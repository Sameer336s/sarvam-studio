import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/types";
import { Button, Card, Textarea } from "@/components/ui";

const PROMPT_PRESETS: { name: string; value: string }[] = [
  { name: "Sameer's assistant (default)", value: DEFAULT_SYSTEM_PROMPT },
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

export function PersonalizationPanel() {
  const { settings, patchSettings } = useApp();

  return (
    <div>
      <Card
        title="Custom instructions"
        subtitle="Sent as the system message on every request. This is who the assistant is and how it works."
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
        <div className="px-4 py-3">
          <Textarea
            value={settings.systemPrompt}
            onChange={(v) => patchSettings({ systemPrompt: v })}
            rows={16}
            placeholder="You are a helpful assistant…"
          />
        </div>
      </Card>

      <Card title="Presets" subtitle="Swap the whole brief in one tap. Editing the text above overrides the preset.">
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
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
    </div>
  );
}
