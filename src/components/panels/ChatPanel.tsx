import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DEFAULT_PARAMS, DEFAULT_SYSTEM_PROMPT, type ModelParams } from "@/lib/types";
import { Button, Card, Field, Select, Slider, Switch, Textarea } from "@/components/ui";
import { MaxTokensField } from "@/components/MaxTokensField";
import { speak, sttEngine, ttsAvailable } from "@/lib/voice";
import { toast } from "@/components/Toast";

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

export function ChatPanel() {
  const { settings, patchSettings, visibleModels, keys } = useApp();

  const patchParams = (patch: Partial<ModelParams>) =>
    patchSettings({ params: { ...settings.params, ...patch } });

  const defaultModel = visibleModels.find((m) => m.id === settings.defaultModelId);

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

      <Card
        title="Talk mode"
        subtitle="Speak your messages, hear the replies. Speech-to-text uses your Sarvam key (Saaras); replies use the phone's own voice."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip gap-1">
            {sttEngine(!!keys["p:sarvam"]?.key) === "sarvam"
              ? "Sarvam Saaras ready"
              : sttEngine(false) === "browser"
                ? "Browser speech engine"
                : "No speech input"}
          </span>
          <span className="chip gap-1">{ttsAvailable() ? "Voice output ready" : "No voice output"}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!ttsAvailable()}
            onClick={() => {
              const ok = speak("Namaste, main aapki madad ke liye taiyaar hoon.", {
                rate: settings.voiceRate,
                lang: "hi-IN",
              });
              if (!ok) toast("This device has no speech engine", "warn");
            }}
          >
            Test voice
          </Button>
        </div>

        <Switch
          label="Read replies aloud"
          hint="Speaks each finished answer with the phone's voice, in the language it was written in."
          checked={settings.speakReplies}
          onChange={(v) => patchSettings({ speakReplies: v })}
        />
        <Switch
          label="Send as soon as I stop talking"
          hint="Off = the transcript lands in the composer so you can edit it first."
          checked={settings.talkAutoSend}
          onChange={(v) => patchSettings({ talkAutoSend: v })}
        />
        <Slider
          label="Speaking rate"
          value={settings.voiceRate}
          min={0.6}
          max={1.8}
          step={0.05}
          onChange={(v) => patchSettings({ voiceRate: v })}
          suffix="x"
        />
        <Field label="Speech-to-text language" hint="“Auto detect” works well for mixed Hindi/English.">
          <Select
            value={settings.sttLanguage}
            onChange={(v) => patchSettings({ sttLanguage: v })}
            options={[
              { value: "unknown", label: "Auto detect" },
              { value: "hi-IN", label: "Hindi" },
              { value: "en-IN", label: "English (India)" },
              { value: "bn-IN", label: "Bengali" },
              { value: "mr-IN", label: "Marathi" },
              { value: "ta-IN", label: "Tamil" },
              { value: "te-IN", label: "Telugu" },
              { value: "gu-IN", label: "Gujarati" },
              { value: "kn-IN", label: "Kannada" },
              { value: "ml-IN", label: "Malayalam" },
              { value: "pa-IN", label: "Punjabi" },
              { value: "od-IN", label: "Odia" },
              { value: "as-IN", label: "Assamese" },
              { value: "ur-IN", label: "Urdu" },
            ]}
          />
        </Field>
      </Card>
    </div>
  );
}
