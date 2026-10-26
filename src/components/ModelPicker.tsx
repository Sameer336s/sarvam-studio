import { useMemo, useRef, useState, useEffect } from "react";
import { Check, ChevronDown, Cpu, Search, Zap } from "lucide-react";
import { PROVIDERS, PROVIDER_ORDER, type ModelDef } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { cn, shortNum } from "@/lib/cn";

export function ModelPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  const { visibleModels, models, keys } = useApp();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // not enough room below → open upwards
      setDropUp(window.innerHeight - rect.bottom < 380);
    }
    setOpen((o) => !o);
  };

  const current = models.find((m) => m.id === value) ?? visibleModels[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? visibleModels.filter(
          (m) =>
            m.name.toLowerCase().includes(term) ||
            m.id.toLowerCase().includes(term) ||
            m.capabilities.some((c) => c.includes(term)),
        )
      : visibleModels;
    return PROVIDER_ORDER.map((p) => ({
      provider: p,
      models: list.filter((m) => m.provider === p),
    })).filter((g) => g.models.length > 0);
  }, [visibleModels, q]);

  const hasKey = (m: ModelDef) =>
    m.provider === "custom"
      ? !!keys[`c:${m.providerRef}`]?.key || true
      : !!keys[`p:${m.provider}`]?.key;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "btn h-9 gap-2 rounded-full pl-2.5 pr-2.5 text-[12.5px]",
          compact && "h-8",
        )}
        title="Choose model"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: PROVIDERS[current?.provider ?? "sarvam"].color }}
        />
        <span className="max-w-[150px] truncate font-medium">{current?.name ?? "Select model"}</span>
        {current?.status === "preview" && <span className="chip px-1.5 py-0">preview</span>}
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>

      {open && (
        <div
          className={cn(
            "popover rise absolute left-0 z-40 w-[340px] max-w-[86vw] overflow-hidden rounded-glass-lg",
            dropUp ? "bottom-11" : "top-11",
          )}
        >
          <div className="border-b border-white/10 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search models or capabilities…"
                className="field h-9 pl-8 text-[12.5px]"
              />
            </div>
          </div>
          <div className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
            {groups.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-muted">
                No model matches “{q}”. Add one in Settings → Models.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.provider} className="mb-1">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                  {PROVIDERS[g.provider].name}
                </p>
                {g.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/8",
                      m.id === value && "bg-white/8",
                    )}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/6">
                      {m.id === value ? (
                        <Check className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5 text-muted" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">{m.name}</span>
                        {!hasKey(m) && (
                          <span className="chip border-amber-400/30 bg-amber-500/10 px-1 py-0 text-[9.5px] text-amber-300">
                            no key
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted">
                        <span className="inline-flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5" />
                          {shortNum(m.contextWindow)} ctx
                        </span>
                        <span>·</span>
                        <span>{m.capabilities.slice(0, 3).join(" · ")}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
