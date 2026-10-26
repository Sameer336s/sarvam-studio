import { useRef, useState } from "react";
import { Download, HardDrive, Keyboard, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button, Card, Modal } from "@/components/ui";
import { toast } from "@/components/Toast";

function storageUsage() {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      bytes += (localStorage.getItem(k)?.length ?? 0) + k.length;
    }
  } catch {
    /* ignore */
  }
  return bytes;
}

export function DataPanel() {
  const store = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<"chats" | "keys" | "all" | null>(null);

  const download = () => {
    const blob = new Blob([store.exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sarvam-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded (API keys are never included).", "ok");
  };

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = store.importAll(String(reader.result ?? ""));
      toast(res.message, res.ok ? "ok" : "warn");
    };
    reader.readAsText(file);
  };

  const bytes = storageUsage();
  const kb = (bytes / 1024).toFixed(1);

  return (
    <div className="space-y-4">
      <Card title="Backup & restore" subtitle="Everything except API keys: chats, models, providers, MCP servers and settings.">
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={download}>
            <Download className="h-4 w-4" /> Export JSON
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
          <HardDrive className="h-3.5 w-3.5 text-muted" />
          <p className="text-[11.5px] text-muted">
            Using <span className="text-ink">{kb} KB</span> of browser storage ·{" "}
            {store.conversations.length} chats · {store.conversations.reduce((n, c) => n + c.messages.length, 0)} messages
          </p>
        </div>
      </Card>

      <Card title="Delete data" subtitle="These actions cannot be undone.">
        <div className="space-y-2">
          <Row
            title="Clear all conversations"
            body="Keeps your models, providers, settings and saved keys."
            action={
              <Button variant="danger" size="sm" onClick={() => setConfirm("chats")}>
                <Trash2 className="h-3.5 w-3.5" /> Clear chats
              </Button>
            }
          />
          <Row
            title="Forget every API key"
            body="Removes the encrypted keys and the device key. You will need to paste keys again."
            action={
              <Button variant="danger" size="sm" onClick={() => setConfirm("keys")}>
                <Trash2 className="h-3.5 w-3.5" /> Forget keys
              </Button>
            }
          />
          <Row
            title="Factory reset"
            body="Wipes chats, keys, custom providers, MCP servers and all settings."
            action={
              <Button variant="danger" size="sm" onClick={() => setConfirm("all")}>
                <TriangleAlert className="h-3.5 w-3.5" /> Reset everything
              </Button>
            }
          />
        </div>
      </Card>

      <Card title="Keyboard shortcuts">
        <div className="grid gap-1.5 text-[11.5px] text-muted sm:grid-cols-2">
          {[
            ["Send message", "Enter"],
            ["New line", "Shift + Enter"],
            ["Send (always)", "Ctrl / ⌘ + Enter"],
            ["Close panel", "Esc"],
            ["New chat", "Ctrl / ⌘ + K"],
          ].map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5">
                <Keyboard className="h-3 w-3" />
                {label}
              </span>
              <span className="font-mono text-[10.5px] text-ink">{keys}</span>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "chats"
            ? "Clear all conversations?"
            : confirm === "keys"
              ? "Forget every API key?"
              : "Factory reset this app?"
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          {confirm === "chats"
            ? "Every chat and message will be deleted from this browser."
            : confirm === "keys"
              ? "Saved keys will be deleted and the encryption key discarded. This cannot be undone."
              : "All local data will be deleted, including keys, custom providers and settings."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm === "chats") {
                store.clearAllChats();
                toast("Conversations cleared.", "ok");
              } else if (confirm === "keys") {
                await Promise.all(Object.keys(store.keys).map((slot) => store.clearKey(slot)));
                toast("All keys forgotten.", "ok");
              } else {
                await store.resetEverything();
                toast("App reset to defaults.", "ok");
              }
              setConfirm(null);
            }}
          >
            Yes, delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}
