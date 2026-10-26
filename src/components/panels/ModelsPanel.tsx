import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Power,
  Cpu,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import {
  CAPABILITIES,
  PROVIDERS,
  PROVIDER_ORDER,
  RETIRED_MODELS,
  type ModelDef,
  type ProviderId,
} from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { Badge, Button, Card, Field, IconButton, Input, Modal, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/Toast";
import { cn, shortNum } from "@/lib/cn";

const emptyModel = (provider: ProviderId): ModelDef => ({
  id: "",
  name: "",
  provider,
  description: "",
  contextWindow: 128000,
  maxTokens: 8192,
  capabilities: ["chat"],
  status: "active",
  endpoint: "",
});

export function ModelsPanel() {
  const store = useApp();
  const [q, setQ] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | ProviderId>("all");
  const [editing, setEditing] = useState<ModelDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ModelDef>(emptyModel("sarvam"));
  const [showRetired, setShowRetired] = useState(false);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return store.models.filter((m) => {
      if (providerFilter !== "all" && m.provider !== providerFilter) return false;
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term) ||
        m.capabilities.some((c) => c.includes(term))
      );
    });
  }, [store.models, q, providerFilter]);

  const saveEdit = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.id.trim()) {
      toast("A model needs both a display name and a model ID.", "warn");
      return;
    }
    store.updateModel(editing.id, editing);
    setEditing(null);
    toast("Model updated.", "ok");
  };

  const create = () => {
    if (!draft.name.trim() || !draft.id.trim()) {
      toast("Fill in the model ID and name.", "warn");
      return;
    }
    if (store.models.some((m) => m.id === draft.id)) {
      toast("That model ID already exists.", "warn");
      return;
    }
    store.addModel(draft);
    setCreating(false);
    setDraft(emptyModel("sarvam"));
    toast(`${draft.name} added.`, "ok");
  };

  return (
    <div className="space-y-4">
      <Card
        title="Model catalogue"
        subtitle={`${store.models.length} models configured · ${store.models.filter((m) => m.enabled !== false).length} enabled. Turn a model off to hide it from the picker.`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => store.restoreModels()}>
              <RotateCcw className="h-3.5 w-3.5" /> Restore defaults
            </Button>
            <Button size="sm" variant="accent" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Add model
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, id, capability…"
              className="field h-9 pl-8 text-[12.5px]"
            />
          </div>
          <Select
            value={providerFilter}
            onChange={setProviderFilter}
            options={[
              { value: "all", label: "All providers" },
              ...PROVIDER_ORDER.map((p) => ({ value: p, label: PROVIDERS[p].name })),
            ]}
            className="sm:w-52"
          />
        </div>

        <div className="space-y-2">
          {list.map((m) => {
            const enabled = m.enabled !== false;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border p-3 transition",
                  enabled ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-white/[0.01] opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${PROVIDERS[m.provider].color}22` }}
                  >
                    <Cpu className="h-3.5 w-3.5" style={{ color: PROVIDERS[m.provider].color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[12.5px] font-semibold text-ink">{m.name}</p>
                      <Badge>{PROVIDERS[m.provider].name}</Badge>
                      {m.status !== "active" && (
                        <Badge tone={m.status === "preview" ? "warn" : "default"}>{m.status}</Badge>
                      )}
                      {m.builtin === false && <Badge tone="accent">custom</Badge>}
                      {m.endpoint && <Badge tone="warn">endpoint override</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted">{m.id}</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{m.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="chip text-[10px]">{shortNum(m.contextWindow)} ctx</span>
                      <span className="chip text-[10px]">{shortNum(m.maxTokens)} out</span>
                      {m.capabilities.slice(0, 5).map((c) => (
                        <span key={c} className="chip chip-accent text-[10px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      title={enabled ? "Enabled — click to hide from the picker" : "Disabled — click to enable"}
                      onClick={() => store.toggleModelEnabled(m.id)}
                      className={enabled ? "text-emerald-400" : "text-muted"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton title="Edit" onClick={() => setEditing({ ...m })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      title="Delete model"
                      className="hover:text-red-400"
                      onClick={() => {
                        store.deleteModel(m.id);
                        toast(`${m.name} removed from the catalogue.`, "ok");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
          {list.length === 0 && (
            <p className="py-6 text-center text-[12px] text-muted">No models match that filter.</p>
          )}
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-amber-400" /> Models removed from this app
          </span>
        }
        subtitle="These IDs no longer work on the provider APIs, so they were deleted from the catalogue."
        actions={
          <Button size="sm" variant="ghost" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide" : "Show"} details
          </Button>
        }
      >
        {showRetired && (
          <div className="space-y-2">
            {RETIRED_MODELS.map((r) => (
              <div key={r.id} className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <p className="text-[12px] font-medium text-ink">{r.name}</p>
                  <span className="chip font-mono text-[10px]">{r.id}</span>
                </div>
                <p className="mt-1 pl-5 text-[11px] leading-relaxed text-amber-200/85">{r.note}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit model" wide>
        {editing && (
          <ModelForm
            value={editing}
            onChange={setEditing}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
            saveLabel="Save changes"
          />
        )}
      </Modal>

      {/* create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Add a model" wide>
        <ModelForm
          value={draft}
          onChange={setDraft}
          onSave={create}
          onCancel={() => setCreating(false)}
          saveLabel="Add model"
          isNew
        />
      </Modal>
    </div>
  );
}

function ModelForm({
  value,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  isNew,
}: {
  value: ModelDef;
  onChange: (m: ModelDef) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  isNew?: boolean;
}) {
  const { customProviders } = useApp();
  const patch = (p: Partial<ModelDef>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Model ID" hint="Exactly what the provider expects in the `model` field.">
          <Input value={value.id} onChange={(v) => patch({ id: v.trim() })} placeholder="sarvam-105b" disabled={!isNew && value.builtin} />
        </Field>
        <Field label="Display name">
          <Input value={value.name} onChange={(v) => patch({ name: v })} placeholder="Sarvam-105B" />
        </Field>
        <Field label="Provider">
          <Select
            value={value.provider}
            onChange={(p) => patch({ provider: p })}
            options={PROVIDER_ORDER.map((p) => ({ value: p, label: PROVIDERS[p].name }))}
          />
        </Field>
        <Field label="Status">
          <Select
            value={value.status}
            onChange={(s) => patch({ status: s })}
            options={[
              { value: "active", label: "Active" },
              { value: "preview", label: "Preview" },
              { value: "legacy", label: "Legacy" },
            ]}
          />
        </Field>
        {value.provider === "custom" && (
          <Field label="Custom provider" className="sm:col-span-2">
            <Select
              value={value.providerRef ?? ""}
              onChange={(id) => patch({ providerRef: id })}
              options={[
                { value: "", label: "— none —" },
                ...customProviders.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Field>
        )}
        <Field label="Context window (tokens)">
          <Input
            value={String(value.contextWindow)}
            onChange={(v) => patch({ contextWindow: Number(v.replace(/\D/g, "")) || 0 })}
          />
        </Field>
        <Field label="Max output tokens">
          <Input
            value={String(value.maxTokens)}
            onChange={(v) => patch({ maxTokens: Number(v.replace(/\D/g, "")) || 0 })}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea value={value.description} onChange={(v) => patch({ description: v })} rows={2} />
      </Field>

      <Field label="Endpoint override (optional)" hint="Useful for Sarvam v2 models or a proxy URL.">
        <Input value={value.endpoint ?? ""} onChange={(v) => patch({ endpoint: v })} placeholder="https://…" />
      </Field>

      <Field label="Capabilities">
        <div className="flex flex-wrap gap-1.5">
          {CAPABILITIES.map((c) => {
            const on = value.capabilities.includes(c);
            return (
              <button
                key={c}
                onClick={() =>
                  patch({
                    capabilities: on
                      ? value.capabilities.filter((x) => x !== c)
                      : [...value.capabilities, c],
                  })
                }
                className={cn(
                  "chip transition",
                  on ? "border-accent/50 bg-accent/15 text-ink" : "hover:text-ink",
                )}
              >
                {on && <Check className="h-2.5 w-2.5" />}
                {c}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="accent" onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
