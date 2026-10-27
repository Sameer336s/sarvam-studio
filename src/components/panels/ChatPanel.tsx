import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_PARAMS, DEFAULT_SYSTEM_PROMPT, type ModelParams } from "@/lib/types";
import { Button, Card, Field, Select, Slider, Switch, Textarea } from "@/components/ui";

const PROMPT_PRESETS: { name: string; value: string }[] = [
  { name: "Balanced assistant", value: DEFAULT_SYSTEM_PROMPT },
  {
    name: "Concise engineer",
    value:
      "You are a senior software engineer. Answer with working code first, then a short explanation. No filler, no apologies. Point out bugs and edge cases. Use the user's language.",
  },
  {
    name: "Bharat multilingual",
    value:
      "You are a helpful assistant fluent in Indian languages. Always reply in the language and script the user writes in (Devanagari, Tamil, Bengali, Telugu, etc.). Keep technical terms in English when that is clearer, and explain them briefly in the user's language.",
  },
  {
    name: "Teacher / explainer",
    value:
      "You are a patient teacher. Explain step by step with small examples, then summarise in three bullet points. Ask one clarifying question if the request is ambiguous.",
  },
  {
    name: "Tool-first agent",
    value:
      "You are an agent with MCP tools. Prefer calling a tool over guessing, and say which tool you used. If a tool fails, report the error plainly instead of inventing an answer.",
  },
];

export function ChatPanel() {
  const { settings, patchSettings, visibleModels } = useApp();

  const patchParams = (patch: Partial<ModelParams>) =>
    patchSettings({ params: { ...settings.params, ...patch } });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        className="lg:col-span-2"
        title="System prompt"
        subtitle="Sent as the system message on every request. Leave empty to send none."
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patchSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        }
      >
        <Textarea
          value={settings.systemPrompt}
          onChange={(v) => patchSettings({ systemPrompt: v })}
          rows={6}
          placeholder="You are a helpful assistant…"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROMPT_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => patchSettings({ systemPrompt: p.value })}
              className="chip hover:border-accent/40 hover:text-ink"
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

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
        <Slider
          label="Max output tokens"
          value={settings.params.maxTokens}
          min={256}
          max={32768}
          step={256}
          onChange={(v) => patchParams({ maxTokens: v })}
        />
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
