import { useEffect, useState } from "react";
import { MAX_OUTPUT_CEILING } from "@/lib/types";
import { cn } from "@/lib/cn";

const PRESETS = [
  { label: "4K", value: 4096 },
  { label: "8K", value: 8192 },
  { label: "32K", value: 32768 },
  { label: "128K", value: 131072 },
  { label: "1M", value: 1_000_000 },
  { label: "2M", value: 2_000_000 },
];

/** Plain 1,000,000 grouping — token counts read better without lakh/crore units. */
function fmt(n: number) {
  return n.toLocaleString("en-US");
}

/**
 * Max output tokens, with "Auto" as the default.
 *
 * Auto sends the limit the model itself documents (carried in the catalogue), which is
 * almost always the right answer. Manual lets you type any value up to 2,000,000 and it is
 * sent verbatim — the provider decides whether it can honour it.
 */
export function MaxTokensField({
  value,
  modelMax,
  modelName,
  onChange,
  label = "Max output tokens",
}: {
  value: number | null;
  modelMax: number;
  modelName?: string;
  onChange: (v: number | null) => void;
  label?: string;
}) {
  const auto = value == null;
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d]/g, ""));
    if (!n) {
      onChange(null);
      return;
    }
    onChange(Math.min(Math.max(1, n), MAX_OUTPUT_CEILING));
  };

  const over = !auto && value! > modelMax;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {[
            { id: "auto", label: "Auto" },
            { id: "manual", label: "Manual" },
          ].map((opt) => {
            const active = (opt.id === "auto") === auto;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  if (opt.id === "auto") onChange(null);
                  else onChange(value ?? modelMax);
                }}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active ? "bg-accent text-white" : "text-muted hover:bg-white/8 hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {auto ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="font-mono text-[13px] text-ink">{fmt(modelMax)}</span>
          <span className="text-[11px] text-muted">
            tokens — {modelName ? `${modelName}'s documented limit` : "the model's documented limit"}
          </span>
        </div>
      ) : (
        <>
          <input
            type="number"
            min={1}
            max={MAX_OUTPUT_CEILING}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(draft);
            }}
            className="field font-mono"
            placeholder={String(modelMax)}
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => onChange(p.value)}
                className={cn(
                  "chip text-[10px]",
                  value === p.value && "border-accent/50 bg-accent/15 text-accent",
                )}
              >
                {p.label}
              </button>
            ))}
            <button onClick={() => onChange(modelMax)} className="chip text-[10px]">
              model ({fmt(modelMax)})
            </button>
          </div>
        </>
      )}

      <p
        className={cn(
          "mt-1.5 text-[10.5px] leading-relaxed",
          over ? "text-amber-400" : "text-muted/80",
        )}
      >
        {over
          ? `${fmt(value!)} is above what ${modelName ?? "this model"} documents (${fmt(
              modelMax,
            )}) — the request is sent as-is, and the provider may reject it or cut it short.`
          : `Ceiling 2,000,000. Auto is recommended: it follows the model's own limit.`}
      </p>
    </div>
  );
}
