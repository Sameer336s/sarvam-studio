import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "ok" | "warn" | "info" };

export function toast(message: string, tone: "ok" | "warn" | "info" = "info") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, tone } }));
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail as { message: string; tone: Toast["tone"] };
      const id = ++seq;
      setItems((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4800);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="glass-hi rise pointer-events-auto flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-[12.5px] text-ink"
        >
          {t.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : t.tone === "warn" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          )}
          <span className="flex-1 leading-relaxed">{t.message}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
