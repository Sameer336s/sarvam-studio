/**
 * Provider + model catalog.
 *
 * Model IDs verified against vendor documentation in October 2026:
 *  - Sarvam AI  : docs.sarvam.ai (v1: sarvam-105b, sarvam-105b-conversations;
 *                 v2 open-weight: glm5.3, gemma4, deepseekv4.1-flash)
 *  - OpenAI     : developers.openai.com/api/docs/models (GPT-6 Astra, 6.1 Sol, 6 Luna,
 *                 GPT-5.6 Sol/Terra/Luna, GPT-5.4 family)
 *  - Anthropic  : platform.claude.com/docs/en/models/overview
 *                 (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5)
 *  - Google     : ai.google.dev/gemini-api/docs/models
 *                 (Gemini 4 Argon, 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Pro)
 *
 * Sarvam-M (`sarvam-m`) and Sarvam-30B (`sarvam-30b`) are gone from the API — they were
 * removed from this catalog on purpose. See RETIRED_MODELS for the migration note that
 * the Models panel shows.
 */

export type ProviderId = "sarvam" | "openai" | "anthropic" | "google" | "custom";

export type ModelStatus = "active" | "preview" | "legacy";

export type ModelDef = {
  id: string;
  name: string;
  provider: ProviderId;
  description: string;
  contextWindow: number;
  maxTokens: number;
  capabilities: string[];
  /** Per-model endpoint override (e.g. Sarvam v2 vs v1). */
  endpoint?: string;
  /** Per-model request shape override. */
  api?: "openai" | "anthropic";
  status: ModelStatus;
  /** Rough USD per 1M tokens, when the vendor publishes it. */
  pricing?: { input: number; output: number };
  /** True for models shipped with the app (custom models are false). */
  builtin?: boolean;
  enabled?: boolean;
  /** Custom provider id this model belongs to. */
  providerRef?: string;
};

export type ProviderDef = {
  id: ProviderId;
  name: string;
  short: string;
  kind: "openai" | "anthropic" | "custom";
  endpoint: string;
  modelsEndpoint?: string;
  authHeader: string;
  authPrefix: string;
  keyHint: string;
  docs: string;
  keysUrl: string;
  notes: string;
  color: string;
};

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  sarvam: {
    id: "sarvam",
    name: "Sarvam AI",
    short: "Sarvam",
    kind: "openai",
    endpoint: "https://api.sarvam.ai/v1/chat/completions",
    modelsEndpoint: "https://api.sarvam.ai/v2/models",
    authHeader: "api-subscription-key",
    authPrefix: "",
    keyHint: "sk_…",
    docs: "https://docs.sarvam.ai",
    keysUrl: "https://dashboard.sarvam.ai",
    notes:
      "Indian-language flagship models. The v2 endpoint serves the open-weight models (GLM, Gemma, DeepSeek) with the same key.",
    color: "#f97316",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    short: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    modelsEndpoint: "https://api.openai.com/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    keyHint: "sk-proj-…",
    docs: "https://platform.openai.com/docs",
    keysUrl: "https://platform.openai.com/api-keys",
    notes: "GPT-6 / GPT-5.6 families. Keys start with sk- and are billed per token.",
    color: "#10b981",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    short: "Claude",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    modelsEndpoint: "https://api.anthropic.com/v1/models",
    authHeader: "x-api-key",
    authPrefix: "",
    keyHint: "sk-ant-…",
    docs: "https://docs.anthropic.com",
    keysUrl: "https://console.anthropic.com/settings/keys",
    notes:
      "Claude Fable / Opus / Sonnet / Haiku. Browser calls are allowed via the direct-browser-access header this app sends.",
    color: "#d97757",
  },
  google: {
    id: "google",
    name: "Google Gemini",
    short: "Gemini",
    kind: "openai",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    keyHint: "AIza…",
    docs: "https://ai.google.dev/gemini-api/docs",
    keysUrl: "https://aistudio.google.com/apikey",
    notes: "Uses Gemini's OpenAI-compatibility layer, so the same request shape works.",
    color: "#3b82f6",
  },
  custom: {
    id: "custom",
    name: "Custom / self-hosted",
    short: "Custom",
    kind: "custom",
    endpoint: "",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    keyHint: "optional for local models",
    docs: "",
    keysUrl: "",
    notes:
      "Any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, OpenRouter, Groq, Together, Fireworks, a proxy…",
    color: "#a855f7",
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["sarvam", "openai", "anthropic", "google", "custom"];

const ALL_INDIAN = ["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur"];

export const DEFAULT_MODELS: ModelDef[] = [
  /* ----------------------------- Sarvam AI ----------------------------- */
  {
    id: "sarvam-105b",
    name: "Sarvam-105B",
    provider: "sarvam",
    description:
      "Sarvam's flagship 105B chat model — complex reasoning, coding and agentic work with 128K context.",
    contextWindow: 128000,
    maxTokens: 8192,
    capabilities: ["chat", "reasoning", "code", "tools", "multilingual"],
    status: "active",
    builtin: true,
  },
  {
    id: "sarvam-105b-conversations",
    name: "Sarvam-105B Conversations",
    provider: "sarvam",
    description:
      "Conversational variant post-trained for real-time dialogue and voice-agent workloads.",
    contextWindow: 128000,
    maxTokens: 4096,
    capabilities: ["chat", "multilingual", "low-latency"],
    status: "active",
    builtin: true,
  },
  {
    id: "glm5.3",
    name: "GLM-5.3 (via Sarvam)",
    provider: "sarvam",
    description:
      "Open-weight model on Sarvam's v2 endpoint with a 1M context window, visible reasoning and tool calling.",
    contextWindow: 1000000,
    maxTokens: 32768,
    capabilities: ["chat", "reasoning", "code", "tools", "long-context"],
    endpoint: "https://api.sarvam.ai/v2/chat/completions",
    status: "active",
    builtin: true,
  },
  {
    id: "deepseekv4.1-flash",
    name: "DeepSeek V4.1 Flash (via Sarvam)",
    provider: "sarvam",
    description: "Fast 1M-context reasoning model with tool calling, served by Sarvam v2.",
    contextWindow: 1000000,
    maxTokens: 32768,
    capabilities: ["chat", "reasoning", "code", "tools", "long-context"],
    endpoint: "https://api.sarvam.ai/v2/chat/completions",
    status: "active",
    builtin: true,
  },
  {
    id: "gemma4",
    name: "Gemma 4 (via Sarvam)",
    provider: "sarvam",
    description: "31B open-weight multimodal model on Sarvam v2 — text + image input, tool calling.",
    contextWindow: 131000,
    maxTokens: 32768,
    capabilities: ["chat", "vision", "tools"],
    endpoint: "https://api.sarvam.ai/v2/chat/completions",
    status: "active",
    builtin: true,
  },

  /* ------------------------------ OpenAI ------------------------------ */
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "openai",
    description: "OpenAI's most capable model for demanding reasoning and coding. 1.05M context.",
    contextWindow: 1050000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    pricing: { input: 10, output: 50 },
    builtin: true,
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: "openai",
    description: "Near-Astra performance for complex work at a lower cost.",
    contextWindow: 1050000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    pricing: { input: 2, output: 10 },
    builtin: true,
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "openai",
    description: "Most efficient GPT-6 model for focused, high-volume tasks.",
    contextWindow: 1050000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "vision", "tools"],
    status: "active",
    pricing: { input: 0.1, output: 0.5 },
    builtin: true,
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    description: "Previous-generation flagship, still fully supported. Good default for agents.",
    contextWindow: 400000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools"],
    status: "active",
    builtin: true,
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "openai",
    description: "Balanced mid-tier model — the recommended replacement for GPT-5 mini.",
    contextWindow: 400000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools"],
    status: "active",
    builtin: true,
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "openai",
    description: "Small, cheap, fast — classification, extraction and short answers.",
    contextWindow: 400000,
    maxTokens: 128000,
    capabilities: ["chat", "vision", "tools"],
    status: "active",
    builtin: true,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    description: "General-purpose GPT-5.4 release. Kept for teams already pinned to it.",
    contextWindow: 400000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools"],
    status: "legacy",
    builtin: true,
  },

  /* ----------------------------- Anthropic ---------------------------- */
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    description:
      "Anthropic's most capable model for demanding reasoning and long-horizon agentic work. Adaptive thinking.",
    contextWindow: 1000000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    pricing: { input: 10, output: 50 },
    builtin: true,
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    description: "For long-running agentic coding and knowledge work. Always-on adaptive thinking.",
    contextWindow: 1000000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    pricing: { input: 4, output: 20 },
    builtin: true,
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    description: "The best speed/intelligence balance — the everyday workhorse.",
    contextWindow: 1000000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    pricing: { input: 2, output: 10 },
    builtin: true,
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    provider: "anthropic",
    description: "Fastest, cheapest Claude — classification, extraction, routing.",
    contextWindow: 1000000,
    maxTokens: 128000,
    capabilities: ["chat", "vision", "tools", "low-latency"],
    status: "active",
    builtin: true,
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    description: "Previous-generation Opus, still active on the API.",
    contextWindow: 1000000,
    maxTokens: 128000,
    capabilities: ["chat", "reasoning", "code", "vision", "tools"],
    status: "legacy",
    builtin: true,
  },

  /* ------------------------------ Google ------------------------------ */
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon",
    provider: "google",
    description:
      "Google's most capable model for complex coding, agentic, math and science tasks (GA Oct 2026).",
    contextWindow: 1000000,
    maxTokens: 65536,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    builtin: true,
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google",
    description: "Frontier-class intelligence at Flash speed and price. Great default.",
    contextWindow: 1000000,
    maxTokens: 65536,
    capabilities: ["chat", "reasoning", "code", "vision", "tools", "long-context"],
    status: "active",
    builtin: true,
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "google",
    description: "Stable, token-efficient Flash model for high-volume work.",
    contextWindow: 1000000,
    maxTokens: 65536,
    capabilities: ["chat", "code", "vision", "tools"],
    status: "active",
    builtin: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    provider: "google",
    description: "Low-latency, low-cost model for subagents and automation.",
    contextWindow: 1000000,
    maxTokens: 65536,
    capabilities: ["chat", "vision", "tools", "low-latency"],
    status: "active",
    builtin: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (preview)",
    provider: "google",
    description: "Preview Pro model with deep world knowledge and multimodal reasoning.",
    contextWindow: 1000000,
    maxTokens: 65536,
    capabilities: ["chat", "reasoning", "code", "vision", "tools"],
    status: "preview",
    builtin: true,
  },
];

/** Models that no longer exist on the vendor API — kept as a migration note only. */
export const RETIRED_MODELS: { id: string; name: string; provider: ProviderId; note: string }[] = [
  {
    id: "sarvam-m",
    name: "Sarvam-M (24B)",
    provider: "sarvam",
    note:
      "Deprecated by Sarvam in June 2026 and no longer accepted by the Chat Completions API — requests fail with invalid_request_error. Removed from this app; use Sarvam-105B.",
  },
  {
    id: "sarvam-30b",
    name: "Sarvam-30B",
    provider: "sarvam",
    note:
      "Fully deprecated in July 2026. Sarvam-105B is now the only supported Sarvam chat model. Removed from this app.",
  },
  {
    id: "sarvam-105b-32k / sarvam-30b-16k",
    name: "Fixed-context Sarvam variants",
    provider: "sarvam",
    note:
      "Retired in May 2026 — the base sarvam-105b / sarvam-30b IDs now serve the full context window.",
  },
  {
    id: "gpt-4o / gpt-4.1 / gpt-5-mini",
    name: "Older OpenAI models",
    provider: "openai",
    note:
      "GPT-4.1 / GPT-4o shut down 14 Jan 2027 and GPT-5 / GPT-5 mini shut down 11 Dec 2026. Migrate to GPT-6 Luna or GPT-5.6 Terra.",
  },
  {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    note: "Retired 5 Aug 2026. Use Claude Opus 5.5.",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    note: "Deprecated 30 Sep 2026, retires 30 Nov 2026. Use Claude Sonnet 5.5.",
  },
  {
    id: "gemini-3.7-flash / gemini-3.5-flash",
    name: "Older Gemini Flash models",
    provider: "google",
    note:
      "Requests are auto-routed to gemini-3.8-flash / gemini-3.6-flash. Update the model string.",
  },
];

export const CAPABILITIES = [
  "chat",
  "reasoning",
  "code",
  "vision",
  "tools",
  "long-context",
  "multilingual",
  "low-latency",
];

export const LANGUAGES_HINT = ALL_INDIAN;

/* ==================================================================
   Free & open-source setup presets.

   One click creates a custom provider (endpoint + auth header) and adds
   its models to the catalogue. Local servers need no key at all; hosted
   free tiers need a free key. Model IDs on hosted gateways rotate often —
   every provider card has a "list models" button that pulls the live IDs
   for your key, which is the reliable way to see what you actually have.
   ================================================================== */

export type FreePreset = {
  id: string;
  name: string;
  short: string;
  endpoint: string;
  modelsEndpoint: string;
  authHeader: string;
  authPrefix: string;
  /** Hosted gateways need a key; local servers do not. */
  needsKey: boolean;
  /** true for servers running on the user's own machine */
  local: boolean;
  note: string;
  keysUrl?: string;
  models: { id: string; label: string; contextWindow?: number; maxTokens?: number; vision?: boolean }[];
};

export const FREE_PRESETS: FreePreset[] = [
  {
    id: "ollama",
    name: "Ollama",
    short: "Ollama",
    endpoint: "http://localhost:11434/v1/chat/completions",
    modelsEndpoint: "http://localhost:11434/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: false,
    local: true,
    note: "Runs models on your own machine. Install Ollama, `ollama pull llama3.2`, then use the ↻ button to list what you have.",
    models: [
      { id: "llama3.2", label: "Llama 3.2 3B", contextWindow: 131072 },
      { id: "qwen2.5", label: "Qwen 2.5 7B", contextWindow: 32768 },
      { id: "deepseek-r1", label: "DeepSeek R1 (reasoning)", contextWindow: 131072 },
      { id: "gemma3", label: "Gemma 3", contextWindow: 131072, vision: true },
      { id: "phi4", label: "Phi-4", contextWindow: 16384 },
      { id: "llava", label: "LLaVA (vision)", contextWindow: 4096, vision: true },
    ],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    short: "LM Studio",
    endpoint: "http://localhost:1234/v1/chat/completions",
    modelsEndpoint: "http://localhost:1234/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: false,
    local: true,
    note: "Desktop app with a built-in OpenAI-compatible server. Start the server (Developer tab) and press ↻ to import the models you downloaded.",
    models: [],
  },
  {
    id: "llamacpp",
    name: "llama.cpp server",
    short: "llama.cpp",
    endpoint: "http://localhost:8080/v1/chat/completions",
    modelsEndpoint: "http://localhost:8080/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: false,
    local: true,
    note: "`llama-server -m model.gguf --port 8080` exposes an OpenAI-compatible API. Fastest path to a fully offline chat.",
    models: [],
  },
  {
    id: "vllm",
    name: "vLLM / SGLang",
    short: "vLLM",
    endpoint: "http://localhost:8000/v1/chat/completions",
    modelsEndpoint: "http://localhost:8000/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: false,
    local: true,
    note: "Self-hosted GPU serving. Point at your vLLM or SGLang server; press ↻ to import the served model IDs.",
    models: [],
  },
  {
    id: "openrouter-free",
    name: "OpenRouter (free models)",
    short: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    modelsEndpoint: "https://openrouter.ai/api/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://openrouter.ai/keys",
    note: "Free key, no card. IDs ending in :free cost nothing but are capped (50 requests/day under $10 lifetime spend, 1000 above). `openrouter/free` auto-picks an available free model.",
    models: [
      { id: "openrouter/free", label: "Free router (auto-picks)", contextWindow: 131072 },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", contextWindow: 1000000 },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", contextWindow: 1000000 },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", contextWindow: 262144, vision: true },
      { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B", contextWindow: 262144, vision: true },
      { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1 (coding)", contextWindow: 262144 },
    ],
  },
  {
    id: "groq",
    name: "Groq (free tier)",
    short: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    modelsEndpoint: "https://api.groq.com/openai/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://console.groq.com/keys",
    note: "Free key, extremely fast inference. The free tier currently serves the open-weight models below (30 req/min, 1000/day).",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", contextWindow: 131072 },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", contextWindow: 131072 },
      { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", contextWindow: 131072, vision: true },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face Inference",
    short: "HF",
    endpoint: "https://router.huggingface.co/v1/chat/completions",
    modelsEndpoint: "https://router.huggingface.co/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://huggingface.co/settings/tokens",
    note: "Free monthly inference credits with a read token. Hundreds of open-weight models — press ↻ to list the ones your token can call.",
    models: [],
  },
  {
    id: "together",
    name: "Together AI",
    short: "Together",
    endpoint: "https://api.together.xyz/v1/chat/completions",
    modelsEndpoint: "https://api.together.xyz/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://api.together.ai/settings/api-keys",
    note: "Open-weight models hosted at scale; has a free starter tier. Press ↻ to import the current model IDs.",
    models: [],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    short: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    modelsEndpoint: "https://api.deepseek.com/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://platform.deepseek.com/api_keys",
    note: "Very cheap open-weight models, including a reasoning model. Paid, but small credit goes a long way.",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", contextWindow: 131072 },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", contextWindow: 131072 },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    short: "Mistral",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    modelsEndpoint: "https://api.mistral.ai/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://console.mistral.ai/api-keys",
    note: "Free experiment tier. Open-weight Mistral and Codestral models.",
    models: [
      { id: "open-mistral-nemo", label: "Mistral Nemo", contextWindow: 131072 },
      { id: "mistral-small-latest", label: "Mistral Small", contextWindow: 131072 },
      { id: "codestral-latest", label: "Codestral (code)", contextWindow: 262144 },
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    short: "Cerebras",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    modelsEndpoint: "https://api.cerebras.ai/v1/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://cloud.cerebras.ai",
    note: "Free tier with very high tokens/sec on open-weight models. Press ↻ to list what your key can use.",
    models: [],
  },
  {
    id: "github-models",
    name: "GitHub Models",
    short: "GitHub",
    endpoint: "https://models.github.ai/inference/chat/completions",
    modelsEndpoint: "https://models.github.ai/catalog/models",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    needsKey: true,
    local: false,
    keysUrl: "https://github.com/settings/tokens",
    note: "Included with a GitHub account (PAT with models:read). Rate-limited but genuinely free.",
    models: [],
  },
];
