"""FastAPI app: serves the UI and proxies chat to the providers.

The browser never sees an API key. It talks to this server, which holds the keys, builds
the provider request, and streams the answer back as Server-Sent Events.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from . import keystore
from .client import Attachment, Client, Message, ProviderError, estimate_tokens
from .config import Config
from .mcp import McpClient, connect
from .providers import MODELS, PRESETS, PROVIDERS, Model
from .web import INDEX_HTML


app = FastAPI(title="Sarvam Studio (Python)", version="3.5.0")
client = Client()


# --------------------------------------------------------------------- models


def _model_payload(model: Model) -> dict[str, Any]:
    return {
        "id": model.id,
        "name": model.name,
        "provider": model.provider,
        "providerName": PROVIDERS[model.provider].name,
        "providerColor": PROVIDERS[model.provider].color,
        "description": model.description,
        "contextWindow": model.context_window,
        "maxTokens": model.max_tokens,
        "capabilities": model.capabilities,
        "hasKey": bool(client.key_for(model)),
        "custom": model.provider == "custom",
    }


def _custom_models(cfg: Config) -> list[Model]:
    out: list[Model] = []
    for pid, spec in cfg.custom_providers.items():
        for mid in spec.get("models", []):
            out.append(Model(
                id=mid,
                name=mid.split("/")[-1],
                provider="custom",
                description=spec.get("name", pid),
                context_window=int(spec.get("context_window", 131_072)),
                max_tokens=int(spec.get("max_tokens", 8192)),
                capabilities=["chat", "tools"],
                provider_ref=pid,
            ))
    return out


def _all_models() -> list[Model]:
    return MODELS + _custom_models(client.config)


# ---------------------------------------------------------------------- state


@app.get("/api/state")
async def state() -> dict[str, Any]:
    cfg = client.config
    return {
        "config": {
            "theme": cfg.theme,
            "palette": cfg.palette,
            "accent": cfg.accent,
            "accent2": cfg.accent2,
            "defaultModel": cfg.default_model,
            "systemPrompt": cfg.system_prompt,
            "contextMessages": cfg.context_messages,
            "autoMaxTokens": cfg.auto_max_tokens,
            "speakReplies": cfg.speak_replies,
            "voiceRate": cfg.voice_rate,
            "params": cfg.params.as_dict(),
        },
        "models": [_model_payload(m) for m in _all_models()],
        "providers": {k: {"name": v.name, "color": v.color, "docs": v.docs} for k, v in PROVIDERS.items()},
        "presets": [
            {"id": p.id, "name": p.name, "short": p.short, "note": p.note,
             "local": p.local, "needsKey": p.needs_key, "models": p.models}
            for p in PRESETS
        ],
        "keys": keystore.masked(),
        "customProviders": cfg.custom_providers,
        "mcp": cfg.mcp_servers,
        "encryption": "fernet" if keystore.HAVE_CRYPTO else "obfuscated",
    }


class ConfigPatch(BaseModel):
    patch: dict[str, Any]


@app.post("/api/config")
async def update_config(body: ConfigPatch) -> dict[str, Any]:
    client.config.merge(body.patch)
    client.config.save()
    return {"ok": True, "config": body.patch}


class KeyBody(BaseModel):
    slot: str
    key: str


@app.post("/api/keys")
async def set_key(body: KeyBody) -> dict[str, Any]:
    if ":" not in body.slot:
        raise HTTPException(400, "slot must look like p:sarvam or c:my-provider")
    keystore.save_key(body.slot, body.key)
    return {"ok": True, "keys": keystore.masked()}


@app.delete("/api/keys/{slot}")
async def delete_key(slot: str) -> dict[str, Any]:
    keystore.delete_key(slot)
    return {"ok": True, "keys": keystore.masked()}


class PresetBody(BaseModel):
    id: str
    key: str | None = None


@app.post("/api/preset")
async def add_preset(body: PresetBody) -> dict[str, Any]:
    preset = next((p for p in PRESETS if p.id == body.id), None)
    if preset is None:
        raise HTTPException(404, "unknown preset")
    cfg = client.config
    cfg.custom_providers[preset.id] = {
        "name": preset.name,
        "endpoint": preset.endpoint,
        "models_endpoint": preset.models_endpoint,
        "auth_header": preset.auth_header,
        "auth_prefix": preset.auth_prefix,
        "models": preset.models or [],
        "local": preset.local,
    }
    cfg.save()
    if body.key:
        keystore.save_key(f"c:{preset.id}", body.key)
    return {"ok": True, "customProviders": cfg.custom_providers, "keys": keystore.masked()}


class ModelBody(BaseModel):
    model: str


@app.post("/api/models/live")
async def live_models(body: ModelBody) -> dict[str, Any]:
    try:
        model = client.model(body.model)
        ids = await client.list_models(model)
    except ProviderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"models": ids}


# ----------------------------------------------------------------------- chat


class ChatAttachment(BaseModel):
    kind: str = "text"
    name: str = "file"
    mime: str = "text/plain"
    dataUrl: str | None = None
    text: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    attachments: list[ChatAttachment] = []


class ChatBody(BaseModel):
    model: str = "auto"
    messages: list[ChatMessage]
    system: str | None = None
    params: dict[str, Any] | None = None
    mcp: list[dict[str, Any]] = []


def _to_messages(body: ChatBody) -> list[Message]:
    out: list[Message] = []
    if body.system:
        out.append(Message(role="system", content=body.system))
    for m in body.messages:
        out.append(Message(
            role=m.role,
            content=m.content,
            attachments=[
                Attachment(kind=a.kind, name=a.name, mime=a.mime, data_url=a.dataUrl, text=a.text)
                for a in m.attachments
            ],
        ))
    return out


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@app.post("/api/chat")
async def chat(body: ChatBody) -> StreamingResponse:
    cfg = client.config
    params = cfg.params
    if body.params:
        for k, v in body.params.items():
            if hasattr(params, k):
                setattr(params, k, v)

    messages = _to_messages(body)
    if params.max_tokens is None and cfg.auto_max_tokens == "balanced":
        try:
            params.max_tokens = min(client.model(body.model).max_tokens, 4096)
        except ProviderError:
            pass

    async def gen() -> AsyncIterator[str]:
        try:
            needs = {
                "vision": any(a.kind == "image" for m in messages for a in m.attachments),
                "tools": bool(body.mcp),
                "approx": estimate_tokens(messages),
            }
            if body.model == "auto":
                model = client.auto_model(vision=needs["vision"], tools=needs["tools"],
                                          approx_tokens=needs["approx"])
                if model is None:
                    yield _sse({"type": "error", "message": "No model with a key. Add one in Settings."})
                    return
                yield _sse({"type": "model", "id": model.id, "name": model.name})
            else:
                model = client.model(body.model)

            # ---- MCP tools ----
            registry: dict[str, tuple[McpClient, str]] = {}
            specs: list[dict[str, Any]] = []
            for idx, server in enumerate(body.mcp):
                mcp = McpClient(server["url"], server.get("headers"))
                try:
                    await mcp.initialize()
                    tools = await mcp.list_tools()
                except Exception as exc:  # noqa: BLE001
                    yield _sse({"type": "tool_error", "message": f"{server['url']}: {exc}"})
                    continue
                for tool in tools:
                    name = f"s{idx}__{tool.name}"[:64]
                    registry[name] = (mcp, tool.name)
                    specs.append({"name": name, "description": tool.description,
                                  "parameters": tool.input_schema})

            if specs:
                plan = await client.complete(model, messages, params, specs)
                if plan.get("tool_calls"):
                    messages.append(Message(role="assistant", content=plan.get("text") or ""))
                    results: list[str] = []
                    for call in plan["tool_calls"]:
                        entry = registry.get(call["name"])
                        yield _sse({"type": "tool", "name": call["name"],
                                    "arguments": call["arguments"]})
                        if not entry:
                            results.append(f"{call['name']}: unknown tool")
                            continue
                        mcp, real = entry
                        try:
                            output = await mcp.call_tool(real, call["arguments"] or {})
                        except Exception as exc:  # noqa: BLE001
                            output = f"tool failed: {exc}"
                        yield _sse({"type": "tool_result", "name": call["name"], "result": output[:600]})
                        results.append(f"[{call['name']}]\n{output}")
                    messages.append(Message(role="user",
                                            content="Tool results:\n\n" + "\n\n".join(results)))
                elif plan.get("text"):
                    yield _sse({"type": "delta", "text": plan["text"]})
                    yield _sse({"type": "done"})
                    return

            finish = None
            async for event in client.stream(model, messages, params):
                if event.error:
                    yield _sse({"type": "error", "message": event.error})
                    return
                if event.text:
                    yield _sse({"type": "delta", "text": event.text})
                if event.reasoning:
                    yield _sse({"type": "reasoning", "text": event.reasoning})
                if event.usage:
                    yield _sse({"type": "usage", **event.usage})
                if event.finish:
                    finish = event.finish
                    yield _sse({"type": "finish", "reason": finish})

            if finish in ("length", "max_tokens"):
                yield _sse({"type": "notice", "kind": "length"})
            yield _sse({"type": "done"})
        except ProviderError as exc:
            yield _sse({"type": "error", "message": str(exc)})
        except Exception as exc:  # noqa: BLE001 - never leave the stream hanging
            yield _sse({"type": "error", "message": f"{type(exc).__name__}: {exc}"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------------ mcp


class McpBody(BaseModel):
    url: str
    headers: dict[str, str] = {}


@app.post("/api/mcp/connect")
async def mcp_connect(body: McpBody) -> dict[str, Any]:
    server = await connect(body.url, body.headers)
    return {
        "ok": server.error is None,
        "error": server.error,
        "tools": [{"name": t.name, "description": t.description, "parameters": t.input_schema}
                  for t in server.tools],
    }


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "models": len(_all_models()),
            "keys": len(keystore.all_keys()), "version": app.version}


# ------------------------------------------------------------------------ ui


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    return HTMLResponse(INDEX_HTML)


def run(host: str = "127.0.0.1", port: int = 8000, open_browser: bool = True) -> None:
    import threading
    import webbrowser

    import uvicorn

    url = f"http://{host}:{port}"
    if open_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"\n  Sarvam Studio (Python) -> {url}\n  Ctrl+C to stop\n")
    uvicorn.run(app, host=host, port=port, log_level="warning")
