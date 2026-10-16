/**
 * MERIDIAN — the single authoritative universal router.
 *
 * Every AI request in Lemniscate routes through this module. Meridian owns
 * the ROUTING DECISIONS and the EXECUTION LIFECYCLE; nothing else does:
 *
 *   - providers.ts owns provider-specific communication (wire formats,
 *     auth headers, SSE parsing, typed ProviderError classification).
 *   - ./loa (Anchor) owns deterministic offline execution.
 *   - ai.ts owns companion behavior: context assembly, prompts, schemas,
 *     sampling profiles and offline content. It CALLS Meridian for every
 *     online execution; it never talks to a provider itself.
 *
 * Meridian's responsibilities, and nothing else's:
 *
 *   1. AWARENESS — which providers have keys this session, each provider's
 *      health (circuit state + per-model EWMA from ./modelHealth), and the
 *      discovered model catalogs (stale-while-revalidate, persisted).
 *   2. ORDER — per-companion provider pins (prefs.aiProviderByBot), the
 *      global active provider, and optional cross-provider failover.
 *   3. CHAINS — per (bot, provider) fallback chains: the configured head
 *      (router presets resolved live), then defaults, health-reordered.
 *   4. PACING — the 15/min sliding-window rate limiter (queueing, shared
 *      across tabs) and the daily quota against the usage ledger.
 *   5. EXECUTION — route() and routeStream(): bounded retries with jittered
 *      backoff, provider cooldowns on hard failures, partial-stream
 *      protection, in-flight deduplication of identical concurrent calls.
 *   6. NORMALISATION — every outcome is {text, tokens, provider, model};
 *      every failure is a typed MeridianError with a user-safe message.
 *
 * Routing invariants, enforced here and nowhere else:
 *   - no circular routing (a request visits each provider at most once)
 *   - no infinite retries (≤2 attempts per model, ≤12 candidates, bounded
 *     backoff ≤1.6s per retry)
 *   - no repeated calls to providers that just failed hard (circuit opens
 *     for 30s–5min by failure class)
 *   - the free-tier guarantee: on OpenRouter every candidate ends with
 *     `:free` (ensureFree is the single chokepoint); direct providers use
 *     only curated free-tier ids in their fallback positions.
 */

import type { AiModelInfo, BotId, UsageRow } from "./types";
import {
  PROVIDERS,
  PROVIDER_IDS,
  activeProviderId,
  hasKey,
  streamChat as providerStreamOnce,
  fetchModels as fetchProviderModels,
  ProviderError,
  type ProviderId,
  type ProviderFailKind,
  type ChatMessage,
  type StreamTimeouts,
} from "./providers";
import { getPrefs } from "./store";
import { logUsage } from "./data";
import { getUserId, idbAll } from "./db";
import {
  healthBoost,
  observeModel,
  warmModelHealth,
} from "./modelHealth";
import { cacheGet, cacheGetWithMeta, cacheSet, MODELS_KEY, HOUR } from "./cache";

/* ════════════════════════════════════════════════════════════════
   Model families & ranking (pure — the scoring Meridian routes on).
   ════════════════════════════════════════════════════════════════ */

/** Default models — used when no key-level catalog is available and no
 *  router preset is configured. All valid, currently-available OpenRouter
 *  model IDs with `:free` variants so a user on the free tier never hits
 *  a 404 or an unexpected bill. Verified against the live catalog on
 *  2026-10-14: lightning for conversation speed, dense Gemma 4 for
 *  structured study, the 550B Ultra for long-form creative work. */
export const DEFAULT_MODELS: Record<BotId, string> = {
  luma: "nvidia/nemotron-3.5-lightning:free",
  ouro: "google/gemma-4-31b-it:free",
  ankaa: "nvidia/nemotron-3-ultra-550b-a55b:free",
};

/** Fallback chain — ALL entries are `:free` variants so a user who added a
 *  key expecting free-tier usage is NEVER silently upgraded to a paid model.
 *  Every id is live in today's :free catalog (verified 2026-10-14). */
export const FALLBACKS = [
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
  "thinkingmachines/inkling:free",
];

/** Guard: ensure a model ID is a free-tier variant. If the ID lacks the
 *  `:free` suffix, return the free variant of the same model. If the model
 *  has no known free variant, return the bot's default (which is always
 *  free). This is the SINGLE chokepoint that guarantees no paid model ever
 *  reaches the user's API key. OpenRouter-only — direct providers have no
 *  `:free` convention. */
function ensureFree(model: string, bot: BotId): string {
  if (model.endsWith(":free")) return model;
  if (!model.includes(":") || model.endsWith(":latest")) {
    const freeVariant = model.includes(":")
      ? model.replace(/:.*$/, ":free")
      : `${model}:free`;
    return freeVariant;
  }
  return DEFAULT_MODELS[bot];
}

/* Fast, inexpensive models — prioritized for Luma (conversation) where low
 *  latency matters more than deep reasoning. Current-generation families
 *  first (2026-10); long-served legacy ids kept at the tail for the direct
 *  providers that still serve them (Groq's llama line). */
const FAST_FAMILIES = [
  "nemotron-3.5-lightning",
  "gemma-4-26b",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "qwen-3.8-27b",
  "grok-4.20",
  "mistral-small",
  "gpt-oss-20b",
  "llama-3.3-70b",
  "llama-3.1-8b",
];

/* Large / high-parameter models — prioritized for Ouro (structured study)
 *  where reasoning quality matters. */
const BIG_FAMILIES = [
  "nemotron-3-ultra",
  "nemotron-3-super",
  "gemma-4-31b",
  "mistral-medium-3",
  "magistral-medium",
  "grok-4.7",
  "grok-4.20",
  "devstral",
  "gemini-3.5-pro",
  "llama-3.3-70b",
  "qwen-3.8-27b",
];

/* Models known to excel at creative writing and long-form fiction.
 *  Inkling leads — it is the free tier's dedicated writing family. */
const CREATIVE_FAMILIES = [
  "inkling",
  "nemotron-3-ultra",
  "grok-4.7",
  "gemma-4-31b",
  "grok-4.20",
  "magistral-medium",
  "mistral-medium-3",
  "nemotron-3-super",
  "llama-3.3-70b",
  "gemma-4-26b",
];

/** Pure ranking. Universal scoring across the whole free catalog: parsed
 *  parameter size (intelligence), provider tier, context window (creativity
 *  headroom) and family fit for the bot's task profile. Meridian uses this
 *  to auto-pick the best free model per bot. */
export function rankFreeModels(
  models: AiModelInfo[],
  bot: BotId,
): AiModelInfo[] {
  const free = models.filter((m) => m.free || m.id.endsWith(":free"));
  const paramsB = (id: string): number => {
    const m = id.match(/(\d+(?:\.\d+)?)\s?b\b/i);
    return m ? parseFloat(m[1] ?? "0") : 0;
  };
  const providerTier = (id: string): number => {
    if (/^(nvidia|google|thinkingmachines|openai|anthropic)\//.test(id)) return 8;
    if (
      /^(mistralai|meta-llama|cohere|deepseek|moonshotai|poolside|liquid)\//.test(
        id,
      )
    )
      return 5;
    return 0;
  };
  const score = (m: AiModelInfo): number => {
    let s = Math.min(131072, m.context) / 8192;
    const id = m.id.toLowerCase();
    const size = Math.min(10, paramsB(id) / 45);
    // Canonical members outrank their lesser variants: a model whose base
    // name IS the family string ("inkling") beats one that merely contains
    // it ("inkling-small"), which substring matching alone would score as a
    // perfect tie, leaving the order to input accident.
    const base = (id.split("/").pop() ?? id).replace(/:free$/, "");
    const canonical =
      CREATIVE_FAMILIES.includes(base) ||
      BIG_FAMILIES.includes(base) ||
      FAST_FAMILIES.includes(base);
    if (canonical) s += 25;
    const isCoder =
      /(^|[-/])\w*coder\w*(-|:|$)/.test(id) ||
      id.includes("code-") ||
      id.includes("-coder") ||
      // agentic/code families whose names don't carry the word coder
      id.includes("codestral") ||
      id.includes("devstral") ||
      id.includes("north-mini-code") ||
      id.includes("laguna");
    if (isCoder) s -= 120;
    if (bot === "ankaa") {
      CREATIVE_FAMILIES.forEach((f, i) => {
        if (id.includes(f)) s += 150 - i * 8;
      });
      BIG_FAMILIES.forEach((f, i) => {
        if (id.includes(f) && !CREATIVE_FAMILIES.includes(f)) s += 80 - i * 6;
      });
      s += size * 1.2 + providerTier(id) * 0.8;
      if (paramsB(id) > 0 && paramsB(id) < 7) s -= 20;
    } else {
      FAST_FAMILIES.forEach((f, i) => {
        if (id.includes(f)) s += 120 - i * 9;
      });
      CREATIVE_FAMILIES.forEach((f, i) => {
        if (id.includes(f)) s += 40 - i * 2;
      });
      BIG_FAMILIES.forEach((f, i) => {
        if (id.includes(f) && !CREATIVE_FAMILIES.includes(f)) s += 30 - i * 3;
      });
      s += size * 0.4 + providerTier(id);
    }
    return s;
  };
  return [...free].sort((a, b) => score(b) - score(a));
}

/* ════════════════════════════════════════════════════════════════
   Router presets.
   ════════════════════════════════════════════════════════════════ */

export const ROUTER_PRESETS: { id: string; label: string; hint: string }[] = [
  {
    id: "meridian/auto",
    label: "Meridian Auto",
    hint: "Best free model per task, resolved live",
  },
  {
    id: "meridian/fast",
    label: "Meridian Fast",
    hint: "Optimized for speed and accuracy",
  },
  {
    id: "meridian/creative",
    label: "Meridian Creative",
    hint: "Long context for creative writing",
  },
];

export function isRouterPreset(id: string): boolean {
  return id === "openrouter/auto" || ROUTER_PRESETS.some((p) => p.id === id);
}

/* ════════════════════════════════════════════════════════════════
   Provider routing order — pins, active provider, failover.
   ════════════════════════════════════════════════════════════════ */

/** The provider a bot's request would go to FIRST: its pinned provider
 *  when one is keyed, else the global active provider. */
export function effectiveProviderFor(bot: BotId): ProviderId {
  const pinned = getPrefs().aiProviderByBot[bot];
  if (pinned && hasKey(pinned)) return pinned;
  return activeProviderId();
}

/** The ordered list of providers Meridian may use for a bot's request.
 *  Order: the bot's pinned provider (when keyed), then the active provider,
 *  then — only when failover is on — every other keyed provider in registry
 *  order. Providers currently in circuit cooldown are kept in the list but
 *  skipped at execution time (the cooldown is transient state, not config).
 *  Empty when nothing is routable (callers fall back to the Anchor engine). */
export function providerOrderFor(bot: BotId): ProviderId[] {
  const prefs = getPrefs();
  const active = activeProviderId();
  const pinned = prefs.aiProviderByBot[bot];
  const primary = pinned && hasKey(pinned) ? pinned : active;
  const out: ProviderId[] = [];
  if (hasKey(primary)) out.push(primary);
  if (!prefs.aiFailover) return out;
  for (const p of PROVIDER_IDS) {
    if (p === primary) continue;
    if (hasKey(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

/** Global "is online execution possible" peek, used by views for status
 *  surfaces. True when ANY companion has at least one routable provider. */
export function aiConfigured(): boolean {
  return (["luma", "ouro", "ankaa"] as BotId[]).some(
    (b) => providerOrderFor(b).length > 0,
  );
}

/** Per-companion peek: can this specific bot reach a provider? */
export function aiConfiguredFor(bot: BotId): boolean {
  return providerOrderFor(bot).length > 0;
}

/* ════════════════════════════════════════════════════════════════
   Per-provider model chains.
   ════════════════════════════════════════════════════════════════ */

/** Default model for a bot on a provider: OpenRouter keeps the curated
 *  per-bot free defaults; direct providers use the registry's default. */
export function defaultModelFor(provider: ProviderId, bot: BotId): string {
  return provider === "openrouter"
    ? DEFAULT_MODELS[bot]
    : PROVIDERS[provider].defaultModel;
}

/** The raw configured head for a bot on a provider, before any resolution.
 *  Public for routeEpoch's cache identity — it must change exactly when the
 *  user's configuration changes, and never otherwise. */
export function configuredModelFor(provider: ProviderId, bot: BotId): string {
  return (
    getPrefs().aiModelsByProvider[provider]?.[bot] ??
    defaultModelFor(provider, bot)
  );
}

const resolvedCache = new Map<string, { at: number; model: string }>();

/** Resolve the configured head for a bot on a specific provider. Router
 *  presets (OpenRouter-only) are resolved live from the catalog ranking and
 *  memoised for an hour; plain ids pass through (with the :free guard on
 *  OpenRouter). Never throws — a catalog failure degrades to the provider's
 *  default, so chain building can't be knocked over by discovery problems. */
export async function resolveModelFor(
  bot: BotId,
  provider: ProviderId = activeProviderId(),
): Promise<string> {
  const configured = configuredModelFor(provider, bot);
  if (provider !== "openrouter") return configured;
  if (!isRouterPreset(configured)) return ensureFree(configured, bot);
  let profile: BotId = bot;
  if (configured === "meridian/creative") profile = "ankaa";
  const cacheKey = `${provider}:${profile}`;
  const hit = resolvedCache.get(cacheKey);
  if (hit && Date.now() - hit.at < HOUR) return hit.model;
  try {
    const ranked = rankFreeModels(await fetchModels(false, provider), profile);
    const model = ranked[0]?.id ?? defaultModelFor(provider, bot);
    const safe = ensureFree(model, bot);
    resolvedCache.set(cacheKey, { at: Date.now(), model: safe });
    return safe;
  } catch {
    return defaultModelFor(provider, bot);
  }
}

/** The synchronous display head for a bot — what the Settings panel and the
 *  reader badges show. Reflects the bot's EFFECTIVE provider (pin or active)
 *  so the badge never lies about who would answer. */
export function activeModelFor(bot: BotId): string {
  const provider = effectiveProviderFor(bot);
  const configured = configuredModelFor(provider, bot);
  if (provider !== "openrouter") return configured;
  if (isRouterPreset(configured)) return configured;
  return ensureFree(configured, bot);
}

/** The per-(bot, provider) fallback chain, health-reordered. The head comes
 *  from the user's configuration (or the live preset resolution); the tail
 *  is defaults + curated free-tier ids. The adaptive EWMA boost from
 *  ./modelHealth reorders within the chain; unobserved models keep their
 *  static position via the stable index tie-break. */
export async function chainFor(
  bot: BotId,
  provider: ProviderId,
): Promise<string[]> {
  void warmModelHealth(); // fire-and-forget, hourly internal guard
  const head = await resolveModelFor(bot, provider);
  if (provider !== "openrouter") {
    const info = PROVIDERS[provider];
    const all = [head, info.defaultModel, ...info.knownFreeModels];
    return all
      .filter((m) => !!m)
      .map((m, i) => ({ m, i, b: healthBoost(bot, provider, m) }))
      .sort((a, b) => b.b - a.b || a.i - b.i)
      .map((x) => x.m)
      .filter((m, i, a) => a.indexOf(m) === i);
  }
  // Defense in depth: filter EVERY model in the chain to `:free` only. Even
  // if a default or fallback somehow got a paid ID, it never reaches the
  // user's API key.
  const all = [head, DEFAULT_MODELS[bot], ...FALLBACKS];
  return all
    .filter((m, i, a) => !!m && m.endsWith(":free") && a.indexOf(m) === i)
    .map((m, i) => ({ m, i, b: healthBoost(bot, provider, m) }))
    .sort((a, b) => b.b - a.b || a.i - b.i)
    .map((x) => x.m);
}

/** Universal router action: pull the whole free catalog of a provider and
 *  assign the best-ranked model to each companion in one move. Returns null
 *  when nothing free is visible. */
export async function autoAssignFreeModels(
  provider: ProviderId = activeProviderId(),
): Promise<Record<BotId, string> | null> {
  const models = await fetchModels(false, provider);
  const free = models.filter((m) => m.free || m.id.endsWith(":free"));
  if (free.length === 0) return null;
  const best = (bot: BotId): string => {
    const ranked = rankFreeModels(models, bot);
    const id = ranked[0]?.id ?? defaultModelFor(provider, bot);
    return provider === "openrouter" ? ensureFree(id, bot) : id;
  };
  return { luma: best("luma"), ouro: best("ouro"), ankaa: best("ankaa") };
}

/* ════════════════════════════════════════════════════════════════
   Model discovery — the persisted stale-while-revalidate layer.
   ════════════════════════════════════════════════════════════════ */

/** Re-exported raw-catalog shape (the layer that parses the API response
 *  owns the type). */
import type { RawCatalogModel } from "./providers";
export type { RawCatalogModel };

const MODELS_TTL = 6 * HOUR;
const MODELS_STALE_AT = 3 * HOUR;

/** Catalog cache key per provider. OpenRouter keeps the legacy `models:v3`
 *  key so existing 6h caches survive; new providers get `models:v3:<p>`. */
const modelsCacheKey = (provider: ProviderId): string =>
  provider === "openrouter" ? MODELS_KEY : `${MODELS_KEY}:${provider}`;

const inflightModels = new Map<ProviderId, Promise<AiModelInfo[]>>();

async function fetchModelsFromNetwork(
  provider: ProviderId,
  force = false,
): Promise<AiModelInfo[]> {
  const models = await fetchProviderModels(provider, force);
  if (models.length)
    await cacheSet(modelsCacheKey(provider), models, MODELS_TTL);
  return models;
}

/** Catalog for a provider: served from the IDB cache immediately; a hit
 *  older than the staleness threshold is returned while a background
 *  refresh fires (stale-while-revalidate); on network failure the last good
 *  cache keeps serving rather than throwing. In-flight callers share one
 *  promise so a burst of requests costs one fetch. */
export async function fetchModels(
  force = false,
  provider: ProviderId = activeProviderId(),
): Promise<AiModelInfo[]> {
  const key = modelsCacheKey(provider);
  const inflight = inflightModels.get(provider) ?? null;
  const meta = force ? null : await cacheGetWithMeta<AiModelInfo[]>(key);

  if (meta && meta.value.length) {
    const age = Date.now() - meta.createdAt;
    if (age > MODELS_STALE_AT && !inflight) {
      inflightModels.set(
        provider,
        fetchModelsFromNetwork(provider)
          .catch(() => meta.value) // network hiccup → keep serving the stale cache
          .finally(() => {
            inflightModels.delete(provider);
          }),
      );
    }
    return meta.value;
  }

  if (inflight && !force) return inflight;

  if (!inflight) {
    inflightModels.set(
      provider,
      fetchModelsFromNetwork(provider, force)
        .catch(async (e) => {
          // last-ditch: serve a stale-but-expired cache if we still have one
          const stale = await cacheGet<AiModelInfo[]>(key);
          if (stale && stale.length) return stale;
          throw e;
        })
        .finally(() => {
          inflightModels.delete(provider);
        }),
    );
  }
  return inflightModels.get(provider) as Promise<AiModelInfo[]>;
}

/** Catalog plus freshness metadata for UI surfaces: when the list was last
 *  fetched from upstream, how old it is, and whether it is past the
 *  staleness threshold (a background refresh may be due or in flight). */
export interface CatalogMeta {
  models: AiModelInfo[];
  fetchedAt: number | null;
  ageMs: number;
  stale: boolean;
}

export async function fetchModelsWithMeta(
  force = false,
  provider: ProviderId = activeProviderId(),
): Promise<CatalogMeta> {
  const models = await fetchModels(force, provider);
  const meta = await cacheGetWithMeta<AiModelInfo[]>(
    modelsCacheKey(provider),
  );
  if (!meta || !meta.value.length) {
    return { models, fetchedAt: null, ageMs: Infinity, stale: true };
  }
  const ageMs = Date.now() - meta.createdAt;
  return { models, fetchedAt: meta.createdAt, ageMs, stale: ageMs > MODELS_STALE_AT };
}

/* ════════════════════════════════════════════════════════════════
   Provider circuit state — never re-call a provider that just failed hard.
   ════════════════════════════════════════════════════════════════ */

const COOLDOWN_MS: Record<"auth" | "rate" | "network" | "server" | "timeout", number> = {
  auth: 5 * 60_000, // key rejected — probably bad; other providers may be fine
  rate: 60_000, // provider-level 429 — back off, retry next request
  network: 30_000, // unreachable from this browser (CORS/DNS/offline)
  server: 45_000, // 5xx outage
  timeout: 30_000, // bounded timer expired
};

interface Cooldown {
  until: number;
  kind: ProviderFailKind;
}

const providerCooldown = new Map<ProviderId, Cooldown>();

function coolProvider(provider: ProviderId, kind: "auth" | "rate" | "network" | "server" | "timeout"): void {
  const until = Date.now() + (COOLDOWN_MS[kind] ?? 30_000);
  const prev = providerCooldown.get(provider);
  if (prev && prev.until >= until) return;
  providerCooldown.set(provider, { until, kind });
}

function cooldownOf(provider: ProviderId): Cooldown | null {
  for (;;) {
    const cd = providerCooldown.get(provider);
    if (!cd) return null;
    if (cd.until <= Date.now()) {
      providerCooldown.delete(provider);
      continue;
    }
    return cd;
  }
}

/* ════════════════════════════════════════════════════════════════
   Pacing — the sliding-window rate limiter and the daily quota.
   ════════════════════════════════════════════════════════════════ */

const WINDOW_MS = 60_000;
const LIMIT = 15;
const stamps: number[] = [];
let queued = 0;

/** Cross-tab window sync (best-effort): every stamped call is announced on a
 *  BroadcastChannel so two side-by-side tabs share one effective 15/min
 *  budget. Silent no-op where BroadcastChannel is unavailable. */
let rateChan: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== "undefined") {
    rateChan = new BroadcastChannel("lemniscate:rate");
    rateChan.onmessage = (e: MessageEvent) => {
      const t = (e.data as { t?: number } | null)?.t;
      if (typeof t === "number" && Date.now() - t < WINDOW_MS) {
        stamps.push(t);
        stamps.sort((a, b) => a - b);
      }
    };
  }
} catch {
  rateChan = null;
}

function stamp(): void {
  const t = Date.now();
  stamps.push(t);
  try {
    rateChan?.postMessage({ t });
  } catch {
    /* channel closed mid-flight — ignore */
  }
}

function pruneStamps(): void {
  const now = Date.now();
  while (stamps.length && now - (stamps[0] ?? 0) > WINDOW_MS) stamps.shift();
}

export function rateInfo(): {
  used: number;
  limit: number;
  windowMs: number;
  queued: number;
} {
  pruneStamps();
  return { used: stamps.length, limit: LIMIT, windowMs: WINDOW_MS, queued };
}

async function rateWait(): Promise<void> {
  pruneStamps();
  if (stamps.length < LIMIT) {
    stamp();
    return;
  }
  const waitMs = (stamps[0] ?? Date.now()) + WINDOW_MS - Date.now() + 60;
  if (waitMs > 25_000) {
    throw new MeridianError(
      "saturated",
      `The request queue is saturated: Lemniscate paces AI calls at 15/minute and ${queued} call${queued === 1 ? " is" : "s are"} already queued. Give it a breath and try again; the Anchor engine remains available in the meantime.`,
    );
  }
  queued++;
  try {
    await new Promise((r) => setTimeout(r, waitMs));
    pruneStamps();
    stamp();
  } finally {
    queued = Math.max(0, queued - 1);
  }
}

/* Daily quota counter — O(1) per request; one scan per day to initialise. */
let dailyCountCache: { date: number; count: number } | null = null;

function dayKey(): number {
  return new Date().setHours(0, 0, 0, 0);
}

async function ensureDailyCount(): Promise<void> {
  const today = dayKey();
  if (dailyCountCache && dailyCountCache.date === today) return;
  const rows = await idbAll<UsageRow>("usage").then((r) =>
    r.filter((u) => u.userId === getUserId()),
  );
  const count = rows.filter(
    (r) => r.createdAt >= today && r.status === "ok",
  ).length;
  dailyCountCache = { date: today, count };
}

function incrementDailyCount(): void {
  if (dailyCountCache && dailyCountCache.date === dayKey()) {
    dailyCountCache.count++;
  }
}

async function quotaCheck(): Promise<void> {
  const prefs = getPrefs();
  await ensureDailyCount();
  const used = dailyCountCache?.count ?? 0;
  if (used >= prefs.dailyQuota) {
    throw new MeridianError(
      "quota",
      `Daily AI quota reached (${prefs.dailyQuota} calls). The Anchor engine remains fully available — or raise the quota in Settings.`,
    );
  }
}

/* ════════════════════════════════════════════════════════════════
   Errors — the application-level routing contract.
   ════════════════════════════════════════════════════════════════ */

export type MeridianErrorKind =
  | ProviderFailKind
  | "quota"
  | "saturated"
  | "offline-plan";

export class MeridianError extends Error {
  readonly kind: MeridianErrorKind;
  constructor(kind: MeridianErrorKind, message: string) {
    super(message);
    this.name = "MeridianError";
    this.kind = kind;
  }
}

export function isMeridianError(e: unknown): e is MeridianError {
  return e instanceof MeridianError;
}

/** Normalise any thrown value into (kind, message). Unknown values default
 *  to "server" — the router never lets an exotic exception escape shape. */
function classifyFailure(e: unknown): { kind: ProviderFailKind; message: string } {
  if (e instanceof ProviderError) {
    return { kind: e.kind, message: e.message };
  }
  if (e instanceof Error && e.name === "AbortError") {
    return { kind: "aborted", message: "Cancelled." };
  }
  return {
    kind: "server",
    message: e instanceof Error ? e.message : "request failed",
  };
}

const PROVIDER_LEVEL: ReadonlySet<ProviderFailKind> = new Set([
  "auth",
  "rate",
  "network",
]);

const MAX_CANDIDATES = 12;

/** Jittered bounded backoff between the two attempts on one model. */
const backoffMs = (attempt: number): number =>
  600 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);

const estTokens = (text: string, tokens: number | null): number =>
  tokens ?? Math.round(text.length / 4) + 200;

/** The ledger key for a serving model: always `provider/model`. */
export const ledgerModel = (provider: ProviderId, model: string): string =>
  `${provider}/${model}`;

/* ────────────────────────────────────────────────────────────
   Deadline profiles & route budgets.
   ──────────────────────────────────────────────────────────── */

/** Bounded-lifecycle profiles per operation class. This is the fix for
 *  stagnant requests that never complete: a dead connection is cut by
 *  the connect deadline, a stalled stream by the idle deadline, and a
 *  runaway generation by the max deadline — while genuinely slow creative
 *  production (reasoning models pause a long time between tokens) gets a
 *  deliberately wider idle window than conversation, so extra time is
 *  spent ONLY where it buys quality. Pure — exported for tests. */
const PROFILE_CREATIVE: StreamTimeouts = {
  connectMs: 30_000,
  idleMs: 150_000,
  maxMs: 15 * 60_000,
};
const PROFILE_STRUCTURED: StreamTimeouts = {
  connectMs: 25_000,
  idleMs: 75_000,
  maxMs: 8 * 60_000,
};
const PROFILE_REPAIR: StreamTimeouts = {
  connectMs: 25_000,
  idleMs: 60_000,
  maxMs: 4 * 60_000,
};
const PROFILE_CHAT: StreamTimeouts = {
  connectMs: 20_000,
  idleMs: 45_000,
  maxMs: 3 * 60_000,
};

export function streamProfileFor(kind: string): StreamTimeouts {
  if (/repair$/.test(kind)) return PROFILE_REPAIR;
  if (/^cinema|^section|^outline|^longform|^draft/.test(kind))
    return PROFILE_CREATIVE;
  if (/^study|^analysis|^refine/.test(kind)) return PROFILE_STRUCTURED;
  return PROFILE_CHAT;
}

/** Whole-walk budget per class: even with retries, cooldowns and failover
 *  across every keyed provider, a single user request must terminate in
 *  bounded time. Exhausted → honest timeout; the caller falls back to
 *  Anchor. Pure — exported for tests. */
export function routeBudgetFor(kind: string): number {
  // repair first: "study:quiz:repair" starts with "study" but is a quick
  // corrective call — it must never inherit the longer study budget.
  if (/repair$/.test(kind)) return 3 * 60_000;
  if (/^cinema|^section|^outline|^longform|^draft/.test(kind))
    return 12 * 60_000;
  if (/^study|^analysis|^refine/.test(kind)) return 6 * 60_000;
  return 2 * 60_000;
}

function budgetMessage(budgetMs: number): string {
  return `The route ran out of time across every available model (${Math.round(
    budgetMs / 60_000,
  )} min budget) — the Anchor engine remains fully available.`;
}
/* ════════════════════════════════════════════════════════════════
   Execution — route() and routeStream().
   ════════════════════════════════════════════════════════════════ */

export interface RouteCall {
  bot: BotId;
  kind: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  docId?: string | null;
  /** fires once, with the candidate that actually served */
  onServed?: (served: { provider: ProviderId; model: string }) => void;
}

export interface RouteOutcome {
  text: string;
  tokens: number | null;
  provider: ProviderId;
  model: string;
  /** how many candidates were tried before one answered */
  tried: number;
}

/** In-flight deduplication of identical concurrent non-streaming requests:
 *  two identical calls racing (double-click, overlapping panels) cost one
 *  provider round-trip and one ledger row. Keyed on everything that affects
 *  the response; the entries live only while the shared promise is pending. */
const inflightRoute = new Map<string, Promise<RouteOutcome>>();

function dedupKeyOf(call: RouteCall): string {
  return [
    call.bot,
    call.kind,
    call.messages.map((m) => `${m.role}:${m.content}`).join("\u0000"),
    call.maxTokens ?? "",
    call.temperature ?? "",
    call.topP ?? "",
  ].join("\u0001");
}

function finalFailure(
  order: ProviderId[],
  sawAuth: boolean,
  sawRate: boolean,
  lastKind: ProviderFailKind,
  lastMsg: string,
): MeridianError {
  const primaryLabel = PROVIDERS[order[0] ?? activeProviderId()].label;
  if (sawAuth) {
    return new MeridianError(
      "auth",
      `No ${primaryLabel} key set — add one in Settings.`,
    );
  }
  if (sawRate) {
    return new MeridianError(
      "rate",
      "The provider is rate-limiting this key right now. Lemniscate will retry on the next request — the Anchor engine remains available meanwhile.",
    );
  }
  return new MeridianError(
    lastKind,
    `The AI provider couldn't be reached (${lastMsg}). The Anchor engine remains fully available.`,
  );
}

/** Non-streaming routed execution (transport: streamed with a sink tap,
 *  so every request — not just chat — gets the three-deadline stagnation
 *  guard). Walks the provider order; within each provider walks its
 *  health-reordered chain; each model gets at most two attempts with
 *  jittered bounded backoff between them. Provider-level failures open the
 *  circuit for that provider and move on immediately. The whole walk is
 *  bounded by routeBudgetFor(). */
export async function route(call: RouteCall): Promise<RouteOutcome> {
  const t0 = performance.now();
  const budget = routeBudgetFor(call.kind);
  const order = providerOrderFor(call.bot);
  if (!order.length) {
    throw new MeridianError(
      "offline-plan",
      "No keyed provider is routable right now — the Anchor engine remains fully available.",
    );
  }
  const dk = dedupKeyOf(call);
  const twin = inflightRoute.get(dk);
  if (twin) return twin;
  /* Pacing and quota come after routability and dedup: a keyless request
     must not stamp the shared 15/min window, and joining an in-flight twin
     must not stamp a second time — the twin already paced for this send. */
  await rateWait();
  await quotaCheck();

  const exec = (async (): Promise<RouteOutcome> => {
    let tried = 0;
    let lastKind: ProviderFailKind = "server";
    let lastMsg = "Provider unreachable";
    let sawAuth = false;
    let sawRate = false;
    let outOfBudget = false;

    for (const provider of order) {
      if (cooldownOf(provider)) continue; // circuit open — skip this request
      const chain = await chainFor(call.bot, provider);
      let providerDead = false;
      for (const model of chain) {
        if (tried >= MAX_CANDIDATES) break;
        if (performance.now() - t0 > budget) {
          outOfBudget = true;
          break;
        }
        tried++;
        for (let attempt = 0; attempt < 2 && !providerDead; attempt++) {
          const at = performance.now();
          try {
            const { text, tokens } = await providerStreamOnce(
              call.messages,
              model,
              () => {}, // sink tap: non-streaming callers never see deltas
              undefined,
              {
                maxTokens: call.maxTokens,
                temperature: call.temperature,
                topP: call.topP,
              },
              provider,
              streamProfileFor(call.kind),
            );
            const ms = Math.round(performance.now() - at);
            observeModel(call.bot, provider, model, true, ms);
            void logUsage(
              call.bot,
              call.kind,
              estTokens(text, tokens),
              ms,
              "ok",
              call.docId ?? null,
              ledgerModel(provider, model),
            );
            incrementDailyCount();
            call.onServed?.({ provider, model });
            return { text, tokens, provider, model, tried };
          } catch (e) {
            const { kind, message } = classifyFailure(e);
            lastKind = kind;
            lastMsg = message;
            observeModel(
              call.bot,
              provider,
              model,
              false,
              Math.round(performance.now() - at),
            );
            if (kind === "aborted") {
              throw new MeridianError("aborted", "Stopped.");
            }
            if (kind === "auth") sawAuth = true;
            if (kind === "rate") sawRate = true;
            if (PROVIDER_LEVEL.has(kind)) {
              // auth / rate / network: the whole provider is bad right now —
              // cool it, skip its remaining models, fail over.
              if (kind === "auth" || kind === "rate" || kind === "network") {
                coolProvider(provider, kind);
              }
              providerDead = true;
              break;
            }
            // model-level (bad-request / empty / server / timeout): retry
            // once on this model, then let the chain move on.
            if (attempt === 0) await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          }
        }
        if (providerDead) break;
      }
      /* Budget exhaustion ends the walk (no remaining provider can beat
         the clock); a dead provider FAILS OVER to the next keyed provider —
         the same contract routeStream() implements and the module header
         promises. A 429 on the pinned provider must not kill the request
         when a second keyed provider exists. */
      if (outOfBudget) break;
      if (providerDead) continue;
    }

    if (outOfBudget) {
      void logUsage(
        call.bot,
        call.kind,
        0,
        Math.round(performance.now() - t0),
        "error",
        call.docId ?? null,
      );
      throw new MeridianError("timeout", budgetMessage(budget));
    }
    void logUsage(
      call.bot,
      call.kind,
      0,
      Math.round(performance.now() - t0),
      "error",
      call.docId ?? null,
    );
    throw finalFailure(order, sawAuth, sawRate, lastKind, lastMsg);
  })();

  inflightRoute.set(dk, exec);
  try {
    return await exec;
  } finally {
    inflightRoute.delete(dk);
  }
}

export interface StreamCall extends RouteCall {
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface StreamOutcome extends RouteOutcome {
  /** true when a candidate failed mid-stream after already delivering
   *  tokens — the partial text is returned instead of retried, so a fresh
   *  candidate's output can never be appended to a half-answer. */
  partial: boolean;
}

/** Streaming routed execution. Same provider order and chains as route();
 *  no in-request backoff (first-token latency matters more than pacing
 *  between already-failing candidates) and partial-stream protection.
 *  Every candidate runs under its class deadline profile and the whole
 *  walk is bounded by routeBudgetFor(). */
export async function routeStream(call: StreamCall): Promise<StreamOutcome> {
  const order = providerOrderFor(call.bot);
  if (!order.length) {
    throw new MeridianError(
      "offline-plan",
      "No keyed provider is routable right now — the Anchor engine remains fully available.",
    );
  }
  /* Routability before pacing: a keyless stream request must not stamp
     the shared 15/min window — there is nothing to send. */
  await rateWait();
  await quotaCheck();
  const t0 = performance.now();
  const budget = routeBudgetFor(call.kind);

  let streamed = "";
  let tried = 0;
  let lastKind: ProviderFailKind = "server";
  let lastMsg = "stream failed";
  let sawAuth = false;
  let sawRate = false;
  let outOfBudget = false;
  // Attribution for a budget-exhausted partial: the candidate that streamed.
  let lastProv: ProviderId = order[0] ?? activeProviderId();
  let lastMdl = "";

  for (const provider of order) {
    if (cooldownOf(provider)) continue;
    const chain = await chainFor(call.bot, provider);
    let providerDead = false;
    for (const model of chain) {
      if (tried >= MAX_CANDIDATES) break;
      // Budget check sits BETWEEN candidates, never mid-stream: an
      // in-flight candidate is bounded by its own profile's maxMs.
      if (performance.now() - t0 > budget) {
        outOfBudget = true;
        break;
      }
      tried++;
      lastProv = provider;
      lastMdl = model;
      const at = performance.now();
      try {
        const tap = (chunk: string): void => {
          streamed += chunk;
          call.onDelta(chunk);
        };
        const { text, tokens } = await providerStreamOnce(
          call.messages,
          model,
          tap,
          call.signal,
          {
            maxTokens: call.maxTokens,
            temperature: call.temperature,
            topP: call.topP,
          },
          provider,
          streamProfileFor(call.kind),
        );
        const ms = Math.round(performance.now() - at);
        observeModel(call.bot, provider, model, true, ms);
        void logUsage(
          call.bot,
          call.kind,
          estTokens(text, tokens),
          ms,
          "ok",
          call.docId ?? null,
          ledgerModel(provider, model),
        );
        incrementDailyCount();
        call.onServed?.({ provider, model });
        return { text, tokens, provider, model, tried, partial: false };
      } catch (e) {
        if (call.signal?.aborted) {
          throw new MeridianError("aborted", "Stopped.");
        }
        const { kind, message } = classifyFailure(e);
        lastKind = kind;
        lastMsg = message;
        observeModel(
          call.bot,
          provider,
          model,
          false,
          Math.round(performance.now() - at),
        );
        // Partial-stream protection: tokens already delivered to the UI can
        // never be appended to by a fresh candidate — return what we have.
        if (streamed.length > 0) {
          void logUsage(
            call.bot,
            call.kind,
            Math.round(streamed.length / 4) + 200,
            Math.round(performance.now() - t0),
            "error",
            call.docId ?? null,
            ledgerModel(provider, model),
          );
          return {
            text: streamed,
            tokens: null,
            provider,
            model,
            tried,
            partial: true,
          };
        }
        if (kind === "aborted") {
          throw new MeridianError("aborted", "Stopped.");
        }
        if (kind === "auth") sawAuth = true;
        if (kind === "rate") sawRate = true;
        if (PROVIDER_LEVEL.has(kind)) {
          if (kind === "auth" || kind === "rate" || kind === "network") {
            coolProvider(provider, kind);
          }
          providerDead = true;
          break;
        }
        // model-level failure with nothing streamed → next model in chain
      }
      if (providerDead) break;
    }
    if (outOfBudget || providerDead) continue;
  }

  if (outOfBudget) {
    if (streamed.length > 0) {
      // Partial-stream protection: tokens already delivered to the UI can
      // never be discarded in favour of a fallback answer — return what we
      // have. (Normally unreachable: a mid-stream candidate failure returns
      // earlier; kept airtight on purpose.)
      void logUsage(
        call.bot,
        call.kind,
        Math.round(streamed.length / 4) + 200,
        Math.round(performance.now() - t0),
        "error",
        call.docId ?? null,
        ledgerModel(lastProv, lastMdl || "unknown"),
      );
      return {
        text: streamed,
        tokens: null,
        provider: lastProv,
        model: lastMdl || "unknown",
        tried,
        partial: true,
      };
    }
    void logUsage(
      call.bot,
      call.kind,
      0,
      Math.round(performance.now() - t0),
      "error",
      call.docId ?? null,
    );
    throw new MeridianError("timeout", budgetMessage(budget));
  }
  void logUsage(
    call.bot,
    call.kind,
    0,
    Math.round(performance.now() - t0),
    "error",
    call.docId ?? null,
  );
  throw finalFailure(order, sawAuth, sawRate, lastKind, lastMsg);
}

/* ════════════════════════════════════════════════════════════════
   Route epochs — cache identity for artifacts that attribute a model.
   ════════════════════════════════════════════════════════════════ */

/** A stable identity for HOW a bot is currently routed. Used in artifact
 *  cache keys (study sets, scene cards, deep analyses) so that changing the
 *  provider or model configuration invalidates exactly the caches whose
 *  attribution would otherwise go stale. Offline determinism is identity-
 *  neutral: when nothing is routable, every epoch collapses to "offline"
 *  and cached offline artifacts keep serving (they are deterministic). */
export function routeEpoch(bot: BotId): string {
  const order = providerOrderFor(bot);
  const primary = order[0];
  if (!primary) return "offline";
  return `${primary}|${configuredModelFor(primary, bot)}`;
}

/** Best-effort description of who would serve a bot right now — used by
 *  views for honest status copy. */
export function routeSummaryFor(bot: BotId): string {
  const order = providerOrderFor(bot);
  const primary = order[0];
  if (!primary) return "Anchor engine (offline)";
  const label = PROVIDERS[primary].label;
  if (order.length > 1) {
    return `${label}, failing over to ${order.length - 1} other keyed provider${order.length === 2 ? "" : "s"}`;
  }
  return label;
}
