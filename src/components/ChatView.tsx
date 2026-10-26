import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Paperclip,
  Pencil,
  Plug,
  RefreshCw,
  Square,
  Trash2,
  User,
  Wrench,
  Check,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Markdown } from "@/lib/markdown";
import { useApp, customEndpointFor } from "@/lib/store";
import { completeOnce, streamChat, ProviderError, type ApiMessage, type ToolSpec } from "@/lib/api";
import { callToolOnce, type McpServer, type McpTool } from "@/lib/mcp";
import type { ChatMsg, ToolRun } from "@/lib/types";
import { cn, fmtTime } from "@/lib/cn";
import { IconButton } from "@/components/ui";
import { ModelPicker } from "@/components/ModelPicker";
import { toast } from "@/components/Toast";
import { PROVIDERS } from "@/lib/catalog";

type BoundTool = { spec: ToolSpec; server: McpServer; tool: McpTool };

function bindTools(servers: McpServer[]): BoundTool[] {
  const out: BoundTool[] = [];
  let i = 0;
  for (const server of servers) {
    if (!server.enabled || server.status !== "connected") continue;
    for (const tool of server.tools) {
      const safe = `${server.name}__${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      out.push({
        spec: {
          name: safe || `tool_${i}`,
          description: `[${server.name}] ${tool.description ?? tool.name}`,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
        server,
        tool,
      });
      i++;
    }
  }
  return out;
}

export function ChatView({
  onOpenSettings,
  onOpenMcp,
  modelId,
  onModelChange,
}: {
  onOpenSettings: () => void;
  onOpenMcp: () => void;
  modelId: string;
  onModelChange: (id: string) => void;
}) {
  const store = useApp();
  const { settings, mcpServers, customProviders } = store;
  const active = store.active;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Async continuations (regenerate / edit & resend) must read the *latest*
  // conversations, not the ones captured when the handler was created.
  const storeRef = useRef(store);
  storeRef.current = store;
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  const model = store.modelById(modelId) ?? store.activeModel ?? store.visibleModels[0];
  const tools = useMemo(() => bindTools(mcpServers), [mcpServers]);
  const messages = active?.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  /* ------------------------------------------------------------- scrolling */
  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMsg?.content, lastMsg?.reasoning]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  /* --------------------------------------------------------------- textarea */
  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };
  useEffect(autoGrow, [input]);

  /* ------------------------------------------------------------------ send */
  const buildHistory = (msgs: ChatMsg[]): ApiMessage[] => {
    const trimmed = msgs.slice(-Math.max(2, settings.contextMessages));
    return trimmed
      .filter((m) => m.content.trim() && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const runSend = useCallback(
    async (textArg?: string, opts: { reuseUser?: boolean } = {}) => {
      const text = (textArg ?? input).trim();
      if (!text || busy) return;
      if (!model) {
        toast("Pick a model first.", "warn");
        return;
      }

      const endpointCfg = customEndpointFor(model, customProviders);
      const apiKey = storeRef.current.keyFor(model.provider, model.providerRef);
      if (!apiKey && model.provider !== "custom") {
        toast(`No ${PROVIDERS[model.provider].name} API key yet — add it in Settings → Providers.`, "warn");
        onOpenSettings();
        return;
      }
      if (model.provider === "custom" && !endpointCfg?.endpoint) {
        toast("This custom model has no endpoint. Set it in Settings → Providers.", "warn");
        onOpenSettings();
        return;
      }

      const live = storeRef.current;
      let chatId = live.activeId;
      if (!chatId) chatId = store.newChat(model.id);
      const conv = live.conversations.find((c) => c.id === chatId);
      const history = conv?.messages ?? [];

      const userMsg: ChatMsg = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      if (!opts.reuseUser) store.addMessage(chatId, userMsg);
      setInput("");

      const asstId = crypto.randomUUID();
      store.addMessage(chatId, {
        id: asstId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        modelId: model.id,
      });

      const apiMessages: ApiMessage[] = [];
      if (settings.systemPrompt.trim())
        apiMessages.push({ role: "system", content: settings.systemPrompt.trim() });
      apiMessages.push(...buildHistory(history));
      apiMessages.push({ role: "user", content: text });

      setBusy(true);
      setStreamingId(asstId);
      stickToBottom.current = true;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const patch = (p: Partial<ChatMsg>) => store.updateMessage(chatId!, asstId, p);
      const toolRuns: ToolRun[] = [];

      try {
        /* ---- optional tool-planning round ---- */
        let followUp: ApiMessage[] | null = null;
        if (tools.length > 0 && model.capabilities.includes("tools")) {
          let plan;
          try {
            plan = await completeOnce({
              model,
              apiKey,
              messages: apiMessages,
              custom: endpointCfg,
              temperature: settings.temperature,
              topP: settings.topP,
              maxTokens: settings.maxTokens,
              tools: tools.map((t) => t.spec),
              signal: ctrl.signal,
            });
          } catch (e) {
            const msg = e instanceof ProviderError ? e.message : "Tool planning failed.";
            throw new Error(msg);
          }

          if (plan.toolCalls.length > 0) {
            const results: { call: (typeof plan.toolCalls)[number]; output: string; run: ToolRun }[] = [];
            for (const call of plan.toolCalls) {
              const bound = tools.find((t) => t.spec.name === call.name);
              const run: ToolRun = {
                id: call.id,
                serverName: bound?.server.name ?? "unknown",
                name: bound?.tool.name ?? call.name,
                args: safeJson(call.arguments),
                status: "running",
              };
              toolRuns.push(run);
              patch({ toolRuns: [...toolRuns] });
              if (!bound) {
                run.status = "error";
                run.result = "No such tool is connected.";
              } else if (!bound.server.autoApprove) {
                run.status = "ok";
                run.result =
                  "Skipped: this server requires manual approval. Enable auto-approve in MCP settings to let the model call it.";
              } else {
                const t0 = performance.now();
                try {
                  run.result = await callToolOnce(bound.server, bound.tool.name, run.args);
                  run.status = "ok";
                } catch (e) {
                  run.status = "error";
                  run.result = (e as Error).message;
                }
                run.ms = Math.round(performance.now() - t0);
              }
              patch({ toolRuns: [...toolRuns] });
              results.push({ call, output: run.result ?? "", run });
            }

            // build the follow-up conversation for the final answer
            if (model.provider === "anthropic") {
              followUp = [
                ...apiMessages,
                { role: "assistant", content: plan.raw?.content ?? [{ type: "text", text: plan.text }] },
                {
                  role: "user",
                  content: results.map((r) => ({
                    type: "tool_result",
                    tool_use_id: r.call.id,
                    content: r.output || "(empty)",
                  })),
                },
              ];
            } else {
              followUp = [
                ...apiMessages,
                {
                  role: "assistant",
                  content: plan.text || null,
                  tool_calls: results.map((r) => ({
                    id: r.call.id,
                    type: "function",
                    function: { name: r.call.name, arguments: r.call.arguments || "{}" },
                  })),
                },
                ...results.map((r) => ({
                  role: "tool" as const,
                  tool_call_id: r.call.id,
                  content: r.output || "(empty)",
                })),
              ];
            }
          } else {
            // Model answered directly — no follow-up request needed.
            patch({ content: plan.text || "(empty response)" });
            setBusy(false);
            setStreamingId(null);
            return;
          }
        }

        /* ---- non-streaming final answer ---- */
        if (!settings.streaming) {
          const res = await completeOnce({
            model,
            apiKey,
            messages: followUp ?? apiMessages,
            custom: endpointCfg,
            temperature: settings.temperature,
            topP: settings.topP,
            maxTokens: settings.maxTokens,
            tools: followUp ? undefined : tools.length ? tools.map((t) => t.spec) : undefined,
            signal: ctrl.signal,
          });
          patch({ content: res.text || "(The model returned an empty response.)" });
          if (ctrl.signal.aborted) patch({ stopped: true });
          return;
        }

        /* ---- streaming final answer ---- */
        const gen = await streamChat({
          model,
          apiKey,
          messages: followUp ?? apiMessages,
          custom: endpointCfg,
          temperature: settings.temperature,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
          tools: followUp ? undefined : tools.length ? tools.map((t) => t.spec) : undefined,
          signal: ctrl.signal,
        });

        let acc = "";
        let reasoning = "";
        let usage: ChatMsg["usage"];
        for await (const ev of gen) {
          if (ev.error) {
            patch({ content: acc ? `${acc}\n\n⚠️ ${ev.error}` : ev.error, error: !acc });
            break;
          }
          if (ev.reasoning) {
            reasoning += ev.reasoning;
            patch({ reasoning });
          }
          if (ev.delta) {
            acc += ev.delta;
            patch({ content: acc });
          }
          if (ev.usage) usage = { ...usage, ...ev.usage };
          if (ev.done) break;
        }
        if (!acc && !reasoning) patch({ content: "(The model returned an empty response.)" });
        if (usage) patch({ usage });
        if (ctrl.signal.aborted) patch({ stopped: true });
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          patch({ stopped: true });
        } else {
          patch({ content: (e as Error).message || "Something went wrong.", error: true });
        }
      } finally {
        setBusy(false);
        setStreamingId(null);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, busy, model, settings, tools, customProviders, store],
  );

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStreamingId(null);
  };

  const regenerate = async (msg: ChatMsg) => {
    if (!active || busy) return;
    const idx = active.messages.findIndex((m) => m.id === msg.id);
    const prevUser = [...active.messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    store.dropMessagesFrom(active.id, prevUser.id);
    // wait a tick so the store update lands before we re-send
    setTimeout(() => void runSend(prevUser.content), 30);
  };

  const submitEdit = () => {
    if (!editing || !active) return;
    const text = editing.text.trim();
    if (!text) return;
    const id = editing.id;
    store.dropMessagesFrom(active.id, id);
    setEditing(null);
    setTimeout(() => void runSend(text), 30);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && settings.sendOnEnter) {
      e.preventDefault();
      void runSend();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void runSend();
    }
  };

  const suggestions = [
    { title: "Explain a concept", body: "Explain transformers to me like I'm a backend developer, with a diagram in text." },
    { title: "Write code", body: "Write a Python script that watches a folder and uploads new files to S3." },
    { title: "In Indian languages", body: "मेरे लिए एक छोटी सी कहानी लिखो — बारिश और एक चाय की दुकान के बारे में." },
    { title: "Use MCP tools", body: "Look up the documentation for this repo and summarise the architecture." },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-8">
            <div
              className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl shadow-lg"
              style={{
                background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))",
                boxShadow: "0 20px 50px -18px rgb(var(--accent))",
              }}
            >
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-center text-2xl font-semibold tracking-tight text-ink">
              What should we build today?
            </h1>
            <p className="mt-2 max-w-md text-center text-[13px] leading-relaxed text-muted">
              {model ? `${model.name} · ${PROVIDERS[model.provider].name}` : "Pick a model"} — with{" "}
              {tools.length > 0
                ? `${tools.length} MCP tool${tools.length === 1 ? "" : "s"} ready`
                : "MCP tools one click away"}
              .
            </p>
            <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void runSend(s.body)}
                  className="glass rounded-2xl p-3.5 text-left transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <p className="text-[12.5px] font-semibold text-ink">{s.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{s.body}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mx-auto flex flex-col",
              settings.density === "compact" ? "gap-3" : "gap-5",
            )}
            style={{ maxWidth: `min(100%, var(--chat-width))` }}
          >
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                modelName={store.modelById(m.modelId ?? "")?.name}
                isStreaming={streamingId === m.id}
                editing={editing?.id === m.id ? editing.text : null}
                onEditStart={() => setEditing({ id: m.id, text: m.content })}
                onEditChange={(t) => setEditing({ id: m.id, text: t })}
                onEditCancel={() => setEditing(null)}
                onEditSubmit={submitEdit}
                onRegenerate={() => void regenerate(m)}
                onDelete={() => active && store.deleteMessage(active.id, m.id)}
                onCopy={() => {
                  navigator.clipboard.writeText(m.content).then(
                    () => toast("Copied to clipboard", "ok"),
                    () => toast("Clipboard blocked by the browser", "warn"),
                  );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="mx-auto" style={{ maxWidth: `min(100%, var(--chat-width))` }}>
          {tools.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
              <Plug className="h-3 w-3 text-muted" />
              <span className="text-[11px] text-muted">MCP:</span>
              {tools.slice(0, 6).map((t) => (
                <span key={t.spec.name} className="chip chip-accent text-[10px]">
                  {t.tool.name}
                </span>
              ))}
              {tools.length > 6 && (
                <span className="text-[10.5px] text-muted">+{tools.length - 6} more</span>
              )}
            </div>
          )}
          <div className="glass-hi rounded-glass-lg p-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                model ? `Message ${model.name}…` : "Message…"
              }
              className="scroll-thin max-h-[260px] w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/80"
              style={{ minHeight: 44 }}
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
              <div className="flex min-w-0 items-center gap-1">
                <ModelPicker value={model?.id ?? ""} onChange={onModelChange} compact />
                <IconButton title="MCP tools & setup" onClick={onOpenMcp} active={tools.length > 0}>
                  <Plug className="h-4 w-4" />
                </IconButton>
                <IconButton title="Settings" onClick={onOpenSettings}>
                  <Paperclip className="h-4 w-4 rotate-45 opacity-0" />
                </IconButton>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden text-[10.5px] text-muted sm:block">
                  {settings.sendOnEnter ? "Enter to send · Shift+Enter for a line" : "Ctrl+Enter to send"}
                </span>
                {busy ? (
                  <button
                    onClick={stop}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/20 text-red-200 transition hover:bg-red-500/30"
                    title="Stop generating"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => void runSend()}
                    disabled={!input.trim()}
                    className="btn btn-accent flex h-9 w-9 items-center justify-center rounded-full p-0 disabled:opacity-35"
                    title="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 px-1 text-center text-[10.5px] leading-relaxed text-muted/70">
            {model
              ? `${model.name} · ${(model.contextWindow / 1000).toFixed(0)}K context · max ${model.maxTokens.toLocaleString()} output tokens`
              : "No model selected"}
            {" · Keys stay on this device"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- message row */

function MessageRow({
  msg,
  modelName,
  isStreaming,
  editing,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSubmit,
  onRegenerate,
  onDelete,
  onCopy,
}: {
  msg: ChatMsg;
  modelName?: string;
  isStreaming: boolean;
  editing: string | null;
  onEditStart: () => void;
  onEditChange: (t: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const { settings } = useApp();
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = msg.role === "user";
  const bubbles = settings.bubbleStyle === "bubbles";

  return (
    <div className={cn("group flex gap-2.5 sm:gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && settings.showAvatars && (
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}
        >
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-[92%] flex-col gap-1", isUser && "items-end")}>
        {!isUser && (modelName || msg.toolRuns?.length) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {modelName && <span className="text-[11px] font-medium text-muted">{modelName}</span>}
            {msg.toolRuns?.length ? (
              <span className="chip px-1.5 py-0 text-[10px]">
                <Wrench className="h-2.5 w-2.5" /> {msg.toolRuns.length} tool
                {msg.toolRuns.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        )}

        {msg.toolRuns && msg.toolRuns.length > 0 && (
          <div className="w-full space-y-1.5">
            {msg.toolRuns.map((run) => (
              <details key={run.id} className="glass-soft rounded-xl px-3 py-2 text-[11.5px]">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-muted">
                  {run.status === "running" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-accent" />
                  ) : run.status === "ok" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                  )}
                  <span className="font-medium text-ink">{run.name}</span>
                  <span className="text-muted">on {run.serverName}</span>
                  {run.ms != null && <span className="ml-auto text-muted">{run.ms}ms</span>}
                </summary>
                <pre className="scroll-thin mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted">
                  {JSON.stringify(run.args, null, 2)}
                </pre>
                {run.result && (
                  <pre className="scroll-thin mt-1.5 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink/80">
                    {run.result}
                  </pre>
                )}
              </details>
            ))}
          </div>
        )}

        {msg.reasoning && (
          <div className="w-full">
            <button
              onClick={() => setShowReasoning((v) => !v)}
              className="chip mb-1 gap-1 text-[10.5px]"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showReasoning && "rotate-180")} />
              reasoning
            </button>
            {showReasoning && (
              <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-muted">
                {msg.reasoning}
              </pre>
            )}
          </div>
        )}

        {editing !== null ? (
          <div className="glass w-full rounded-2xl p-2">
            <textarea
              value={editing}
              onChange={(e) => onEditChange(e.target.value)}
              rows={Math.min(12, editing.split("\n").length + 1)}
              className="scroll-thin w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-ink outline-none"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={onEditCancel} className="btn btn-ghost h-8 px-3 text-[12px]">
                Cancel
              </button>
              <button onClick={onEditSubmit} className="btn btn-accent h-8 px-3 text-[12px]">
                Save & send
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "w-full px-3.5 py-2.5",
              bubbles && isUser
                ? "rounded-3xl text-white shadow-lg"
                : bubbles
                  ? "glass rounded-3xl"
                  : "rounded-2xl border-l-2 border-accent/50 bg-white/[0.03] pl-3.5",
              msg.error && "border border-red-400/30 bg-red-500/10",
            )}
            style={
              bubbles && isUser
                ? {
                    background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))",
                    boxShadow: "0 14px 34px -18px rgb(var(--accent))",
                  }
                : undefined
            }
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{msg.content}</p>
            ) : msg.content ? (
              <Markdown text={msg.content} />
            ) : (
              <span className="typing inline-flex items-center py-1">
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 px-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {settings.showTimestamps && (
            <span className="mr-1 text-[10px] text-muted">{fmtTime(msg.createdAt)}</span>
          )}
          {msg.stopped && <span className="mr-1 text-[10px] text-amber-400">stopped</span>}
          {settings.showUsage && msg.usage?.completion != null && (
            <span className="mr-1 text-[10px] text-muted">{msg.usage.completion} tok</span>
          )}
          {isUser && (
            <IconButton title="Edit & resend" onClick={onEditStart}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton title="Copy" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          {!isUser && !isStreaming && (
            <IconButton title="Regenerate" onClick={onRegenerate}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton title="Delete message" onClick={onDelete} className="hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {isUser && settings.showAvatars && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8">
          <User className="h-4 w-4 text-muted" />
        </div>
      )}
    </div>
  );
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { raw: text };
  }
}
