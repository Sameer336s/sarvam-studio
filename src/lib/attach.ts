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

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic", ".heif"];

function isZip(file: File): boolean {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  );
}

function isTextName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXT.some((ext) => lower.endsWith(ext)) || /(^|\/)(README|LICENSE|Dockerfile|Makefile)$/i.test(name);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> })
    .DecompressionStream;
  if (!Ctor) throw new Error("This browser cannot unzip files.");
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new Ctor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Minimal ZIP reader: walks the central directory and inflates text entries with the
 * platform's own DecompressionStream, so a project zip can be attached without pulling in
 * a 100 KB library. Binary entries are skipped.
 */
async function readZipTexts(file: File): Promise<{ name: string; text: string }[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That file is not a readable zip.");

  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out: { name: string; text: string }[] = [];
  let total = 0;

  for (let n = 0; n < count && out.length < 25; n++) {
    if (off + 46 > buf.length || dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || !isTextName(name)) continue;
    if (localOff + 30 > buf.length) continue;

    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) continue;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let bytes: Uint8Array;
    try {
      if (method === 0) bytes = raw;
      else if (method === 8) bytes = await inflateRaw(raw);
      else continue;
    } catch {
      continue;
    }
    if (bytes.length > 200_000) continue;
    out.push({ name, text: new TextDecoder().decode(bytes) });
    total += bytes.length;
    if (total > 400_000) break;
  }
  return out;
}

/**
 * Android file providers sometimes hand back application/octet-stream with a real
 * filename, so the MIME type alone is not enough to recognise a photo.
 */
function looksImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return IMAGE_EXT.some((ext) => name.endsWith(ext));
}

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

export type AttachResult = { ok: true; attachment: Attachment } | { ok: false; reason: string };

function unsupportedReason(file: File): string {
  const type = file.type || file.name.split(".").pop() || "file";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
    return "PDF is not supported yet — send a .txt export or a screenshot instead";
  if (/word|excel|powerpoint|officedocument/.test(file.type))
    return "Office documents are not supported — export to .txt or .csv first";
  if (file.type.startsWith("video/") || file.type.startsWith("audio/"))
    return "audio and video are not supported yet";
  return `${type} is not supported yet (images and text files are)`;
}

/**
 * Turn a File into an attachment we can send to a model.
 * Returns a reason when the file cannot be used, so the UI can say why.
 */
export async function fileToAttachment(file: File): Promise<AttachResult> {
  const base = {
    id: uid(),
    name: file.name || "pasted",
    mime: file.type || "application/octet-stream",
    size: file.size,
  };

  if (isZip(file)) {
    try {
      const entries = await readZipTexts(file);
      if (entries.length === 0)
        return { ok: false, reason: "that zip has no readable text or code files inside" };
      const joined = entries
        .map((e) => `--- file: ${e.name} ---\n${e.text}`)
        .join("\n\n");
      const capped = joined.length > ATTACH.maxTextChars ? joined.slice(0, ATTACH.maxTextChars) : joined;
      return {
        ok: true,
        attachment: {
          ...base,
          kind: "text",
          text: `${entries.length} file${entries.length === 1 ? "" : "s"} from ${file.name}\n\n${capped}`,
        },
      };
    } catch (e) {
      return { ok: false, reason: (e as Error).message || "could not unzip that file" };
    }
  }

  if (looksImage(file)) {
    if (file.size > ATTACH.maxImageBytes)
      return { ok: false, reason: `image is larger than ${formatBytes(ATTACH.maxImageBytes)}` };
    try {
      const raw = await readAsDataUrl(file);
      const { url, width, height } = await downscale(raw);
      return { ok: true, attachment: { ...base, kind: "image", dataUrl: url, width, height } };
    } catch {
      return {
        ok: false,
        reason: "this image format cannot be decoded here — try JPEG, PNG or WebP",
      };
    }
  }

  if (looksTextual(file)) {
    if (file.size > ATTACH.maxTextBytes)
      return { ok: false, reason: `text file is larger than ${formatBytes(ATTACH.maxTextBytes)}` };
    const text = await readAsText(file);
    return {
      ok: true,
      attachment: {
        ...base,
        kind: "text",
        text: text.length > ATTACH.maxTextChars ? text.slice(0, ATTACH.maxTextChars) : text,
      },
    };
  }

  return { ok: false, reason: unsupportedReason(file) };
}

/** Files dropped or picked in one go, with a reason per skipped file. */
export async function filesToAttachments(
  files: FileList | File[],
  existing: number,
): Promise<{ added: Attachment[]; skipped: string[] }> {
  const all = Array.from(files);
  const room = Math.max(0, ATTACH.maxFiles - existing);
  const list = all.slice(0, room);
  const added: Attachment[] = [];
  const skipped: string[] = [];
  if (all.length > room) skipped.push(`only ${ATTACH.maxFiles} attachments per message`);

  for (const f of list) {
    try {
      const res = await fileToAttachment(f);
      if (res.ok) added.push(res.attachment);
      else skipped.push(`${f.name}: ${res.reason}`);
    } catch {
      skipped.push(`${f.name}: could not be read`);
    }
  }
  return { added, skipped };
}
