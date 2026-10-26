import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { connectServer, MCP_PRESETS, type McpServer } from "@/lib/mcp";
import { Badge, Button, Card, Field, IconButton, Input, Select, Switch } from "@/components/ui";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";

export function McpPanel() {
  const store = useApp();
  const [draft, setDraft] = useState<{ name: string; url: string; transport: "http" | "sse" }>({
    name: "",
    url: "",
    transport: "http",
  });
  const [headerDraft, setHeaderDraft] = useState({ name: "", value: "" });
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const add = () => {
    if (!draft.name.trim() || !draft.url.trim()) {
      toast("Give the server a name and a URL.", "warn");
      return;
    }
    const server: McpServer = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      transport: draft.transport,
      headers,
      enabled: true,
      autoApprove: false,
      status: "idle",
      tools: [],
    };
    store.addMcpServer(server);
    setDraft({ name: "", url: "", transport: "http" });
    setHeaders([]);
    toast("Server added — hit Connect to fetch its tools.", "ok");
  };

  const connect = async (server: McpServer) => {
    setBusyId(server.id);
    store.updateMcpServer(server.id, { status: "connecting", error: undefined });
    try {
      const { tools, serverInfo } = await connectServer(server);
      store.updateMcpServer(server.id, {
        status: "connected",
        tools,
        serverInfo,
        lastChecked: Date.now(),
        error: undefined,
      });
      toast(`Connected to ${server.name} — ${tools.length} tool${tools.length === 1 ? "" : "s"}.`, "ok");
      setExpanded(server.id);
    } catch (e) {
      const message = (e as Error).message || "Connection failed.";
      store.updateMcpServer(server.id, { status: "error", error: message, lastChecked: Date.now() });
      toast(`${server.name}: ${message}`, "warn");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="How MCP works here"
        subtitle="Model Context Protocol lets the model call real tools — search, docs, databases, your own APIs."
      >
        <ol className="space-y-1.5 text-[11.5px] leading-relaxed text-muted">
          <li>
            <span className="font-medium text-ink">1.</span> Add a remote MCP server URL (Streamable
            HTTP, usually ending in <code className="font-mono">/mcp</code>).
          </li>
          <li>
            <span className="font-medium text-ink">2.</span> Press <span className="text-ink">Connect</span> — the app
            performs the JSON-RPC <code className="font-mono">initialize</code> handshake and lists the server's tools.
          </li>
          <li>
            <span className="font-medium text-ink">3.</span> Pick a model that supports tools. Connected tools appear
            above the composer and the model decides when to call them.
          </li>
          <li>
            <span className="font-medium text-ink">4.</span> Tool calls are shown inline in the chat with their arguments
            and results. Turn on <span className="text-ink">auto-approve</span> per server to let them run without a prompt.
          </li>
        </ol>
        <p className="note-warn mt-2">
          Local <code className="font-mono">stdio</code> servers (npx …) cannot be started from a web page. Expose them
          with an HTTP bridge such as <code className="font-mono">mcp-proxy</code> and use that URL here. Your provider
          API keys are never sent to MCP servers.
        </p>
      </Card>

      <Card title="Add a server" subtitle="Name it, paste the URL, optionally add auth headers.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
              placeholder="DeepWiki docs"
            />
          </Field>
          <Field label="Transport">
            <Select
              value={draft.transport}
              onChange={(v) => setDraft((d) => ({ ...d, transport: v }))}
              options={[
                { value: "http", label: "Streamable HTTP (recommended)" },
                { value: "sse", label: "Legacy HTTP + SSE" },
              ]}
            />
          </Field>
          <Field label="Server URL" className="sm:col-span-2">
            <Input
              value={draft.url}
              onChange={(v) => setDraft((d) => ({ ...d, url: v }))}
              placeholder="https://mcp.example.com/mcp"
            />
          </Field>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <p className="label">Auth headers (optional)</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={headerDraft.name}
              onChange={(v) => setHeaderDraft((h) => ({ ...h, name: v }))}
              placeholder="Authorization"
            />
            <Input
              value={headerDraft.value}
              onChange={(v) => setHeaderDraft((h) => ({ ...h, value: v }))}
              placeholder="Bearer …"
              type="password"
            />
            <Button
              variant="ghost"
              onClick={() => {
                if (!headerDraft.name.trim()) return;
                setHeaders((h) => [...h, { name: headerDraft.name.trim(), value: headerDraft.value }]);
                setHeaderDraft({ name: "", value: "" });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {headers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {headers.map((h, i) => (
                <span key={`${h.name}-${i}`} className="chip font-mono text-[10px]">
                  {h.name}
                  <button
                    onClick={() => setHeaders((all) => all.filter((_, idx) => idx !== i))}
                    className="ml-1 text-muted hover:text-red-400"
                    aria-label={`Remove ${h.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="accent" onClick={add}>
            <Plus className="h-4 w-4" /> Add server
          </Button>
          <span className="text-[11px] text-muted">or start from a preset:</span>
          {MCP_PRESETS.map((p) => (
            <button
              key={p.url}
              title={p.note}
              onClick={() => setDraft({ name: p.name, url: p.url, transport: "http" })}
              className="chip hover:border-accent/40 hover:text-ink"
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      {store.mcpServers.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[12px] text-muted">
            No MCP servers yet. Add one above to give the model tools.
          </p>
        </Card>
      ) : (
        store.mcpServers.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl",
                  s.status === "connected"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : s.status === "error"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-white/6 text-muted",
                )}
              >
                <Plug className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[12.5px] font-semibold text-ink">{s.name}</p>
                  <Badge
                    tone={
                      s.status === "connected" ? "ok" : s.status === "error" ? "bad" : "default"
                    }
                  >
                    {s.status}
                  </Badge>
                  {s.serverInfo?.name && <Badge>{s.serverInfo.name}</Badge>}
                  <Badge>{s.transport === "http" ? "streamable http" : "http+sse"}</Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted">{s.url}</p>
                {s.error && (
                  <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {s.error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="accent"
                  disabled={busyId === s.id}
                  onClick={() => void connect(s)}
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {s.status === "connected" ? "Reconnect" : "Connect"}
                </Button>
                <IconButton
                  title="Remove server"
                  className="hover:text-red-400"
                  onClick={() => store.removeMcpServer(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>

            <div className="mt-3 grid gap-1 sm:grid-cols-2">
              <Switch
                label="Enabled in chat"
                hint="Off = tools hidden from the model."
                checked={s.enabled}
                onChange={(v) => store.updateMcpServer(s.id, { enabled: v })}
              />
              <Switch
                label="Auto-approve tool calls"
                hint="On = the model may run these tools without asking."
                checked={s.autoApprove}
                onChange={(v) => store.updateMcpServer(s.id, { autoApprove: v })}
              />
            </div>

            {s.tools.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-[11.5px] text-muted hover:text-ink"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", expanded === s.id && "rotate-180")}
                  />
                  {s.tools.length} tool{s.tools.length === 1 ? "" : "s"} available
                  {!s.autoApprove && <span className="text-amber-400">· approval required</span>}
                </button>
                {expanded === s.id && (
                  <div className="mt-1 space-y-1.5">
                    {s.tools.map((t) => (
                      <div key={t.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                        <p className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink">
                          <Wrench className="h-3 w-3 text-accent" />
                          {t.name}
                        </p>
                        {t.description && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t.description}</p>
                        )}
                        {t.inputSchema?.properties && (
                          <p className="mt-1 font-mono text-[10px] text-muted/80">
                            args: {Object.keys(t.inputSchema.properties).join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {s.status === "connected" && (
              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-emerald-300/80">
                <ShieldCheck className="h-3 w-3" />
                Keys are not shared with this server. Calls happen directly from your browser.
              </p>
            )}
          </Card>
        ))
      )}

      <Card title="Quick checks" subtitle="If a server will not connect:">
        <ul className="space-y-1 text-[11.5px] leading-relaxed text-muted">
          <li>· The URL must accept <code className="font-mono">POST</code> with JSON-RPC and return JSON or SSE.</li>
          <li>· 401/403 → add the auth header the server expects (usually <code className="font-mono">Authorization</code>).</li>
          <li>· Browser CORS blocks many servers. If the console shows a CORS error, the server must allow your origin.</li>
          <li>· <code className="font-mono">http://localhost</code> works only if the server sends permissive CORS headers.</li>
        </ul>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => {
            store.mcpServers.forEach((s) => void connect(s));
          }}
          disabled={store.mcpServers.length === 0}
        >
          <Check className="h-3.5 w-3.5" /> Connect all
        </Button>
      </Card>
    </div>
  );
}
