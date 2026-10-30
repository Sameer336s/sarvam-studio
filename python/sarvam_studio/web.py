"""The single-page UI, served by the Python server. Vanilla JS, no build step.

Mocha & gold: #5B4632 surfaces, #F4D9A0 champagne, #C8792C amber.
"""

INDEX_HTML = r"""<!doctype html>
<html lang="en" data-theme="dark" data-palette="warm">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Sarvam Studio</title>
<style>
  :root {
    --accent: #C8792C;
    --accent-2: #F4D9A0;
    --radius: 14px;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  html[data-palette="warm"][data-theme="dark"] {
    --bg-0: #17110c; --bg-1: #1f1811; --panel: #2a211a; --panel-2: #33291f;
    --fg: #f6eee4; --muted: #baa892; --border: rgba(255,236,210,.10);
  }
  html[data-palette="warm"][data-theme="light"] {
    --bg-0: #faf5ee; --bg-1: #fffdf8; --panel: #fffdf9; --panel-2: #f6ece0;
    --fg: #2b2016; --muted: #7c6854; --border: rgba(92,70,50,.14);
  }
  html[data-palette="neutral"][data-theme="dark"] {
    --bg-0: #0f1115; --bg-1: #161920; --panel: #1b1f27; --panel-2: #232833;
    --fg: #e9ecf3; --muted: #9aa3b2; --border: rgba(255,255,255,.10);
  }
  html[data-palette="neutral"][data-theme="light"] {
    --bg-0: #f6f7f9; --bg-1: #ffffff; --panel: #ffffff; --panel-2: #eef0f4;
    --fg: #171a20; --muted: #5d6675; --border: rgba(20,24,32,.12);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; height: 100vh; display: flex; overflow: hidden;
    background: var(--bg-0); color: var(--fg); font-family: var(--font); font-size: 14px;
  }
  button, input, textarea, select { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: none; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--panel-2); border-radius: 8px; }

  /* sidebar */
  aside {
    width: 264px; flex: 0 0 264px; background: var(--bg-1); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; padding: 10px; gap: 8px;
  }
  .brand { display: flex; align-items: center; gap: 8px; padding: 6px 4px 10px; }
  .brand .dot { width: 22px; height: 22px; border-radius: 7px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
  .brand b { font-size: 14px; letter-spacing: .2px; }
  .brand small { display: block; color: var(--muted); font-size: 10.5px; font-weight: 400; }
  .new {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #241a10;
    border-radius: 10px; padding: 9px 12px; font-weight: 650; font-size: 13px;
  }
  .chats { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .chat-row { display: flex; align-items: center; gap: 6px; padding: 8px 9px; border-radius: 9px;
    color: var(--muted); font-size: 12.5px; }
  .chat-row:hover { background: var(--panel); color: var(--fg); }
  .chat-row.active { background: var(--panel); color: var(--fg); }
  .chat-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-row button { color: var(--muted); font-size: 14px; opacity: 0; }
  .chat-row:hover button { opacity: 1; }
  .side-foot { border-top: 1px solid var(--border); padding-top: 8px; display: flex; gap: 6px; }
  .side-foot button { flex: 1; padding: 7px; border-radius: 8px; background: var(--panel);
    color: var(--muted); font-size: 12px; }
  .side-foot button:hover { color: var(--fg); }

  /* main */
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid var(--border); }
  header h1 { font-size: 13.5px; font-weight: 600; margin: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  header .sub { color: var(--muted); font-size: 11px; }
  .spacer { flex: 1; }
  .icon-btn { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
    color: var(--muted); }
  .icon-btn:hover { background: var(--panel); color: var(--fg); }

  .scroll { flex: 1; overflow-y: auto; padding: 18px 16px 8px; }
  .thread { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .msg { display: flex; gap: 10px; }
  .msg.user { flex-direction: row-reverse; }
  .msg > .body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .msg.user > .body { align-items: flex-end; }
  .avatar { width: 26px; height: 26px; border-radius: 8px; flex: 0 0 26px; display: grid;
    place-items: center; font-size: 12px; background: var(--panel-2); color: var(--muted); }
  .bubble { max-width: min(100%, 660px); padding: 10px 13px; border-radius: var(--radius);
    background: var(--panel); line-height: 1.62; overflow-wrap: anywhere; }
  .msg.user .bubble { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #241a10; }
  .msg .meta { font-size: 10.5px; color: var(--muted); margin-bottom: 3px; }
  .bubble img { max-width: 100%; border-radius: 10px; display: block; margin: 6px 0; }
  .bubble pre { background: #14110d; color: #efe9e0; padding: 10px 12px; border-radius: 10px;
    overflow-x: auto; font-family: var(--mono); font-size: 12.5px; margin: 8px 0; }
  .bubble code { font-family: var(--mono); font-size: .9em; background: rgba(127,127,127,.16);
    padding: 1px 4px; border-radius: 4px; }
  .bubble pre code { background: none; padding: 0; }
  .bubble table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 12.5px; }
  .bubble th, .bubble td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; }
  .bubble a { color: var(--accent); }
  .actions { display: flex; gap: 4px; margin-top: 6px; opacity: 0; transition: opacity .15s; }
  .msg:hover .actions { opacity: 1; }
  .actions button { font-size: 11px; color: var(--muted); padding: 3px 7px; border-radius: 6px;
    background: var(--panel-2); }
  .actions button:hover { color: var(--fg); }
  .notice { margin-top: 6px; font-size: 11.5px; color: #e9b46a; background: rgba(200,121,44,.12);
    border: 1px solid rgba(200,121,44,.3); border-radius: 8px; padding: 6px 9px;
    display: flex; gap: 8px; align-items: center; }
  .notice button { color: #f4d9a0; font-weight: 600; }

  /* composer */
  .composer-wrap { padding: 8px 16px max(12px, env(safe-area-inset-bottom)); }
  .composer { max-width: 760px; margin: 0 auto; background: var(--bg-1);
    border: 1px solid var(--border); border-radius: 16px; padding: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 3px 9px; }
  .chip button { color: var(--muted); }
  textarea { width: 100%; background: none; border: 0; resize: none; outline: none;
    padding: 8px 8px 4px; max-height: 180px; line-height: 1.55; }
  .row { display: flex; align-items: center; gap: 6px; padding: 2px 4px 2px; }
  select { background: var(--panel); border: 1px solid var(--border); border-radius: 9px;
    padding: 6px 8px; font-size: 12px; max-width: 46vw; }
  .send { margin-left: auto; width: 34px; height: 34px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #241a10;
    font-size: 16px; font-weight: 700; }
  .send:disabled { opacity: .4; }
  .hint { text-align: center; font-size: 10.5px; color: var(--muted); margin-top: 6px; }

  /* drawer */
  .drawer { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: none; z-index: 40; }
  .drawer.open { display: block; }
  .sheet { position: absolute; right: 0; top: 0; bottom: 0; width: min(460px, 100%);
    background: var(--bg-1); border-left: 1px solid var(--border); overflow-y: auto; padding: 16px; }
  .sheet h2 { font-size: 15px; margin: 0 0 4px; }
  .sheet p.note { color: var(--muted); font-size: 11.5px; margin: 0 0 14px; line-height: 1.55; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 12px; margin-bottom: 10px; }
  .card h3 { font-size: 12.5px; margin: 0 0 8px; }
  label { display: block; font-size: 11.5px; color: var(--muted); margin: 8px 0 3px; }
  input[type=text], input[type=password], input[type=number] {
    width: 100%; background: var(--bg-0); border: 1px solid var(--border); border-radius: 9px;
    padding: 8px 10px; font-size: 12.5px; }
  input[type=range] { width: 100%; accent-color: var(--accent); }
  .btn { background: var(--panel-2); border: 1px solid var(--border); border-radius: 9px;
    padding: 7px 11px; font-size: 12px; }
  .btn.accent { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #241a10;
    font-weight: 650; border: 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .keyrow { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .pill { font-size: 10px; padding: 2px 7px; border-radius: 999px; background: var(--panel-2);
    color: var(--muted); }
  .pill.ok { color: #7fd39a; }
  .swatches { display: flex; gap: 6px; margin-top: 8px; }
  .swatches i { flex: 1; height: 22px; border-radius: 6px; border: 1px solid var(--border); }
  @media (max-width: 760px) {
    aside { position: fixed; inset: 0 auto 0 0; z-index: 30; transform: translateX(-100%);
      transition: transform .2s; }
    aside.open { transform: none; }
  }
</style>
</head>
<body>
<aside id="sidebar">
  <div class="brand">
    <div class="dot"></div>
    <div><b>Sarvam Studio</b><small>Python edition</small></div>
  </div>
  <button class="new" id="newChat">+ New chat</button>
  <div class="chats" id="chats"></div>
  <div class="side-foot">
    <button id="openSettings">Settings</button>
    <button id="toggleTheme">Theme</button>
  </div>
</aside>

<main>
  <header>
    <button class="icon-btn" id="menuBtn">☰</button>
    <div style="min-width:0">
      <h1 id="chatTitle">New chat</h1>
      <div class="sub" id="chatSub">no model</div>
    </div>
    <div class="spacer"></div>
    <button class="icon-btn" id="speakBtn" title="Read replies aloud">🔊</button>
    <button class="icon-btn" id="settingsBtn" title="Settings">⚙</button>
  </header>

  <div class="scroll" id="scroll"><div class="thread" id="thread"></div></div>

  <div class="composer-wrap">
    <div class="composer">
      <div class="chips" id="chips"></div>
      <textarea id="input" rows="1" placeholder="Message… (Enter to send, Shift+Enter for a new line)"></textarea>
      <div class="row">
        <select id="modelSel"></select>
        <button class="icon-btn" id="attachBtn" title="Attach images or files">📎</button>
        <button class="icon-btn" id="micBtn" title="Speak">🎙</button>
        <button class="send" id="sendBtn" title="Send">↑</button>
      </div>
    </div>
    <div class="hint" id="hint"></div>
  </div>
</main>

<input type="file" id="fileInput" multiple hidden
  accept="image/*,text/*,application/pdf,.md,.json,.csv,.log,.yml,.yaml,.xml,.html,.css,.js,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.sql,.ini,.toml,.zip" />

<div class="drawer" id="drawer">
  <div class="sheet" id="sheet"></div>
</div>

<script>
const state = { config: {}, models: [], presets: [], keys: {}, providers: {}, mcp: [], customProviders: {} };
const chats = { list: [], active: null };
let attachments = [], busy = false, controller = null, recognizing = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------------------------------------------------------- markdown */
function md(text) {
  const blocks = [];
  let s = esc(text).replace(/```(\w+)?[ \t]*([^\n`]*)\n([\s\S]*?)```/g, (m, lang, name, code) => {
    blocks.push({ lang: lang || "text", name: (name || "").trim(), code });
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
       .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/(^|\n)### (.+)/g, "$1<h4>$2</h4>")
       .replace(/(^|\n)## (.+)/g, "$1<h3>$2</h3>")
       .replace(/(^|\n)# (.+)/g, "$1<h3>$2</h3>")
       .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" loading="lazy" />')
       .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');

  // pipe tables (before newlines become <br>)
  s = s.replace(/(^|\n)(\|[^\n]*\|)\n\|[\-: |]+\|\n((?:\|[^\n]*\|\n?)+)/g, (m0, pre, head, rows) => {
    const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const th = cells(head).map((c) => `<th>${c}</th>`).join("");
    const body = rows.trim().split("\n").map((line) => `<tr>${cells(line).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    return `${pre}<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  });

  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  s = "<p>" + s + "</p>";
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const b = blocks[Number(i)];
    return `<pre data-name="${esc(b.name || "")}" data-lang="${esc(b.lang)}"><code>${esc(b.code)}</code></pre>`;
  });
  return s;
}

/* ---------------------------------------------------------------- storage */
const LS = "sarvam.py.chats";
function loadChats() {
  try { const raw = JSON.parse(localStorage.getItem(LS) || "{}"); chats.list = raw.list || []; chats.active = raw.active || null; }
  catch { chats.list = []; }
}
function saveChats() { localStorage.setItem(LS, JSON.stringify({ list: chats.list, active: chats.active })); }
function currentChat() { return chats.list.find((c) => c.id === chats.active); }
function newChat() {
  const chat = { id: "c" + Date.now(), title: "New chat", messages: [], model: state.config.defaultModel || "auto" };
  chats.list.unshift(chat); chats.active = chat.id; saveChats(); renderChats(); renderThread(); $("input").focus();
}

/* ------------------------------------------------------------------- render */
function renderChats() {
  $("chats").innerHTML = chats.list.map((c) => `
    <div class="chat-row ${c.id === chats.active ? "active" : ""}" data-id="${c.id}">
      <span>${esc(c.title || "New chat")}</span>
      <button data-del="${c.id}" title="Delete">×</button>
    </div>`).join("") || `<div class="chat-row"><span>No chats yet</span></div>`;
  $("chats").querySelectorAll(".chat-row").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.dataset.del) {
        chats.list = chats.list.filter((c) => c.id !== e.target.dataset.del);
        if (chats.active === e.target.dataset.del) chats.active = chats.list[0]?.id || null;
        saveChats(); renderChats(); renderThread(); return;
      }
      chats.active = row.dataset.id; saveChats(); renderChats(); renderThread();
    };
  });
}

function bubbleHtml(m) {
  const images = (m.attachments || []).filter((a) => a.kind === "image" && a.dataUrl)
    .map((a) => `<img src="${a.dataUrl}" alt="${esc(a.name)}" />`).join("");
  const files = (m.attachments || []).filter((a) => a.kind !== "image")
    .map((a) => `<div class="chip">📄 ${esc(a.name)}</div>`).join("");
  return images + files + md(m.content || "");
}

function renderThread() {
  const chat = currentChat();
  const thread = $("thread");
  if (!chat) { thread.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0">Say something to start.</div>`; return; }
  thread.innerHTML = chat.messages.map((m, i) => `
    <div class="msg ${m.role}">
      <div class="avatar">${m.role === "user" ? "you" : "AI"}</div>
      <div class="body">
        <div class="meta">${m.role === "user" ? "You" : esc(m.modelName || "assistant")}${m.usage ? ` · ${m.usage.completion || 0} tok` : ""}</div>
        <div class="bubble">${bubbleHtml(m)}</div>
        ${m.notice ? `<div class="notice"><span>${m.notice === "length" ? "Reply was cut at the output limit." : "The stream was interrupted."}</span><button data-continue="${i}">Continue</button></div>` : ""}
        <div class="actions">
          <button data-copy="${i}">Copy</button>
          <button data-regen="${i}">Regenerate</button>
          ${(m.role === "assistant") ? `<button data-save="${i}">Save</button>` : ""}
        </div>
      </div>
    </div>`).join("");
  thread.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => {
    navigator.clipboard.writeText(chat.messages[b.dataset.copy].content);
    b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200);
  });
  thread.querySelectorAll("[data-regen]").forEach((b) => b.onclick = () => regenerate(Number(b.dataset.regen)));
  thread.querySelectorAll("[data-continue]").forEach((b) => b.onclick = () => send("Continue exactly where you stopped. Do not repeat yourself."));
  thread.querySelectorAll("[data-save]").forEach((b) => b.onclick = () => saveArtifact(Number(b.dataset.save)));
  thread.querySelectorAll("pre[data-name]").forEach((pre) => {
    if (!pre.dataset.name) return;
    const btn = document.createElement("button");
    btn.className = "btn"; btn.style.marginTop = "4px"; btn.textContent = "⤓ " + pre.dataset.name;
    btn.onclick = () => download(pre.dataset.name, pre.innerText);
    pre.after(btn);
  });
  $("scroll").scrollTop = $("scroll").scrollHeight;
  const model = state.models.find((m) => m.id === (chat.model || "auto"));
  $("chatTitle").textContent = chat.title;
  $("chatSub").textContent = model ? `${model.name} · ${model.providerName}` : "auto";
}

/* ------------------------------------------------------------------- files */
function download(name, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function saveArtifact(index) {
  const chat = currentChat(); if (!chat) return;
  const code = [...document.querySelectorAll(".msg")[index].querySelectorAll("pre")].map((p) => p.innerText).join("\n\n");
  download(`reply-${index + 1}.txt`, code || chat.messages[index].content);
}

async function addFiles(files) {
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      attachments.push({ kind: "image", name: file.name, mime: file.type, dataUrl });
    } else {
      const text = await file.text().catch(() => "");
      if (!text) continue;
      attachments.push({ kind: "text", name: file.name, mime: file.type || "text/plain", text: text.slice(0, 40000) });
    }
  }
  renderChips();
}
function renderChips() {
  $("chips").innerHTML = attachments.map((a, i) => `
    <div class="chip">${a.kind === "image" ? "🖼" : "📄"} ${esc(a.name)}
      <button data-rm="${i}">×</button></div>`).join("");
  $("chips").querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
    attachments.splice(Number(b.dataset.rm), 1); renderChips();
  });
}

/* -------------------------------------------------------------------- send */
async function send(presetText) {
  const chat = currentChat() || (newChat(), currentChat());
  const text = (presetText !== undefined ? presetText : $("input").value).trim();
  if ((!text && !attachments.length) || busy) return;

  chat.messages.push({ role: "user", content: text, attachments: [...attachments] });
  if (chat.title === "New chat" && text) chat.title = text.slice(0, 42);
  $("input").value = ""; attachments = []; renderChips();
  const reply = { role: "assistant", content: "", modelName: "" };
  chat.messages.push(reply);
  saveChats(); renderChats(); renderThread();

  busy = true; $("sendBtn").textContent = "■"; controller = new AbortController();

  const history = chat.messages.slice(0, -1).slice(-(state.config.contextMessages || 30)).map((m) => ({
    role: m.role, content: m.content, attachments: m.attachments || [],
  }));

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: chat.model || "auto",
        messages: history,
        system: state.config.systemPrompt,
        params: state.config.params,
        mcp: (state.mcp || []).filter((s) => s.enabled !== false).map((s) => ({ url: s.url, headers: s.headers || {} })),
      }),
    });
    if (!res.ok) throw new Error(await res.text());

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === "delta") { reply.content += ev.text; renderThread(); }
        else if (ev.type === "reasoning") { reply.reasoning = (reply.reasoning || "") + ev.text; }
        else if (ev.type === "model") { reply.modelName = ev.name; }
        else if (ev.type === "usage") { reply.usage = ev; }
        else if (ev.type === "notice") { reply.notice = ev.kind; }
        else if (ev.type === "error") { reply.content += (reply.content ? "\n\n" : "") + "⚠️ " + ev.message; }
        else if (ev.type === "tool") { reply.content += `\n\n_🔧 ${ev.name}_`; }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") reply.content += (reply.content ? "\n\n" : "") + "⚠️ " + err.message;
  } finally {
    busy = false; $("sendBtn").textContent = "↑"; controller = null;
    saveChats(); renderThread();
    if (state.config.speakReplies && reply.content) speak(reply.content);
  }
}

function regenerate(index) {
  const chat = currentChat(); if (!chat) return;
  const prev = [...chat.messages.slice(0, index)].reverse().find((m) => m.role === "user");
  if (!prev) return;
  chat.messages = chat.messages.slice(0, index - 1);
  saveChats(); renderThread(); send(prev.content);
}

/* ------------------------------------------------------------------- voice */
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const clean = text.replace(/```[\s\S]*?```/g, " code block ").replace(/[*_#>`]/g, " ").slice(0, 3000);
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = state.config.voiceRate || 1;
  u.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function toggleMic() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) { alert("This browser has no speech recognition. Chrome or Android Chrome works."); return; }
  if (recognizing) { recognizing.stop(); recognizing = null; return; }
  const r = new Rec();
  r.lang = state.config.sttLanguage && state.config.sttLanguage !== "unknown" ? state.config.sttLanguage : "en-IN";
  r.interimResults = false;
  r.onresult = (e) => { $("input").value = e.results[0][0].transcript; };
  r.onend = () => { recognizing = null; $("micBtn").style.color = ""; };
  r.start(); recognizing = r; $("micBtn").style.color = "var(--accent)";
}

/* ------------------------------------------------------------------ models */
function renderModels() {
  const usable = state.models.filter((m) => m.hasKey || m.custom);
  const opts = [`<option value="auto">Auto — best available</option>`]
    .concat(usable.map((m) => `<option value="${m.id}">${esc(m.name)} · ${esc(m.providerName)}</option>`));
  $("modelSel").innerHTML = opts.join("");
  const chat = currentChat();
  $("modelSel").value = (chat && chat.model) || state.config.defaultModel || "auto";
}

/* ---------------------------------------------------------------- settings */
function renderSettings() {
  const cfg = state.config;
  const keyRows = Object.entries(state.providers).filter(([id]) => id !== "custom").map(([id, p]) => {
    const slot = "p:" + id;
    const saved = state.keys[slot];
    return `<div class="card">
      <h3>${esc(p.name)} <span class="pill ${saved ? "ok" : ""}">${saved ? "key saved " + esc(saved.hint) : "no key"}</span></h3>
      <div class="keyrow">
        <input type="password" placeholder="Paste ${esc(p.name)} API key" data-key="${slot}" />
        <button class="btn accent" data-save="${slot}">Save</button>
        ${saved ? `<button class="btn" data-clear="${slot}">Clear</button>` : ""}
      </div>
    </div>`;
  }).join("");

  const presetRows = state.presets.map((p) => {
    const added = state.customProviders[p.id];
    return `<div class="card">
      <h3>${esc(p.name)} <span class="pill">${esc(p.short)}</span></h3>
      <p class="note" style="margin:0 0 8px">${esc(p.note)}</p>
      ${added ? `<span class="pill ok">added · ${added.models.length} models</span>` : `<button class="btn accent" data-preset="${p.id}">Add</button>`}
    </div>`;
  }).join("");

  $("sheet").innerHTML = `
    <h2>Settings</h2>
    <p class="note">Everything runs on your machine. Keys are stored encrypted on this server and never sent to the browser.</p>

    <div class="card">
      <h3>Appearance</h3>
      <div class="grid2">
        <button class="btn" data-theme="dark">Dark</button>
        <button class="btn" data-theme="light">Light</button>
        <button class="btn" data-palette="warm">Mocha & gold</button>
        <button class="btn" data-palette="neutral">Neutral</button>
      </div>
      <div class="swatches"><i style="background:#5B4632"></i><i style="background:#F4D9A0"></i><i style="background:#C8792C"></i></div>
    </div>

    <div class="card">
      <h3>Parameters</h3>
      <label>Temperature <b id="tv">${cfg.params.temperature}</b></label>
      <input type="range" min="0" max="2" step="0.05" value="${cfg.params.temperature}" data-param="temperature" />
      <label>Top-p <b id="pv">${cfg.params.top_p}</b></label>
      <input type="range" min="0.1" max="1" step="0.05" value="${cfg.params.top_p}" data-param="top_p" />
      <label>Max output tokens (empty = model maximum)</label>
      <input type="number" min="1" max="2000000" value="${cfg.params.max_tokens ?? ""}" data-param="max_tokens" placeholder="auto" />
      <label>Context messages</label>
      <input type="number" min="2" max="80" value="${cfg.contextMessages}" data-cfg="contextMessages" />
    </div>

    <div class="card">
      <h3>API keys</h3>
      <p class="note" style="margin:0 0 8px">${state.encryption === "fernet" ? "Encrypted with Fernet on disk." : "Stored obfuscated (install `cryptography` for encryption)."}</p>
      ${keyRows}
    </div>

    <div class="card">
      <h3>Free &amp; open-source</h3>
      <p class="note" style="margin:0 0 8px">One click adds the endpoint and its models. Local servers need no key.</p>
      ${presetRows}
    </div>

    <div class="card">
      <h3>MCP tools</h3>
      <label>Server URL (Streamable HTTP)</label>
      <div class="keyrow">
        <input type="text" id="mcpUrl" placeholder="https://mcp.deepwiki.com/mcp" />
        <button class="btn accent" id="mcpAdd">Connect</button>
      </div>
      <div id="mcpList" style="margin-top:8px"></div>
    </div>
  `;

  $("sheet").querySelectorAll("[data-theme]").forEach((b) => b.onclick = () => {
    document.documentElement.dataset.theme = b.dataset.theme;
    patchConfig({ theme: b.dataset.theme });
  });
  $("sheet").querySelectorAll("[data-palette]").forEach((b) => b.onclick = () => {
    document.documentElement.dataset.palette = b.dataset.palette;
    patchConfig({ palette: b.dataset.palette });
  });
  $("sheet").querySelectorAll("[data-save]").forEach((b) => b.onclick = async () => {
    const slot = b.dataset.save;
    const input = $("sheet").querySelector(`[data-key="${slot}"]`);
    if (!input.value.trim()) return;
    const res = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, key: input.value.trim() }) });
    const data = await res.json();
    state.keys = data.keys; await refresh(); renderSettings();
  });
  $("sheet").querySelectorAll("[data-clear]").forEach((b) => b.onclick = async () => {
    const res = await fetch("/api/keys/" + encodeURIComponent(b.dataset.clear), { method: "DELETE" });
    const data = await res.json(); state.keys = data.keys; await refresh(); renderSettings();
  });
  $("sheet").querySelectorAll("[data-preset]").forEach((b) => b.onclick = async () => {
    const res = await fetch("/api/preset", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.dataset.preset }) });
    const data = await res.json();
    state.customProviders = data.customProviders; state.keys = data.keys;
    await refresh(); renderSettings();
  });
  $("sheet").querySelectorAll("[data-param]").forEach((el) => el.oninput = () => {
    const key = el.dataset.param;
    const value = key === "max_tokens" ? (el.value ? Number(el.value) : null) : Number(el.value);
    state.config.params[key] = value;
    if (key === "temperature" && $("tv")) $("tv").textContent = value;
    if (key === "top_p" && $("pv")) $("pv").textContent = value;
    patchConfig({ params: state.config.params });
  });
  $("sheet").querySelectorAll("[data-cfg]").forEach((el) => el.onchange = () => {
    state.config[el.dataset.cfg] = Number(el.value);
    patchConfig({ [el.dataset.cfg]: Number(el.value) });
  });
  const add = $("mcpAdd");
  if (add) add.onclick = async () => {
    const url = $("mcpUrl").value.trim();
    if (!url) return;
    add.textContent = "…";
    const res = await fetch("/api/mcp/connect", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }) });
    const data = await res.json();
    add.textContent = "Connect";
    if (!data.ok) { alert("Could not connect: " + (data.error || "unknown")); return; }
    state.mcp.push({ url, enabled: true, tools: data.tools });
    patchConfig({ mcpServers: state.mcp });
    renderMcp();
  };
  renderMcp();
}

function renderMcp() {
  const box = $("mcpList");
  if (!box) return;
  box.innerHTML = (state.mcp || []).map((s, i) => `
    <div class="chip" style="margin:2px 0;width:100%;justify-content:space-between">
      <span>${esc(s.url)} · ${(s.tools || []).length} tools</span>
      <button data-mcp-rm="${i}">×</button>
    </div>`).join("") || `<span class="pill">none connected</span>`;
  box.querySelectorAll("[data-mcp-rm]").forEach((b) => b.onclick = () => {
    state.mcp.splice(Number(b.dataset.mcpRm), 1); patchConfig({ mcpServers: state.mcp }); renderMcp();
  });
}

async function patchConfig(patch) {
  state.config = { ...state.config, ...patch };
  await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }) });
}

/* ------------------------------------------------------------------- boot */
async function refresh() {
  const res = await fetch("/api/state");
  const data = await res.json();
  Object.assign(state, data);
  document.documentElement.dataset.theme = data.config.theme || "dark";
  document.documentElement.dataset.palette = data.config.palette || "warm";
  $("speakBtn").style.color = data.config.speakReplies ? "var(--accent)" : "";
  renderModels();
  $("hint").textContent = `${data.models.filter((m) => m.hasKey).length} models ready · Auto picks the best for each message`;
}

async function boot() {
  loadChats();
  await refresh();
  if (!chats.active) newChat(); else { renderChats(); renderThread(); }

  $("newChat").onclick = newChat;
  $("sendBtn").onclick = () => (busy ? controller?.abort() : send());
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  $("settingsBtn").onclick = () => { renderSettings(); $("drawer").classList.add("open"); };
  $("openSettings").onclick = () => { renderSettings(); $("drawer").classList.add("open"); };
  $("drawer").onclick = (e) => { if (e.target.id === "drawer") $("drawer").classList.remove("open"); };
  $("toggleTheme").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; patchConfig({ theme: next });
  };
  $("speakBtn").onclick = () => {
    const next = !state.config.speakReplies;
    state.config.speakReplies = next;
    $("speakBtn").style.color = next ? "var(--accent)" : "";
    patchConfig({ speakReplies: next });
  };
  $("attachBtn").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (e) => { addFiles([...e.target.files]); e.target.value = ""; };
  $("micBtn").onclick = toggleMic;
  $("modelSel").onchange = (e) => {
    const chat = currentChat(); if (chat) { chat.model = e.target.value; saveChats(); renderThread(); }
  };
  $("input").oninput = () => { const t = $("input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 180) + "px"; };
  $("input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]); });
}

boot();
</script>
</body>
</html>
"""
