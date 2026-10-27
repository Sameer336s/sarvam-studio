import type { Attachment } from "@/lib/types";
import { ATTACH } from "@/lib/types";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TEXT_EXT = [
  ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".log", ".yml", ".yaml", ".xml",
  ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java",
  ".kt", ".c", ".h", ".cpp", ".cs", ".php", ".sh", ".sql", ".ini", ".toml", ".env",
];

function looksTextual(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (/^application\/(json|xml|x-yaml|javascript|x-sh)/.test(file.type)) return true;
  const name = file.name.toLowerCase();
  return TEXT_EXT.some((ext) => name.endsWith(ext));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

/** Downscale an image in the browser so a 6 MB photo becomes ~150 KB. */
async function downscale(dataUrl: string): Promise<{ url: string; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode that image."));
    el.src = dataUrl;
  });
  const max = ATTACH.maxImageDim;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  ctx.drawImage(img, 0, 0, w, h);

  // Keep transparency for PNGs, compress everything else as JPEG.
  const isPng = dataUrl.startsWith("data:image/png");
  const out = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", ATTACH.imageQuality);
  return { url: out.length < dataUrl.length ? out : dataUrl, width: w, height: h };
}

let seq = 0;
const uid = () => `att_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Turn a File into an attachment we can send to a model.
 * Returns null when the file is too big or cannot be used.
 */
export async function fileToAttachment(file: File): Promise<Attachment | null> {
  const base = {
    id: uid(),
    name: file.name || "pasted",
    mime: file.type || "application/octet-stream",
    size: file.size,
  };

  if (file.type.startsWith("image/")) {
    if (file.size > ATTACH.maxImageBytes) return null;
    const raw = await readAsDataUrl(file);
    const { url, width, height } = await downscale(raw);
    return { ...base, kind: "image", dataUrl: url, width, height };
  }

  if (looksTextual(file)) {
    if (file.size > ATTACH.maxTextBytes) return null;
    const text = await readAsText(file);
    return {
      ...base,
      kind: "text",
      text: text.length > ATTACH.maxTextChars ? text.slice(0, ATTACH.maxTextChars) : text,
    };
  }

  return null;
}

/** Files dropped or picked in one go, with per-file error reporting. */
export async function filesToAttachments(
  files: FileList | File[],
  existing: number,
): Promise<{ added: Attachment[]; skipped: string[] }> {
  const list = Array.from(files).slice(0, Math.max(0, ATTACH.maxFiles - existing));
  const added: Attachment[] = [];
  const skipped: string[] = [];
  for (const f of list) {
    try {
      const a = await fileToAttachment(f);
      if (a) added.push(a);
      else skipped.push(`${f.name} (unsupported or too large)`);
    } catch {
      skipped.push(`${f.name} (could not read)`);
    }
  }
  return { added, skipped };
}
