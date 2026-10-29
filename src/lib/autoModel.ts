import type { ModelDef, ProviderId } from "@/lib/catalog";
import type { CustomProviderDef, KeyInfo } from "@/lib/types";

/** Sentinel model id for "pick the best available model". */
export const AUTO_ID = "auto";

export type AutoNeeds = {
  /** The message carries images. */
  vision?: boolean;
  /** MCP tools are connected and should be usable. */
  tools?: boolean;
  /** Rough token count of the conversation, so long chats avoid small windows. */
  approxTokens?: number;
};

export type AutoPick = {
  model: ModelDef;
  reason: string;
};

const PROVIDER_WEIGHT: Record<ProviderId, number> = {
  sarvam: 12,
  anthropic: 9,
  openai: 9,
  google: 9,
  custom: 7,
};

/** Is there a usable credential for this model's provider? */
export function hasCredentials(
  model: ModelDef,
  keys: Record<string, KeyInfo>,
  customProviders: CustomProviderDef[],
): boolean {
  if (model.provider === "custom") {
    const cp = customProviders.find((c) => c.id === model.providerRef);
    if (!cp?.endpoint) return false;
    // local servers need no key; hosted ones do
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(cp.endpoint);
    return local || !!keys[`c:${model.providerRef}`]?.key;
  }
  return !!keys[`p:${model.provider}`]?.key;
}

/**
 * Picks the model the user would most likely have chosen themselves.
 *
 * Hard filters first (needs vision / needs tools / context fits), then a small score:
 * provider preference, context size, price, latency, and status. Deliberately boring and
 * explainable — the chat header shows what it picked and why.
 */
export function pickAutoModel(
  models: ModelDef[],
  keys: Record<string, KeyInfo>,
  customProviders: CustomProviderDef[],
  needs: AutoNeeds = {},
): AutoPick | null {
  const approx = needs.approxTokens ?? 0;
  const candidates = models.filter((m) => {
    if (m.enabled === false) return false;
    if (!hasCredentials(m, keys, customProviders)) return false;
    if (needs.vision && !m.capabilities.includes("vision")) return false;
    if (needs.tools && !m.capabilities.includes("tools")) return false;
    // leave headroom for the reply
    if (approx > 0 && m.contextWindow < approx * 1.6) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // The first model a provider lists is its flagship; a gentle bonus keeps Auto on the
  // model most people would have picked instead of always jumping to the biggest window.
  const flagship = new Set<string>();
  const seen = new Set<string>();
  for (const m of candidates) {
    if (!seen.has(m.provider)) {
      seen.add(m.provider);
      flagship.add(m.id);
    }
  }

  const scored = candidates.map((m) => {
    let score = 0;
    score += PROVIDER_WEIGHT[m.provider] ?? 5;
    score += Math.min(m.contextWindow / 1_000_000, 1) * 6;
    if (flagship.has(m.id)) score += 8;
    if (m.status === "active") score += 10;
    if (m.status === "legacy") score -= 25;
    if (m.status === "preview") score -= 6;
    if (m.capabilities.includes("low-latency")) score += 6;
    if (m.capabilities.includes("reasoning")) score += 4;
    if (m.pricing) {
      // cheaper output wins ties
      score += (1 - Math.min(m.pricing.output / 50, 1)) * 14;
    } else {
      score += 5;
    }
    if (m.builtin === false) score -= 3; // prefer curated models on a tie
    return { m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].m;

  const why: string[] = [];
  if (needs.vision) why.push("image input");
  if (needs.tools) why.push("tools");
  if (approx > 0) why.push(`${Math.round(best.contextWindow / 1000)}K context`);
  if (best.capabilities.includes("reasoning") && why.length < 3) why.push("reasoning");
  if (why.length === 0) why.push("best available");

  return { model: best, reason: why.join(" · ") };
}
