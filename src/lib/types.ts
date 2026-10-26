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

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  modelId?: string;
  error?: boolean;
  reasoning?: string;
  toolRuns?: ToolRun[];
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
};

export type CustomProviderDef = {
  id: string;
  name: string;
  endpoint: string;
  modelsEndpoint?: string;
  authHeader: string;
  authPrefix: string;
  color?: string;
};

export type KeyStatus = "none" | "checking" | "valid" | "invalid";

export type KeyInfo = {
  key: string;
  status: KeyStatus;
  message?: string;
  checkedAt?: number;
};

export type Settings = {
  theme: "dark" | "light" | "system";
  accent: string;
  accent2: string;
  bgStyle: "aurora" | "mesh" | "plain" | "grid";
  glassBlur: number;
  glassAlpha: number;
  glassBorder: number;
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
  temperature: number;
  topP: number;
  maxTokens: number;
  streaming: boolean;
  sendOnEnter: boolean;
  contextMessages: number;

  rememberKeys: boolean;
  showLegacyModels: boolean;
  defaultModelId: string;
};

export const DEFAULT_SYSTEM_PROMPT =
  "You are a precise, helpful assistant. Answer in the user's language and script. Prefer clear structure, use Markdown, and say plainly when you are unsure. When MCP tools are available, use them instead of guessing.";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "#8b5cf6",
  accent2: "#38bdf8",
  bgStyle: "aurora",
  glassBlur: 20,
  glassAlpha: 0.07,
  glassBorder: 0.14,
  radius: 18,
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
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 4096,
  streaming: true,
  sendOnEnter: true,
  contextMessages: 24,

  rememberKeys: true,
  showLegacyModels: false,
  defaultModelId: "sarvam-105b",
};

export const ACCENT_PRESETS: { name: string; accent: string; accent2: string }[] = [
  { name: "Violet Sky", accent: "#8b5cf6", accent2: "#38bdf8" },
  { name: "Saffron", accent: "#f97316", accent2: "#fbbf24" },
  { name: "Emerald", accent: "#10b981", accent2: "#22d3ee" },
  { name: "Rose", accent: "#f43f5e", accent2: "#fb7185" },
  { name: "Indigo", accent: "#6366f1", accent2: "#a78bfa" },
  { name: "Teal", accent: "#14b8a6", accent2: "#84cc16" },
  { name: "Graphite", accent: "#94a3b8", accent2: "#64748b" },
];

export type AppState = {
  conversations: Conversation[];
  activeId: string | null;
  models: ModelDef[];
  customProviders: CustomProviderDef[];
  mcpServers: McpServer[];
  settings: Settings;
  keys: Record<string, KeyInfo>;
};
