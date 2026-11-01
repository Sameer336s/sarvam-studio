import { Check, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_PARAMS, DEFAULT_SYSTEM_PROMPT } from "@/lib/types";
import { Button, Card, Field, Row, Select, Switch } from "@/components/ui";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";

const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
] as const;

export function GeneralPanel() {
  const { settings, patchSettings, models, conversations, encryption } = useApp();

  return (
    <div>
      <Card title="Theme" subtitle="Applies instantly, everywhere.">
        <Row label="Colour mode" hint="System follows your phone's setting.">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => patchSettings({ theme: t.id as typeof settings.theme })}
                className={cn(
                  "px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  settings.theme === t.id ? "bg-accent text-white" : "text-muted hover:bg-white/8 hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Palette" hint="Mocha brown surfaces with champagne and amber, or neutral graphite.">
          <div className="flex gap-1.5">
            {[
              { id: "warm", label: "Mocha", colors: ["#5B4632", "#F4D9A0", "#C8792C"] },
              { id: "neutral", label: "Neutral", colors: ["#2a2a30", "#9aa3b2", "#6366f1"] },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => patchSettings({ palette: p.id as "warm" | "neutral" })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
                  settings.palette === p.id ? "border-accent/60 bg-accent/10" : "border-white/10",
                )}
              >
                <span className="flex">
                  {p.colors.map((c) => (
                    <span
                      key={c}
                      className="-ml-0.5 h-3 w-3 rounded-full border border-black/20 first:ml-0"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                {p.label}
                {settings.palette === p.id && <Check className="h-3 w-3 text-accent" />}
              </button>
            ))}
          </div>
        </Row>
      </Card>

      <Card
        title="Recommended setup"
        subtitle="The baseline this app is tuned for. Safe to apply any time."
      >
        <Row
          label="Apply the tuned baseline"
          hint="Auto model · model maximum output · temp 0.70 · top-p 0.95 · 30 context messages."
        >
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              patchSettings({
                params: { ...DEFAULT_PARAMS },
                autoMaxTokens: "max",
                contextMessages: 30,
                streaming: true,
                sendOnEnter: true,
                defaultModelId: "auto",
                systemPrompt: DEFAULT_SYSTEM_PROMPT,
              });
              toast("Recommended setup applied", "ok");
            }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Apply
          </Button>
        </Row>
        <Switch
          label="Stream replies token by token"
          hint="Off = wait for the full answer, then show it. Streaming feels faster and is cheaper to cancel."
          checked={settings.streaming}
          onChange={(v) => patchSettings({ streaming: v })}
        />
        <Switch
          label="Enter sends the message"
          hint="Off = Ctrl+Enter sends, Enter adds a new line."
          checked={settings.sendOnEnter}
          onChange={(v) => patchSettings({ sendOnEnter: v })}
        />
      </Card>

      <Card title="About">
        <Row label="Sarvam Studio" hint="Multi-model AI chat studio — React + TypeScript, no backend.">
          <span className="chip font-mono">v3.6.0</span>
        </Row>
        <Row label="Models available" hint="Everything in the catalogue, plus any OpenAI-compatible endpoint you add.">
          <span className="chip">{models.length}</span>
        </Row>
        <Row label="Conversations on this device" hint="Stored locally. Nothing is uploaded anywhere.">
          <span className="chip">{conversations.length}</span>
        </Row>
        <Row label="API keys" hint="Encrypted at rest with a device key; never leave this device.">
          <span className="chip">{encryption ? "encrypted" : "device key"}</span>
        </Row>
        <Field label="Repository" wide hint="Source, releases and the Python edition.">
          <a
            href="https://github.com/Sameer336s/sarvam-studio"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[12.5px] text-accent underline decoration-accent/40 underline-offset-2"
          >
            github.com/Sameer336s/sarvam-studio
          </a>
        </Field>
      </Card>
    </div>
  );
}
