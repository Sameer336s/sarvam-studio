import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useApp } from "@/lib/store";
import { ACCENT_PRESETS } from "@/lib/types";
import { Card, Field, Select, Slider, Switch } from "@/components/ui";
import { cn } from "@/lib/cn";

const BGS = [
  { id: "aurora", label: "Aurora" },
  { id: "mesh", label: "Mesh" },
  { id: "grid", label: "Grid" },
  { id: "plain", label: "Plain" },
] as const;

export function AppearancePanel() {
  const { settings, patchSettings } = useApp();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Theme" subtitle="Applies instantly across the whole app.">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "dark", label: "Dark", icon: Moon },
            { id: "light", label: "Light", icon: Sun },
            { id: "system", label: "System", icon: Monitor },
          ].map((t) => {
            const Icon = t.icon;
            const active = settings.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => patchSettings({ theme: t.id as typeof settings.theme })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[12px] transition",
                  active
                    ? "border-accent/50 bg-accent/10 text-ink"
                    : "border-white/10 text-muted hover:bg-white/6 hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <label className="label">Background</label>
          <div className="grid grid-cols-4 gap-2">
            {BGS.map((b) => (
              <button
                key={b.id}
                onClick={() => patchSettings({ bgStyle: b.id })}
                className={cn(
                  "rounded-xl border px-2 py-2 text-[11.5px] transition",
                  settings.bgStyle === b.id
                    ? "border-accent/50 bg-accent/10 text-ink"
                    : "border-white/10 text-muted hover:bg-white/6",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Accent colour" subtitle="Drives buttons, highlights, gradients and glows.">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {ACCENT_PRESETS.map((p) => {
            const active = settings.accent.toLowerCase() === p.accent.toLowerCase();
            return (
              <button
                key={p.name}
                title={p.name}
                onClick={() => patchSettings({ accent: p.accent, accent2: p.accent2 })}
                className={cn(
                  "relative flex h-11 items-center justify-center rounded-xl border transition",
                  active ? "border-white/60" : "border-white/10 hover:border-white/30",
                )}
                style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }}
              >
                {active && <Check className="h-4 w-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Custom accent">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accent}
                onChange={(e) => patchSettings({ accent: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border border-white/15 bg-transparent"
              />
              <input
                value={settings.accent}
                onChange={(e) => patchSettings({ accent: e.target.value })}
                className="field h-9 font-mono text-[12px]"
              />
            </div>
          </Field>
          <Field label="Custom secondary">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accent2}
                onChange={(e) => patchSettings({ accent2: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border border-white/15 bg-transparent"
              />
              <input
                value={settings.accent2}
                onChange={(e) => patchSettings({ accent2: e.target.value })}
                className="field h-9 font-mono text-[12px]"
              />
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Glass & shape" subtitle="Frosted-glass intensity, corner radius and blur.">
        <Slider
          label="Blur"
          value={settings.glassBlur}
          min={0}
          max={48}
          onChange={(v) => patchSettings({ glassBlur: v })}
          suffix="px"
        />
        <Slider
          label="Surface opacity"
          value={Math.round(settings.glassAlpha * 100)}
          min={0}
          max={30}
          onChange={(v) => patchSettings({ glassAlpha: v / 100 })}
          suffix="%"
        />
        <Slider
          label="Border light"
          value={Math.round(settings.glassBorder * 100)}
          min={0}
          max={60}
          onChange={(v) => patchSettings({ glassBorder: v / 100 })}
          suffix="%"
        />
        <Slider
          label="Corner radius"
          value={settings.radius}
          min={4}
          max={32}
          onChange={(v) => patchSettings({ radius: v })}
          suffix="px"
        />
        <Switch
          label="Animations"
          hint="Background drift, message rise-in, hover lifts."
          checked={settings.animations}
          onChange={(v) => patchSettings({ animations: v })}
        />
      </Card>

      <Card title="Typography & chat layout" subtitle="Comfort settings for long sessions.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Typeface">
            <Select
              value={settings.fontFamily}
              onChange={(v) => patchSettings({ fontFamily: v })}
              options={[
                { value: "sans", label: "Sans (Inter-like)" },
                { value: "serif", label: "Serif" },
                { value: "mono", label: "Monospace" },
              ]}
            />
          </Field>
          <Field label="Message style">
            <Select
              value={settings.bubbleStyle}
              onChange={(v) => patchSettings({ bubbleStyle: v })}
              options={[
                { value: "bubbles", label: "Bubbles (ChatGPT-like)" },
                { value: "flat", label: "Flat / document" },
              ]}
            />
          </Field>
        </div>
        <Slider
          label="Font size"
          value={Math.round(settings.fontScale * 100)}
          min={85}
          max={125}
          step={5}
          onChange={(v) => patchSettings({ fontScale: v / 100 })}
          suffix="%"
        />
        <Slider
          label="Conversation width"
          value={settings.chatWidth}
          min={36}
          max={80}
          onChange={(v) => patchSettings({ chatWidth: v })}
          suffix="rem"
        />
        <div className="mt-2">
          <label className="label">Density</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "comfortable", label: "Comfortable" },
              { id: "compact", label: "Compact" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => patchSettings({ density: d.id as typeof settings.density })}
                className={cn(
                  "rounded-xl border px-2 py-2 text-[11.5px] transition",
                  settings.density === d.id
                    ? "border-accent/50 bg-accent/10 text-ink"
                    : "border-white/10 text-muted hover:bg-white/6",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <Switch
          label="Show timestamps"
          checked={settings.showTimestamps}
          onChange={(v) => patchSettings({ showTimestamps: v })}
        />
        <Switch
          label="Show avatars"
          checked={settings.showAvatars}
          onChange={(v) => patchSettings({ showAvatars: v })}
        />
      </Card>
    </div>
  );
}
