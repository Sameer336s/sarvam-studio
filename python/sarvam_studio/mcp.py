"""Minimal MCP (Model Context Protocol) client over Streamable HTTP.

JSON-RPC 2.0: initialize -> notifications/initialized -> tools/list -> tools/call.
Responses may be plain JSON or an SSE stream; both are handled.
"""

from __future__ import annotations

import itertools
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

PROTOCOL_VERSION = "2025-06-18"


@dataclass
class McpTool:
    name: str
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=lambda: {"type": "object", "properties": {}})

    def as_function(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.input_schema}


@dataclass
class McpServer:
    name: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    tools: list[McpTool] = field(default_factory=list)
    error: str | None = None


class McpError(RuntimeError):
    pass


class McpClient:
    def __init__(self, url: str, headers: dict[str, str] | None = None,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.url = url
        self.headers = {"Content-Type": "application/json",
                        "Accept": "application/json, text/event-stream",
                        **(headers or {})}
        self._transport = transport
        self._session: str | None = None
        self._ids = itertools.count(1)

    def _http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self._transport, timeout=httpx.Timeout(60.0, connect=15.0))

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        headers = dict(self.headers)
        if self._session:
            headers["mcp-session-id"] = self._session
        async with self._http() as http:
            async with http.stream("POST", self.url, headers=headers, json=payload) as resp:
                sid = resp.headers.get("mcp-session-id")
                if sid:
                    self._session = sid
                if resp.status_code >= 400:
                    raw = (await resp.aread()).decode("utf-8", "replace")
                    raise McpError(f"MCP {resp.status_code}: {raw[:200]}")
                if "id" not in payload:
                    return None  # notification
                ctype = resp.headers.get("content-type", "")
                if "text/event-stream" in ctype:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            data = json.loads(line[5:].strip())
                        except json.JSONDecodeError:
                            continue
                        if isinstance(data, dict) and data.get("id") == payload["id"]:
                            return data
                    return None
                raw = (await resp.aread()).decode("utf-8", "replace")
                return json.loads(raw) if raw.strip() else None

    async def initialize(self) -> dict[str, Any]:
        result = await self._post({
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "sarvam-studio-python", "version": "3.5.0"},
            },
        })
        await self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return result or {}

    async def list_tools(self) -> list[McpTool]:
        result = await self._post({"jsonrpc": "2.0", "id": next(self._ids), "method": "tools/list"})
        tools = ((result or {}).get("result") or {}).get("tools") or []
        return [
            McpTool(
                name=t.get("name", ""),
                description=t.get("description", ""),
                input_schema=t.get("inputSchema") or {"type": "object", "properties": {}},
            )
            for t in tools
            if t.get("name")
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        result = await self._post({
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments or {}},
        })
        payload = (result or {}).get("result") or {}
        if isinstance(payload, dict) and payload.get("isError"):
            return "tool error: " + json.dumps(payload)[:400]
        content = payload.get("content") if isinstance(payload, dict) else None
        if isinstance(content, list):
            chunks = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
            return "\n".join(chunks) or json.dumps(payload)[:400]
        return json.dumps(payload)[:400]


async def connect(url: str, headers: dict[str, str] | None = None) -> McpServer:
    """Handshake and list tools; returns the server with an `error` set on failure."""
    client = McpClient(url, headers)
    try:
        await client.initialize()
        tools = await client.list_tools()
        return McpServer(name=url, url=url, headers=headers or {}, tools=tools)
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI
        return McpServer(name=url, url=url, headers=headers or {}, error=str(exc))


# Community servers worth knowing about. "hosted" ones work straight from a client;
# the others are stdio processes and need a bridge (supergateway / mcp-proxy).
OPEN_SOURCE_MCP = [
    {"name": "DeepWiki", "hosted": True, "url": "https://mcp.deepwiki.com/mcp",
     "note": "Ask questions about any public GitHub repo. No key."},
    {"name": "Cloudflare Docs", "hosted": True, "url": "https://docs.mcp.cloudflare.com/mcp",
     "note": "Cloudflare documentation as tools. No key."},
    {"name": "Context7", "hosted": True, "url": "https://mcp.context7.com/mcp",
     "note": "Up-to-date library documentation."},
    {"name": "Filesystem", "hosted": False,
     "command": 'npx -y @modelcontextprotocol/server-filesystem "$HOME/projects"',
     "note": "Read/write files in folders you allow."},
    {"name": "Git", "hosted": False,
     "command": 'npx -y mcp-server-git --repository "$HOME/projects/app"',
     "note": "Status, diff, log, commit for a local repo."},
    {"name": "Memory", "hosted": False, "command": "npx -y @modelcontextprotocol/server-memory",
     "note": "A knowledge graph the model can write to."},
    {"name": "Fetch", "hosted": False, "command": "npx -y mcp-server-fetch",
     "note": "Fetch a URL and convert it to markdown."},
    {"name": "Time", "hosted": False, "command": "npx -y mcp-server-time",
     "note": "Timezones — the thing models always get wrong."},
]


def bridge_command(command: str) -> str:
    """Turn a stdio server into an HTTP endpoint this client can reach."""
    return f'npx -y supergateway --stdio "{command}" --port 8000 --outputTransport streamableHttp'
