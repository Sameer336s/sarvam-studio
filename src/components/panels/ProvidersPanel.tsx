import { useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  X,
  Download,
  Cpu,
} from "lucide-react";
import { FREE_PRESETS, PROVIDERS, PROVIDER_ORDER, type FreePreset, type ProviderId } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { validateKey, fetchLiveModels, ProviderError } from "@/lib/api";
import { Button, Card, Field, IconButton, Input, Switch } from "@/components/ui";
import { toast } from "@/components/Toast";
import { cn, maskKey } from "@/lib/cn";

export function ProvidersPanel() {
  const store = useApp();
  const { settings, patchSettings, encryption } = store;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, string[]>>({});

  const slotOf = (p: ProviderId, cpId?: string) => (p === "custom" && cpId ? `c:${cpId}` : `p:${p}`);

  const save = async (p: ProviderId, cpId?: string) => {
    const slot = slotOf(p, cpId);
    const value = (drafts[slot] ?? store.keys[slot]?.key ?? "").trim();
    if (!value) return;
    setBusy(slot);
    store.setKeyStatus(slot, "checking");
    const cp = cpId ? store.customProviders.find((c) => c.id === cpId) : undefined;
    const res = await validateKey(p, value, cp ? { endpoint: cp.endpoint, modelsEndpoint: cp.modelsEndpoint, authHeader: cp.authHeader, authPrefix: cp.authPrefix } : undefined);
    await store.setKey(slot, value);
    store.setKeyStatus(slot, res.ok ? "valid" : "invalid", res.message);
    setBusy(null);
    setDrafts((d) => ({ ...d, [slot]: "" }));
    toast(res.message, res.ok ? "ok" : "warn");
  };

  const loadLive = async (p: ProviderId, cpId?: string) => {
    const slot = slotOf(p, cpId);
    const key = store.keys[slot]?.key ?? "";
    const cp = cpId ? store.customProviders.find((c) => c.id === cpId) : undefined;
    setBusy(slot);
    try {
      const ids = await fetchLiveModels(
        p,
        key,
        cp ? { endpoint: cp.endpoint, modelsEndpoint: cp.modelsEndpoint, authHeader: cp.authHeader, authPrefix: cp.authPrefix } : undefined,
      );
      setLive((l) => ({ ...l, [slot]: ids }));
      toast(`${ids.length} models found on ${cp?.name ?? PROVIDERS[p].name}.`, "ok");
    } catch (e) {
      toast(e instanceof ProviderError ? e.message : (e as Error).message, "warn");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <FreeProviders />

      <Card
        title="Key storage"
        subtitle={
          encryption
            ? "Keys are encrypted with a device-bound AES-GCM key held in IndexedDB and saved to this browser, so a restart does not log you out."
            : "This browser cannot encrypt (no WebCrypto/IndexedDB). Keys are saved in obfuscated form instead."
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "chip gap-1.5",
              encryption ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300",
            )}
          >
            {encryption ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {encryption ? "Encrypted at rest" : "Obfuscated only"}
          </span>
          <span className="chip gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            {Object.values(store.keys).filter((k) => k.key).length} saved
          </span>
        </div>
        <div className="mt-1">
          <Switch
            label="Remember keys after closing the app"
            hint="On by default. Turn off to keep keys in memory only — you will re-enter them each session."
            checked={settings.rememberKeys}
            onChange={(v) => patchSettings({ rememberKeys: v })}
          />
        </div>
        <p className="note-warn mt-1">
          Any key kept in a browser is only as safe as the browser. It is protected against someone
          reading localStorage, but not against malicious extensions or someone using your unlocked
          device. For shared machines, turn remembering off.
        </p>
      </Card>

      {PROVIDER_ORDER.filter((p) => p !== "custom").map((p) => {
        const def = PROVIDERS[p];
        const slot = slotOf(p);
        const info = store.keys[slot];
        const has = !!info?.key;
        const draftValue = drafts[slot] ?? "";
        return (
          <Card
            key={p}
            title={
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
                {def.name}
                {info?.status === "valid" && (
                  <span className="chip border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0 text-[9.5px] text-emerald-300">
                    connected
                  </span>
                )}
                {info?.status === "invalid" && (
                  <span className="chip border-red-400/30 bg-red-500/10 px-1.5 py-0 text-[9.5px] text-red-300">
                    invalid
                  </span>
                )}
              </span>
            }
            subtitle={def.notes}
            actions={
              <a
                href={def.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost h-8 gap-1 px-2.5 text-[11.5px]"
              >
                Get key <ExternalLink className="h-3 w-3" />
              </a>
            }
          >
            {has && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span className="font-mono text-[11.5px] text-muted">{maskKey(info.key)}</span>
                <div className="flex items-center gap-1">
                  <IconButton
                    title={reveal[slot] ? "Hide" : "Reveal"}
                    onClick={() => setReveal((r) => ({ ...r, [slot]: !r[slot] }))}
                  >
                    {reveal[slot] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </IconButton>
                  <IconButton
                    title="Remove key"
                    onClick={() => {
                      void store.clearKey(slot);
                      toast(`${def.name} key removed`, "ok");
                    }}
                    className="hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            )}
            {has && reveal[slot] && (
              <pre className="mb-2 overflow-x-auto rounded-lg bg-black/30 p-2 font-mono text-[11px] text-ink/80">
                {info.key}
              </pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={draftValue}
                onChange={(v) => setDrafts((d) => ({ ...d, [slot]: v }))}
                placeholder={has ? "Replace key…" : def.keyHint}
                onKeyDown={(e) => e.key === "Enter" && void save(p)}
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="accent"
                  disabled={busy === slot || !draftValue.trim()}
                  onClick={() => void save(p)}
                  className="shrink-0"
                >
                  {busy === slot ? <Loader2 className="h-3.5 w-3.5 spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save & test
                </Button>
                <Button
                  variant="ghost"
                  className="shrink-0 px-3"
                  disabled={busy === slot || !has}
                  onClick={() => void loadLive(p)}
                  title="List the models this key can use"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {info?.message && (
              <p
                className={cn(
                  "mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed",
                  info.status === "valid" ? "text-emerald-300" : "text-amber-300",
                )}
              >
                {info.status === "valid" ? <Check className="mt-0.5 h-3 w-3" /> : <X className="mt-0.5 h-3 w-3" />}
                {info.message}
              </p>
            )}

            {live[slot] && live[slot].length > 0 && (
              <div className="mt-2">
                <p className="label">Live models on this key</p>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto scroll-thin">
                  {live[slot].map((id) => {
                    const exists = store.models.some((m) => m.id === id);
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          if (exists) return;
                          store.addModel({
                            id,
                            name: id,
                            provider: p,
                            description: `Added from the live ${def.name} model list.`,
                            contextWindow: 128000,
                            maxTokens: 8192,
                            capabilities: ["chat"],
                            status: "active",
                          });
                          toast(`${id} added to your models`, "ok");
                        }}
                        className={cn(
                          "chip font-mono text-[10.5px]",
                          exists ? "opacity-50" : "hover:border-accent/40 hover:text-ink",
                        )}
                        title={exists ? "Already in your model list" : "Click to add"}
                      >
                        {id}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <CustomProviders />
    </div>
  );
}

function CustomProviders() {
  const store = useApp();
  const [draft, setDraft] = useState({
    name: "",
    endpoint: "",
    modelsEndpoint: "",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    models: "",
  });

  const add = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      toast("A name and an endpoint are required.", "warn");
      return;
    }
    const id = crypto.randomUUID();
    store.addCustomProvider({
      id,
      name: draft.name.trim(),
      endpoint: draft.endpoint.trim(),
      modelsEndpoint: draft.modelsEndpoint.trim() || undefined,
      authHeader: draft.authHeader.trim() || "Authorization",
      authPrefix: draft.authPrefix,
    });
    const models = draft.models
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    for (const mid of models) {
      store.addModel({
        id: mid,
        name: mid,
        provider: "custom",
        providerRef: id,
        description: `Custom model on ${draft.name.trim()}`,
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: ["chat"],
        status: "active",
      });
    }
    setDraft({
      name: "",
      endpoint: "",
      modelsEndpoint: "",
      authHeader: "Authorization",
      authPrefix: "Bearer ",
      models: "",
    });
    toast(`Added ${draft.name.trim()}${models.length ? ` with ${models.length} model(s)` : ""}.`, "ok");
  };

  return (
    <Card
      title="Custom / self-hosted providers"
      subtitle="Anything OpenAI-compatible: Ollama, LM Studio, vLLM, OpenRouter, Groq, Together, a corporate gateway…"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name">
          <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="Ollama (local)" />
        </Field>
        <Field label="Chat endpoint">
          <Input
            value={draft.endpoint}
            onChange={(v) => setDraft((d) => ({ ...d, endpoint: v }))}
            placeholder="http://localhost:11434/v1/chat/completions"
          />
        </Field>
        <Field label="Models endpoint (optional)" hint="Used by “test key” and the live model list.">
          <Input
            value={draft.modelsEndpoint}
            onChange={(v) => setDraft((d) => ({ ...d, modelsEndpoint: v }))}
            placeholder="http://localhost:11434/v1/models"
          />
        </Field>
        <Field label="Model IDs" hint="Comma separated. You can add more later in the Models tab.">
          <Input
            value={draft.models}
            onChange={(v) => setDraft((d) => ({ ...d, models: v }))}
            placeholder="llama3.1, qwen3:8b"
          />
        </Field>
        <Field label="Auth header">
          <Input
            value={draft.authHeader}
            onChange={(v) => setDraft((d) => ({ ...d, authHeader: v }))}
            placeholder="Authorization"
          />
        </Field>
        <Field label="Auth prefix">
          <Input
            value={draft.authPrefix}
            onChange={(v) => setDraft((d) => ({ ...d, authPrefix: v }))}
            placeholder="Bearer "
          />
        </Field>
      </div>
      <Button variant="accent" onClick={add} className="mt-3">
        <Plus className="h-4 w-4" /> Add provider
      </Button>

      {store.customProviders.length > 0 && (
        <div className="mt-4 space-y-2">
          {store.customProviders.map((cp) => {
            const slot = `c:${cp.id}`;
            const info = store.keys[slot];
            return (
              <div key={cp.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{cp.name}</p>
                    <p className="truncate font-mono text-[10.5px] text-muted">{cp.endpoint}</p>
                  </div>
                  <IconButton
                    title="Delete provider"
                    className="hover:text-red-400"
                    onClick={() => store.removeCustomProvider(cp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {store.models
                    .filter((m) => m.providerRef === cp.id)
                    .map((m) => (
                      <span key={m.id} className="chip font-mono text-[10px]">
                        {m.id}
                      </span>
                    ))}
                </div>
                <CustomKeyRow
                  slot={slot}
                  name={cp.name}
                  hasKey={!!info?.key}
                  masked={info?.key ? maskKey(info.key) : ""}
                  onSave={async (value) => {
                    store.setKeyStatus(slot, "checking");
                    const res = await validateKey("custom", value, {
                      endpoint: cp.endpoint,
                      modelsEndpoint: cp.modelsEndpoint,
                      authHeader: cp.authHeader,
                      authPrefix: cp.authPrefix,
                    });
                    await store.setKey(slot, value);
                    store.setKeyStatus(slot, res.ok ? "valid" : "invalid", res.message);
                    toast(res.message, res.ok ? "ok" : "warn");
                  }}
                  onClear={() => {
                    void store.clearKey(slot);
                    toast(`${cp.name} key cleared`, "ok");
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CustomKeyRow({
  hasKey,
  masked,
  onSave,
  onClear,
}: {
  slot: string;
  name: string;
  hasKey: boolean;
  masked: string;
  onSave: (value: string) => Promise<void>;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <Input
        type="password"
        value={value}
        onChange={setValue}
        placeholder={hasKey ? `Saved: ${masked}` : "API key (optional for local models)"}
      />
      <Button
        variant="accent"
        size="sm"
        disabled={busy || !value.trim()}
        onClick={async () => {
          setBusy(true);
          await onSave(value.trim());
          setValue("");
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 spin" /> : <Check className="h-3.5 w-3.5" />}
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={!hasKey}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}


/* --------------------------------------------------- free / open source */

function FreeProviders() {
  const store = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const add = (p: FreePreset) => {
    setBusy(p.id);
    const existing = store.customProviders.find((c) => c.presetId === p.id);
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      store.addCustomProvider({
        id,
        name: p.name,
        endpoint: p.endpoint,
        modelsEndpoint: p.modelsEndpoint,
        authHeader: p.authHeader,
        authPrefix: p.authPrefix,
        presetId: p.id,
      });
    }
    let added = 0;
    for (const m of p.models) {
      if (store.models.some((x) => x.id === m.id && x.providerRef === id)) continue;
      store.addModel({
        id: m.id,
        name: m.label,
        provider: "custom",
        providerRef: id,
        description: `${p.name}${p.local ? " — runs on your machine" : ""}`,
        contextWindow: m.contextWindow ?? 131072,
        maxTokens: m.maxTokens ?? 8192,
        capabilities: m.vision ? ["chat", "vision", "tools"] : ["chat", "tools"],
        status: "active",
      });
      added++;
    }
    setBusy(null);
    toast(
      existing
        ? `${p.name} already added${added ? `, +${added} models` : ""}`
        : `${p.name} added${added ? ` with ${added} model${added === 1 ? "" : "s"}` : ""}${
            p.needsKey ? " — add its key below" : ""
          }`,
      "ok",
    );
  };

  return (
    <Card
      title="Free & open source"
      subtitle="One click adds the endpoint and its models. Local servers need no key at all."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {FREE_PRESETS.map((p) => {
          const added = store.customProviders.some((c) => c.presetId === p.id);
          return (
            <div
              key={p.id}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-2.5",
                added ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                    <Cpu className="h-3.5 w-3.5 text-muted" />
                    {p.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] leading-tight text-muted/80">
                    {p.endpoint.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={added ? "ghost" : "accent"}
                  disabled={busy === p.id}
                  onClick={() => add(p)}
                  className="shrink-0"
                >
                  {busy === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 spin" />
                  ) : added ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {added ? "Added" : "Add"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <span
                  className={cn(
                    "chip px-1.5 py-0 text-[9.5px]",
                    p.local
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                      : "border-sky-400/30 bg-sky-500/10 text-sky-300",
                  )}
                >
                  {p.local ? "local · no key" : "free key"}
                </span>
                {p.models.length > 0 && (
                  <span className="chip px-1.5 py-0 text-[9.5px]">{p.models.length} models</span>
                )}
              </div>
              <p className="text-[10.5px] leading-relaxed text-muted">{p.note}</p>
              {p.keysUrl && (
                <a
                  href={p.keysUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline"
                >
                  Get a free key <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        After adding, press ↻ on the provider card below to import the live model list for your key —
        hosted gateways rotate model IDs often.
      </p>
    </Card>
  );
}
