# Changelog

## 3.0.0 — October 2026

Performance pass plus the features people asked for most.

### Added
- **Image and file attachments.** Pick, drag-and-drop or paste; images are downscaled to 1280 px in the
  browser before they are stored or sent, text files are inlined into the prompt. Attachments persist
  with the message and are shed (images first) if localStorage fills up.
- **Images in replies.** Markdown images, array content parts and `images[]` all render inline with a
  click-to-zoom lightbox and a download button.
- **Free & open-source presets** — 12 one-click setups: Ollama, LM Studio, llama.cpp, vLLM/SGLang
  (local, no key) and OpenRouter free, Groq, Hugging Face, Together, DeepSeek, Mistral, Cerebras,
  GitHub Models (free key).
- **Full model parameters** — temperature, top-p, top-k, presence/frequency penalties, seed, stop
  sequences, reasoning effort and JSON mode, as global defaults with per-chat overrides.
- Parameters button in the composer; overrides stored on the conversation.
- Quota-aware chat persistence: if storage fills up, image payloads are dropped before any text.

### Changed
- **The glass layer is gone.** Solid surfaces, 1px borders, one static background gradient; no
  backdrop-filter and no animated blobs. Roughly a third of the previous paint work.
- **Streaming is batched per animation frame** instead of per token; message rows are memoised and
  off-screen messages use `content-visibility: auto`, so long chats no longer re-render everything on
  every chunk.
- Settings: "glass" controls replaced by surface contrast and border strength; background styles cut to
  plain / glow / grid.
- Toasts moved to the bottom-right so they never cover the composer.
- Bundle: ~97 KB gzipped for JS + CSS combined.

## 2.0.0 — October 2026

The rebuild: from a single-provider demo to a multi-model studio, plus an Android app.

### Added
- Glass-morphism design system with live controls (superseded in 3.0).
- Five provider families: Sarvam AI (v1 + v2), OpenAI, Anthropic, Google Gemini, custom endpoints.
- Editable model catalogue: 22 models with context, output limits, capabilities and status.
- Persistent encrypted keys: WebCrypto AES-GCM with a non-extractable device key in IndexedDB;
  Android Keystore in the APK.
- Real MCP client: JSON-RPC over Streamable HTTP (SSE fallback), inline tool-call traces,
  per-server auto-approve.
- ChatGPT-style chat: pinned/today/archive sidebar, search, markdown with copyable code blocks,
  edit-and-resend, regenerate, stop, reasoning traces, token counts.
- Six settings tabs, all wired.
- Android APK with a Gradle-free build script, adaptive launcher icon and Keystore-backed keys.
- CI (typecheck + build) and a GitHub Pages deploy workflow.

### Changed
- Model IDs updated to the current lineups: GPT-6 / GPT-5.6, Claude Fable 5.1 / Opus 5.5 / Sonnet 5.5 /
  Haiku 5.5, Gemini 4 Argon / 3.8 Flash, Sarvam-105B and the v2 open-weight models.
- Keys are remembered by default (opt-out) instead of session-only with an opt-in.

### Removed
- `sarvam-m` and `sarvam-30b` — deprecated by Sarvam, now rejected by the API.
- Older OpenAI / Anthropic / Gemini IDs that were retired or auto-routed; documented in the catalogue's
  "removed models" card with migration notes.
- The fake MCP "test" that returned hardcoded tools, and dead UI toggles.

## 1.0.0 — initial version

Single-provider Sarvam chat with session-only keys, a model selector, and an MCP configuration screen.
