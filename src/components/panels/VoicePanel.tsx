import { useApp } from "@/lib/store";
import { speak, sttEngine, ttsAvailable } from "@/lib/voice";
import { Button, Card, Field, Select, Slider, Switch } from "@/components/ui";
import { toast } from "@/components/Toast";

export function VoicePanel() {
  const { settings, patchSettings, keys } = useApp();

  return (
    <div>
      <Card
        title="Voice"
        subtitle="Speak your messages, hear the replies. Speech-to-text uses your Sarvam key (Saaras); replies use the phone's own voice."
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
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
        <Field label="Speech-to-text language" hint="Auto detect works well for mixed Hindi/English.">
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
