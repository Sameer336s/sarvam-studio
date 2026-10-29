import { useState } from "react";
import { Check, Download, ExternalLink, FileCode2, Share2 } from "lucide-react";
import { extractArtifacts, formatBytes } from "@/lib/artifacts";
import { openFile, saveFile, shareFile } from "@/lib/save";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";

/**
 * Files produced by a reply. Each one can be downloaded, opened in a tab, or shared —
 * the same three actions a chat app like Indus gives you for generated documents.
 */
export function ArtifactBar({ text, className }: { text: string; className?: string }) {
  const artifacts = extractArtifacts(text);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  if (artifacts.length === 0) return null;

  const mark = (id: string, label: string) => {
    setDone((d) => ({ ...d, [id]: label }));
    setTimeout(() => setDone((d) => ({ ...d, [id]: "" })), 2200);
  };

  const onSave = async (id: string, name: string, code: string) => {
    setBusy(id);
    const res = await saveFile(name, code);
    setBusy(null);
    if (res === "saved") {
      mark(id, "Saved");
      toast(`${name} saved to Downloads`, "ok");
    } else if (res === "shared") {
      mark(id, "Shared");
      toast(`${name} — pick where to send it`, "ok");
    } else if (res === "downloaded") {
      mark(id, "Saved");
      toast(`${name} downloaded`, "ok");
    } else {
      toast("Could not save that file here", "warn");
    }
  };

  const onOpen = (name: string, code: string) => {
    if (!openFile(name, code)) {
      void onSave(`${name}-open`, name, code);
    }
  };

  const onShare = async (id: string, name: string, code: string) => {
    setBusy(id);
    const ok = await shareFile(name, code);
    setBusy(null);
    if (ok) mark(id, "Shared");
    else toast("Sharing is not available here — file saved instead", "warn");
  };

  return (
    <div className={cn("mt-2 space-y-1.5", className)}>
      {artifacts.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
        >
          <FileCode2 className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11.5px] text-ink">{a.name}</p>
            <p className="text-[10px] text-muted">
              {a.lang} · {a.lines} lines · {formatBytes(a.bytes)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => void onSave(a.id, a.name, a.code)}
              disabled={busy === a.id}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-white/10 hover:text-ink"
              title="Download"
            >
              {done[a.id] ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Download className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{done[a.id] || "Download"}</span>
            </button>
            <button
              onClick={() => onOpen(a.name, a.code)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-white/10 hover:text-ink"
              title="Open in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </button>
            <button
              onClick={() => void onShare(a.id, a.name, a.code)}
              disabled={busy === a.id}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-white/10 hover:text-ink"
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
