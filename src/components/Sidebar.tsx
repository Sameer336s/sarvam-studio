import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn, dayBucket, timeAgo } from "@/lib/cn";
import { IconButton } from "@/components/ui";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  open,
  onToggle,
  onOpenSettings,
  onOpenMcp,
}: {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  onOpenMcp: () => void;
}) {
  const store = useApp();
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return store.conversations.filter((c) => {
      if (!!c.archived !== showArchived) return false;
      if (!term) return true;
      return (
        c.title.toLowerCase().includes(term) ||
        c.messages.some((m) => m.content.toLowerCase().includes(term))
      );
    });
  }, [store.conversations, q, showArchived]);

  const groups = useMemo(() => {
    const pinned = filtered.filter((c) => c.pinned);
    const rest = filtered.filter((c) => !c.pinned);
    const map = new Map<string, Conversation[]>();
    for (const c of rest) {
      const bucket = dayBucket(c.updatedAt || c.createdAt);
      map.set(bucket, [...(map.get(bucket) ?? []), c]);
    }
    const out: { label: string; items: Conversation[] }[] = [];
    if (pinned.length) out.push({ label: "Pinned", items: pinned });
    for (const [label, items] of map) {
      out.push({ label, items: items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) });
    }
    return out;
  }, [filtered]);

  const commitRename = () => {
    if (renaming && renaming.value.trim()) store.renameChat(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onToggle}
        />
      )}
      <aside
        className={cn(
          "z-30 flex h-full shrink-0 flex-col border-r border-white/8 transition-all duration-300 ease-soft",
          "bg-[rgb(var(--panel)/0.05)] backdrop-blur-2xl",
          open ? "w-[272px]" : "w-0 overflow-hidden md:w-[68px]",
          "fixed md:relative inset-y-0 left-0",
        )}
      >
        {/* brand */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))",
              boxShadow: "0 10px 26px -12px rgb(var(--accent))",
            }}
          >
            <Sparkles className="h-4.5 w-4.5 text-white" style={{ height: 18, width: 18 }} />
          </div>
          {open && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-ink">Sarvam Studio</p>
              <p className="truncate text-[10.5px] text-muted">Multi-model · MCP · Glass UI</p>
            </div>
          )}
          <IconButton title={open ? "Collapse sidebar" : "Expand sidebar"} onClick={onToggle}>
            {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </IconButton>
        </div>

        {/* new chat */}
        <div className="px-2.5 pb-2">
          <button
            onClick={() => {
              store.newChat();
              if (window.innerWidth < 768) onToggle();
            }}
            className={cn(
              "btn btn-accent w-full gap-2 rounded-xl",
              open ? "h-10 justify-start px-3" : "h-10 justify-center px-0",
            )}
          >
            <Plus className="h-4 w-4" />
            {open && <span className="text-[13px] font-medium">New chat</span>}
          </button>
        </div>

        {open && (
          <div className="px-2.5 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats…"
                className="field h-9 pl-8 text-[12.5px]"
              />
              {q && (
                <button
                  className="absolute right-2 top-2.5 text-muted hover:text-ink"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* list */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!open && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              {filtered.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => store.setActive(c.id)}
                  title={c.title}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-semibold transition",
                    store.activeId === c.id ? "bg-white/12 text-ink" : "text-muted hover:bg-white/8",
                  )}
                >
                  {c.title.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {open &&
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="section-title px-2.5 pb-1 pt-2">{g.label}</p>
                {g.items.map((c) => {
                  const isActive = store.activeId === c.id;
                  return (
                    <div key={c.id} className="group relative">
                      {renaming?.id === c.id ? (
                        <div className="flex items-center gap-1 px-1 py-1">
                          <input
                            autoFocus
                            value={renaming.value}
                            onChange={(e) => setRenaming({ id: c.id, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            className="field h-8 text-[12.5px]"
                          />
                          <IconButton title="Save" onClick={commitRename}>
                            <Check className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            store.setActive(c.id);
                            if (window.innerWidth < 768) onToggle();
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors",
                            isActive
                              ? "bg-white/10 text-ink"
                              : "text-muted hover:bg-white/6 hover:text-ink",
                          )}
                        >
                          {c.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" />}
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="shrink-0 rounded-md p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFor(menuFor === c.id ? null : c.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setMenuFor(c.id);
                            }}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      )}

                      {menuFor === c.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                          <div className="popover absolute right-1 top-9 z-20 w-44 rounded-xl p-1 text-[12px]">
                            <MenuItem
                              icon={<Pencil className="h-3.5 w-3.5" />}
                              label="Rename"
                              onClick={() => {
                                setRenaming({ id: c.id, value: c.title });
                                setMenuFor(null);
                              }}
                            />
                            <MenuItem
                              icon={c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              label={c.pinned ? "Unpin" : "Pin to top"}
                              onClick={() => {
                                store.togglePin(c.id);
                                setMenuFor(null);
                              }}
                            />
                            <MenuItem
                              icon={<Archive className="h-3.5 w-3.5" />}
                              label={c.archived ? "Unarchive" : "Archive"}
                              onClick={() => {
                                store.toggleArchive(c.id);
                                setMenuFor(null);
                              }}
                            />
                            <MenuItem
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              label="Delete"
                              danger
                              onClick={() => {
                                store.deleteChat(c.id);
                                setMenuFor(null);
                              }}
                            />
                            <div className="px-2.5 py-1 text-[10px] text-muted">
                              {c.messages.length} messages · {timeAgo(c.updatedAt || c.createdAt)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

          {open && filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-muted">
              {q ? `No chats match “${q}”.` : "No conversations yet — start one above."}
            </p>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-white/8 p-2">
          {open && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11.5px] text-muted hover:bg-white/6 hover:text-ink"
            >
              <Archive className="h-3.5 w-3.5" />
              {showArchived ? "Back to chats" : "Archived"}
              {showArchived && <span className="chip ml-auto px-1.5 py-0 text-[9px]">on</span>}
            </button>
          )}
          <button
            onClick={onOpenMcp}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] text-muted hover:bg-white/6 hover:text-ink",
              !open && "justify-center px-0",
            )}
            title="MCP tools"
          >
            <Plug className="h-4 w-4" />
            {open && <span className="flex-1 text-left">MCP tools</span>}
            {open && store.mcpServers.length > 0 && (
              <span className="chip px-1.5 py-0 text-[9.5px]">{store.mcpServers.length}</span>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] text-muted hover:bg-white/6 hover:text-ink",
              !open && "justify-center px-0",
            )}
            title="Settings"
          >
            <SettingsIcon className="h-4 w-4" />
            {open && <span className="flex-1 text-left">Settings</span>}
          </button>
          {open && (
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2">
              <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-[10.5px] leading-tight text-muted">
                {Object.values(store.keys).filter((k) => k.key).length} key
                {Object.values(store.keys).filter((k) => k.key).length === 1 ? "" : "s"} saved
                {store.encryption ? " · encrypted" : " · this device"}
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/10",
        danger ? "text-red-400 hover:text-red-300" : "text-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
