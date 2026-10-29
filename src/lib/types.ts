import type { ModelDef } from "@/lib/catalog";
import type { McpServer } from "@/lib/mcp";

export type ToolRun = {
  id: string;
  serverName: string;
  name: string;
  args: any;
  result?: string;
  status: "running" | "ok" | "error";
  ms?: number;
};

/** A file the user attached to a message. */
export type Attachment = {
  id: string;
  kind: "image" | "text";
  name: string;
  mime: string;
  /** Original size in bytes. */
  size: number;
  /** data: URL for images (downscaled). */
  dataUrl?: string;
  /** Extracted plain text for text-like files. */
  text?: string;
  width?: number;
  height?: number;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set when a reply was cut short, so the UI can offer "Continue". */
  notice?: "length" | "interrupted";
  createdAt: number;
  modelId?: string;
  error?: boolean;
  reasoning?: string;
  toolRuns?: ToolRun[];
  attachments?: Attachment[];
  usage?: { prompt?: number; completion?: number };
  stopped?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMsg[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  /** Per-chat overrides on top of the global parameter defaults. */
  params?: Partial<ModelParams>;
};

export type CustomProviderDef = {
  id: string;
  name: string;
  endpoint: string;
  modelsEndpoint?: string;
  authHeader: string;
  authPrefix: string;
  color?: string;
  /** Free / open-source preset this provider came from. */
  presetId?: string;
};

export type KeyStatus = "none" | "checking" | "valid" | "invalid";

export type KeyInfo = {
  key: string;
  status: KeyStatus;
  message?: string;
  checkedAt?: number;
};

/** Everything a model request can be tuned with. */
export type ModelParams = {
  temperature: number;
  topP: number;
  topK: number | null;
  /** null = use the model's own documented output limit (auto). */
  maxTokens: number | null;
  presencePenalty: number;
  frequencyPenalty: number;
  seed: number | null;
  stop: string[];
  reasoningEffort: "auto" | "low" | "medium" | "high";
  jsonMode: boolean;
};

/** Hard ceiling for a manual override. Providers reject anything they do not support. */
export const MAX_OUTPUT_CEILING = 2_000_000;

export const DEFAULT_PARAMS: ModelParams = {
  temperature: 0.7,
  topP: 0.95,
  topK: null,
  maxTokens: null,
  presencePenalty: 0,
  frequencyPenalty: 0,
  seed: null,
  stop: [],
  reasoningEffort: "auto",
  jsonMode: false,
};

export type Settings = {
  theme: "dark" | "light" | "system";
  /** neutral = graphite/greys, warm = mocha brown surfaces */
  palette: "neutral" | "warm";
  accent: string;
  accent2: string;
  bgStyle: "plain" | "mesh" | "grid";
  surfaceMix: number;
  borderStrength: number;
  radius: number;
  fontFamily: "sans" | "serif" | "mono";
  fontScale: number;
  density: "comfortable" | "compact";
  bubbleStyle: "bubbles" | "flat";
  chatWidth: number;
  showTimestamps: boolean;
  showAvatars: boolean;
  animations: boolean;
  showUsage: boolean;

  systemPrompt: string;
  params: ModelParams;
  streaming: boolean;
  sendOnEnter: boolean;
  contextMessages: number;

  rememberKeys: boolean;
  showLegacyModels: boolean;
  defaultModelId: string;

  /** What "Auto" sends as the output budget. */
  autoMaxTokens: "max" | "balanced";
  /** Spoken replies (talk mode). */
  speakReplies: boolean;
  voiceRate: number;
  /** BCP-47 code for speech-to-text, or "unknown" to auto-detect. */
  sttLanguage: string;
  /** Send the transcript automatically when recording stops. */
  talkAutoSend: boolean;
};

export const DEFAULT_SYSTEM_PROMPT =
  "You are a precise, helpful assistant. Answer in the user's language and script. Prefer clear structure, use Markdown, and say plainly when you are unsure. When MCP tools are available, use them instead of guessing.";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  palette: "warm",
  accent: "#C8792C",
  accent2: "#F4D9A0",
  bgStyle: "plain",
  surfaceMix: 1,
  borderStrength: 0.12,
  radius: 12,
  fontFamily: "sans",
  fontScale: 1,
  density: "comfortable",
  bubbleStyle: "bubbles",
  chatWidth: 48,
  showTimestamps: false,
  showAvatars: true,
  animations: true,
  showUsage: true,

  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  params: { ...DEFAULT_PARAMS },
  streaming: true,
  sendOnEnter: true,
  contextMessages: 24,

  rememberKeys: true,
  showLegacyModels: false,
  defaultModelId: "sarvam-105b",

  autoMaxTokens: "max",
  speakReplies: false,
  voiceRate: 1,
  sttLanguage: "unknown",
  talkAutoSend: true,
};

export const ACCENT_PRESETS: {
  name: string;
  accent: string;
  accent2: string;
  palette?: "warm" | "neutral";
}[] = [
  { name: "Mocha Gold", accent: "#C8792C", accent2: "#F4D9A0", palette: "warm" },
  { name: "Indigo", accent: "#6366f1", accent2: "#8b5cf6" },
  { name: "Saffron", accent: "#ea580c", accent2: "#f59e0b" },
  { name: "Emerald", accent: "#059669", accent2: "#10b981" },
  { name: "Rose", accent: "#e11d48", accent2: "#f43f5e" },
  { name: "Sky", accent: "#0284c7", accent2: "#38bdf8" },
  { name: "Teal", accent: "#0d9488", accent2: "#14b8a6" },
  { name: "Graphite", accent: "#475569", accent2: "#64748b" },
];

/** Attachment limits. Images are downscaled before they are stored. */
export const ATTACH = {
  maxFiles: 6,
  maxImageDim: 1280,
  imageQuality: 0.82,
  maxImageBytes: 8 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTextChars: 40000,
};
