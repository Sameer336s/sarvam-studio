import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plug,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { Markdown } from "@/lib/markdown";
import { useApp, customEndpointFor } from "@/lib/store";
import {
  completeOnce,
  streamChat,
  ProviderError,
  toApiMessages,
  type ApiMessage,
  type ToolSpec,
} from "@/lib/api";
import { callToolOnce, type McpServer, type McpTool } from "@/lib/mcp";
import { filesToAttachments, formatBytes } from "@/lib/attach";
import {
  ATTACH,
  DEFAULT_PARAMS,
  type Attachment,
  type ChatMsg,
  type ModelParams,
  type ToolRun,
} from "@/lib/types";
import { cn, fmtTime, uuid } from "@/lib/cn";
import { Button, IconButton, Modal, Select, Slider, Switch } from "@/components/ui";
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  // Async continuations must read the *latest* state, not the render they captured.
  const storeRef = useRef(store);
  storeRef.current = store;

  const model = store.modelById(modelId) ?? store.activeModel ?? store.visibleModels[0];
  const tools = useMemo(() => bindTools(mcpServers), [mcpServers]);
  const messages = active?.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  const params: ModelParams = useMemo(
    () => ({ ...settings.params, ...(active?.params ?? {}) }),
    [settings.params, active?.params],
  );
  const hasOverrides = !!active?.params && Object.keys(active.params).length > 0;

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
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };
  useEffect(autoGrow, [input]);

  /* ------------------------------------------------------------ attachments */
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;
      setAttachBusy(true);
      try {
        const { added, skipped } = await filesToAttachments(files, attachments.length);
        if (added.length) setAttachments((prev) => [...prev, ...added].slice(0, ATTACH.maxFiles));
        if (skipped.length) toast(skipped.slice(0, 2).join(" · "), "warn");
        if (added.length) toast(`${added.length} file${added.length === 1 ? "" : "s"} attached`, "ok");
      } finally {
        setAttachBusy(false);
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /* ------------------------------------------------------------------ send */
  const runSend = useCallback(
    async (textArg?: string) => {
      const text = (textArg ?? input).trim();
      const atts = textArg ? [] : attachments;
      if ((!text && atts.length === 0) || busy) return;
      if (!model) {
        toast("Pick a model first.", "warn");
        return;
      }

      const live = storeRef.current;
      const endpointCfg = customEndpointFor(model, live.customProviders);
      const apiKey = live.keyFor(model.provider, model.providerRef);
      if (!apiKey && model.provider !== "custom") {
        toast(`No ${PROVIDERS[model.provider].name} API key yet — add it in Settings → API keys.`, "warn");
        onOpenSettings();
        return;
      }
      if (model.provider === "custom" && !endpointCfg?.endpoint) {
        toast("This model has no endpoint. Set it in Settings → API keys.", "warn");
        onOpenSettings();
        return;
      }

      let chatId = live.activeId;
      if (!chatId) chatId = live.newChat(model.id);
      const conv = live.conversations.find((c) => c.id === chatId);
      const history = conv?.messages ?? [];
      const chatParams: ModelParams = { ...live.settings.params, ...(conv?.params ?? {}) };

      const userMsg: ChatMsg = {
        id: uuid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        attachments: atts.length ? atts : undefined,
      };
      live.addMessage(chatId, userMsg);
      setInput("");
      setAttachments([]);

      const asstId = uuid();
      live.addMessage(chatId, {
        id: asstId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        modelId: model.id,
      });

      // Build the wire messages, including any images/text files.
      const apiMessages: ApiMessage[] = [];
      const sys = live.settings.systemPrompt.trim();
      if (sys) apiMessages.push({ role: "system", content: sys });
      const trimmed = history.slice(-Math.max(2, live.settings.contextMessages));
      apiMessages.push(
        ...toApiMessages(
          [
            ...trimmed.filter((m) => !m.error).map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments,
            })),
            { role: "user" as const, content: text, attachments: atts },
          ],
          model.provider === "anthropic" ? "anthropic" : "openai",
        ),
      );

      setBusy(true);
      setStreamingId(asstId);
      stickToBottom.current = true;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      /* --- rAF-batched patching: one React update per frame, not per token --- */
      let pendingContent = "";
      let pendingReasoning = "";
      let frame: number | null = null;
      const flush = () => {
        frame = null;
        const patch: Partial<ChatMsg> = {};
        if (pendingContent) patch.content = pendingContent;
        if (pendingReasoning) patch.reasoning = pendingReasoning;
        if (Object.keys(patch).length) storeRef.current.updateMessage(chatId!, asstId, patch);
      };
      const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(flush);
      };
      const flushNow = () => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        flush();
      };

      const toolRuns: ToolRun[] = [];

      try {
        /* ---- optional tool-planning round ---- */
        let followUp: ApiMessage[] | null = null;
        if (tools.length > 0 && model.capabilities.includes("tools")) {
          const plan = await completeOnce({
            model,
            apiKey,
            messages: apiMessages,
            custom: endpointCfg,
            params: chatParams,
            tools: tools.map((t) => t.spec),
            signal: ctrl.signal,
          });

          if (plan.toolCalls.length > 0) {
            const results: { call: (typeof plan.toolCalls)[number]; output: string }[] = [];
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
              storeRef.current.updateMessage(chatId, asstId, { toolRuns: [...toolRuns] });
              if (!bound) {
                run.status = "error";
                run.result = "No such tool is connected.";
              } else if (!bound.server.autoApprove) {
                run.status = "ok";
                run.result =
                  "Skipped: this server needs manual approval. Enable auto-approve in MCP settings to let the model call it.";
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
              storeRef.current.updateMessage(chatId, asstId, { toolRuns: [...toolRuns] });
              results.push({ call, output: run.result ?? "" });
            }

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
            pendingContent = plan.text || "(empty response)";
            flushNow();
            return;
          }
        }

        /* ---- non-streaming answer ---- */
        if (!live.settings.streaming) {
          const res = await completeOnce({
            model,
            apiKey,
            messages: followUp ?? apiMessages,
            custom: endpointCfg,
            params: chatParams,
            tools: followUp ? undefined : tools.length ? tools.map((t) => t.spec) : undefined,
            signal: ctrl.signal,
          });
          pendingContent = res.text || "(The model returned an empty response.)";
          flushNow();
          return;
        }

        /* ---- streaming answer ---- */
        const gen = await streamChat({
          model,
          apiKey,
          messages: followUp ?? apiMessages,
          custom: endpointCfg,
          params: chatParams,
          tools: followUp ? undefined : tools.length ? tools.map((t) => t.spec) : undefined,
          signal: ctrl.signal,
        });

        let usage: ChatMsg["usage"];
        for await (const ev of gen) {
          if (ev.error) {
            pendingContent = pendingContent ? `${pendingContent}\n\n⚠️ ${ev.error}` : ev.error;
            flushNow();
            storeRef.current.updateMessage(chatId, asstId, { error: !pendingContent });
            break;
          }
          if (ev.reasoning) {
            pendingReasoning += ev.reasoning;
            schedule();
          }
          if (ev.delta) {
            pendingContent += ev.delta;
            schedule();
          }
          if (ev.usage) usage = { ...usage, ...ev.usage };
          if (ev.done) break;
        }
        flushNow();
        if (!pendingContent && !pendingReasoning)
          storeRef.current.updateMessage(chatId, asstId, {
            content: "(The model returned an empty response.)",
          });
        if (usage) storeRef.current.updateMessage(chatId, asstId, { usage });
        if (ctrl.signal.aborted) storeRef.current.updateMessage(chatId, asstId, { stopped: true });
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          flushNow();
          storeRef.current.updateMessage(chatId, asstId, { stopped: true });
        } else {
          const msg =
            e instanceof ProviderError ? e.message : (e as Error).message || "Something went wrong.";
          pendingContent = pendingContent ? `${pendingContent}\n\n⚠️ ${msg}` : msg;
          flushNow();
          storeRef.current.updateMessage(chatId, asstId, { error: !pendingContent });
        }
      } finally {
        if (frame !== null) cancelAnimationFrame(frame);
        setBusy(false);
        setStreamingId(null);
        abortRef.current = null;
      }
    },
    // callbacks below are stable (storeRef), so only these change identity
    [input, attachments, busy, model, tools, onOpenSettings],
  );

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStreamingId(null);
  };

  const regenerate = useCallback((msgId: string) => {
    const live = storeRef.current;
    const conv = live.conversations.find((c) => c.id === live.activeId);
    if (!conv || busyRef.current) return;
    const idx = conv.messages.findIndex((m) => m.id === msgId);
    const prevUser = [...conv.messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    live.dropMessagesFrom(conv.id, prevUser.id);
    setTimeout(() => void sendRef.current(prevUser.content), 30);
  }, []);

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const sendRef = useRef(runSend);
  sendRef.current = runSend;

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

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const copyMessage = useCallback((id: string) => {
    const conv = storeRef.current.conversations.find((c) => c.id === storeRef.current.activeId);
    const m = conv?.messages.find((x) => x.id === id);
    if (!m) return;
    navigator.clipboard.writeText(m.content).then(
      () => toast("Copied", "ok"),
      () => toast("Clipboard blocked by the browser", "warn"),
    );
  }, []);

  const deleteMessage = useCallback((id: string) => {
    const live = storeRef.current;
    if (live.activeId) live.deleteMessage(live.activeId, id);
  }, []);

  const startEdit = useCallback((id: string) => {
    const conv = storeRef.current.conversations.find((c) => c.id === storeRef.current.activeId);
    const m = conv?.messages.find((x) => x.id === id);
    if (m) setEditing({ id, text: m.content });
  }, []);

  const suggestions = [
    { title: "Explain something", body: "Explain how vector databases work, with a small example." },
    { title: "Write code", body: "Write a Python script that watches a folder and uploads new files to S3." },
    { title: "In Indian languages", body: "मेरे लिए एक छोटी सी कहानी लिखो — बारिश और एक चाय की दुकान के बारे में." },
    { title: "Send a screenshot", body: "Attach a screenshot with the paperclip and ask what is wrong with the UI." },
  ];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-accent/5">
          <p className="text-sm font-medium text-accent">Drop images or files to attach</p>
        </div>
      )}

      {/* messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Bot className="h-6 w-6" />
            </div>
            <h1 className="text-center text-xl font-semibold tracking-tight text-ink">
              What should we build today?
            </h1>
            <p className="mt-1.5 max-w-md text-center text-[12.5px] leading-relaxed text-muted">
              {model ? `${model.name} · ${PROVIDERS[model.provider].name}` : "Pick a model"} — send text,
              images or files
              {tools.length > 0 ? `, with ${tools.length} MCP tool${tools.length === 1 ? "" : "s"} ready` : ""}.
            </p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void runSend(s.body)}
                  className="glass rounded-xl p-3 text-left transition-colors hover:border-accent/40"
                >
                  <p className="text-[12.5px] font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{s.body}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mx-auto flex flex-col",
              settings.density === "compact" ? "gap-3" : "gap-4",
            )}
            style={{ maxWidth: `min(100%, var(--chat-width))` }}
          >
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                modelName={store.modelById(m.modelId ?? "")?.name}
                isStreaming={streamingId === m.id}
                editingValue={editing?.id === m.id ? editing.text : null}
                onEditChange={(t) => setEditing((e) => (e ? { ...e, text: t } : e))}
                onEditCancel={() => setEditing(null)}
                onEditSubmit={submitEdit}
                onEditStart={startEdit}
                onRegenerate={regenerate}
                onDelete={deleteMessage}
                onCopy={copyMessage}
              />
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="mx-auto" style={{ maxWidth: `min(100%, var(--chat-width))` }}>
          {tools.length > 0 && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
              <Plug className="h-3 w-3 text-muted" />
              <span className="text-[11px] text-muted">MCP:</span>
              {tools.slice(0, 5).map((t) => (
                <span key={t.spec.name} className="chip chip-accent text-[10px]">
                  {t.tool.name}
                </span>
              ))}
              {tools.length > 5 && (
                <span className="text-[10.5px] text-muted">+{tools.length - 5} more</span>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="group relative flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-1.5 pr-1"
                >
                  {a.kind === "image" && a.dataUrl ? (
                    <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted" />
                  )}
                  <div className="max-w-[130px]">
                    <p className="truncate text-[11px] text-ink">{a.name}</p>
                    <p className="text-[9.5px] text-muted">{formatBytes(a.size)}</p>
                  </div>
                  <button
                    onClick={() => removeAttachment(a.id)}
                    className="rounded p-0.5 text-muted hover:bg-white/10 hover:text-red-400"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="glass-hi p-1.5">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              placeholder={model ? `Message ${model.name}…` : "Message…"}
              className="scroll-thin max-h-[240px] w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/70"
              style={{ minHeight: 40 }}
            />
            <div className="flex items-center justify-between gap-1.5 px-0.5">
              <div className="flex min-w-0 items-center gap-0.5">
                <ModelPicker value={model?.id ?? ""} onChange={onModelChange} compact />
                <IconButton
                  title="Attach image or file"
                  onClick={() => fileRef.current?.click()}
                  disabled={attachBusy || attachments.length >= ATTACH.maxFiles}
                >
                  {attachBusy ? <Loader2 className="h-4 w-4 spin" /> : <Paperclip className="h-4 w-4" />}
                </IconButton>
                <IconButton
                  title="Model parameters"
                  onClick={() => setParamsOpen(true)}
                  active={hasOverrides}
                >
                  <Settings2 className="h-4 w-4" />
                </IconButton>
                <IconButton title="MCP tools" onClick={onOpenMcp} active={tools.length > 0}>
                  <Plug className="h-4 w-4" />
                </IconButton>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,text/*,application/pdf,.md,.json,.csv,.tsv,.log,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.sql,.ini,.toml,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files;
                    if (f) void addFiles(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="hidden text-[10.5px] text-muted sm:block">
                  {settings.sendOnEnter ? "Enter to send · Shift+Enter for a line" : "Ctrl+Enter to send"}
                </span>
                {busy ? (
                  <button
                    onClick={stop}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                    title="Stop"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => void runSend()}
                    disabled={!input.trim() && attachments.length === 0}
                    className="btn btn-accent flex h-9 w-9 items-center justify-center rounded-full p-0 disabled:opacity-35"
                    title="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="mt-1.5 hidden px-1 text-center text-[10.5px] leading-relaxed text-muted/70 sm:block">
            {model
              ? `${model.name} · ${(model.contextWindow / 1000).toFixed(0)}K ctx · temp ${params.temperature.toFixed(2)} · max ${params.maxTokens} tokens`
              : "No model selected"}
            {" · keys stay on this device"}
          </p>
        </div>
      </div>

      <Modal open={paramsOpen} onClose={() => setParamsOpen(false)} title="Model parameters">
        <ParamsForm
          params={params}
          hasOverrides={hasOverrides}
          onChange={(patch) => {
            if (!active) return;
            store.setChatParams(active.id, patch);
          }}
          onReset={() => {
            if (active) store.clearChatParams(active.id);
            toast("Back to global defaults", "ok");
          }}
          onEditDefaults={() => {
            setParamsOpen(false);
            onOpenSettings();
          }}
        />
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ params */

function ParamsForm({
  params,
  hasOverrides,
  onChange,
  onReset,
  onEditDefaults,
}: {
  params: ModelParams;
  hasOverrides: boolean;
  onChange: (patch: Partial<ModelParams>) => void;
  onReset: () => void;
  onEditDefaults: () => void;
}) {
  const [stopText, setStopText] = useState(params.stop.join(", "));

  return (
    <div className="space-y-1">
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
        These apply to this chat only, on top of your global defaults.
        {hasOverrides && <span className="text-accent"> Overrides are active.</span>}
      </p>

      <Slider
        label="Temperature"
        value={params.temperature}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => onChange({ temperature: v })}
      />
      <Slider
        label="Top-p"
        value={params.topP}
        min={0.1}
        max={1}
        step={0.05}
        onChange={(v) => onChange({ topP: v })}
      />
      <Slider
        label="Top-k (0 = off)"
        value={params.topK ?? 0}
        min={0}
        max={100}
        onChange={(v) => onChange({ topK: v === 0 ? null : v })}
      />
      <Slider
        label="Max output tokens"
        value={params.maxTokens}
        min={256}
        max={32768}
        step={256}
        onChange={(v) => onChange({ maxTokens: v })}
      />

      <div className="grid grid-cols-2 gap-3 pt-2">
        <div>
          <label className="label">Presence penalty</label>
          <input
            type="number"
            step="0.1"
            min="-2"
            max="2"
            value={params.presencePenalty}
            onChange={(e) => onChange({ presencePenalty: Number(e.target.value) || 0 })}
            className="field"
          />
        </div>
        <div>
          <label className="label">Frequency penalty</label>
          <input
            type="number"
            step="0.1"
            min="-2"
            max="2"
            value={params.frequencyPenalty}
            onChange={(e) => onChange({ frequencyPenalty: Number(e.target.value) || 0 })}
            className="field"
          />
        </div>
        <div>
          <label className="label">Seed (blank = random)</label>
          <input
            type="number"
            value={params.seed ?? ""}
            placeholder="random"
            onChange={(e) => onChange({ seed: e.target.value === "" ? null : Number(e.target.value) })}
            className="field"
          />
        </div>
        <div>
          <label className="label">Reasoning effort</label>
          <Select
            value={params.reasoningEffort}
            onChange={(v) => onChange({ reasoningEffort: v })}
            options={[
              { value: "auto", label: "Auto (provider default)" },
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </div>
      </div>

      <div className="pt-2">
        <label className="label">Stop sequences (comma separated, max 4)</label>
        <input
          value={stopText}
          onChange={(e) => setStopText(e.target.value)}
          onBlur={() =>
            onChange({
              stop: stopText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 4),
            })
          }
          placeholder="e.g. \n\nUser:, </answer>"
          className="field"
        />
      </div>

      <div className="pt-1">
        <Switch
          label="JSON mode"
          hint="Ask the provider to return valid JSON (supported models only)."
          checked={params.jsonMode}
          onChange={(v) => onChange({ jsonMode: v })}
        />
      </div>

      <div className="flex justify-between gap-2 pt-3">
        <Button variant="ghost" onClick={onEditDefaults}>
          Edit global defaults
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={!hasOverrides}>
          Reset this chat
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- message row */

const MessageRow = memo(function MessageRow({
  msg,
  modelName,
  isStreaming,
  editingValue,
  onEditChange,
  onEditCancel,
  onEditSubmit,
  onEditStart,
  onRegenerate,
  onDelete,
  onCopy,
}: {
  msg: ChatMsg;
  modelName?: string;
  isStreaming: boolean;
  editingValue: string | null;
  onEditChange: (t: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onEditStart: (id: string) => void;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
}) {
  const { settings } = useApp();
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = msg.role === "user";
  const bubbles = settings.bubbleStyle === "bubbles";

  return (
    <div className={cn("msg-row group flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && settings.showAvatars && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-[92%] flex-col gap-1", isUser && "items-end")}>
        {!isUser && (modelName || msg.toolRuns?.length) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {modelName && <span className="text-[10.5px] font-medium text-muted">{modelName}</span>}
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
              <details key={run.id} className="glass-soft px-2.5 py-1.5 text-[11.5px]">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-muted">
                  {run.status === "running" ? (
                    <Loader2 className="h-3 w-3 spin text-accent" />
                  ) : run.status === "ok" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                  )}
                  <span className="font-medium text-ink">{run.name}</span>
                  <span className="text-muted">on {run.serverName}</span>
                  {run.ms != null && <span className="ml-auto text-muted">{run.ms}ms</span>}
                </summary>
                <pre className="scroll-thin mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-muted">
                  {JSON.stringify(run.args, null, 2)}
                </pre>
                {run.result && (
                  <pre className="scroll-thin mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-ink/80">
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
              className="chip mb-1 gap-1 text-[10px]"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showReasoning && "rotate-180")} />
              reasoning
            </button>
            {showReasoning && (
              <pre className="scroll-thin max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/20 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {msg.reasoning}
              </pre>
            )}
          </div>
        )}

        {isUser && msg.attachments && msg.attachments.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-end gap-1.5">
            {msg.attachments.map((a) =>
              a.kind === "image" && a.dataUrl ? (
                <img
                  key={a.id}
                  src={a.dataUrl}
                  alt={a.name}
                  loading="lazy"
                  decoding="async"
                  className="max-h-28 max-w-[168px] rounded-lg border border-white/10 object-cover"
                />
              ) : (
                <span key={a.id} className="chip gap-1 text-[10.5px]">
                  <FileText className="h-3 w-3" /> {a.name}
                </span>
              ),
            )}
          </div>
        )}

        {editingValue !== null ? (
          <div className="glass w-full rounded-xl p-1.5">
            <textarea
              value={editingValue}
              onChange={(e) => onEditChange(e.target.value)}
              rows={Math.min(10, editingValue.split("\n").length + 1)}
              className="scroll-thin w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-relaxed text-ink outline-none"
            />
            <div className="mt-1 flex justify-end gap-1.5">
              <button onClick={onEditCancel} className="btn btn-ghost h-7 px-2.5 text-[11.5px]">
                Cancel
              </button>
              <button onClick={onEditSubmit} className="btn btn-accent h-7 px-2.5 text-[11.5px]">
                Save & send
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "w-full px-3 py-2",
              bubbles && isUser
                ? "rounded-2xl bg-accent text-white"
                : bubbles
                  ? "glass rounded-2xl"
                  : "rounded-lg border-l-2 border-accent/50 bg-white/[0.03] pl-2.5",
              msg.error && "border border-red-400/30 bg-red-500/10",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                {msg.content || (msg.attachments?.length ? "" : "…")}
              </p>
            ) : msg.content ? (
              <div className={cn(isStreaming && "stream-caret")}>
                <Markdown text={msg.content} />
              </div>
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
          {msg.stopped && <span className="mr-1 text-[10px] text-amber-500">stopped</span>}
          {settings.showUsage && msg.usage?.completion != null && (
            <span className="mr-1 text-[10px] text-muted">{msg.usage.completion} tok</span>
          )}
          {isUser && (
            <IconButton title="Edit & resend" onClick={() => onEditStart(msg.id)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton title="Copy" onClick={() => onCopy(msg.id)}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          {!isUser && !isStreaming && (
            <IconButton title="Regenerate" onClick={() => onRegenerate(msg.id)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton title="Delete" onClick={() => onDelete(msg.id)} className="hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {isUser && settings.showAvatars && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/8 text-muted">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
});

function safeJson(text: string): any {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { raw: text };
  }
}
