import type { ModelDef, ProviderId } from "@/lib/catalog";
import { PROVIDERS } from "@/lib/catalog";
import { MAX_OUTPUT_CEILING, type Attachment, type ModelParams } from "@/lib/types";

/* ------------------------------------------------------------------ types */

export type ApiRole = "system" | "user" | "assistant" | "tool";

export type ApiMessage = {
  role: ApiRole;
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

export type ToolSpec = {
  name: string;
  description?: string;
  parameters: any;
};

export type ToolCall = { id: string; name: string; arguments: string };

export type StreamEvent = {
  delta?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
  toolCalls?: ToolCall[];
  usage?: { prompt?: number; completion?: number };
};

export type Target = {
  endpoint: string;
  api: "openai" | "anthropic";
  headers: Record<string, string>;
  model: string;
};

export class ProviderError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type CustomEndpoint = {
  endpoint: string;
  modelsEndpoint?: string;
  authHeader: string;
  authPrefix: string;
};

/**
 * Output-token budget for a request.
 * `null` (auto) means "whatever the model documents" — which is what the model
 * catalogue carries. A manual value is sent verbatim up to the 2M ceiling, so a
 * user who knows their endpoint supports more is not silently clamped; providers
 * that do not support it answer with a clear 400 instead.
 */
export function resolveMaxTokens(value: number | null | undefined, model: ModelDef): number {
  const raw = value == null ? model.maxTokens : Math.floor(value);
  return Math.max(1, Math.min(Number.isFinite(raw) ? raw : model.maxTokens, MAX_OUTPUT_CEILING));
}

export type RequestOpts = {
  params?: Partial<ModelParams>;
  tools?: ToolSpec[];
  signal?: AbortSignal;
};

export function classify(status: number, body: string): ProviderError {
  const snippet = (body || "").slice(0, 300);
  if (status === 401 || status === 403)
    return new ProviderError(
      "Invalid or unauthorised API key. Open Settings → API keys and check the key for this provider.",
      status,
      "auth",
    );
  if (status === 402)
    return new ProviderError("Payment required — the provider account is out of credit.", status, "billing");
  if (status === 404)
    return new ProviderError(
      `Model or endpoint not found. This model ID may have been retired by the provider.${
        snippet ? ` (${snippet})` : ""
      }`,
      status,
      "not_found",
    );
  if (status === 413)
    return new ProviderError("Payload too large — remove an attachment or lower max tokens.", status, "too_large");
  if (status === 429)
    return new ProviderError("Rate limit or quota exceeded. Wait a moment and retry.", status, "rate_limit");
  if (status === 400 || status === 422)
    return new ProviderError(
      `Bad request: ${snippet || "the provider rejected the parameters."}`,
      status,
      "bad_request",
    );
  if (status >= 500)
    return new ProviderError("The provider is temporarily unavailable. Try again shortly.", status, "server");
  return new ProviderError(snippet || `Request failed (${status}).`, status, "unknown");
}

/* --------------------------------------------------------------- resolve */

function authHeaders(provider: ProviderId, apiKey: string, custom?: CustomEndpoint) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "anthropic") {
    h["x-api-key"] = apiKey;
    h["anthropic-version"] = "2026-10-21";
    h["anthropic-dangerous-direct-browser-access"] = "true";
  } else if (provider === "sarvam") {
    h["api-subscription-key"] = apiKey;
    if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "custom") {
    const header = custom?.authHeader?.trim() || "Authorization";
    const prefix = custom?.authPrefix ?? "Bearer ";
    if (apiKey) h[header] = prefix ? `${prefix}${apiKey}` : apiKey;
  } else {
    h["Authorization"] = `Bearer ${apiKey}`;
  }
  return h;
}

export function resolveTarget(model: ModelDef, apiKey: string, custom?: CustomEndpoint): Target {
  const provider = model.provider;
  const def = PROVIDERS[provider];
  const endpoint = model.endpoint || (provider === "custom" ? custom?.endpoint ?? "" : def.endpoint);
  return {
    endpoint,
    api: provider === "anthropic" ? "anthropic" : "openai",
    headers: authHeaders(provider, apiKey, custom),
    model: model.id,
  };
}

/* ------------------------------------------------------- attachments -> parts */

const IMAGE_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

export function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(IMAGE_RE);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

function textFileBlock(a: Attachment) {
  const body = a.text ?? "";
  const trimmed = body.length > 20000 ? `${body.slice(0, 20000)}\n…(truncated)` : body;
  return `\n\n--- file: ${a.name} ---\n${trimmed}\n--- end of ${a.name} ---`;
}

/**
 * Turns a chat message (text + attachments) into provider-shaped content.
 * Images go as real image parts; text files are inlined as fenced blocks so
 * even text-only models can use them.
 */
function userContent(msg: { content: string; attachments?: Attachment[] }, api: "openai" | "anthropic") {
  const atts = msg.attachments ?? [];
  if (atts.length === 0) return msg.content;

  const images = atts.filter((a) => a.kind === "image" && a.dataUrl);
  const files = atts.filter((a) => a.kind === "text" && a.text);
  const text = msg.content + files.map(textFileBlock).join("");

  if (images.length === 0) return text;

  if (api === "anthropic") {
    const parts: any[] = images
      .map((a) => {
        const split = splitDataUrl(a.dataUrl!);
        if (!split) return null;
        return {
          type: "image",
          source: { type: "base64", media_type: split.mediaType, data: split.data },
        };
      })
      .filter(Boolean);
    if (text.trim()) parts.push({ type: "text", text });
    return parts;
  }

  const parts: any[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const a of images) {
    parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
  }
  return parts;
}

/** Build the wire messages for a whole conversation. */
export function toApiMessages(
  msgs: { role: "system" | "user" | "assistant"; content: string; attachments?: Attachment[] }[],
  api: "openai" | "anthropic",
): ApiMessage[] {
  return msgs.map((m) => ({
    role: m.role,
    content: m.role === "user" ? userContent(m, api) : m.content,
  }));
}

/* ------------------------------------------------------------- request body */

function reasoningEffortFor(provider: ProviderId, effort?: ModelParams["reasoningEffort"]) {
  if (!effort || effort === "auto") return undefined;
  // Sarvam's v2 reasoning models document low / high / max only.
  if (provider === "sarvam") return effort === "high" ? "max" : effort === "medium" ? "high" : "low";
  return effort;
}

function openAiBody(
  model: ModelDef,
  messages: ApiMessage[],
  stream: boolean,
  opts: RequestOpts,
) {
  const p = opts.params ?? {};
  const body: Record<string, unknown> = { model: model.id, messages, stream };

  if (typeof p.temperature === "number") body.temperature = p.temperature;
  if (typeof p.topP === "number") body.top_p = p.topP;
  if (typeof p.topK === "number" && p.topK > 0) body.top_k = p.topK;
  if (typeof p.presencePenalty === "number" && p.presencePenalty !== 0)
    body.presence_penalty = p.presencePenalty;
  if (typeof p.frequencyPenalty === "number" && p.frequencyPenalty !== 0)
    body.frequency_penalty = p.frequencyPenalty;
  if (typeof p.seed === "number") body.seed = p.seed;
  if (Array.isArray(p.stop) && p.stop.length) body.stop = p.stop.slice(0, 4);
  if (p.jsonMode) body.response_format = { type: "json_object" };

  const effort = reasoningEffortFor(model.provider, p.reasoningEffort);
  if (effort) body.reasoning_effort = effort;

  const maxOut = resolveMaxTokens(p.maxTokens, model);
  if (maxOut) {
    // OpenAI's reasoning models want max_completion_tokens; everyone else uses max_tokens.
    if (model.provider === "openai") body.max_completion_tokens = maxOut;
    else body.max_tokens = maxOut;
  }

  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  if (stream) body.stream_options = { include_usage: true };
  return body;
}

function anthropicBody(
  model: ModelDef,
  messages: ApiMessage[],
  stream: boolean,
  opts: RequestOpts,
) {
  const p = opts.params ?? {};
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: resolveMaxTokens(p.maxTokens, model),
    messages: rest.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: m.tool_call_id, content: String(m.content ?? "") },
          ],
        };
      }
      return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
    }),
    stream,
  };
  if (system) body.system = system;
  if (typeof p.temperature === "number") body.temperature = p.temperature;
  if (typeof p.topP === "number") body.top_p = p.topP;
  if (typeof p.topK === "number" && p.topK > 0) body.top_k = p.topK;
  if (Array.isArray(p.stop) && p.stop.length) body.stop_sequences = p.stop.slice(0, 4);
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  return body;
}

/* --------------------------------------------------------------- SSE parse */

async function* readSse(
  res: Response,
  api: "openai" | "anthropic",
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const reader = res.body?.getReader();
  if (!reader) {
    yield { error: "This provider did not return a readable stream." };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: any;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.error) {
          yield { error: json.error.message || "Provider returned an error mid-stream." };
          return;
        }
        if (api === "anthropic") {
          if (json.type === "content_block_delta") {
            if (json.delta?.type === "text_delta" && json.delta.text) yield { delta: json.delta.text };
            if (json.delta?.type === "thinking_delta" && json.delta.thinking)
              yield { reasoning: json.delta.thinking };
          }
          if (json.type === "message_delta" && json.usage) {
            yield { usage: { completion: json.usage.output_tokens } };
          }
        } else {
          const delta = json.choices?.[0]?.delta;
          if (delta) {
            if (typeof delta.content === "string" && delta.content) yield { delta: delta.content };
            else if (Array.isArray(delta.content)) {
              const text = delta.content
                .map((c: any) => (c?.type === "text" ? c.text : c?.image_url?.url ? `\n\n![](${c.image_url.url})\n\n` : ""))
                .join("");
              if (text) yield { delta: text };
            }
            if (delta.reasoning_content) yield { reasoning: delta.reasoning_content };
          }
          if (json.usage) {
            yield {
              usage: { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens },
            };
          }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") yield { error: "The stream was interrupted." };
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ calls */

export async function streamChat(args: {
  model: ModelDef;
  apiKey: string;
  messages: ApiMessage[];
  custom?: CustomEndpoint;
  params?: Partial<ModelParams>;
  tools?: ToolSpec[];
  signal?: AbortSignal;
}): Promise<AsyncGenerator<StreamEvent>> {
  const { model, apiKey, messages, custom, signal } = args;
  const target = resolveTarget(model, apiKey, custom);
  if (!target.endpoint) {
    return (async function* () {
      yield {
        error: "No endpoint configured for this model. Open Settings → API keys and add an endpoint.",
      };
    })();
  }
  const body =
    target.api === "anthropic"
      ? anthropicBody(model, messages, true, args)
      : openAiBody(model, messages, true, args);

  let res: Response;
  try {
    res = await fetch(target.endpoint, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return (async function* () {
        yield { done: true };
      })();
    }
    return (async function* () {
      yield {
        error:
          "Could not reach the provider from the browser (network or CORS). If your key is correct, route requests through a proxy — see .env.example.",
      };
    })();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return (async function* () {
      yield { error: classify(res.status, text).message };
    })();
  }
  return readSse(res, target.api, signal);
}

/** One non-streaming turn — used for tool planning and for non-stream mode. */
export async function completeOnce(args: {
  model: ModelDef;
  apiKey: string;
  messages: ApiMessage[];
  custom?: CustomEndpoint;
  params?: Partial<ModelParams>;
  tools?: ToolSpec[];
  signal?: AbortSignal;
}): Promise<{ text: string; toolCalls: ToolCall[]; raw?: any }> {
  const { model, apiKey, messages, custom, signal } = args;
  const target = resolveTarget(model, apiKey, custom);
  if (!target.endpoint) throw new ProviderError("No endpoint configured for this model.", 0, "no_endpoint");
  const body =
    target.api === "anthropic"
      ? anthropicBody(model, messages, false, args)
      : openAiBody(model, messages, false, args);

  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: target.headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw classify(res.status, text);
  }
  const json: any = await res.json();

  if (target.api === "anthropic") {
    const blocks = json.content ?? [];
    const text = blocks
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const images = blocks
      .filter((b: any) => b.type === "image" && b.source?.data)
      .map((b: any) => `\n\n![](data:${b.source.media_type};base64,${b.source.data})\n\n`)
      .join("");
    const toolCalls: ToolCall[] = blocks
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }));
    return { text: text + images, toolCalls, raw: json };
  }

  const msg = json.choices?.[0]?.message ?? {};
  let content = "";
  if (typeof msg.content === "string") content = msg.content;
  else if (Array.isArray(msg.content)) {
    content = msg.content
      .map((c: any) =>
        c?.type === "text" ? c.text : c?.image_url?.url ? `\n\n![](${c.image_url.url})\n\n` : "",
      )
      .join("");
  }
  // some image models put the picture in `images[]`
  if (Array.isArray(msg.images)) {
    content += msg.images
      .map((img: any) => {
        const url = img?.image_url?.url ?? img?.url;
        return url ? `\n\n![](${url})\n\n` : "";
      })
      .join("");
  }
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments ?? "{}",
  }));
  return { text: content, toolCalls, raw: json };
}

/* -------------------------------------------------------------- validate */

export async function validateKey(
  provider: ProviderId,
  apiKey: string,
  custom?: CustomEndpoint,
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim() && provider !== "custom")
    return { ok: false, message: "Enter a key first." };
  const def = PROVIDERS[provider];
  const modelsUrl = provider === "custom" ? custom?.modelsEndpoint?.trim() || "" : def.modelsEndpoint || "";

  // Preferred: a cheap authenticated GET /models — validates without spending tokens.
  if (modelsUrl) {
    try {
      const res = await fetch(modelsUrl, { headers: authHeaders(provider, apiKey, custom) });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const count = Array.isArray(json?.data) ? json.data.length : Array.isArray(json?.models) ? json.models.length : undefined;
        return {
          ok: true,
          message: count ? `Key valid — ${count} models available.` : "Key validated successfully.",
        };
      }
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: classify(res.status, text).message };
      }
    } catch {
      // network/CORS — fall through to a ping
    }
  }

  // Fallback: 1-token chat ping.
  const probe: ModelDef = {
    id:
      provider === "openai"
        ? "gpt-6-luna"
        : provider === "google"
          ? "gemini-3.5-flash-lite"
          : provider === "anthropic"
            ? "claude-haiku-5-5"
            : provider === "custom"
              ? ""
              : "sarvam-105b",
    name: "probe",
    provider,
    description: "",
    contextWindow: 8000,
    maxTokens: 1,
    capabilities: [],
    status: "active",
    endpoint: provider === "custom" ? custom?.endpoint : undefined,
  };
  if (!probe.id) return { ok: true, message: "No key needed for this endpoint." };
  try {
    await completeOnce({
      model: probe,
      apiKey,
      messages: [{ role: "user", content: "ping" }],
      custom,
      params: { maxTokens: 1 },
    });
    return { ok: true, message: "Key validated successfully." };
  } catch (e) {
    if (e instanceof ProviderError) return { ok: false, message: e.message };
    return {
      ok: false,
      message:
        "Could not verify the key — the browser could not reach the provider (CORS or network). The key may still be correct.",
    };
  }
}

/** Fetches live model IDs from the provider, when it exposes a listing endpoint. */
export async function fetchLiveModels(
  provider: ProviderId,
  apiKey: string,
  custom?: CustomEndpoint,
): Promise<string[]> {
  const def = PROVIDERS[provider];
  const url = provider === "custom" ? custom?.modelsEndpoint?.trim() : def.modelsEndpoint;
  if (!url) throw new ProviderError("This provider has no model-listing endpoint.", 0, "no_endpoint");
  const res = await fetch(url, { headers: authHeaders(provider, apiKey, custom) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw classify(res.status, text);
  }
  const json: any = await res.json();
  const list: string[] = Array.isArray(json?.data)
    ? json.data.map((m: any) => m.id).filter(Boolean)
    : Array.isArray(json?.models)
      ? json.models.map((m: any) => (m.name || m.id || "").replace(/^models\//, "")).filter(Boolean)
      : [];
  return [...new Set(list)].sort();
}
