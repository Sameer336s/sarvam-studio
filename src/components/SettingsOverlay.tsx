import { useEffect, useState } from "react";
import {
  Blocks,
  KeyRound,
  Palette,
  Plug,
  SlidersHorizontal,
  Sparkles,
  X,
  Database,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui";
import { AppearancePanel } from "@/components/panels/AppearancePanel";
import { ChatPanel } from "@/components/panels/ChatPanel";
import { ModelsPanel } from "@/components/panels/ModelsPanel";
import { ProvidersPanel } from "@/components/panels/ProvidersPanel";
import { McpPanel } from "@/components/panels/McpPanel";
import { DataPanel } from "@/components/panels/DataPanel";
import { useApp } from "@/lib/store";

export type SettingsTab = "appearance" | "chat" | "models" | "providers" | "mcp" | "data";

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "appearance", label: "Appearance", icon: Palette, hint: "Theme, glass, colours, layout" },
  { id: "chat", label: "Chat & models", icon: SlidersHorizontal, hint: "Prompt, sampling, behaviour" },
  { id: "models", label: "Model catalogue", icon: Blocks, hint: "Add, edit, remove models" },
  { id: "providers", label: "API keys", icon: KeyRound, hint: "Keys, saved on this device" },
  { id: "mcp", label: "MCP tools", icon: Plug, hint: "Connect tool servers" },
  { id: "data", label: "Data & privacy", icon: Database, hint: "Backup, delete, shortcuts" },
];

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
  const { encryption } = useApp();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open && !mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative mx-auto flex h-full max-w-6xl flex-col p-2 sm:p-5">
        <div className="glass-hi flex min-h-0 flex-1 flex-col overflow-hidden rounded-glass-lg">
          {/* header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}
            >
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[13.5px] font-semibold text-ink">Settings</h2>
              <p className="truncate text-[10.5px] text-muted">
                Everything is stored locally in this browser ·{" "}
                {encryption ? "keys encrypted at rest" : "keys stored on this device"}
              </p>
            </div>
            <IconButton title="Close settings" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* tabs */}
            <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTab(t.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
                      active
                        ? "bg-white/10 text-ink"
                        : "text-muted hover:bg-white/6 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-accent")} />
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap text-[12.5px] font-medium">{t.label}</span>
                      <span className="hidden truncate text-[10px] text-muted md:block">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* body */}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {tab === "appearance" && <AppearancePanel />}
              {tab === "chat" && <ChatPanel />}
              {tab === "models" && <ModelsPanel />}
              {tab === "providers" && <ProvidersPanel />}
              {tab === "mcp" && <McpPanel />}
              {tab === "data" && <DataPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
