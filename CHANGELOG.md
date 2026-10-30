# Changelog

## 3.5.1 — October 2026

### Changed
- **New default system prompt**: the personal-assistant brief (Sameer Sayyad's assistant — direct, opinionated,
  resourceful, no filler; code and design standards; image watermark `sameer._.i` + Instagram handle).
  Existing installs adopt it once on next launch (`promptVersion` migration); after that your own edits stick.
- Settings -> Chat & models -> prompt presets now list it first as "Sameer's assistant (default)".

## 3.4.0 — October 2026

### Added — Mocha & gold theme (default)
- New **warm palette** built from the colours you asked for: mocha brown `#5B4632` surfaces,
  champagne gold `#F4D9A0` and burnt amber `#C8792C` accents. Warm is now the default in both dark and
  light; the old graphite look is still one tap away under Appearance → Palette.

### Added — multitasking
- **Several chats can answer at once.** Each conversation keeps its own stream and its own stop
  button, so you can send a long request, switch chats, and keep working. A small pill above the
  composer shows how many chats are running with a **Stop all**.
- Per-chat guard: sending twice into the *same* chat is still blocked, but other chats are free.

### Added — voice mode (ChatGPT style)
- A hands-free, full-screen voice mode: it listens, transcribes, sends, speaks the answer, and starts
  listening again. Tap **Send now** to end a turn early, **Skip** to cut the speech, **End** to leave.
- Fixed 9-second turn window (no VAD), so it behaves predictably on phones.

### Changed
- Output budgets raised again: Sarvam-105B now 32,768 (was 8,192) and its conversations variant 8,192.
- **Recommended setup** button in Settings → Chat & models applies the baseline this app is tuned for
  (Auto model, model maximum output, temp 0.70, top-p 0.95, 30 context messages).
- Three more free/OSS providers in one click: **NVIDIA NIM**, **Fireworks AI**, **SambaNova**.
- Two more open-source MCP servers: **Time** and the **Everything** reference server.
- Composer respects the phone's gesture bar (`env(safe-area-inset-bottom)`).

### Fixed
- Code blocks were unreadable in the light theme (dark surface, dark text).
- The voice-mode sheet was see-through because `--bg-0` is a hex value and cannot be wrapped in `rgb()`.

## 3.3.1 — October 2026

### Fixed
- **Speech-to-text rejected the recording.** MediaRecorder produces `audio/webm;codecs=opus`, and
  Sarvam's STT endpoint only accepts mpeg/mp3/wav-family types — it answered 400 "Invalid file type".
  The recorder's audio is now decoded and re-encoded as **16 kHz mono 16-bit WAV** in the browser before
  upload, which is both accepted and what the docs recommend for accuracy.
- Error text from the STT endpoint is parsed out of the JSON body instead of showing the raw response.

## 3.3.0 — October 2026

### Fixed — the "stream was interrupted" bug
- **Stop reason is now read.** OpenAI-style `finish_reason` and Anthropic `stop_reason` were being
  ignored, so a reply cut off by the output budget looked like a network failure. It now says
  "Reply was cut at the output limit" and offers a **Continue** button.
- **One silent retry.** If the connection dies before any text arrives, the request is retried once
  automatically instead of surfacing an error immediately.
- **Real output budgets.** The Sarvam v2 reasoning models (GLM-5.3, DeepSeek V4.1 Flash, Gemma 4) had
  8,192 output tokens in the catalogue — reasoning alone could eat that and truncate the answer. They
  now carry 32,768.
- New setting: **Auto sends the model maximum** (default) or a balanced 4K, so "Auto" means the
  biggest budget the model allows unless you choose otherwise.

### Added — talk mode
- **Speak your message.** Mic button in the composer records up to 30 s and transcribes it — with
  Sarvam **Saaras** (`saaras:v4`) when a Sarvam key is present, or the browser's own speech engine
  otherwise. Auto-send on stop, or drop the transcript into the composer to edit.
- **Hear the reply.** Speaker toggle reads answers aloud using the phone's own voices, picking the
  language from the script of the text (Devanagari → Hindi, Tamil → Tamil…), with a speaking-rate
  slider and a "Test voice" button.
- Speech-to-text language picker (auto-detect plus 13 Indian languages).

### Added — open-source MCP catalogue
- Twelve community MCP servers listed in Settings → MCP tools: DeepWiki, Cloudflare Docs, Context7 and
  GitMCP connect straight from the page; Filesystem, Git, Memory, Sequential thinking, Fetch, SQLite,
  Puppeteer and GitHub ship with their `npx` command and a copy-ready **bridge** command
  (`supergateway`) that turns a stdio server into an HTTP endpoint this app can reach.

### Android
- `RECORD_AUDIO` permission plus `onPermissionRequest` handling, so `getUserMedia` works in the
  WebView after the system permission dialog.

## 3.2.0 — October 2026

Built to feel like a consumer assistant app rather than a developer console — still with no
account, no sign-in and no sign-up anywhere.

### Added
- **Auto model.** A new default entry in the model menu that picks the best *available* model for
  each message: it filters by what the message needs (image input, tool calling, context that fits)
  and then prefers the provider's flagship, the cheaper model on a tie. The header and composer show
  what it picked ("Auto → Sarvam-105B") and the pick is re-evaluated per message.
- **File cards on replies.** Any code block the model writes becomes a real file with
  **Download · Open · Share**. A fence that names the file (` ```python math_utils.py `) uses that
  name; otherwise one is generated from the language. In the APK, Download writes into the device's
  Downloads folder through MediaStore.
- **Zip attachments.** Drop a `.zip` and the text/code files inside it are extracted in the browser
  (native `DecompressionStream`, no library) and inlined into the prompt — up to 25 files / 400 KB.
  Binaries inside the archive are skipped.
- `AndroidFiles` bridge in the APK: blob downloads are a no-op in a WebView, so saving goes through
  MediaStore on Android 10+ and the app's Download folder on older devices.

### Changed
- A chat created while Auto is selected stays on Auto, so it keeps adapting as you attach images or
  connect tools.
- The Markdown renderer no longer prints the file name from a fence header as the first line of code.

## 3.1.0 — October 2026

### Changed
- **Max output tokens is now "Auto" by default**, driven by the model's own documented limit from the
  catalogue — Sarvam-105B sends 8,192, GPT-6 Astra 128,000, Gemini 65,536, and so on. No more guessing.
- **Manual override goes up to 2,000,000 tokens.** A value above what the model documents is sent
  verbatim (with a warning in the panel) instead of being silently clamped, so an endpoint that really
  supports more is not held back. The provider still decides whether it can honour it.
- The token field is a proper input with presets (4K · 8K · 32K · 128K · 1M · 2M · model default)
  instead of a slider that stopped at 32K.

### Fixed
- Token counts are formatted as 1,000,000 rather than 10,00,000, which was easy to misread.

## 3.0.1 — October 2026

### Fixed
- **Attachments did nothing in the Android app.** The WebView was created with a bare
  `WebChromeClient`, which silently swallows taps on `<input type="file">`. `onShowFileChooser`
  and `onActivityResult` are now implemented, so the paperclip opens the system document picker
  and the chosen files reach the page. (This never affected the browser build.)
- Files whose MIME type arrives as `application/octet-stream` (common with Android file
  providers) are now recognised as images by extension instead of being rejected.
- PDFs and Office documents are no longer greyed out by the file filter; picking one explains
  that it is not supported yet instead of failing silently.
- `crypto.randomUUID` is only available in secure contexts, so message ids now fall back to a
  generated id — sending works on plain-http deployments too.

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
