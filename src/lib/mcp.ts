/**
 * Minimal MCP (Model Context Protocol) client that runs entirely in the browser.
 *
 * Transport: "Streamable HTTP" (POST JSON-RPC to one URL, responses as JSON or SSE),
 * which is what current MCP servers expose. Legacy HTTP+SSE is attempted as a fallback.
 * Local stdio servers (npx …) cannot be reached from a web page — that needs a desktop
 * host or a bridge, which the UI says plainly.
 */

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: any;
};

export type McpHeader = { name: string; value: string };

export type McpServer = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  headers: McpHeader[];
  enabled: boolean;
  autoApprove: boolean;
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
  tools: McpTool[];
  serverInfo?: { name?: string; version?: string };
  lastChecked?: number;
};

const PROTOCOL_VERSION = "2025-06-18";

function headersToObject(headers: McpHeader[], extra: Record<string, string> = {}) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...extra,
  };
  for (const { name, value } of headers) {
    if (name?.trim() && value?.trim()) h[name.trim()] = value.trim();
  }
  return h;
}

/** Pull the JSON-RPC payload out of an SSE body (last matching `data:` line wins). */
function parseSseBody(text: string): any | null {
  const lines = text.split(/\r?\n/);
  let last: any = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      if (json && (json.result !== undefined || json.error !== undefined || json.id !== undefined)) {
        last = json;
      }
    } catch {
      /* ignore keep-alive / partial */
    }
  }
  return last;
}

export class McpClient {
  private sessionId?: string;
  private nextId = 1;
  private ssePostUrl?: string;

  constructor(
    private url: string,
    private headers: McpHeader[],
    private transport: "http" | "sse" = "http",
  ) {}

  private async post(body: any, signal?: AbortSignal): Promise<Response> {
    const url = this.transport === "sse" && this.ssePostUrl ? this.ssePostUrl : this.url;
    return fetch(url, {
      method: "POST",
      headers: headersToObject(this.headers, this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      body: JSON.stringify(body),
      signal,
    });
  }

  /** Legacy HTTP+SSE: open the stream once to learn the POST endpoint. */
  private async discoverSseEndpoint(signal?: AbortSignal) {
    const res = await fetch(this.url, {
      headers: headersToObject(this.headers, { Accept: "text/event-stream" }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`SSE endpoint returned ${res.status}.`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const match = buf.match(/event:\s*endpoint\s*\n\s*data:\s*(\S+)/);
        if (match) {
          const raw = match[1];
          this.ssePostUrl = raw.startsWith("http") ? raw : new URL(raw, this.url).toString();
          break;
        }
        if (buf.length > 20000) break;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    if (!this.ssePostUrl) throw new Error("SSE handshake did not return an endpoint.");
  }

  async request(method: string, params: any = {}, signal?: AbortSignal): Promise<any> {
    if (this.transport === "sse" && !this.ssePostUrl) await this.discoverSseEndpoint(signal);
    const body = { jsonrpc: "2.0", id: this.nextId++, method, params };
    const res = await this.post(body, signal);
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `MCP server returned ${res.status}. ${text.slice(0, 180)}${
          res.status === 401 || res.status === 403 ? " — add the right auth header/token." : ""
        }`,
      );
    }

    const ct = res.headers.get("content-type") || "";
    let json: any = null;
    if (ct.includes("text/event-stream")) {
      json = parseSseBody(await res.text());
    } else {
      try {
        json = await res.json();
      } catch {
        json = parseSseBody(await res.text().catch(() => ""));
      }
    }
    if (!json) throw new Error("MCP server returned an empty or unparseable response.");
    if (json.error) throw new Error(json.error.message || "MCP error");
    return json.result;
  }

  async initialize(signal?: AbortSignal): Promise<{ name?: string; version?: string }> {
    const result = await this.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { roots: { listChanged: false } },
        clientInfo: { name: "Sarvam Studio", version: "2.0.0" },
      },
      signal,
    );
    // Fire-and-forget notification; servers that don't need it just ignore the failure.
    try {
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, signal);
    } catch {
      /* ignore */
    }
    return { name: result?.serverInfo?.name, version: result?.serverInfo?.version };
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    const result = await this.request("tools/list", {}, signal);
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
  }

  async callTool(name: string, args: any, signal?: AbortSignal): Promise<string> {
    const result = await this.request("tools/call", { name, arguments: args ?? {} }, signal);
    if (!result) return "(no result)";
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c?.type === "text") return c.text;
        if (c?.type === "resource") return c.resource?.text ?? JSON.stringify(c.resource);
        if (c?.type === "image") return `[image ${c.mimeType ?? ""}]`;
        return JSON.stringify(c);
      })
      .join("\n")
      .trim();
    const out = text || JSON.stringify(result).slice(0, 4000);
    return result.isError ? `Error: ${out}` : out;
  }
}

export async function connectServer(
  server: McpServer,
  timeoutMs = 15000,
): Promise<{ tools: McpTool[]; serverInfo?: { name?: string; version?: string } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const client = new McpClient(server.url, server.headers, server.transport);
    const serverInfo = await client.initialize(ctrl.signal);
    const tools = await client.listTools(ctrl.signal);
    return { tools, serverInfo };
  } finally {
    clearTimeout(timer);
  }
}

export async function callToolOnce(
  server: McpServer,
  toolName: string,
  args: any,
  timeoutMs = 30000,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const client = new McpClient(server.url, server.headers, server.transport);
    await client.initialize(ctrl.signal);
    return await client.callTool(toolName, args, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Well-known public MCP endpoints people can try in one click. */
export const MCP_PRESETS: { name: string; url: string; note: string }[] = [
  {
    name: "Fetch server (public demo)",
    url: "https://mcp.deepwiki.com/mcp",
    note: "DeepWiki MCP — repo documentation lookups. No key needed.",
  },
  {
    name: "Local MCP bridge",
    url: "http://localhost:3001/mcp",
    note: "Run `npx -y @modelcontextprotocol/server-* ` behind a small HTTP bridge (mcp-proxy).",
  },
  {
    name: "Cloudflare MCP",
    url: "https://docs.mcp.cloudflare.com/mcp",
    note: "Cloudflare's docs MCP. Add an auth header if your account requires one.",
  },
];

/* ==================================================================
   Open-source MCP servers worth knowing about.

   Two very different groups:
   - hosted: an HTTPS endpoint you can connect to from this page today.
   - local: an npx/uvx stdio process. A web page cannot start a process,
     so these need a one-line bridge (supergateway or mcp-proxy) and then
     you connect to the bridge's URL.
   ================================================================== */

export type McpCatalogEntry = {
  name: string;
  category: "search" | "code" | "data" | "files" | "browser" | "utility";
  /** Present for hosted servers. */
  url?: string;
  /** Present for stdio servers. */
  command?: string;
  /** URL to use once the command is running behind a bridge. */
  bridgedUrl?: string;
  note: string;
  hosted: boolean;
};

export const OPEN_SOURCE_MCP: McpCatalogEntry[] = [
  {
    name: "DeepWiki",
    category: "code",
    url: "https://mcp.deepwiki.com/mcp",
    note: "Ask questions about any public GitHub repository. Hosted, no key.",
    hosted: true,
  },
  {
    name: "Cloudflare Docs",
    category: "search",
    url: "https://docs.mcp.cloudflare.com/mcp",
    note: "Cloudflare's documentation as tools. Hosted, no key.",
    hosted: true,
  },
  {
    name: "Context7 (Upstash)",
    category: "code",
    url: "https://mcp.context7.com/mcp",
    note: "Up-to-date library documentation for coding questions. Hosted; some endpoints want an API key.",
    hosted: true,
  },
  {
    name: "GitMCP",
    category: "code",
    url: "https://gitmcp.io/modelcontextprotocol/servers",
    note: "Swap the path for owner/repo to get docs + code search for that project. Hosted, no key.",
    hosted: true,
  },
  {
    name: "Filesystem",
    category: "files",
    command: 'npx -y @modelcontextprotocol/server-filesystem "$HOME/projects"',
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Read/write files in the folders you allow. Local — run it behind a bridge.",
    hosted: false,
  },
  {
    name: "Git",
    category: "code",
    command: 'npx -y mcp-server-git --repository "$HOME/projects/app"',
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Status, diff, log, commit for a local repository.",
    hosted: false,
  },
  {
    name: "Memory",
    category: "data",
    command: "npx -y @modelcontextprotocol/server-memory",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "A knowledge graph the model can write to and recall later.",
    hosted: false,
  },
  {
    name: "Sequential thinking",
    category: "utility",
    command: "npx -y @modelcontextprotocol/server-sequential-thinking",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "A scratchpad for multi-step reasoning. Cheap and surprisingly useful.",
    hosted: false,
  },
  {
    name: "Fetch",
    category: "search",
    command: "npx -y mcp-server-fetch",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Fetches a URL and converts it to markdown for the model.",
    hosted: false,
  },
  {
    name: "SQLite",
    category: "data",
    command: 'npx -y mcp-server-sqlite --db-path "$HOME/data/app.db"',
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Query and inspect a local SQLite database.",
    hosted: false,
  },
  {
    name: "Puppeteer",
    category: "browser",
    command: "npx -y @modelcontextprotocol/server-puppeteer",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Drives a headless browser: navigate, click, screenshot.",
    hosted: false,
  },
  {
    name: "Time",
    category: "utility",
    command: "npx -y mcp-server-time",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Timezones and current time — the one thing models always get wrong.",
    hosted: false,
  },
  {
    name: "Everything (reference)",
    category: "utility",
    command: "npx -y @modelcontextprotocol/server-everything",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "The reference server: prompts, resources and a dozen demo tools. Good for testing a bridge.",
    hosted: false,
  },
  {
    name: "GitHub",
    category: "code",
    command: "npx -y @modelcontextprotocol/server-github",
    bridgedUrl: "http://localhost:8000/mcp",
    note: "Issues, PRs, code search. Needs GITHUB_PERSONAL_ACCESS_TOKEN in the environment.",
    hosted: false,
  },
];

/** One-liner that turns any stdio server into an HTTP endpoint this app can reach. */
export function bridgeCommand(command: string): string {
  return `npx -y supergateway --stdio "${command.replace(/"/g, '\\"')}" --port 8000 --outputTransport streamableHttp`;
}
