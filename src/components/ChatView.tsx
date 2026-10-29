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
  Mic,
  Paperclip,
  Volume2,
  VolumeX,
  Pencil,
  Plug,
  RefreshCw,
  Settings2,
  Square,
  AudioLines,
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
import { ArtifactBar } from "@/components/ArtifactBar";
import { AUTO_ID, pickAutoModel } from "@/lib/autoModel";
import {
  speak,
  speakable,
  speakAsync,
  startRecording,
  sttEngine,
  stopSpeaking,
  transcribeBrowser,
  transcribeSarvam,
  ttsAvailable,
  type Recorder,
} from "@/lib/voice";
import { MaxTokensField } from "@/components/MaxTokensField";
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
  /** One entry per chat that is currently streaming, so several chats can run at once. */
  const [runs, setRuns] = useState<Record<string, { asstId: string }>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [voiceLine, setVoiceLine] = useState("");

  const busy = !!(active?.id && runs[active.id]);
  const streamingId = active?.id ? runs[active.id]?.asstId ?? null : null;
  const anyRunning = Object.keys(runs).length > 0;

  const aborts = useRef<Record<string, AbortController>>({});
  const voiceModeRef = useRef(false);
  voiceModeRef.current = voiceMode;
  const autoStopRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(active?.id ?? null);
  activeIdRef.current = active?.id ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  // Async continuations must read the *latest* state, not the render they captured.
  const storeRef = useRef(store);
  storeRef.current = store;

  const isAuto = modelId === AUTO_ID;
  const autoPick = useMemo(
    () => pickAutoModel(store.visibleModels, store.keys, customProviders, {}),
    [store.visibleModels, store.keys, customProviders],
  );
  const displayModel = isAuto
    ? autoPick?.model ?? null
    : store.modelById(modelId) ?? store.activeModel ?? store.visibleModels[0];
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
      const resolved = displayModel;
      const text = (textArg ?? input).trim();
      const atts = textArg ? [] : attachments;
      if (!text && atts.length === 0) return;
      const targetChat = storeRef.current.activeId;
      if (targetChat && runsRef.current[targetChat]) {
        toast("This chat is still answering — wait or stop it first.", "warn");
        return;
      }
      if (!resolved) {
        toast("Pick a model first — or add a key so Auto can choose one.", "warn");
        onOpenSettings();
        return;
      }

      const live = storeRef.current;
      let model = resolved; // may be re-picked below when Auto is on
      const needs = {
        vision: atts.some((a) => a.kind === "image"),
        tools: tools.length > 0,
        approxTokens: Math.round(
          (live.conversations.find((c) => c.id === live.activeId)?.messages ?? [])
            .slice(-20)
            .reduce((n, m) => n + m.content.length, 0) / 4,
        ),
      };
      if (modelId === AUTO_ID) {
        const picked = pickAutoModel(live.visibleModels, live.keys, live.customProviders, needs);
        if (!picked) {
          toast("Auto needs at least one model with a key. Add one in Settings → API keys.", "warn");
          onOpenSettings();
          return;
        }
        model = picked.model;
        if (picked.model.id !== resolved?.id) {
          toast(`Auto → ${picked.model.name} (${picked.reason})`, "info");
        }
      }
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
      if (!chatId) chatId = live.newChat(modelId === AUTO_ID ? AUTO_ID : model.id);
      const conv = live.conversations.find((c) => c.id === chatId);
      const history = conv?.messages ?? [];
      const chatParams: ModelParams = { ...live.settings.params, ...(conv?.params ?? {}) };
      // "Auto" already means the model's own limit; balanced mode trims it to a sane default.
      if (chatParams.maxTokens == null && live.settings.autoMaxTokens === "balanced") {
        chatParams.maxTokens = Math.min(model.maxTokens, 4096);
      }

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

      setRuns((r) => ({ ...r, [chatId]: { asstId } }));
      stickToBottom.current = true;
      const ctrl = new AbortController();
      aborts.current[chatId] = ctrl;

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

        /* ---- streaming answer (one silent retry if the connection drops early) ---- */
        let usage: ChatMsg["usage"];
        let finish: string | undefined;
        let interrupted = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          interrupted = false;
          let gotAnything = false;
          const gen = await streamChat({
            model,
            apiKey,
            messages: followUp ?? apiMessages,
            custom: endpointCfg,
            params: chatParams,
            tools: followUp ? undefined : tools.length ? tools.map((t) => t.spec) : undefined,
            signal: ctrl.signal,
          });

          for await (const ev of gen) {
            if (ev.error) {
              // Nothing arrived yet? The stream may simply have been dropped — retry once.
              if (!gotAnything && attempt === 0 && !ctrl.signal.aborted) {
                interrupted = true;
                break;
              }
              pendingContent = pendingContent ? `${pendingContent}\n\n⚠️ ${ev.error}` : ev.error;
              flushNow();
              storeRef.current.updateMessage(chatId, asstId, { error: !pendingContent });
              return;
            }
            if (ev.finish) finish = ev.finish;
            if (ev.reasoning) {
              pendingReasoning += ev.reasoning;
              gotAnything = true;
              schedule();
            }
            if (ev.delta) {
              pendingContent += ev.delta;
              gotAnything = true;
              schedule();
            }
            if (ev.usage) usage = { ...usage, ...ev.usage };
            if (ev.done) break;
          }

          if (!interrupted) break;
          await new Promise((r) => setTimeout(r, 500));
        }

        flushNow();

        const cut = finish === "length" || finish === "max_tokens";
        if (!pendingContent && !pendingReasoning) {
          storeRef.current.updateMessage(chatId, asstId, {
            content: interrupted
              ? "The connection dropped before the model answered. Tap retry to send it again."
              : "(The model returned an empty response.)",
            error: interrupted,
          });
        } else {
          if (cut) {
            storeRef.current.updateMessage(chatId, asstId, { notice: "length" });
            toast(
              `Reply hit the output limit (${(chatParams.maxTokens ?? model.maxTokens).toLocaleString(
                "en-US",
              )} tokens) — raise max output tokens or lower reasoning effort`,
              "warn",
            );
          } else if (interrupted) {
            storeRef.current.updateMessage(chatId, asstId, { notice: "interrupted" });
          }
        }
        if (usage) storeRef.current.updateMessage(chatId, asstId, { usage });
        if (ctrl.signal.aborted) storeRef.current.updateMessage(chatId, asstId, { stopped: true });

        if (live.settings.speakReplies && pendingContent && !voiceModeRef.current) {
          speak(pendingContent, { rate: live.settings.voiceRate });
        }
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
        delete aborts.current[chatId];
        setRuns((r) => {
          const next = { ...r };
          delete next[chatId];
          return next;
        });
        if (chatId === activeIdRef.current) stickToBottom.current = true;
      }
    },
    // callbacks below are stable (storeRef), so only these change identity
    [input, attachments, displayModel, tools, onOpenSettings],
  );

  const stop = () => {
    const id = storeRef.current.activeId;
    if (id) aborts.current[id]?.abort();
  };

  /** Stop every chat that is still streaming (multitasking needs a way out). */
  const stopAll = () => {
    Object.values(aborts.current).forEach((c) => c.abort());
    setRuns({});
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
  const runsRef = useRef(runs);
  runsRef.current = runs;
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

  /* ------------------------------------------------------------ talk mode */
  useEffect(() => {
    if (!recorder) return;
    const t = setInterval(() => setRecSecs(Math.floor(recorder.elapsed() / 1000)), 200);
    return () => clearInterval(t);
  }, [recorder]);

  const startTalk = async () => {
    const key = storeRef.current.keyFor("sarvam");
    if (sttEngine(!!key) === "none") {
      toast("Speech input needs a Sarvam key (or Chrome's built-in speech engine).", "warn");
      onOpenSettings();
      return;
    }
    stopSpeaking();
    try {
      const rec = await startRecording(30000);
      setRecorder(rec);
      setRecSecs(0);
    } catch (e) {
      toast((e as Error).message || "Could not start the microphone", "warn");
    }
  };

  const stopTalk = async (cancel = false) => {
    if (!recorder) return;
    const rec = recorder;
    setRecorder(null);
    setRecSecs(0);
    if (cancel) {
      rec.cancel();
      return;
    }
    const blob = await rec.stop();
    if (blob.size < 1200) {
      toast("That was too short — hold a little longer", "warn");
      return;
    }
    const live = storeRef.current;
    const key = live.keyFor("sarvam");
    const engine = sttEngine(!!key);
    setTranscribing(true);
    try {
      const lang = live.settings.sttLanguage;
      const text =
        engine === "sarvam"
          ? (await transcribeSarvam(blob, key, lang)).text
          : await transcribeBrowser(lang);
      if (!text) {
        toast("Could not hear anything in that recording", "warn");
        return;
      }
      if (live.settings.talkAutoSend) void sendRef.current(text);
      else setInput((v) => (v ? `${v} ${text}` : text));
    } catch (e) {
      toast((e as Error).message || "Transcription failed", "warn");
    } finally {
      setTranscribing(false);
    }
  };

  /* ------------------------------------------------- voice mode (hands-free) */
  const lastAssistantText = () => {
    const live = storeRef.current;
    const conv = live.conversations.find((c) => c.id === live.activeId);
    const last = [...(conv?.messages ?? [])].reverse().find((m) => m.role === "assistant");
    return last?.content ?? "";
  };

  const listenOnce = useCallback(async () => {
    if (!voiceModeRef.current) return;
    stopSpeaking();
    setVoiceState("listening");
    setVoiceLine("");
    try {
      const rec = await startRecording(15000);
      setRecorder(rec);
      setRecSecs(0);
      // Turn-taking without a VAD: give the speaker a fixed window.
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      autoStopRef.current = window.setTimeout(() => {
        void finishTurn(rec);
      }, 9000);
    } catch (e) {
      setVoiceState("idle");
      toast((e as Error).message || "Microphone unavailable", "warn");
    }
  }, []);

  const finishTurn = useCallback(async (rec: Recorder) => {
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    setRecorder(null);
    setRecSecs(0);
    const blob = await rec.stop();
    if (blob.size < 1200) {
      if (voiceModeRef.current) void listenOnce();
      return;
    }
    setVoiceState("thinking");
    const live = storeRef.current;
    const key = live.keyFor("sarvam");
    try {
      const lang = live.settings.sttLanguage;
      const text =
        sttEngine(!!key) === "sarvam"
          ? (await transcribeSarvam(blob, key, lang)).text
          : await transcribeBrowser(lang);
      if (!text) {
        if (voiceModeRef.current) void listenOnce();
        return;
      }
      setVoiceLine(text);
      await sendRef.current(text);
      if (!voiceModeRef.current) {
        setVoiceState("idle");
        return;
      }
      setVoiceState("speaking");
      await speakAsync(lastAssistantText(), { rate: live.settings.voiceRate });
      if (voiceModeRef.current) void listenOnce();
      else setVoiceState("idle");
    } catch (e) {
      setVoiceState("idle");
      toast((e as Error).message || "Voice turn failed", "warn");
    }
  }, [listenOnce]);

  const enterVoice = () => {
    if (!storeRef.current.settings.speakReplies) storeRef.current.patchSettings({ speakReplies: true });
    setVoiceMode(true);
    setTimeout(() => void listenOnce(), 150);
  };

  const exitVoice = () => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setVoiceState("idle");
    stopSpeaking();
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    if (recorder) recorder.cancel();
    setRecorder(null);
    setRecSecs(0);
  };

  const continueReply = useCallback((id: string) => {
    const live = storeRef.current;
    const conv = live.conversations.find((c) => c.id === live.activeId);
    const m = conv?.messages.find((x) => x.id === id);
    if (m) live.updateMessage(conv!.id, id, { notice: undefined });
    void sendRef.current(
      "Continue exactly where you stopped. Do not repeat what you already wrote and do not start over.",
    );
  }, []);

  const toggleSpeak = () => {
    const next = !storeRef.current.settings.speakReplies;
    storeRef.current.patchSettings({ speakReplies: next });
    if (!next) stopSpeaking();
    else toast("Replies will be read aloud", "ok");
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
              {displayModel ? `${displayModel.name} · ${PROVIDERS[displayModel.provider].name}` : "Pick a model"} — send text,
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
                onContinue={continueReply}
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

          {anyRunning && (
            <div className="mx-auto mb-1.5 flex max-w-2xl items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] text-accent">
              <Loader2 className="h-3 w-3 spin" />
              <span>
                {Object.keys(runs).length} chat{Object.keys(runs).length === 1 ? "" : "s"} answering in
                the background
              </span>
              <button
                onClick={stopAll}
                className="ml-auto rounded px-1.5 py-0.5 font-medium hover:bg-accent/20"
              >
                Stop all
              </button>
            </div>
          )}

          {recorder && (
            <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-2.5 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-[11.5px] font-medium text-red-300">
                Listening… {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
              </span>
              <span className="flex-1" />
              <button
                onClick={() => void stopTalk(true)}
                className="rounded-md px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20"
              >
                Cancel
              </button>
              <button
                onClick={() => void stopTalk()}
                className="flex items-center gap-1 rounded-md bg-red-500/25 px-2 py-0.5 text-[11px] font-medium text-red-100 hover:bg-red-500/35"
              >
                <AudioLines className="h-3 w-3" /> Use this
              </button>
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
              placeholder={displayModel ? `Message ${displayModel.name}…` : "Message…"}
              className="scroll-thin max-h-[240px] w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/70"
              style={{ minHeight: 40 }}
            />
            <div className="flex items-center justify-between gap-1.5 px-0.5">
              <div className="flex min-w-0 items-center gap-0.5">
                <ModelPicker value={modelId} onChange={onModelChange} compact />
                <IconButton
                  title="Attach image or file"
                  onClick={() => fileRef.current?.click()}
                  disabled={attachBusy || attachments.length >= ATTACH.maxFiles}
                >
                  {attachBusy ? <Loader2 className="h-4 w-4 spin" /> : <Paperclip className="h-4 w-4" />}
                </IconButton>
                <IconButton
                  title={recorder ? "Stop and transcribe" : "Talk — speak your message"}
                  onClick={() => (recorder ? void stopTalk() : void startTalk())}
                  active={!!recorder}
                  disabled={transcribing}
                >
                  {transcribing ? (
                    <Loader2 className="h-4 w-4 spin" />
                  ) : recorder ? (
                    <Square className="h-4 w-4 text-red-400" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </IconButton>
                <IconButton
                  title="Voice mode — hands-free conversation"
                  onClick={enterVoice}
                  disabled={!ttsAvailable() || sttEngine(!!store.keys["p:sarvam"]?.key) === "none"}
                >
                  <AudioLines className="h-4 w-4" />
                </IconButton>
                <IconButton
                  title={settings.speakReplies ? "Stop reading replies aloud" : "Read replies aloud"}
                  onClick={toggleSpeak}
                  active={settings.speakReplies}
                  disabled={!ttsAvailable()}
                >
                  {settings.speakReplies ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
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
                  accept="image/*,text/*,application/pdf,application/zip,application/x-zip-compressed,.zip,.md,.json,.csv,.tsv,.log,.yml,.yaml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.sql,.ini,.toml,.pdf"
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
            {displayModel
              ? `${isAuto ? "Auto → " : ""}${displayModel.name} · ${(
                  displayModel.contextWindow / 1000
                ).toFixed(0)}K ctx · temp ${params.temperature.toFixed(2)} · out ${
                  params.maxTokens == null
                    ? `${displayModel.maxTokens.toLocaleString("en-US")} (auto)`
                    : params.maxTokens.toLocaleString("en-US")
                }`
              : "No model selected"}
            {" · keys stay on this device"}
          </p>
        </div>
      </div>

      <Modal open={paramsOpen} onClose={() => setParamsOpen(false)} title="Model parameters">
        <ParamsForm
          params={params}
          model={displayModel ?? null}
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

      {/* voice mode: hands-free turn taking, ChatGPT style */}
      {voiceMode && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between sheet-solid px-6 py-10">
          <div className="flex w-full max-w-md items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Voice mode</span>
            <button onClick={exitVoice} className="btn btn-ghost px-3 py-1.5 text-[12px]">
              <X className="h-3.5 w-3.5" /> End
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <div
              className={cn(
                "relative flex h-40 w-40 items-center justify-center rounded-full",
                voiceState === "listening" ? "bg-accent/15" : "bg-white/5",
              )}
            >
              <span
                className={cn(
                  "absolute inset-0 rounded-full border",
                  voiceState === "listening" ? "border-accent/40 animate-ping" : "border-white/10",
                )}
              />
              <span
                className="flex h-24 w-24 items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}
              >
                {voiceState === "thinking" ? (
                  <Loader2 className="h-8 w-8 spin" />
                ) : voiceState === "speaking" ? (
                  <Volume2 className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </span>
            </div>

            <div className="min-h-[3rem] max-w-md">
              <p className="text-[15px] font-medium text-ink">
                {voiceState === "listening"
                  ? "Listening…"
                  : voiceState === "thinking"
                    ? "Thinking…"
                    : voiceState === "speaking"
                      ? "Speaking…"
                      : "Ready"}
              </p>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                {voiceLine || (voiceState === "listening" ? "Speak, or tap End to leave voice mode." : " ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (recorder) void finishTurn(recorder);
                else if (voiceState === "speaking") {
                  stopSpeaking();
                  void listenOnce();
                } else if (voiceState === "idle") void listenOnce();
              }}
              className="btn btn-accent px-6 py-3 text-[13px]"
              disabled={voiceState === "thinking"}
            >
              {recorder ? "Send now" : voiceState === "speaking" ? "Skip" : "Talk"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ params */

function ParamsForm({
  params,
  model,
  hasOverrides,
  onChange,
  onReset,
  onEditDefaults,
}: {
  params: ModelParams;
  model: { name: string; maxTokens: number } | null;
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
      <div className="py-1.5">
        <MaxTokensField
          value={params.maxTokens}
          modelMax={model?.maxTokens ?? 8192}
          modelName={model?.name}
          onChange={(v) => onChange({ maxTokens: v })}
        />
      </div>

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
  onContinue,
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
  onContinue: (id: string) => void;
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

        {!isUser && msg.notice && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5">
            <span className="flex-1 text-[11px] leading-relaxed text-amber-300">
              {msg.notice === "length"
                ? "Reply was cut at the output limit."
                : "The stream was interrupted before it finished."}
            </span>
            <button
              onClick={() => onContinue(msg.id)}
              className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30"
            >
              Continue
            </button>
          </div>
        )}

        {!isUser && !msg.error && <ArtifactBar text={msg.content} />}

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
