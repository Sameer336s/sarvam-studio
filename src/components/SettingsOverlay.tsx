import { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  Database,
  KeyRound,
  Palette,
  Plug,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui";
import { AppearancePanel } from "@/components/panels/AppearancePanel";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { GeneralPanel } from "@/components/panels/GeneralPanel";
import { PersonalizationPanel } from "@/components/panels/PersonalizationPanel";
import { VoicePanel } from "@/components/panels/VoicePanel";
import { ModelsPanel } from "@/components/panels/ModelsPanel";
import { ProvidersPanel } from "@/components/panels/ProvidersPanel";
import { McpPanel } from "@/components/panels/McpPanel";
import { DataPanel } from "@/components/panels/DataPanel";

export type SettingsTab =
  | "general"
  | "appearance"
  | "chat"
  | "personalization"
  | "voice"
  | "mcp"
  | "providers"
  | "models"
  | "data";

type TabDef = {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
  hint: string;
  keywords: string;
};

const TABS: TabDef[] = [
  { id: "general", label: "General", icon: Wrench, hint: "Theme, palette, defaults, about",
    keywords: "theme palette dark light system recommended about version repo language" },
  { id: "appearance", label: "Appearance", icon: Palette, hint: "Colours, type, layout",
    keywords: "accent colour color font size radius density width avatars timestamps background" },
  { id: "chat", label: "Chat & models", icon: SlidersHorizontal, hint: "Model, sampling, behaviour",
    keywords: "model default temperature top-p top-k penalty seed stop reasoning json tokens context streaming" },
  { id: "personalization", label: "Personalization", icon: UserRound, hint: "Custom instructions",
    keywords: "system prompt persona custom instructions presets personality" },
  { id: "voice", label: "Voice", icon: Volume2, hint: "Speech in and out",
    keywords: "voice speech talk microphone stt tts language rate read aloud" },
  { id: "mcp", label: "Connectors", icon: Plug, hint: "MCP tool servers",
    keywords: "mcp tools connectors servers deepwiki context7 bridge open source" },
  { id: "providers", label: "Model providers", icon: KeyRound, hint: "API keys and free tiers",
    keywords: "api key sarvam openai anthropic google gemini free open source ollama groq openrouter" },
  { id: "models", label: "Model catalogue", icon: Blocks, hint: "Add, edit, remove models",
    keywords: "models catalogue add edit delete context window capabilities retired" },
  { id: "data", label: "Data controls", icon: Database, hint: "Backup, export, delete",
    keywords: "data export import backup delete reset storage privacy shortcuts" },
];

function Panel({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "general":
      return <GeneralPanel />;
    case "appearance":
      return <AppearancePanel />;
    case "chat":
      return <ChatPanel />;
    case "personalization":
      return <PersonalizationPanel />;
    case "voice":
      return <VoicePanel />;
    case "mcp":
      return <McpPanel />;
    case "providers":
      return <ProvidersPanel />;
    case "models":
      return <ModelsPanel />;
    case "data":
      return <DataPanel />;
  }
}

export function SettingsOverlay({
  open,
  tab,
  onTab,
  onClose,
}: {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const tabs = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return TABS;
    return TABS.filter(
      (t) => t.label.toLowerCase().includes(term) || t.keywords.includes(term) || t.hint.toLowerCase().includes(term),
    );
  }, [q]);

  if (!open && !mounted) return null;

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6",
        !open && "pointer-events-none opacity-0",
      )}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="settings-sheet rise flex h-full w-full max-w-5xl flex-col overflow-hidden border border-white/10 sm:h-[86vh] sm:flex-row sm:rounded-2xl">
        {/* nav — a horizontal strip on phones, a sidebar on desktop */}
        <aside className="shrink-0 border-b border-white/8 p-2 sm:w-[228px] sm:border-b-0 sm:border-r sm:p-3">
          <div className="mb-2 hidden items-center justify-between px-1 sm:flex">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Settings</span>
            <IconButton title="Close settings" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="relative mb-2 hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings"
              className="field h-8 w-full pl-8 text-[12px]"
            />
          </div>

          <nav className="scroll-thin flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible sm:pb-0">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => onTab(t.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors sm:w-full",
                    isActive ? "bg-white/10 text-ink" : "text-muted hover:bg-white/6 hover:text-ink",
                  )}
                  title={t.hint}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-accent")} />
                  <span className="whitespace-nowrap text-[12.5px] font-medium">{t.label}</span>
                </button>
              );
            })}
            {tabs.length === 0 && (
              <p className="px-2 py-3 text-[11.5px] text-muted">No setting matches “{q}”.</p>
            )}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">{active.label}</h2>
              <p className="truncate text-[11.5px] text-muted">{active.hint}</p>
            </div>
            <IconButton title="Close settings" onClick={onClose} className="sm:hidden">
              <X className="h-4 w-4" />
            </IconButton>
          </header>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
            <div className="mx-auto max-w-2xl">
              <Panel tab={tab} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
