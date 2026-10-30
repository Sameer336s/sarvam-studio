"""Streaming chat client for Sarvam AI, OpenAI, Anthropic, Gemini and any
OpenAI-compatible endpoint (Ollama, vLLM, OpenRouter, Groq, ...).

No vendor SDKs: two wire formats are normalised here, and the SSE parser is written by
hand so it behaves the same everywhere.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Iterable

import httpx

from . import keystore
from .config import Config, Params
from .providers import MODELS, Model, headers_for, resolve_endpoint

MAX_OUTPUT_CEILING = 2_000_000


# --------------------------------------------------------------------------- data


@dataclass
class Attachment:
    kind: str  # "image" | "text"
    name: str
    mime: str = "text/plain"
    data_url: str | None = None
    text: str | None = None


@dataclass
class Message:
    role: str  # user | assistant | system
    content: str = ""
    attachments: list[Attachment] = field(default_factory=list)


@dataclass
class Event:
    text: str | None = None
    reasoning: str | None = None
    finish: str | None = None
    usage: dict[str, int] | None = None
    error: str | None = None
    tool_calls: list[dict] | None = None


class ProviderError(RuntimeError):
    """A request failed in a way worth showing the user."""


# ------------------------------------------------------------------- helpers


def resolve_max_tokens(value: int | None, model: Model) -> int:
    """None means "whatever the model documents"; a manual value is sent as-is (capped at 2M)."""
    raw = model.max_tokens if value is None else int(value)
    return max(1, min(raw, MAX_OUTPUT_CEILING))


def _image_part(att: Attachment) -> tuple[str, str]:
    """Split a data URL into (media_type, base64 payload)."""
    url = att.data_url or ""
    if url.startswith("data:") and ";base64," in url:
        head, payload = url.split(",", 1)
        media = head[5:].split(";")[0]
        return media or att.mime, payload
    return att.mime, ""


def _text_of(att: Attachment) -> str:
    return f"--- file: {att.name} ---\n{att.text or ''}"


def build_messages(messages: Iterable[Message], wire: str) -> list[dict[str, Any]]:
    """Convert messages (with attachments) into the provider's content shape."""
    out: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == "system":
            out.append({"role": "system", "content": msg.content})
            continue

        images = [a for a in msg.attachments if a.kind == "image" and a.data_url]
        texts = [a for a in msg.attachments if a.kind == "text" and a.text]

        text = msg.content
        for att in texts:
            text = f"{text}\n\n{_text_of(att)}".strip()

        if not images:
            out.append({"role": msg.role, "content": text})
            continue

        if wire == "anthropic":
            parts: list[dict[str, Any]] = []
            for att in images:
                media, payload = _image_part(att)
                parts.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": media, "data": payload},
                })
            if text:
                parts.append({"type": "text", "text": text})
            out.append({"role": msg.role, "content": parts})
        else:
            parts = [{"type": "text", "text": text or "(image attached)"}]
            for att in images:
                parts.append({"type": "image_url", "image_url": {"url": att.data_url}})
            out.append({"role": msg.role, "content": parts})
    return out


def _params_for(params: Params, model: Model) -> dict[str, Any]:
    body: dict[str, Any] = {"temperature": params.temperature, "top_p": params.top_p}
    if params.top_k is not None:
        body["top_k"] = params.top_k
    if params.presence_penalty:
        body["presence_penalty"] = params.presence_penalty
    if params.frequency_penalty:
        body["frequency_penalty"] = params.frequency_penalty
    if params.seed is not None:
        body["seed"] = params.seed
    if params.stop:
        body["stop"] = params.stop[:4]
    if params.reasoning_effort != "auto":
        effort = params.reasoning_effort
        if model.provider == "sarvam" and effort == "high":
            effort = "max"  # Sarvam v2 accepts low / high / max
        body["reasoning_effort"] = effort
    if params.json_mode:
        body["response_format"] = {"type": "json_object"}
    return body


def _anthropic_body(model: Model, messages: list[Message], params: Params, stream: bool,
                    tools: list[dict] | None) -> dict[str, Any]:
    system = "\n\n".join(m.content for m in messages if m.role == "system")
    convo = [m for m in messages if m.role != "system"]
    body: dict[str, Any] = {
        "model": model.id,
        "max_tokens": resolve_max_tokens(params.max_tokens, model),
        "messages": build_messages(convo, "anthropic"),
        "stream": stream,
    }
    if system:
        body["system"] = system
    body.update(_params_for(params, model))
    body.pop("presence_penalty", None)
    body.pop("frequency_penalty", None)
    body.pop("seed", None)
    body.pop("response_format", None)
    if params.stop:
        body["stop_sequences"] = params.stop[:4]
        body.pop("stop", None)
    if tools:
        body["tools"] = [
            {"name": t["name"], "description": t.get("description", ""),
             "input_schema": t.get("parameters") or {"type": "object", "properties": {}}}
            for t in tools
        ]
    return body


def _openai_body(model: Model, messages: list[Message], params: Params, stream: bool,
                 tools: list[dict] | None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model.id,
        "messages": build_messages(messages, "openai"),
        "stream": stream,
    }
    if stream:
        body["stream_options"] = {"include_usage": True}
    body.update(_params_for(params, model))
    max_out = resolve_max_tokens(params.max_tokens, model)
    if model.provider == "openai":
        body["max_completion_tokens"] = max_out
    else:
        body["max_tokens"] = max_out
    if tools:
        body["tools"] = [
            {"type": "function",
             "function": {"name": t["name"], "description": t.get("description", ""),
                          "parameters": t.get("parameters") or {"type": "object", "properties": {}}}}
            for t in tools
        ]
    return body


def friendly_error(status: int, body: str) -> str:
    detail = body.strip()
    try:
        parsed = json.loads(body)
        detail = (
            parsed.get("error", {}).get("message")
            if isinstance(parsed.get("error"), dict)
            else parsed.get("error") or parsed.get("detail") or detail
        )
    except (json.JSONDecodeError, AttributeError):
        pass
    detail = str(detail)[:240]
    if status in (401, 403):
        return "Invalid or unauthorised API key. Check it in Settings -> API keys."
    if status == 402:
        return "This key is out of credit."
    if status == 404:
        return f"Not found (404) — this model id may have been retired. {detail}"
    if status == 413:
        return "The request was too large for this model. Attach less or start a new chat."
    if status == 429:
        return "Rate limited by the provider. Wait a moment, or switch model."
    if status in (400, 422):
        return f"The provider rejected the request: {detail}"
    if status >= 500:
        return "The provider is having trouble right now. Try again shortly."
    return f"Request failed ({status}). {detail}"


# --------------------------------------------------------------------- client


class Client:
    """Async client. Pass `transport` (httpx.MockTransport) to test without a network."""

    def __init__(self, config: Config | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.config = config or Config.load()
        self._transport = transport
        self._custom: dict[str, dict] = {}

    # -- plumbing ----------------------------------------------------------
    def _http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=self._transport,
            timeout=httpx.Timeout(300.0, connect=20.0),
            follow_redirects=True,
        )

    def key_for(self, model: Model) -> str:
        if model.provider == "custom":
            return keystore.get_key(f"c:{model.provider_ref or model.id}")
        return keystore.get_key(f"p:{model.provider}")

    def model(self, model_id: str) -> Model:
        if model_id in ("auto", ""):
            picked = self.auto_model()
            if picked is None:
                raise ProviderError("No model with an API key configured yet.")
            return picked
        try:
            return next(m for m in MODELS if m.id == model_id)
        except StopIteration:
            raise ProviderError(f"Unknown model id: {model_id}") from None

    def available_models(self) -> list[Model]:
        return [m for m in MODELS if self.key_for(m)]

    def auto_model(self, vision: bool = False, tools: bool = False,
                   approx_tokens: int = 0) -> Model | None:
        """Mirror of the app's Auto mode: hard filters first, then a small score."""
        weights = {"sarvam": 12, "anthropic": 9, "openai": 9, "google": 9, "custom": 7}
        candidates = [
            m for m in MODELS
            if self.key_for(m)
            and (not vision or m.supports("vision"))
            and (not tools or m.supports("tools"))
            and (approx_tokens <= 0 or m.context_window >= approx_tokens * 1.6)
        ]
        if not candidates:
            return None

        seen: set[str] = set()
        flagship: set[str] = set()
        for m in candidates:
            if m.provider not in seen:
                seen.add(m.provider)
                flagship.add(m.id)

        def score(m: Model) -> float:
            s = float(weights.get(m.provider, 5))
            s += min(m.context_window / 1_000_000, 1.0) * 6
            if m.id in flagship:
                s += 8
            if m.status == "active":
                s += 10
            elif m.status == "legacy":
                s -= 25
            if m.supports("low-latency"):
                s += 6
            if m.supports("reasoning"):
                s += 4
            return s

        return max(candidates, key=score)

    # -- requests ----------------------------------------------------------
    def _request_for(self, model: Model, messages: list[Message], params: Params,
                     stream: bool, tools: list[dict] | None):
        wire = "anthropic" if model.provider == "anthropic" else "openai"
        body = (_anthropic_body if wire == "anthropic" else _openai_body)(
            model, messages, params, stream, tools
        )
        url = resolve_endpoint(model, self._custom.get(model.provider_ref or ""))
        headers = headers_for(model, self.key_for(model), self._custom.get(model.provider_ref or ""))
        return wire, url, headers, body

    async def stream(
        self,
        model: Model,
        messages: list[Message],
        params: Params | None = None,
        tools: list[dict] | None = None,
    ) -> AsyncIterator[Event]:
        """Yield text/reasoning deltas as they arrive, then finish/usage."""
        params = params or self.config.params
        wire, url, headers, body = self._request_for(model, messages, params, True, tools)

        async with self._http() as http:
            async with http.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    raw = (await resp.aread()).decode("utf-8", "replace")
                    yield Event(error=friendly_error(resp.status_code, raw))
                    return

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload in ("[DONE]", ""):
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    if "error" in chunk and chunk["error"]:
                        err = chunk["error"]
                        msg = err.get("message") if isinstance(err, dict) else str(err)
                        yield Event(error=f"Provider error: {msg}")
                        return

                    if wire == "anthropic":
                        kind = chunk.get("type")
                        if kind == "content_block_delta":
                            delta = chunk.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield Event(text=delta.get("text", ""))
                            elif delta.get("type") == "thinking_delta":
                                yield Event(reasoning=delta.get("thinking", ""))
                        elif kind == "message_delta":
                            stop = (chunk.get("delta") or {}).get("stop_reason")
                            usage = chunk.get("usage") or {}
                            yield Event(
                                finish=stop,
                                usage={"completion": usage.get("output_tokens", 0)} if usage else None,
                            )
                        continue

                    choices = chunk.get("choices") or []
                    if chunk.get("usage"):
                        yield Event(usage={
                            "prompt": chunk["usage"].get("prompt_tokens", 0),
                            "completion": chunk["usage"].get("completion_tokens", 0),
                        })
                    if not choices:
                        continue
                    choice = choices[0]
                    delta = choice.get("delta") or {}
                    if choice.get("finish_reason"):
                        yield Event(finish=choice["finish_reason"])
                    if delta.get("reasoning_content"):
                        yield Event(reasoning=delta["reasoning_content"])
                    if delta.get("content"):
                        content = delta["content"]
                        if isinstance(content, list):
                            text = "".join(p.get("text", "") for p in content if isinstance(p, dict))
                            if text:
                                yield Event(text=text)
                        else:
                            yield Event(text=content)

    async def complete(
        self,
        model: Model,
        messages: list[Message],
        params: Params | None = None,
        tools: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Non-streaming call — used to decide whether tools are needed."""
        params = params or self.config.params
        wire, url, headers, body = self._request_for(model, messages, params, False, tools)

        async with self._http() as http:
            resp = await http.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            raise ProviderError(friendly_error(resp.status_code, resp.text))

        data = resp.json()
        if wire == "anthropic":
            text_parts, calls = [], []
            for block in data.get("content", []):
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    calls.append({"id": block.get("id"), "name": block.get("name"),
                                  "arguments": block.get("input") or {}})
            return {"text": "".join(text_parts), "tool_calls": calls,
                    "finish": data.get("stop_reason"), "raw": data}

        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        calls = []
        for call in msg.get("tool_calls") or []:
            fn = call.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append({"id": call.get("id"), "name": fn.get("name"), "arguments": args})
        return {"text": msg.get("content") or "", "tool_calls": calls,
                "finish": choice.get("finish_reason"), "raw": data}

    async def list_models(self, model: Model) -> list[str]:
        """Pull the live model list for a provider key."""
        provider = model.provider
        url = resolve_endpoint(model, self._custom.get(model.provider_ref or ""))
        from .providers import PROVIDERS

        endpoint = PROVIDERS[provider].models_endpoint or url.replace("/chat/completions", "/models")
        headers = headers_for(model, self.key_for(model), self._custom.get(model.provider_ref or ""))
        async with self._http() as http:
            resp = await http.get(endpoint, headers=headers)
        if resp.status_code >= 400:
            raise ProviderError(friendly_error(resp.status_code, resp.text))
        data = resp.json()
        items = data.get("data") or data.get("models") or []
        return sorted({i.get("id") or i.get("name") for i in items if isinstance(i, dict)})


# ------------------------------------------------------------------ helpers


def estimate_tokens(messages: Iterable[Message]) -> int:
    return sum(len(m.content) for m in messages) // 4


def run(coro):
    """Small helper so scripts can `run(client.complete(...))` without asyncio boilerplate."""
    return asyncio.run(coro)
