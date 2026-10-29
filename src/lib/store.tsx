import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_MODELS, PROVIDERS, type ModelDef, type ProviderId } from "@/lib/catalog";
import { AUTO_ID, pickAutoModel } from "@/lib/autoModel";
import type { McpServer } from "@/lib/mcp";
import {
  DEFAULT_PARAMS,
  DEFAULT_SETTINGS,
  type ChatMsg,
  type Conversation,
  type CustomProviderDef,
  type KeyInfo,
  type KeyStatus,
  type ModelParams,
  type Settings,
} from "@/lib/types";
import { loadSecret, removeSecret, saveSecret, wipeAllSecrets } from "@/lib/secureStore";

const LS = {
  chats: "sarvam.v2.conversations",
  models: "sarvam.v2.models",
  providers: "sarvam.v2.providers",
  mcp: "sarvam.v2.mcp",
  settings: "sarvam.v2.settings",
  active: "sarvam.v2.activeId",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Chats can carry inline images, and localStorage is only ~5 MB. If a write
 * fails we shed image payloads (text and structure survive), and as a last
 * resort keep the newest conversations only. Losing a thumbnail beats losing
 * the whole history.
 */
function persistChats(convs: Conversation[]) {
  if (write(LS.chats, convs)) return;
  const slim = convs.map((c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.attachments?.length
        ? {
            ...m,
            attachments: m.attachments.map((a) =>
              a.kind === "image" ? { ...a, dataUrl: undefined } : a,
            ),
          }
        : m,
    ),
  }));
  if (write(LS.chats, slim)) return;
  write(LS.chats, slim.slice(0, 30));
}

/** Merge stored models with the shipped catalog so app updates add new models. */
function hydrateModels(stored: ModelDef[]): ModelDef[] {
  const byId = new Map(stored.map((m) => [m.id, m]));
  const merged: ModelDef[] = [];
  for (const def of DEFAULT_MODELS) {
    const s = byId.get(def.id);
    merged.push(
      s
        ? {
            ...def,
            ...s,
            // keep vendor-critical fields in sync with the catalog
            endpoint: s.endpoint ?? def.endpoint,
            provider: def.provider,
            builtin: true,
          }
        : { ...def, enabled: true },
    );
    byId.delete(def.id);
  }
  // anything left is a user-created model
  for (const m of byId.values()) merged.push({ ...m, builtin: false });
  return merged;
}

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export type Store = {
  hydrated: boolean;
  encryption: boolean;

  conversations: Conversation[];
  activeId: string | null;
  active: Conversation | null;
  models: ModelDef[];
  visibleModels: ModelDef[];
  customProviders: CustomProviderDef[];
  mcpServers: McpServer[];
  settings: Settings;
  keys: Record<string, KeyInfo>;

  activeModel: ModelDef | null;
  /** Model that "Auto" would choose right now (no attachments/tools considered). */
  autoModel: ModelDef | null;
  modelById: (id: string) => ModelDef | undefined;
  keyFor: (provider: ProviderId, customId?: string) => string;

  newChat: (modelId?: string) => string;
  setActive: (id: string | null) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  clearAllChats: () => void;
  addMessage: (chatId: string, msg: ChatMsg) => void;
  updateMessage: (chatId: string, msgId: string, patch: Partial<ChatMsg>) => void;
  deleteMessage: (chatId: string, msgId: string) => void;
  dropMessagesFrom: (chatId: string, msgId: string) => void;
  setChatModel: (chatId: string, modelId: string) => void;
  setChatParams: (chatId: string, patch: Partial<ModelParams>) => void;
  clearChatParams: (chatId: string) => void;

  toggleModelEnabled: (id: string) => void;
  updateModel: (id: string, patch: Partial<ModelDef>) => void;
  deleteModel: (id: string) => void;
  addModel: (model: ModelDef) => void;
  restoreModels: () => void;

  addCustomProvider: (cp: CustomProviderDef) => void;
  updateCustomProvider: (id: string, patch: Partial<CustomProviderDef>) => void;
  removeCustomProvider: (id: string) => void;

  setKey: (slot: string, key: string) => Promise<void>;
  clearKey: (slot: string) => Promise<void>;
  setKeyStatus: (slot: string, status: KeyStatus, message?: string) => void;

  addMcpServer: (server: McpServer) => void;
  updateMcpServer: (id: string, patch: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;

  patchSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;

  exportAll: () => string;
  importAll: (json: string) => { ok: boolean; message: string };
  resetEverything: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [encryption, setEncryption] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>(() => read(LS.chats, []));
  const [activeId, setActiveId] = useState<string | null>(() => read<string | null>(LS.active, null));
  const [models, setModels] = useState<ModelDef[]>(() =>
    hydrateModels(read<ModelDef[]>(LS.models, [])),
  );
  const [customProviders, setCustomProviders] = useState<CustomProviderDef[]>(() =>
    read<CustomProviderDef[]>(LS.providers, []),
  );
  const [mcpServers, setMcpServers] = useState<McpServer[]>(() => read<McpServer[]>(LS.mcp, []));
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = read<Record<string, unknown>>(LS.settings, {});
    // v2 kept temperature/topP/maxTokens at the top level; fold them into params.
    const legacy = stored as { temperature?: number; topP?: number; maxTokens?: number };
    const params: ModelParams = {
      ...DEFAULT_PARAMS,
      ...(typeof legacy.temperature === "number" ? { temperature: legacy.temperature } : {}),
      ...(typeof legacy.topP === "number" ? { topP: legacy.topP } : {}),
      ...(typeof legacy.maxTokens === "number" ? { maxTokens: legacy.maxTokens } : {}),
      ...((stored.params as Partial<ModelParams>) ?? {}),
    };
    const merged = { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>), params };
    if (!["plain", "mesh", "grid"].includes(merged.bgStyle as string)) merged.bgStyle = "plain";
    if (!["sans", "serif", "mono"].includes(merged.fontFamily as string)) merged.fontFamily = "sans";
    if (!["neutral", "warm"].includes(merged.palette as string)) merged.palette = "warm";
    if (!["dark", "light", "system"].includes(merged.theme as string)) merged.theme = "dark";
    delete (merged as Record<string, unknown>).temperature;
    delete (merged as Record<string, unknown>).topP;
    delete (merged as Record<string, unknown>).maxTokens;
    return merged;
  });
  const [keys, setKeys] = useState<Record<string, KeyInfo>>({});

  /* -------------------------------------------------- persistence effects */
  useEffect(() => persistChats(conversations), [conversations]);
  useEffect(() => {
    write(LS.models, models);
  }, [models]);
  useEffect(() => {
    write(LS.providers, customProviders);
  }, [customProviders]);
  useEffect(() => {
    write(LS.mcp, mcpServers);
  }, [mcpServers]);
  useEffect(() => {
    write(LS.settings, settings);
  }, [settings]);
  useEffect(() => {
    write(LS.active, activeId);
  }, [activeId]);

  /* ------------------------------------------- load encrypted keys on boot */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const slots = [
        ...(["sarvam", "openai", "anthropic", "google"] as ProviderId[]).map((p) => `p:${p}`),
        ...customProviders.map((c) => `c:${c.id}`),
      ];
      const next: Record<string, KeyInfo> = {};
      for (const slot of slots) {
        const value = await loadSecret(`key.${slot}`);
        if (value) next[slot] = { key: value, status: "none" };
      }
      if (!cancelled) {
        setKeys(next);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    import("@/lib/secureStore").then((m) => m.encryptionAvailable().then(setEncryption));
  }, []);

  /* If the user turns remembering off, purge what is already on disk but
     keep the keys in memory for this session. */
  useEffect(() => {
    if (settings.rememberKeys) return;
    (async () => {
      const slots = await Promise.resolve(Object.keys(keys));
      for (const slot of slots) await removeSecret(`key.${slot}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.rememberKeys]);

  /* --------------------------------------------- apply theme to the <html> */
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const dark =
        settings.theme === "dark" || (settings.theme === "system" && !media.matches);
      root.classList.toggle("dark", dark);
      root.classList.toggle("light", !dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "").trim();
      const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
      const n = parseInt(full || "8b5cf6", 16);
      if (Number.isNaN(n)) return "139 92 246";
      return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
    };
    root.dataset.palette = settings.palette === "warm" ? "warm" : "neutral";
    root.style.setProperty("--accent", hexToRgb(settings.accent));
    root.style.setProperty("--accent-2", hexToRgb(settings.accent2));
    root.style.setProperty("--surface-mix", String(settings.surfaceMix));
    root.style.setProperty("--border-strength", String(settings.borderStrength));
    root.style.setProperty("--radius", `${settings.radius}px`);
    root.style.setProperty("--font-scale", String(settings.fontScale));
    root.style.setProperty("--chat-width", `${settings.chatWidth}rem`);
    root.dataset.animations = settings.animations ? "on" : "off";
    root.style.setProperty(
      "--font-ui",
      settings.fontFamily === "serif"
        ? "ui-serif, Georgia, Cambria, serif"
        : settings.fontFamily === "mono"
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    );
  }, [settings]);

  /* ------------------------------------------------------------- selectors */
  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const modelById = useCallback((id: string) => models.find((m) => m.id === id), [models]);

  const visibleModels = useMemo(
    () =>
      models.filter((m) => {
        if (m.enabled === false) return false;
        if (!settings.showLegacyModels && m.status === "legacy") return false;
        return true;
      }),
    [models, settings.showLegacyModels],
  );

  const activeModel = useMemo(() => {
    if (active) {
      const m = models.find((x) => x.id === active.modelId);
      if (m) return m;
    }
    return models.find((m) => m.id === settings.defaultModelId) ?? visibleModels[0] ?? null;
  }, [active, models, settings.defaultModelId, visibleModels]);

  const autoModel = useMemo(
    () => pickAutoModel(models, keys, customProviders, {})?.model ?? null,
    [models, keys, customProviders],
  );

  const keyFor = useCallback(
    (provider: ProviderId, customId?: string) => {
      const slot = provider === "custom" && customId ? `c:${customId}` : `p:${provider}`;
      return keys[slot]?.key ?? "";
    },
    [keys],
  );

  /* ----------------------------------------------------------------- chats */
  const newChat = useCallback(
    (modelId?: string) => {
      const id = uid();
      const conv: Conversation = {
        id,
        title: "New chat",
        messages: [],
        modelId: modelId || activeModel?.id || settings.defaultModelId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations((prev) => [conv, ...prev]);
      setActiveId(id);
      return id;
    },
    [activeModel, settings.defaultModelId],
  );

  const setActive = useCallback((id: string | null) => setActiveId(id), []);

  const deleteChat = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: title.trim() || "Untitled", updatedAt: Date.now() } : c)),
    );
  }, []);

  const togglePin = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }, []);

  const toggleArchive = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c)));
  }, []);

  const clearAllChats = useCallback(() => {
    setConversations([]);
    setActiveId(null);
  }, []);

  const addMessage = useCallback((chatId: string, msg: ChatMsg) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const isFirst = c.messages.length === 0 && msg.role === "user";
        return {
          ...c,
          title: isFirst ? msg.content.slice(0, 48).replace(/\s+/g, " ").trim() || "New chat" : c.title,
          messages: [...c.messages, msg],
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const updateMessage = useCallback((chatId: string, msgId: string, patch: Partial<ChatMsg>) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
  }, []);

  const deleteMessage = useCallback((chatId: string, msgId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== msgId) } : c,
      ),
    );
  }, []);

  const dropMessagesFrom = useCallback((chatId: string, msgId: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const idx = c.messages.findIndex((m) => m.id === msgId);
        if (idx < 0) return c;
        return { ...c, messages: c.messages.slice(0, idx) };
      }),
    );
  }, []);

  const setChatModel = useCallback((chatId: string, modelId: string) => {
    setConversations((prev) => prev.map((c) => (c.id === chatId ? { ...c, modelId } : c)));
  }, []);

  const setChatParams = useCallback((chatId: string, patch: Partial<ModelParams>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, params: { ...c.params, ...patch } } : c)),
    );
  }, []);

  const clearChatParams = useCallback((chatId: string) => {
    setConversations((prev) => prev.map((c) => (c.id === chatId ? { ...c, params: undefined } : c)));
  }, []);

  /* ---------------------------------------------------------------- models */
  const toggleModelEnabled = useCallback((id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: m.enabled === false ? true : false } : m)),
    );
  }, []);

  const updateModel = useCallback((id: string, patch: Partial<ModelDef>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const deleteModel = useCallback((id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addModel = useCallback((model: ModelDef) => {
    setModels((prev) => [...prev, { ...model, enabled: true, builtin: false }]);
  }, []);

  const restoreModels = useCallback(() => {
    setModels(DEFAULT_MODELS.map((m) => ({ ...m, enabled: true })));
  }, []);

  /* ------------------------------------------------------------- providers */
  const addCustomProvider = useCallback((cp: CustomProviderDef) => {
    setCustomProviders((prev) => [...prev, cp]);
  }, []);

  const updateCustomProvider = useCallback((id: string, patch: Partial<CustomProviderDef>) => {
    setCustomProviders((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeCustomProvider = useCallback((id: string) => {
    setCustomProviders((prev) => prev.filter((c) => c.id !== id));
    setModels((prev) => prev.filter((m) => m.providerRef !== id));
    removeSecret(`key.c:${id}`);
    setKeys((prev) => {
      const next = { ...prev };
      delete next[`c:${id}`];
      return next;
    });
  }, []);

  /* ------------------------------------------------------------------ keys */
  const setKey = useCallback(
    async (slot: string, key: string) => {
      const value = key.trim();
      setKeys((prev) => ({ ...prev, [slot]: { key: value, status: "none" } }));
      if (settings.rememberKeys && value) await saveSecret(`key.${slot}`, value);
      else await removeSecret(`key.${slot}`);
    },
    [settings.rememberKeys],
  );

  const clearKey = useCallback(async (slot: string) => {
    setKeys((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    await removeSecret(`key.${slot}`);
  }, []);

  const setKeyStatus = useCallback((slot: string, status: KeyStatus, message?: string) => {
    setKeys((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] ?? { key: "" }), status, message, checkedAt: Date.now() },
    }));
  }, []);

  /* ------------------------------------------------------------------- mcp */
  const addMcpServer = useCallback((server: McpServer) => {
    setMcpServers((prev) => [...prev, server]);
  }, []);

  const updateMcpServer = useCallback((id: string, patch: Partial<McpServer>) => {
    setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeMcpServer = useCallback((id: string) => {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /* -------------------------------------------------------------- settings */
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  /* ------------------------------------------------------------ import/export */
  const exportAll = useCallback(() => {
    // keys are deliberately excluded from exports
    return JSON.stringify(
      {
        app: "sarvam-studio",
        version: 2,
        exportedAt: new Date().toISOString(),
        conversations,
        models,
        customProviders,
        mcpServers: mcpServers.map((s) => ({ ...s, status: "idle" })),
        settings,
      },
      null,
      2,
    );
  }, [conversations, models, customProviders, mcpServers, settings]);

  const importAll = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      if (data.app !== "sarvam-studio") return { ok: false, message: "Not a Sarvam Studio backup file." };
      if (Array.isArray(data.conversations)) setConversations(data.conversations);
      if (Array.isArray(data.models)) setModels(hydrateModels(data.models));
      if (Array.isArray(data.customProviders)) setCustomProviders(data.customProviders);
      if (Array.isArray(data.mcpServers)) setMcpServers(data.mcpServers);
      if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      return { ok: true, message: "Backup restored. API keys were not included — re-add them if needed." };
    } catch {
      return { ok: false, message: "Could not parse that file as JSON." };
    }
  }, []);

  const resetEverything = useCallback(async () => {
    setConversations([]);
    setActiveId(null);
    setModels(DEFAULT_MODELS.map((m) => ({ ...m, enabled: true })));
    setCustomProviders([]);
    setMcpServers([]);
    setSettings({ ...DEFAULT_SETTINGS });
    setKeys({});
    await wipeAllSecrets();
    Object.values(LS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const store: Store = {
    hydrated,
    encryption,
    conversations,
    activeId,
    active,
    models,
    visibleModels,
    customProviders,
    mcpServers,
    settings,
    keys,
    activeModel,
    autoModel,
    modelById,
    keyFor,
    newChat,
    setActive,
    deleteChat,
    renameChat,
    togglePin,
    toggleArchive,
    clearAllChats,
    addMessage,
    updateMessage,
    deleteMessage,
    dropMessagesFrom,
    setChatModel,
    setChatParams,
    clearChatParams,
    toggleModelEnabled,
    updateModel,
    deleteModel,
    addModel,
    restoreModels,
    addCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
    setKey,
    clearKey,
    setKeyStatus,
    addMcpServer,
    updateMcpServer,
    removeMcpServer,
    patchSettings,
    resetSettings,
    exportAll,
    importAll,
    resetEverything,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useApp(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Resolve the endpoint overrides a model needs (custom providers). */
export function customEndpointFor(
  model: ModelDef | null,
  customProviders: CustomProviderDef[],
) {
  if (!model) return undefined;
  if (model.provider !== "custom") {
    return {
      endpoint: model.endpoint || PROVIDERS[model.provider].endpoint,
      authHeader: PROVIDERS[model.provider].authHeader,
      authPrefix: PROVIDERS[model.provider].authPrefix,
    };
  }
  const cp = customProviders.find((c) => c.id === model.providerRef);
  return {
    endpoint: cp?.endpoint ?? "",
    modelsEndpoint: cp?.modelsEndpoint,
    authHeader: cp?.authHeader || "Authorization",
    authPrefix: cp?.authPrefix ?? "Bearer ",
  };
}
