# Sarvam Studio — Python edition

A multi-model AI chat studio written in Python: **Sarvam AI, OpenAI, Anthropic, Google Gemini and any
OpenAI-compatible endpoint** (Ollama, LM Studio, vLLM, OpenRouter, Groq, DeepSeek, Mistral, Together,
Cerebras, NVIDIA NIM, Fireworks, SambaNova, GitHub Models), with **MCP tools**, **image/file
attachments**, **encrypted keys** and **no login of any kind**.

One package, four ways to use it:

| Mode | Command | What you get |
| --- | --- | --- |
| **Web UI** | `python app.py` | Local server on `127.0.0.1:8000`, mocha & gold UI, keys stay on the server |
| **Terminal** | `python app.py --cli` | Streaming chat in your terminal, with slash commands |
| **Desktop** | `python app.py --desktop` | The same UI in a native window (pywebview) |
| **SDK** | `from sarvam_studio import Client` | Use the models from your own scripts |

```bash
pip install fastapi uvicorn httpx pydantic cryptography rich
python app.py
```

No Node, no build step, no database. Python 3.10+.

---

## Install

```bash
git clone https://github.com/Sameer336s/sarvam-studio
cd sarvam-studio/python
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[crypto,cli]"                          # or: pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:8000**, click **Settings**, paste a key (or press **Add** on a free /
local preset) and start chatting.

---

## API keys

Keys never reach the browser. The server holds them and proxies every request.

* Saved keys are encrypted at rest with **Fernet** in `~/.config/sarvam-studio/keys.enc`, next to a
  `secret.key` file with `0600` permissions. (`pip install cryptography`; without it keys are stored
  base64-encoded and the UI says so.)
* `SARVAM_STUDIO_USE_KEYRING=1` keeps them in the system keyring instead, when `keyring` is installed.
* Environment variables work without any file: `SARVAM_API_KEY`, `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.
* `SARVAM_STUDIO_HOME=/some/dir` moves everything.

This protects against a copied keys file or a backup — not against someone who already has read access
to your home directory. A local app cannot do better without an OS keyring.

---

## Models

`Auto` is the default and picks the best **available** model per message: it filters by what the message
needs (image input, tool calling, a context window that fits) and then prefers the provider's flagship.
Every model's output budget comes from the catalogue, and a manual override is sent verbatim up to
**2,000,000** tokens.

| Provider | Models |
| --- | --- |
| Sarvam AI | `sarvam-105b` (128K), `sarvam-105b-conversations`, `glm5.3` (1M), `deepseekv4.1-flash` (1M), `gemma4` (vision) |
| OpenAI | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `gpt-5.6-sol` |
| Anthropic | `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` |
| Google | `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite` |

The catalogue lives in `sarvam_studio/providers.py` — it is data, not code. Providers retire ids
constantly, so `/api/models/live` (and the `list_models()` method) pull the real list for your key.

Free & open-source presets are one click: Ollama, LM Studio, llama.cpp (no key, offline), plus
OpenRouter free, Groq, DeepSeek, Mistral, Together, Hugging Face, Cerebras, NVIDIA NIM, Fireworks,
SambaNova and GitHub Models.

---

## MCP tools

`POST /api/mcp/connect` handshakes with any **Streamable HTTP** MCP server
(`initialize` → `notifications/initialized` → `tools/list`) and returns its tools. Connected servers
are passed to the model as native function tools, results feed a streamed follow-up answer, and every
call is shown in the transcript.

Hosted servers that work straight away: DeepWiki, Cloudflare Docs, Context7. Local stdio servers
(Filesystem, Git, Memory, Fetch, Time, …) need a one-line bridge:

```bash
npx -y supergateway --stdio "npx -y @modelcontextprotocol/server-filesystem ~/projects" \
  --port 8000 --outputTransport streamableHttp
```

Then connect `http://localhost:8000/mcp`.

---

## Terminal chat

```bash
python app.py --cli
```

```
you › explain what this repo does in two lines
ai  › ...
```

Commands: `/model [id]`, `/models`, `/key <provider> <key>`, `/auto`, `/clear`, `/help`, `/quit`.
Markdown streams live when `rich` is installed; otherwise it prints plain text.

---

## SDK

```python
import asyncio
from sarvam_studio import Client, Message

client = Client()                       # reads ~/.config/sarvam-studio
print(client.auto_model().name)         # what Auto would pick right now

async def main():
    model = client.model("sarvam-105b")
    async for event in client.stream(model, [Message(role="user", content="Hi in Hindi")]):
        if event.text:
            print(event.text, end="", flush=True)

asyncio.run(main())
```

Non-streaming helper for tool planning or quick answers:

```python
reply = asyncio.run(client.complete(model, [Message(role="user", content="2+2?")]))
print(reply["text"])
```

Attachments are just data:

```python
from sarvam_studio import Attachment
img = Attachment(kind="image", name="shot.png", mime="image/png", data_url="data:image/png;base64,...")
Message(role="user", content="what is this?", attachments=[img])
```

---

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | the UI |
| GET | `/api/state` | config, models, presets, masked keys |
| POST | `/api/config` | `{patch: {...}}` — theme, params, context, MCP servers |
| POST | `/api/keys` | `{slot: "p:sarvam", key: "..."}` |
| DELETE | `/api/keys/{slot}` | forget a key |
| POST | `/api/preset` | `{id: "ollama"}` — add a free/OSS endpoint |
| POST | `/api/models/live` | `{model: "..."}` — live model ids for that key |
| POST | `/api/mcp/connect` | `{url, headers}` — handshake + tool list |
| POST | `/api/chat` | SSE stream: `model`, `delta`, `reasoning`, `usage`, `finish`, `notice`, `error`, `done` |
| GET | `/api/health` | liveness |

`/api/chat` is a plain `text/event-stream`, so `curl -N` works:

```bash
curl -N http://127.0.0.1:8000/api/chat -H 'content-type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"hello"}]}'
```

---

## Layout

```
app.py                     entry point (--cli / --desktop / serve)
sarvam_studio/
  client.py                provider adapters, SSE parser, auto-model, attachments
  providers.py             provider registry, 16 models, 14 free/OSS presets
  server.py                FastAPI: UI + SSE proxy + keys + MCP
  web.py                   the UI (one HTML string, vanilla JS, no build step)
  cli.py                   terminal chat
  desktop.py               pywebview window
  keystore.py              Fernet-encrypted key storage
  config.py                settings + paths
  mcp.py                   MCP client (JSON-RPC over Streamable HTTP)
tests/test_smoke.py        14 offline tests
```

Two wire formats are normalised in `client.py` — OpenAI chat-completions (Sarvam, OpenAI, Gemini's
compat layer, every custom endpoint) and the Anthropic Messages API. Stop reasons
(`finish_reason` / `stop_reason`) are surfaced, so a reply cut by the output budget says so instead of
looking like a network failure.

---

## Tests

```bash
pip install pytest
python -m pytest -q
```

14 tests, no network and no keys: token resolution, attachment shaping for both wire formats, SSE
parsing for both providers, error mapping, key round-trip and encryption, auto-model selection, and the
server's state/keys/chat endpoints with a mocked transport.

---

## Limitations

* **One process, one user.** There is no authentication on the server; bind it to `127.0.0.1` unless you
  put your own auth in front. `--host 0.0.0.0` is for a trusted LAN only.
* **No local speech.** The web UI uses the browser's own speech recognition and voices; the server does
  not call Sarvam Saaras (the JS app does). Add it in `client.py` if you want it here.
* **PDFs and Office files are not parsed** — send text, code or images.
* Model ids rot. That is why the catalogue is data and why the live-list endpoint exists.

## License

MIT © Samir Sayyad. Not affiliated with Sarvam AI, OpenAI, Anthropic or Google.
