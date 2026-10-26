# Changelog

## 2.0.0 — October 2026

The rebuild: from a single-provider demo to a multi-model studio, plus an Android app.

### Added
- **Glass-morphism design system.** Animated aurora/mesh/grid backgrounds, backdrop-filter surfaces, and
  live controls for blur, surface opacity, border light and corner radius. Dark, light and system themes,
  seven accent presets or any hex pair.
- **Five provider families**: Sarvam AI (v1 + v2), OpenAI, Anthropic, Google Gemini (OpenAI-compat), and
  unlimited custom OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, OpenRouter, Groq…).
- **Editable model catalogue**: 22 models with context windows, output limits, capabilities and status.
  Add, edit, disable, delete, restore defaults, or import from a provider's live model list.
- **Persistent encrypted keys.** WebCrypto AES-GCM with a non-extractable device key in IndexedDB;
  Android Keystore AES-GCM in the APK. Keys survive restarts.
- **Real MCP client**: JSON-RPC over Streamable HTTP (SSE fallback), `initialize` → `tools/list` →
  `tools/call`, tool schemas passed to the model, inline tool-call traces, per-server auto-approve.
- **ChatGPT-style chat**: pinned/today/archive sidebar, full-text search, rename, markdown with copyable
  code blocks, edit-and-resend, regenerate, stop, reasoning traces, token counts.
- **Six settings tabs**, all wired: Appearance, Chat & models, Model catalogue, API keys, MCP tools,
  Data & privacy.
- **Android APK** (`SarvamStudio-2.0.apk`) with a Gradle-free build script, adaptive launcher icon and
  Keystore-backed key encryption.
- CI (typecheck + build) and a GitHub Pages deploy workflow.

### Changed
- Model IDs updated to the current lineups: GPT-6 / GPT-5.6, Claude Fable 5.1 / Opus 5.5 / Sonnet 5.5 /
  Haiku 5.5, Gemini 4 Argon / 3.8 Flash, Sarvam-105B and the v2 open-weight models.
- Keys are now remembered **by default** (opt-out), instead of session-only with an opt-in.
- Request layer rewritten by hand: per-provider body shapes, `max_completion_tokens` for OpenAI,
  `anthropic-version: 2026-10-21` plus direct-browser-access, SSE parsing for both formats.

### Removed
- `sarvam-m` and `sarvam-30b` — deprecated by Sarvam, now rejected by the API. Migrate to `sarvam-105b`.
- Older OpenAI / Anthropic / Gemini IDs that have been retired or auto-routed; documented in the
  catalogue's "removed models" card with migration notes.
- The fake MCP "test" that returned hardcoded tools.
- Dead UI toggles that did nothing.

## 1.0.0 — initial version

Single-provider Sarvam chat with session-only keys, a model selector, and an MCP configuration screen.
