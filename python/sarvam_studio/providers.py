"""Provider registry, model catalogue and free/open-source presets.

Model ids were checked against vendor documentation in October 2026. Providers retire ids
constantly, so the catalogue is data, not code: edit it, or call `list_models()` on a
provider to pull the live list for your key.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ProviderId = Literal["sarvam", "openai", "anthropic", "google", "custom"]


@dataclass
class Provider:
    id: ProviderId
    name: str
    endpoint: str
    auth_header: str
    auth_prefix: str = ""
    models_endpoint: str | None = None
    docs: str = ""
    color: str = "#888888"


PROVIDERS: dict[str, Provider] = {
    "sarvam": Provider(
        id="sarvam",
        name="Sarvam AI",
        endpoint="https://api.sarvam.ai/v1/chat/completions",
        auth_header="api-subscription-key",
        auth_prefix="",
        models_endpoint="https://api.sarvam.ai/v1/models",
        docs="https://docs.sarvam.ai",
        color="#C8792C",
    ),
    "openai": Provider(
        id="openai",
        name="OpenAI",
        endpoint="https://api.openai.com/v1/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        models_endpoint="https://api.openai.com/v1/models",
        docs="https://platform.openai.com/docs",
        color="#10a37f",
    ),
    "anthropic": Provider(
        id="anthropic",
        name="Anthropic",
        endpoint="https://api.anthropic.com/v1/messages",
        auth_header="x-api-key",
        auth_prefix="",
        models_endpoint="https://api.anthropic.com/v1/models",
        docs="https://platform.claude.com/docs",
        color="#d97757",
    ),
    "google": Provider(
        id="google",
        name="Google Gemini",
        endpoint="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        models_endpoint="https://generativelanguage.googleapis.com/v1beta/openai/models",
        docs="https://ai.google.dev/gemini-api/docs",
        color="#4285f4",
    ),
    "custom": Provider(
        id="custom",
        name="Custom endpoint",
        endpoint="",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        docs="",
        color="#8b8b8b",
    ),
}


@dataclass
class Model:
    id: str
    name: str
    provider: ProviderId
    description: str = ""
    context_window: int = 128_000
    max_tokens: int = 8192
    capabilities: list[str] = field(default_factory=lambda: ["chat"])
    endpoint: str | None = None
    provider_ref: str | None = None  # custom provider id
    status: str = "active"

    def supports(self, capability: str) -> bool:
        return capability in self.capabilities


def _m(**kwargs) -> Model:
    return Model(**kwargs)


MODELS: list[Model] = [
    # --- Sarvam AI -----------------------------------------------------------
    _m(id="sarvam-105b", name="Sarvam-105B", provider="sarvam",
       description="Flagship 105B sovereign model. Reasoning, coding, agentic work.",
       context_window=131_072, max_tokens=32_768,
       capabilities=["chat", "reasoning", "code", "tools", "long-context"]),
    _m(id="sarvam-105b-conversations", name="Sarvam-105B Conversations", provider="sarvam",
       description="Dialogue-tuned variant for voice agents.",
       context_window=131_072, max_tokens=8_192,
       capabilities=["chat", "reasoning", "low-latency"]),
    _m(id="glm5.3", name="GLM-5.3 (via Sarvam)", provider="sarvam",
       description="Open-weight, visible reasoning, tool calling.",
       context_window=1_000_000, max_tokens=32_768,
       capabilities=["chat", "reasoning", "code", "tools", "long-context"],
       endpoint="https://api.sarvam.ai/v2/chat/completions"),
    _m(id="deepseekv4.1-flash", name="DeepSeek V4.1 Flash (via Sarvam)", provider="sarvam",
       description="Fast reasoning and tool calling.",
       context_window=1_000_000, max_tokens=32_768,
       capabilities=["chat", "reasoning", "code", "tools", "long-context"],
       endpoint="https://api.sarvam.ai/v2/chat/completions"),
    _m(id="gemma4", name="Gemma 4 (via Sarvam)", provider="sarvam",
       description="Text and image input, tool calling.",
       context_window=131_000, max_tokens=32_768,
       capabilities=["chat", "vision", "tools"],
       endpoint="https://api.sarvam.ai/v2/chat/completions"),
    # --- OpenAI --------------------------------------------------------------
    _m(id="gpt-6-astra", name="GPT-6 Astra", provider="openai",
       description="Frontier reasoning and agentic work.",
       context_window=1_050_000, max_tokens=128_000,
       capabilities=["chat", "reasoning", "code", "vision", "tools", "long-context"]),
    _m(id="gpt-6.1-sol", name="GPT-6.1 Sol", provider="openai",
       description="Balanced flagship.",
       context_window=1_050_000, max_tokens=128_000,
       capabilities=["chat", "reasoning", "vision", "tools", "long-context"]),
    _m(id="gpt-6-luna", name="GPT-6 Luna", provider="openai",
       description="Fast, cheap, still capable.",
       context_window=1_050_000, max_tokens=64_000,
       capabilities=["chat", "reasoning", "vision", "tools", "long-context", "low-latency"]),
    _m(id="gpt-5.6-sol", name="GPT-5.6 Sol", provider="openai",
       description="Previous flagship, still available.",
       context_window=400_000, max_tokens=64_000,
       capabilities=["chat", "reasoning", "vision", "tools"]),
    # --- Anthropic -----------------------------------------------------------
    _m(id="claude-fable-5-1", name="Claude Fable 5.1", provider="anthropic",
       description="Demanding reasoning and long-horizon agentic work.",
       context_window=1_000_000, max_tokens=128_000,
       capabilities=["chat", "reasoning", "code", "vision", "tools", "long-context"]),
    _m(id="claude-opus-5-5", name="Claude Opus 5.5", provider="anthropic",
       description="Long-running agentic coding and knowledge work.",
       context_window=1_000_000, max_tokens=128_000,
       capabilities=["chat", "reasoning", "code", "vision", "tools", "long-context"]),
    _m(id="claude-sonnet-5-5", name="Claude Sonnet 5.5", provider="anthropic",
       description="Best balance of speed and intelligence.",
       context_window=1_000_000, max_tokens=128_000,
       capabilities=["chat", "reasoning", "code", "vision", "tools", "long-context"]),
    _m(id="claude-haiku-5-5", name="Claude Haiku 5.5", provider="anthropic",
       description="Fastest; classification, extraction, routing.",
       context_window=1_000_000, max_tokens=64_000,
       capabilities=["chat", "vision", "tools", "low-latency"]),
    # --- Google --------------------------------------------------------------
    _m(id="gemini-4-argon", name="Gemini 4 Argon", provider="google",
       description="Flagship multimodal model.",
       context_window=1_000_000, max_tokens=65_536,
       capabilities=["chat", "reasoning", "vision", "tools", "long-context"]),
    _m(id="gemini-3.8-flash", name="Gemini 3.8 Flash", provider="google",
       description="Fast multimodal workhorse.",
       context_window=1_000_000, max_tokens=65_536,
       capabilities=["chat", "reasoning", "vision", "tools", "low-latency"]),
    _m(id="gemini-3.5-flash-lite", name="Gemini 3.5 Flash Lite", provider="google",
       description="Cheapest Gemini, good for bulk work.",
       context_window=1_000_000, max_tokens=32_768,
       capabilities=["chat", "vision", "low-latency"]),
]

MODEL_BY_ID = {m.id: m for m in MODELS}

# ---------------------------------------------------------------------------
# Free & open-source endpoints: one click adds the provider and its models.
# ---------------------------------------------------------------------------


@dataclass
class Preset:
    id: str
    name: str
    short: str
    note: str
    endpoint: str
    models_endpoint: str | None = None
    auth_header: str = "Authorization"
    auth_prefix: str = "Bearer "
    local: bool = False
    needs_key: bool = True
    models: list[str] = field(default_factory=list)


PRESETS: list[Preset] = [
    Preset("ollama", "Ollama (local)", "No key, offline",
           "Run `ollama serve` and pull a model. Nothing leaves your machine.",
           "http://localhost:11434/v1/chat/completions", "http://localhost:11434/v1/models",
           local=True, needs_key=False,
           models=["llama3.2", "qwen2.5", "deepseek-r1", "gemma3", "phi4"]),
    Preset("lmstudio", "LM Studio (local)", "No key, offline",
           "Start the local server in LM Studio (port 1234).",
           "http://localhost:1234/v1/chat/completions", "http://localhost:1234/v1/models",
           local=True, needs_key=False),
    Preset("llamacpp", "llama.cpp server", "No key, offline",
           "`llama-server -m model.gguf` exposes an OpenAI-compatible API on 8080.",
           "http://localhost:8080/v1/chat/completions", "http://localhost:8080/v1/models",
           local=True, needs_key=False),
    Preset("openrouter", "OpenRouter (free)", "Free models",
           "Has :free variants of many open models, plus an `openrouter/free` router.",
           "https://openrouter.ai/api/v1/chat/completions", "https://openrouter.ai/api/v1/models",
           models=["openrouter/free"]),
    Preset("groq", "Groq", "Free tier, very fast",
           "Free tier with generous rate limits on open-weight models.",
           "https://api.groq.com/openai/v1/chat/completions", "https://api.groq.com/openai/v1/models",
           models=["openai/gpt-oss-120b", "openai/gpt-oss-20b"]),
    Preset("deepseek", "DeepSeek", "Cheap, strong reasoning",
           "Direct API; the reasoner model shows its thinking.",
           "https://api.deepseek.com/v1/chat/completions", "https://api.deepseek.com/v1/models",
           models=["deepseek-chat", "deepseek-reasoner"]),
    Preset("mistral", "Mistral", "Free tier",
           "Open-weight models from Mistral, hosted.",
           "https://api.mistral.ai/v1/chat/completions", "https://api.mistral.ai/v1/models",
           models=["open-mistral-nemo", "mistral-small-latest", "codestral-latest"]),
    Preset("together", "Together AI", "Open models",
           "Wide catalogue of open-weight models.",
           "https://api.together.xyz/v1/chat/completions", "https://api.together.xyz/v1/models"),
    Preset("huggingface", "Hugging Face", "Free inference credits",
           "Router endpoint for hosted inference providers.",
           "https://router.huggingface.co/v1/chat/completions",
           "https://router.huggingface.co/v1/models"),
    Preset("cerebras", "Cerebras", "Free tier, fastest",
           "Very high tokens/second on open models.",
           "https://api.cerebras.ai/v1/chat/completions", "https://api.cerebras.ai/v1/models"),
    Preset("nvidia", "NVIDIA NIM", "Free developer tier",
           "Open-weight models on build.nvidia.com.",
           "https://integrate.api.nvidia.com/v1/chat/completions",
           "https://integrate.api.nvidia.com/v1/models"),
    Preset("fireworks", "Fireworks AI", "Serverless open models",
           "Llama, Qwen and DeepSeek serverless.",
           "https://api.fireworks.ai/inference/v1/chat/completions",
           "https://api.fireworks.ai/inference/v1/models"),
    Preset("sambanova", "SambaNova", "Fast, free tier",
           "High-throughput open-weight inference.",
           "https://api.sambanova.ai/v1/chat/completions", "https://api.sambanova.ai/v1/models"),
    Preset("github", "GitHub Models", "Free with a GitHub token",
           "A curated set of models behind a GitHub personal access token.",
           "https://models.github.ai/inference/chat/completions",
           "https://models.github.ai/inference/models"),
]


def resolve_endpoint(model: Model, custom: dict | None = None) -> str:
    if model.endpoint:
        return model.endpoint
    if model.provider == "custom" and custom:
        return custom.get("endpoint", "")
    return PROVIDERS[model.provider].endpoint


def headers_for(model: Model, key: str, custom: dict | None = None) -> dict[str, str]:
    provider = PROVIDERS[model.provider]
    header = (custom or {}).get("auth_header") or provider.auth_header
    prefix = (custom or {}).get("auth_prefix")
    prefix = provider.auth_prefix if prefix is None else prefix
    headers = {"Content-Type": "application/json"}
    if key:
        headers[header] = f"{prefix}{key}"
    if model.provider == "anthropic":
        headers["anthropic-version"] = "2026-10-21"
    return headers
