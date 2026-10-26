import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/types";
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

      <Card title="Sampling" subtitle="Applies to every new message.">
        <Slider
          label="Temperature"
          value={settings.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchSettings({ temperature: v })}
        />
        <Slider
          label="Top-p"
          value={settings.topP}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => patchSettings({ topP: v })}
        />
        <Slider
          label="Max output tokens"
          value={settings.maxTokens}
          min={256}
          max={32768}
          step={256}
          onChange={(v) => patchSettings({ maxTokens: v })}
        />
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Capped per model automatically — if a model's own limit is lower, the lower value is used.
        </p>
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
