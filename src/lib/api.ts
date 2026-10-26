import type { ModelDef, ProviderId } from "@/lib/catalog";
import { PROVIDERS } from "@/lib/catalog";

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

export function classify(status: number, body: string): ProviderError {
  const snippet = (body || "").slice(0, 300);
  if (status === 401 || status === 403)
    return new ProviderError(
      "Invalid or unauthorised API key. Open Settings → Providers and check the key for this provider.",
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
  if (status === 429)
    return new ProviderError("Rate limit or quota exceeded. Wait a moment and retry.", status, "rate_limit");
  if (status === 400 || status === 422)
    return new ProviderError(`Bad request: ${snippet || "the provider rejected the parameters."}`, status, "bad_request");
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
    // lets the browser talk to api.anthropic.com without a proxy
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

export function resolveTarget(
  model: ModelDef,
  apiKey: string,
  custom?: CustomEndpoint,
): Target {
  const provider = model.provider;
  const def = PROVIDERS[provider];
  const endpoint =
    model.endpoint || (provider === "custom" ? custom?.endpoint ?? "" : def.endpoint);
  return {
    endpoint,
    api: provider === "anthropic" ? "anthropic" : "openai",
    headers: authHeaders(provider, apiKey, custom),
    model: model.id,
  };
}

/* ------------------------------------------------------------- request body */

function openAiBody(
  model: ModelDef,
  messages: ApiMessage[],
  stream: boolean,
  opts: { temperature?: number; topP?: number; maxTokens?: number; tools?: ToolSpec[] },
) {
  const body: Record<string, unknown> = {
    model: model.id,
    messages,
    stream,
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.topP === "number") body.top_p = opts.topP;
  const maxOut = Math.min(opts.maxTokens || model.maxTokens, model.maxTokens);
  if (maxOut) {
    // OpenAI's newer reasoning models want max_completion_tokens; everyone else uses max_tokens.
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
  opts: { temperature?: number; topP?: number; maxTokens?: number; tools?: ToolSpec[] },
) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: Math.min(opts.maxTokens || model.maxTokens, model.maxTokens),
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
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.topP === "number") body.top_p = opts.topP;
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
          const choice = json.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content) yield { delta: typeof delta.content === "string" ? delta.content : "" };
          if (delta?.reasoning_content) yield { reasoning: delta.reasoning_content };
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
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  tools?: ToolSpec[];
  signal?: AbortSignal;
}): Promise<AsyncGenerator<StreamEvent>> {
  const { model, apiKey, messages, custom, signal } = args;
  const target = resolveTarget(model, apiKey, custom);
  if (!target.endpoint) {
    return (async function* () {
      yield {
        error:
          "No endpoint configured for this model. Open Settings → Providers and add an endpoint.",
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

/** One non-streaming turn — used for tool planning. */
export async function completeOnce(args: {
  model: ModelDef;
  apiKey: string;
  messages: ApiMessage[];
  custom?: CustomEndpoint;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
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
    const toolCalls: ToolCall[] = blocks
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }));
    return { text, toolCalls, raw: json };
  }

  const msg = json.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments ?? "{}",
  }));
  return { text: msg.content ?? "", toolCalls, raw: json };
}

/* -------------------------------------------------------------- validate */

export async function validateKey(
  provider: ProviderId,
  apiKey: string,
  custom?: CustomEndpoint,
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: "Enter a key first." };
  const def = PROVIDERS[provider];
  const modelsUrl =
    provider === "custom"
      ? custom?.modelsEndpoint?.trim() || ""
      : def.modelsEndpoint || "";

  // Preferred: a cheap authenticated GET /models — validates without spending tokens.
  if (modelsUrl) {
    try {
      const res = await fetch(modelsUrl, { headers: authHeaders(provider, apiKey, custom) });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const count = Array.isArray(json?.data) ? json.data.length : undefined;
        return {
          ok: true,
          message: count ? `Key valid — ${count} models available.` : "Key validated successfully.",
        };
      }
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: classify(res.status, text).message };
      }
      // 404/405: endpoint has no model listing — fall through to a tiny chat ping.
    } catch {
      // network/CORS — fall through
    }
  }

  // Fallback: 1-token chat ping.
  const probe: ModelDef = {
    id: provider === "openai" ? "gpt-6-luna" : provider === "google" ? "gemini-3.5-flash-lite" : provider === "anthropic" ? "claude-haiku-5-5" : "sarvam-105b",
    name: "probe",
    provider,
    description: "",
    contextWindow: 8000,
    maxTokens: 1,
    capabilities: [],
    status: "active",
    endpoint: provider === "custom" ? custom?.endpoint : undefined,
  };
  try {
    await completeOnce({
      model: probe,
      apiKey,
      messages: [{ role: "user", content: "ping" }],
      custom,
      maxTokens: 1,
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
      ? json.models.map((m: any) => (m.name || m.id || "").replace(/^models\//, ""))
      : [];
  return [...new Set(list)].sort();
}
