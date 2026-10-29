export type Artifact = {
  id: string;
  /** Suggested file name, e.g. upload.py */
  name: string;
  lang: string;
  code: string;
  lines: number;
  bytes: number;
};

const EXT: Record<string, string> = {
  python: "py", py: "py", javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts",
  tsx: "tsx", json: "json", bash: "sh", sh: "sh", shell: "sh", zsh: "sh", html: "html",
  css: "css", scss: "scss", sql: "sql", yaml: "yml", yml: "yml", toml: "toml", java: "java",
  kotlin: "kt", kt: "kt", swift: "swift", go: "go", rust: "rs", rs: "rs", ruby: "rb", rb: "rb",
  php: "php", c: "c", h: "h", cpp: "cpp", "c++": "cpp", csharp: "cs", cs: "cs", xml: "xml",
  markdown: "md", md: "md", csv: "csv", dockerfile: "Dockerfile", diff: "diff", ini: "ini",
  text: "txt", txt: "txt", plaintext: "txt", graphql: "graphql", r: "r", dart: "dart",
};

/**
 * Pulls the code blocks out of a reply so they can be offered as real files
 * (download / open / share) instead of something to copy by hand.
 *
 * A fence may name the file directly: ```python upload.py
 */
export function extractArtifacts(text: string): Artifact[] {
  const out: Artifact[] = [];
  if (!text || text.indexOf("```") === -1) return out;

  const fence = /```([\w+#.-]*)(?:[ \t]+([^\n`]+))?\n([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = fence.exec(text))) {
    const lang = (m[1] || "").toLowerCase();
    const hint = (m[2] || "").trim();
    const code = m[3].replace(/\n$/, "");
    if (!code.trim()) continue;
    // Skip one-liners and trivially short blocks — they are prose examples, not files.
    if (code.length < 60 && code.split("\n").length < 3) continue;

    let name = "";
    if (hint && /^[\w.-]+\.[a-z0-9]{1,6}$/i.test(hint)) name = hint;
    if (!name) {
      const ext = EXT[lang] || (lang ? lang.replace(/[^\w]/g, "") : "txt");
      name = ext === "Dockerfile" ? "Dockerfile" : `snippet-${i + 1}.${ext}`;
    }

    out.push({
      id: `art_${i}_${code.length}`,
      name,
      lang: lang || "text",
      code,
      lines: code.split("\n").length,
      bytes: new Blob([code]).size,
    });
    i++;
    if (out.length >= 6) break;
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
