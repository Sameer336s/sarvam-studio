import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_PARAMS, type ModelParams } from "@/lib/types";
import { Button, Card, Field, Select, Slider, Switch } from "@/components/ui";
import { MaxTokensField } from "@/components/MaxTokensField";

export function ChatPanel() {
  const { settings, patchSettings, visibleModels } = useApp();

  const patchParams = (patch: Partial<ModelParams>) =>
    patchSettings({ params: { ...settings.params, ...patch } });

  const defaultModel = visibleModels.find((m) => m.id === settings.defaultModelId);

  return (
    <div>
      <Card
        title="Sampling defaults"
        subtitle="Applies to every new chat. Any chat can override these from the composer's parameters button."
        actions={
          <Button size="sm" variant="ghost" onClick={() => patchParams({ ...DEFAULT_PARAMS })}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        }
      >
        <Slider
          label="Temperature"
          value={settings.params.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchParams({ temperature: v })}
        />
        <Slider
          label="Top-p"
          value={settings.params.topP}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => patchParams({ topP: v })}
        />
        <Slider
          label="Top-k (0 = off)"
          value={settings.params.topK ?? 0}
          min={0}
          max={100}
          onChange={(v) => patchParams({ topK: v === 0 ? null : v })}
        />
        <div className="py-1.5">
          <MaxTokensField
            value={settings.params.maxTokens}
            modelMax={defaultModel?.maxTokens ?? 8192}
            modelName={defaultModel?.name}
            onChange={(v) => patchParams({ maxTokens: v })}
          />
        </div>
        <div className="mt-1">
          <label className="label">When set to Auto, send</label>
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {[
              { id: "max", label: "Model maximum", hint: "biggest reply the model allows" },
              { id: "balanced", label: "Balanced (4K)", hint: "cheaper, faster" },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => patchSettings({ autoMaxTokens: o.id as "max" | "balanced" })}
                title={o.hint}
                className={
                  "flex-1 px-3 py-1.5 text-[11.5px] font-medium transition-colors " +
                  (settings.autoMaxTokens === o.id
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-white/8 hover:text-ink")
                }
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            Reasoning models spend output tokens thinking, so the maximum is the safe default — a
            small budget is what cuts a reply off mid-sentence.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field label="Presence penalty">
            <input
              type="number"
              step="0.1"
              min="-2"
              max="2"
              value={settings.params.presencePenalty}
              onChange={(e) => patchParams({ presencePenalty: Number(e.target.value) || 0 })}
              className="field"
            />
          </Field>
          <Field label="Frequency penalty">
            <input
              type="number"
              step="0.1"
              min="-2"
              max="2"
              value={settings.params.frequencyPenalty}
              onChange={(e) => patchParams({ frequencyPenalty: Number(e.target.value) || 0 })}
              className="field"
            />
          </Field>
          <Field label="Seed (blank = random)">
            <input
              type="number"
              value={settings.params.seed ?? ""}
              placeholder="random"
              onChange={(e) =>
                patchParams({ seed: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="field"
            />
          </Field>
          <Field label="Reasoning effort">
            <Select
              value={settings.params.reasoningEffort}
              onChange={(v) => patchParams({ reasoningEffort: v })}
              options={[
                { value: "auto", label: "Auto (provider default)" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Field>
        </div>
        <Field label="Stop sequences (comma separated, max 4)" className="pt-2">
          <input
            value={settings.params.stop.join(", ")}
            onChange={(e) =>
              patchParams({
                stop: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .slice(0, 4),
              })
            }
            placeholder="e.g. </answer>"
            className="field"
          />
        </Field>
        <Switch
          label="JSON mode"
          hint="Ask for valid JSON output where the model supports it."
          checked={settings.params.jsonMode}
          onChange={(v) => patchParams({ jsonMode: v })}
        />
      </Card>

      <Card title="Behaviour" subtitle="Composer and history handling.">
        <Field label="Default model for new chats">
          <Select
            value={settings.defaultModelId}
            onChange={(v) => patchSettings({ defaultModelId: v })}
            options={visibleModels.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>
        <div className="mt-2">
          <Switch
            label="Stream responses"
            hint="Off = wait for the full answer, then show it."
            checked={settings.streaming}
            onChange={(v) => patchSettings({ streaming: v })}
          />
          <Switch
            label="Enter sends the message"
            hint="Off = Enter adds a newline, Ctrl/⌘+Enter sends."
            checked={settings.sendOnEnter}
            onChange={(v) => patchSettings({ sendOnEnter: v })}
          />
          <Switch
            label="Show token usage on replies"
            checked={settings.showUsage}
            onChange={(v) => patchSettings({ showUsage: v })}
          />
          <Switch
            label="Show legacy models"
            hint="Shows models still served by the API but no longer recommended."
            checked={settings.showLegacyModels}
            onChange={(v) => patchSettings({ showLegacyModels: v })}
          />
          <Slider
            label="Context messages sent"
            value={settings.contextMessages}
            min={2}
            max={60}
            onChange={(v) => patchSettings({ contextMessages: v })}
          />
        </div>
      </Card>

    </div>
  );
}
