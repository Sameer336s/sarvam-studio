import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/* ---------------------------------------------------------------- inline */

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  let i = 0;
  while ((match = INLINE.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-i${i++}`;
    if (token.startsWith("**") || token.startsWith("__")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m) {
        out.push(
          <a key={key} href={m[2]} target="_blank" rel="noreferrer noopener">
            {m[1]}
          </a>,
        );
      } else out.push(token);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ------------------------------------------------------------- code block */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="btn btn-ghost h-6 gap-1 rounded-lg px-2 text-[11px]"
          type="button"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ---------------------------------------------------------------- blocks */

type Block =
  | { kind: "code"; code: string; lang?: string }
  | { kind: "text"; lines: string[] };

function splitBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (m.index > last) {
      const text = src.slice(last, m.index);
      if (text.trim()) blocks.push({ kind: "text", lines: text.split("\n") });
    }
    blocks.push({ kind: "code", lang: m[1] || undefined, code: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    const text = src.slice(last);
    if (text.trim()) blocks.push({ kind: "text", lines: text.split("\n") });
  }
  return blocks;
}

function renderText(lines: string[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[] | null = null;
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    out.push(<p key={`${keyBase}-p${key++}`}>{inline(para.join(" "), `${keyBase}-p${key}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={`${keyBase}-li${key}-${i}`}>{inline(it, `${keyBase}-li${key}-${i}`)}</li>
    ));
    out.push(
      list.ordered ? (
        <ol key={`${keyBase}-ol${key++}`}>{items}</ol>
      ) : (
        <ul key={`${keyBase}-ul${key++}`}>{items}</ul>
      ),
    );
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const rows = table
      .filter((r) => !/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(r))
      .map((r) =>
        r
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
    if (rows.length) {
      const [head, ...body] = rows;
      out.push(
        <div key={`${keyBase}-tw${key++}`} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={i}>{inline(h, `${keyBase}-th${i}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{inline(c, `${keyBase}-td${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    table = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushPara();
      flushList();
      flushTable();
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      flushList();
      (table ??= []).push(line);
      continue;
    }
    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = inline(heading[2], `${keyBase}-h${key}`);
      const k = `${keyBase}-h${key++}`;
      if (level === 1) out.push(<h1 key={k}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={k}>{content}</h2>);
      else out.push(<h3 key={k}>{content}</h3>);
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-]*$/.test(line)) {
      flushPara();
      flushList();
      out.push(<hr key={`${keyBase}-hr${key++}`} />);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      flushList();
      out.push(
        <blockquote key={`${keyBase}-q${key++}`}>
          {inline(quote[1], `${keyBase}-q${key}`)}
        </blockquote>,
      );
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ? ul[1] : ol![1]) as string);
      continue;
    }

    if (list) flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  flushTable();
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text || "");
  return (
    <div className="md">
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <CodeBlock key={i} code={b.code} lang={b.lang} />
        ) : (
          <div key={i}>{renderText(b.lines, `b${i}`)}</div>
        ),
      )}
    </div>
  );
}
