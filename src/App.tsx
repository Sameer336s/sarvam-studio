import { useEffect, useState } from "react";
import { Download, Menu, Moon, Plug, Settings, Sun } from "lucide-react";
import { AppProvider, useApp } from "@/lib/store";
import { ChatView } from "@/components/ChatView";
import { Sidebar } from "@/components/Sidebar";
import { SettingsOverlay, type SettingsTab } from "@/components/SettingsOverlay";
import { Toaster, toast } from "@/components/Toast";
import { IconButton } from "@/components/ui";
import { PROVIDERS } from "@/lib/catalog";
import { cn } from "@/lib/cn";

function Shell() {
  const store = useApp();
  const { settings, patchSettings, active, activeModel } = store;
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [modelId, setModelId] = useState(settings.defaultModelId);

  // follow the active conversation's model
  useEffect(() => {
    if (active?.modelId) setModelId(active.modelId);
  }, [active?.id, active?.modelId]);

  // keyboard: Ctrl/⌘+K → new chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const changeModel = (id: string) => {
    setModelId(id);
    if (store.activeId) store.setChatModel(store.activeId, id);
    patchSettings({ defaultModelId: id });
  };

  const toggleTheme = () =>
    patchSettings({ theme: settings.theme === "dark" ? "light" : "dark" });

  const openSettings = (t: SettingsTab = "appearance") => {
    setTab(t);
    setSettingsOpen(true);
  };

  const exportChat = () => {
    if (!active) {
      toast("Open a chat first.", "warn");
      return;
    }
    const md =
      `# ${active.title}\n\n_Model: ${activeModel?.name ?? active.modelId} · exported ${new Date().toLocaleString()}_\n\n` +
      active.messages
        .map(
          (m) =>
            `### ${m.role === "user" ? "You" : activeModel?.name ?? "Assistant"}\n\n${m.content}`,
        )
        .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 60) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Chat exported as Markdown.", "ok");
  };

  const keyReady = activeModel
    ? activeModel.provider === "custom"
      ? true
      : !!store.keys[`p:${activeModel.provider}`]?.key
    : false;

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="app-bg" data-style={settings.bgStyle} aria-hidden>
        <div className="blob blob-a" />
        <div className="blob blob-b" />
        <div className="blob blob-c" />
      </div>

      <div className="relative z-10 flex h-full w-full">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onOpenSettings={() => openSettings("providers")}
          onOpenMcp={() => openSettings("mcp")}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 px-2 pb-1 pt-2 sm:px-4 sm:pt-3">
            <IconButton
              title="Toggle sidebar"
              onClick={() => setSidebarOpen((v) => !v)}
              className="md:hidden"
            >
              <Menu className="h-4 w-4" />
            </IconButton>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[13px] font-semibold text-ink">
                {active?.title ?? "New chat"}
              </h1>
              <p className="flex items-center gap-1.5 truncate text-[10.5px] text-muted">
                {activeModel && (
                  <>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: PROVIDERS[activeModel.provider].color }}
                    />
                    {activeModel.name}
                    <span className="opacity-50">·</span>
                    {PROVIDERS[activeModel.provider].name}
                  </>
                )}
                <span
                  className={cn(
                    "ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[9.5px]",
                    keyReady
                      ? "bg-emerald-500/12 text-emerald-300"
                      : "bg-amber-500/12 text-amber-300",
                  )}
                >
                  {keyReady ? "key ready" : "no key"}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-1">
              <IconButton title="Export this chat" onClick={exportChat} className="hidden sm:inline-flex">
                <Download className="h-4 w-4" />
              </IconButton>
              <IconButton
                title="MCP tools"
                onClick={() => openSettings("mcp")}
                active={store.mcpServers.some((s) => s.status === "connected")}
              >
                <Plug className="h-4 w-4" />
              </IconButton>
              <IconButton
                title={settings.theme === "dark" ? "Switch to light" : "Switch to dark"}
                onClick={toggleTheme}
              >
                {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
              <IconButton title="Settings" onClick={() => openSettings("appearance")}>
                <Settings className="h-4 w-4" />
              </IconButton>
            </div>
          </header>

          <ChatView
            modelId={modelId}
            onModelChange={changeModel}
            onOpenSettings={() => openSettings("providers")}
            onOpenMcp={() => openSettings("mcp")}
          />
        </main>
      </div>

      <SettingsOverlay
        open={settingsOpen}
        tab={tab}
        onTab={setTab}
        onClose={() => setSettingsOpen(false)}
      />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
