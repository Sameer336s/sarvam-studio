/**
 * Saving and sharing generated files.
 *
 * A blob download works in a browser but does nothing inside an Android WebView, so the
 * APK exposes `AndroidFiles.save(name, base64, mime)` which writes through MediaStore into
 * the Downloads folder (Android 10+) or opens a share sheet (older devices).
 */

type AndroidFiles = {
  save: (name: string, base64: string, mime: string) => string;
};

function bridge(): AndroidFiles | null {
  const b = (globalThis as unknown as { AndroidFiles?: AndroidFiles }).AndroidFiles;
  return b && typeof b.save === "function" ? b : null;
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function browserDownload(name: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export type SaveResult = "saved" | "shared" | "downloaded" | "failed";

export function mimeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    csv: "text/csv",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    ts: "text/plain",
    py: "text/x-python",
    sh: "text/x-shellscript",
    yml: "text/yaml",
    yaml: "text/yaml",
    xml: "application/xml",
    sql: "text/plain",
    java: "text/x-java",
    kt: "text/plain",
    go: "text/plain",
    rs: "text/plain",
    rb: "text/plain",
    php: "text/plain",
    c: "text/plain",
    cpp: "text/plain",
  };
  return map[ext] ?? "text/plain";
}

export async function saveFile(name: string, text: string, mime?: string): Promise<SaveResult> {
  const type = mime ?? mimeForName(name);
  const b = bridge();
  if (b) {
    try {
      const status = b.save(name, toBase64(text), type);
      if (status === "saved" || status === "shared") return status;
    } catch {
      /* fall through to the browser path */
    }
  }
  return browserDownload(name, text, type) ? "downloaded" : "failed";
}

/** Opens the file in a new tab (browser only; returns false when blocked). */
export function openFile(name: string, text: string, mime?: string): boolean {
  try {
    const blob = new Blob([text], { type: mime ?? mimeForName(name) });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      URL.revokeObjectURL(url);
      return false;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    return false;
  }
}

/** Native share sheet with the file attached, when the platform supports it. */
export async function shareFile(name: string, text: string, mime?: string): Promise<boolean> {
  const type = mime ?? mimeForName(name);
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  try {
    if (nav.canShare && nav.share) {
      const file = new File([text], name, { type });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: name });
        return true;
      }
    }
  } catch {
    /* cancelled or unsupported */
  }
  // WebView and older browsers: fall back to the save bridge (share sheet on old Android).
  const saved = await saveFile(name, text, type);
  return saved === "saved" || saved === "shared" || saved === "downloaded";
}
