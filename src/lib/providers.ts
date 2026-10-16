/**
 * Multi-provider AI client — one registry, one OpenAI-compatible wire client.
 *
 * Every provider speaks the same dialect: `POST {base}/chat/completions` with
 * SSE streaming, `GET {base}/models` for the catalog, `Authorization: Bearer`
 * auth. The browser calls each provider DIRECTLY — no proxy, no server.
 *
 * Security posture (inherited verbatim from the original openrouter.ts):
 *   - API keys live ONLY in memory (a module-level Map keyed by provider).
 *     They are never written to localStorage, IndexedDB, prefs, URLs or
 *     error messages. A page refresh wipes them all.
 *   - Requests use bounded deadline profiles (see StreamTimeouts); key and
 *     catalog probes get short fixed budgets.
 *   - Upstream error payloads are sanitised before surfacing: only a trimmed
 *     `error.message` survives, with any key echo redacted.
 *
 * The ACTIVE provider is read from prefs (`provider: ProviderId`, default
 * "openrouter") at call time, so `streamChat` / `chat` / `validateSessionKey`
 * route through whatever the user last selected in Settings. Model choices
 * are persisted per provider in prefs; keys are never persisted.
 *
 * Nothing here ever logs a key or includes one in a thrown error.
 */
import type { AiModelInfo, ModelTier } from "./types";
import { getPrefs } from "./store";

export type ProviderId =
  | "openrouter"
  | "gemini"
  | "xai"
  | "groq"
  | "mistral"
  | "cerebras";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  baseUrl: string;
  /** placeholder shown in the key input, e.g. "sk-or-v1…" */
  keyHint: string;
  /** for validation hints / "keys start with…" copy */
  keyPrefix?: string;
  /** one honest line about the free tier */
  freeNote: string;
  extraHeaders?: Record<string, string>;
  /** curated fallback shown before a live catalog loads */
  knownFreeModels: string[];
  defaultModel: string;
  /** where the user creates an account + key */
  keyUrl: string;
}

/* ────────────────────────────────────────────────────────────
   Provider registry — all OpenAI-compatible, all with a free
   tier. Order = the order the Settings picker shows them in.
   ──────────────────────────────────────────────────────────── */

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-v1…",
    keyPrefix: "sk-or-v1",
    freeNote:
      "Aggregates free (:free) models from many labs — currently the Nemotron, Gemma and Inkling families.",
    extraHeaders: {
      "HTTP-Referer": "https://lemniscate.local",
      "X-Title": "Lemniscate",
    },
    /* Verified against GET /api/v1/models on 2026-10-14: every id below is
     * live in the catalog today. Code-only and moderation-only variants
     * (north-mini-code, laguna, content-safety) are deliberately left out. */
    knownFreeModels: [
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "thinkingmachines/inkling:free",
      "thinkingmachines/inkling-small:free",
      "dots-studio/dots-3-note-preview:free",
      "liquid/lfm-2.5-2.6b:free",
    ],
    defaultModel: "nvidia/nemotron-3.5-lightning:free",
    keyUrl: "https://openrouter.ai/keys",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyHint: "AIza…",
    keyPrefix: "AIza",
    freeNote: "Free tier from Google AI Studio.",
    /* Current flash ladder per ai.google.dev (2026-10): 3.8 is the newest
     * chat flash; 3.5/3.1 remain served. Older 2.x kept out — defaults must
     * never point at a retired id. */
    knownFreeModels: [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ],
    defaultModel: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  xai: {
    id: "xai",
    label: "Grok",
    baseUrl: "https://api.x.ai/v1",
    keyHint: "xai-…",
    keyPrefix: "xai-",
    freeNote: "Grok models direct from xAI; promotional credits on new accounts.",
    /* docs.x.ai (2026-10): Grok 4.7 is the current generation; 4.20 the
     * previous GA line. grok-3-mini and grok-4-fast are retired. */
    knownFreeModels: ["grok-4.7", "grok-4.20", "grok-4.20-non-reasoning"],
    defaultModel: "grok-4.7",
    keyUrl: "https://console.x.ai",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyHint: "gsk_…",
    keyPrefix: "gsk_",
    freeNote: "Generous free tier, ultra-fast inference.",
    /* Groq's docs are bot-gated (403 on every route), so this list is the
     * last verified set — all ids Groq has served for a long stretch and
     * still documents in API examples. Runtime /models remains the source
     * of truth whenever a key is present. */
    knownFreeModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "qwen/qwen3-32b",
      "deepseek-r1-distill-llama-70b",
    ],
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyHint: "…",
    freeNote: "Free experiment tier.",
    /* docs.mistral.ai (2026-10): small 3.2 (via the -latest alias),
     * medium 3.1, magistral-medium 1.2, devstral 2 are the current line. */
    knownFreeModels: [
      "mistral-small-latest",
      "open-mistral-nemo",
      "mistral-medium-3-1-25-08",
      "magistral-medium-1-2-25-09",
      "devstral-2-25-12",
    ],
    defaultModel: "mistral-small-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyHint: "csk-…",
    keyPrefix: "csk-",
    freeNote: "Free daily quota, wafer-scale speed.",
    /* inference-docs.cerebras.ai (2026-10): qwen-3.8-27b is the current
     * flagship; the llama/gpt-oss line remains served. qwen-3-32b retired. */
    knownFreeModels: ["qwen-3.8-27b", "llama-3.3-70b", "llama3.1-8b", "gpt-oss-120b"],
    defaultModel: "qwen-3.8-27b",
    keyUrl: "https://cloud.cerebras.ai",
  },
};

export const PROVIDER_LIST: ProviderInfo[] = [
  PROVIDERS.openrouter,
  PROVIDERS.gemini,
  PROVIDERS.xai,
  PROVIDERS.groq,
  PROVIDERS.mistral,
  PROVIDERS.cerebras,
];

export const PROVIDER_IDS: ProviderId[] = PROVIDER_LIST.map((p) => p.id);

/** The active provider from prefs, hardened against hand-edited storage. */
export function activeProviderId(): ProviderId {
  const p = getPrefs().provider;
  return PROVIDER_IDS.includes(p) ? p : "openrouter";
}

/* ────────────────────────────────────────────────────────────
   Key management — session-only (in-memory Map, never persisted).
   ──────────────────────────────────────────────────────────── */

const sessionKeys = new Map<ProviderId, string>();

/** Set the session key for one provider. Stored only in module-level memory
 *  — survives route changes within the same tab, wiped on reload. */
export function setSessionKey(provider: ProviderId, key: string): void {
  sessionKeys.set(provider, key.trim());
}

/** Forget the session key for one provider (all providers when omitted). */
export function clearSessionKey(provider?: ProviderId): void {
  if (provider === undefined) sessionKeys.clear();
  else sessionKeys.delete(provider);
}

/** True when a key that could plausibly work is set for the provider
 *  (active provider when omitted). */
export function hasKey(provider: ProviderId = activeProviderId()): boolean {
  const k = sessionKeys.get(provider);
  return !!k && k.length > 10;
}

/** Returns `sk-or-v1•••••••••` style — never the full key. Empty string when
 *  no key is set. Very short keys are masked whole. */
export function getKeyMasked(provider: ProviderId = activeProviderId()): string {
  const k = sessionKeys.get(provider);
  if (!k) return "";
  if (k.length <= 12) return "•".repeat(k.length);
  return k.slice(0, 6) + "•".repeat(k.length - 10) + k.slice(-4);
}

/* ────────────────────────────────────────────────────────────
   Typed transport failures.

   The wire layer classifies every failure into a stable kind so the
   router (./meridian) can act on STRUCTURE (skip the model, cool the
   provider, fail over, fall back offline) instead of pattern-matching
   human-readable messages. Provider-specific communication stays here;
   routing decisions never live in this module.
   ──────────────────────────────────────────────────────────── */

export type ProviderFailKind =
  | "auth" // key missing / rejected — cool the provider, try another
  | "rate" // 429 / quota — cool the provider briefly, try another
  | "network" // unreachable from the browser (CORS/DNS/offline)
  | "timeout" // bounded timer expired
  | "server" // provider-side outage or malformed stream
  | "bad-request" // this model can't serve this request — skip the model
  | "empty" // completed but returned no content — skip the model
  | "aborted"; // caller cancelled

export class ProviderError extends Error {
  readonly kind: ProviderFailKind;
  readonly provider: ProviderId;
  constructor(kind: ProviderFailKind, provider: ProviderId, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.provider = provider;
  }
}

/** Map an HTTP status to a failure kind. 400/404 are model-level problems
 *  (skip the model, not the provider); 401/403 and 429 are provider-level. */
function kindFromStatus(status: number): ProviderFailKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 400) return "bad-request";
  if (status === 429) return "rate";
  return "server"; // 5xx and anything unrecognized
}

/** In-stream error payloads carry no status — classify by content, then
 *  default to server. Only used for `error.message` text from SSE frames. */
function kindFromInStream(msg: string): ProviderFailKind {
  if (/rate.?limit|quota|too many requests|insufficient/i.test(msg)) return "rate";
  if (/api.?key|auth|token|permission|credential/i.test(msg)) return "auth";
  return "server";
}

function requireKey(provider: ProviderId): string {
  const k = sessionKeys.get(provider);
  if (!k) {
    throw new ProviderError(
      "auth",
      provider,
      `No ${PROVIDERS[provider].label} key set — add one in Settings.`,
    );
  }
  return k;
}

/* ────────────────────────────────────────────────────────────
   Internal helpers.
   ──────────────────────────────────────────────────────────── */

const KEY_TIMEOUT_MS = 15_000;
const MODELS_TIMEOUT_MS = 15_000;
/** Catalog cache TTL — repeated Settings opens shouldn't refetch. */
const MODELS_TTL_MS = 10 * 60_000;

function authHeaders(info: ProviderInfo, key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    ...(info.extraHeaders ?? {}),
  };
}

function headers(info: ProviderInfo, key: string): Record<string, string> {
  return authHeaders(info, key);
}

/** Read the JSON body of a non-OK response without ever throwing — used so
 *  we can sanitise the upstream message before showing it. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Redact any accidental key echo from an upstream message. Covers every
 *  provider's key shape plus a generic Bearer-token catch-all and a
 *  length-anchored rule for providers without a registered prefix (e.g.
 *  Mistral) whose 32+ char secrets would otherwise pass through. */
function redactKeyEcho(msg: string): string {
  return msg
    .replace(/sk-or-[A-Za-z0-9_-]+/gi, "sk-or-••••")
    .replace(/gsk_[A-Za-z0-9]+/gi, "gsk_••••")
    .replace(/xai-[A-Za-z0-9_-]+/gi, "xai-••••")
    .replace(/csk-[A-Za-z0-9_-]+/gi, "csk-••••")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "AIza••••")
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer ••••")
    .replace(
      /(^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g,
      "$1••••",
    );
}

/** An error raised from a provider's own in-stream error payload. Now typed
 *  as a ProviderError so the tolerance loop rethrows it instead of
 *  misclassifying it as a malformed frame. */
class UpstreamError extends ProviderError {}

/** Replace raw upstream payloads with a short, user-safe, provider-aware
 *  message plus the structured kind for the router. The raw body is never
 *  returned — only a trimmed, redacted `error.message` when one is present. */
function sanitiseUpstream(
  body: unknown,
  status: number,
  info: ProviderInfo,
): { message: string; kind: ProviderFailKind } {
  if (body && typeof body === "object") {
    const err = (body as { error?: { message?: unknown } }).error;
    if (err && typeof err.message === "string") {
      const safe = redactKeyEcho(err.message.slice(0, 240));
      if (safe) return { message: safe, kind: kindFromStatus(status) };
    }
    // Some providers put the message at the top level instead of nested.
    const flat = (body as { message?: unknown }).message;
    if (typeof flat === "string") {
      const safe = redactKeyEcho(flat.slice(0, 240));
      if (safe) return { message: safe, kind: kindFromStatus(status) };
    }
  }
  const label = info.label;
  const kind = kindFromStatus(status);
  if (status === 401) return { message: `${label} rejected the key.`, kind };
  if (status === 403) return { message: `${label} refused the request.`, kind };
  if (status === 404) return { message: `Model not found on ${label}.`, kind };
  if (status === 429) return { message: `${label} rate limit hit.`, kind };
  if (status >= 500) return { message: `${label} is unavailable right now.`, kind };
  return { message: `${label} error (${status}).`, kind };
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Fetch rejects with TypeError on network failure and CORS blocks. Direct
 *  providers may not send permissive CORS headers — surface a copy that
 *  points the user at the browser-first option. */
function isNetworkFailure(e: unknown): boolean {
  return typeof TypeError !== "undefined" && e instanceof TypeError;
}

function corsCopy(info: ProviderInfo): string {
  return `Couldn't reach ${info.label} from the browser. If it persists, OpenRouter works browser-first and carries free models from every major lab.`;
}

/* ────────────────────────────────────────────────────────────
   Key validation — GET /key on OpenRouter, GET /models elsewhere.
   The key is passed in (not read from session state) so the user can
   validate a key before committing it. Returns ok=false with a
   sanitised message on any failure.
   ──────────────────────────────────────────────────────────── */

export async function validateKey(
  provider: ProviderId,
  key: string,
): Promise<{ ok: boolean; message: string }> {
  const info = PROVIDERS[provider];
  const k = key.trim();
  if (!k || k.length < 10) {
    return {
      ok: false,
      message: info.keyPrefix
        ? `Key looks too short — ${info.label} keys start with ${info.keyPrefix}…`
        : `Key looks too short for ${info.label}.`,
    };
  }
  const probe = provider === "openrouter" ? `${info.baseUrl}/key` : `${info.baseUrl}/models`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), KEY_TIMEOUT_MS);
  try {
    const res = await fetch(probe, {
      method: "GET",
      signal: ctrl.signal,
      headers: authHeaders(info, k),
    });
    if (!res.ok) {
      const { message } = sanitiseUpstream(
        await safeJson(res),
        res.status,
        info,
      );
      return { ok: false, message };
    }
    return { ok: true, message: `Key works — ${info.label} is reachable.` };
  } catch (e) {
    if (isAbort(e)) {
      return { ok: false, message: `${info.label} took too long to answer.` };
    }
    if (isNetworkFailure(e)) {
      return { ok: false, message: corsCopy(info) };
    }
    return { ok: false, message: `Couldn't reach ${info.label}.` };
  } finally {
    clearTimeout(timer);
  }
}

/** Validate the currently-active session key for a provider (the active
 *  provider when omitted). Used by `testConnection()` in ./ai so the
 *  Settings "Test" button can probe the live session key without ever
 *  exposing the raw key to other modules. */
export async function validateSessionKey(
  provider: ProviderId = activeProviderId(),
): Promise<{ ok: boolean; message: string }> {
  if (!sessionKeys.get(provider)) {
    return {
      ok: false,
      message: `No ${PROVIDERS[provider].label} key set — paste your key in Settings to connect.`,
    };
  }
  return validateKey(provider, sessionKeys.get(provider) as string);
}

/* ────────────────────────────────────────────────────────────
   Model catalog — GET /models, cached per provider (10 min).
   OpenRouter: only `:free` ids survive, exactly as before. Other
   providers list everything with a `free` flag on knownFreeModels.
   ──────────────────────────────────────────────────────────── */

export interface RawCatalogModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

interface ModelCacheEntry {
  at: number;
  models: AiModelInfo[];
}
const modelCache = new Map<ProviderId, ModelCacheEntry>();

export async function fetchModels(
  provider: ProviderId = activeProviderId(),
  force = false,
): Promise<AiModelInfo[]> {
  const info = PROVIDERS[provider];
  if (!force) {
    const hit = modelCache.get(provider);
    if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODELS_TIMEOUT_MS);
  try {
    const res = await fetch(`${info.baseUrl}/models`, {
      method: "GET",
      signal: ctrl.signal,
      headers: headers(info, requireKey(provider)),
    });
    if (!res.ok) {
      const { message, kind } = sanitiseUpstream(
        await safeJson(res),
        res.status,
        info,
      );
      throw new ProviderError(kind, provider, message);
    }
    const json = (await res.json()) as { data?: RawCatalogModel[] };
    const all = Array.isArray(json.data) ? json.data : [];
    const freeSet = new Set(info.knownFreeModels);
    const models = all
      .filter((m) => m && typeof m.id === "string" && m.id)
      .map((m) => {
        // Gemini's OpenAI-compatible /models returns "models/<id>" — strip it.
        const id = m.id.startsWith("models/")
          ? m.id.slice("models/".length)
          : m.id;
        const inPerM = Number(m.pricing?.prompt ?? 0) * 1e6;
        const outPerM = Number(m.pricing?.completion ?? 0) * 1e6;
        const free =
          provider === "openrouter" ? id.endsWith(":free") : freeSet.has(id);
        // Evidence-based pricing tier. Never inferred from the model's name:
        // "free" only when the API itself marks it (OpenRouter :free),
        // "tier" for the registry's curated free tier, "paid" when the API
        // reported nonzero pricing, "unknown" when there is no pricing
        // information at all (every direct provider's /models payload).
        const tier: ModelTier =
          provider === "openrouter"
            ? "free"
            : free
              ? "tier"
              : inPerM > 0 || outPerM > 0
                ? "paid"
                : "unknown";
        return {
          id,
          name: m.name ?? id,
          context: m.context_length ?? 0,
          inPerM,
          outPerM,
          free,
          tier,
        } satisfies AiModelInfo;
      })
      // OpenRouter: ONLY free-tier models — no paid model ever enters the
      // catalog. Others: keep the full list, flag the free tier.
      .filter((m) => (provider === "openrouter" ? m.free : true))
      // drop per-user fine-tunes (model:user/ft)
      .filter((m) => !(m.id.includes(":") && m.id.split(":")[1]?.includes("/")))
      // dedup by id — keep the first occurrence (upstreams occasionally
      // list the same model twice; duplicates break pickers and rankings)
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .sort(
        (a, b) =>
          Number(b.free ?? false) - Number(a.free ?? false) ||
          a.name.localeCompare(b.name),
      );
    modelCache.set(provider, { at: Date.now(), models });
    return models;
  } catch (e) {
    if (isAbort(e)) {
      throw new ProviderError(
        "timeout",
        provider,
        `${info.label} took too long to list models.`,
      );
    }
    if (isNetworkFailure(e)) {
      throw new ProviderError("network", provider, corsCopy(info));
    }
    if (e instanceof ProviderError) throw e;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ────────────────────────────────────────────────────────────
   Chat — POST {base}/chat/completions (streaming + non-streaming).
   ──────────────────────────────────────────────────────────── */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Parse a single SSE buffer chunk into [events, leftover]. Pure. */
export function parseSseChunk(buf: string): { events: string[]; rest: string } {
  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  const events: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("data:")) events.push(t.slice(5).trim());
  }
  return { events, rest };
}

/** Bounded streaming lifecycles. Three independent deadlines so a stalled
 *  connection can never keep a companion busy until manual cancellation:
 *    connectMs — no response headers within this window
 *    idleMs    — no stream data for this long mid-flight
 *    maxMs     — absolute cap on the whole request
 *  A deadline expiring aborts the underlying fetch, cancels the stream
 *  reader, and surfaces as ProviderError("timeout") with a precise message.
 *  The caller's AbortSignal still means user cancellation (rethrown as-is,
 *  never mislabelled as a timeout). */
export interface StreamTimeouts {
  connectMs?: number;
  idleMs?: number;
  maxMs?: number;
}

const DEFAULT_STREAM_TIMEOUTS = {
  connectMs: 30_000,
  idleMs: 90_000,
  maxMs: 10 * 60_000,
};

function timeoutMessage(kind: "connect" | "idle" | "max"): string {
  if (kind === "connect")
    return "The provider did not respond in time (connection deadline).";
  if (kind === "idle")
    return "The stream stalled — no data arrived for too long.";
  return "The request exceeded the maximum duration.";
}

/** Streaming chat completion (SSE). `onDelta` fires as tokens arrive.
 *  Bounded by `timeouts` (see StreamTimeouts); the caller's AbortSignal
 *  cancels immediately and is distinguishable from every timeout. */
export async function streamChat(
  messages: ChatMessage[],
  model: string,
  onDelta: (chunk: string) => void,
  signal: AbortSignal | undefined,
  opts: { temperature?: number; topP?: number; maxTokens?: number } = {},
  provider: ProviderId = activeProviderId(),
  timeouts: StreamTimeouts = {},
): Promise<{ text: string; tokens: number | null }> {
  const info = PROVIDERS[provider];
  const t = { ...DEFAULT_STREAM_TIMEOUTS, ...timeouts };
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.topP !== undefined) body.top_p = opts.topP;
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  /* ── deadline guard ──────────────────────────────────────────
     One internal controller: aborts on the caller's cancel OR any
     deadline. `timeoutKind` records WHICH deadline fired so the
     catch paths can tell a timeout from a user cancellation. */
  const guard = new AbortController();
  let timeoutKind: "connect" | "idle" | "max" | null = null;
  const onCallerAbort = () => {
    if (!timeoutKind) guard.abort();
  };
  if (signal) {
    if (signal.aborted) guard.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const connectTimer = setTimeout(() => {
    timeoutKind = "connect";
    guard.abort();
  }, t.connectMs);
  const maxTimer = setTimeout(() => {
    timeoutKind = "max";
    guard.abort();
  }, t.maxMs);
  // Idle timer: armed after headers arrive, re-armed on every chunk.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timeoutKind = "idle";
      guard.abort();
    }, t.idleMs);
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    let res: Response;
    try {
      res = await fetch(`${info.baseUrl}/chat/completions`, {
        method: "POST",
        signal: guard.signal,
        headers: headers(info, requireKey(provider)),
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (timeoutKind)
        throw new ProviderError("timeout", provider, timeoutMessage(timeoutKind));
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (e instanceof Error && e.name === "AbortError") throw e; // user cancel
      if (isNetworkFailure(e))
        throw new ProviderError("network", provider, corsCopy(info));
      throw e;
    }
    clearTimeout(connectTimer);
    armIdle();
    if (!res.ok) {
      const { message, kind } = sanitiseUpstream(
        await safeJson(res),
        res.status,
        info,
      );
      throw new ProviderError(kind, provider, message);
    }
    if (!res.body)
      throw new ProviderError(
        "server",
        provider,
        "Provider returned no stream body",
      );
    reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let tokens: number | null = null;
    // Bounds against a misbehaving or compromised endpoint that streams an
    // endless newline-free frame or ignores max_tokens: both buffers must
    // stay finite or the tab exhausts memory.
    const MAX_FRAME_CHARS = 1_000_000;
    const MAX_STREAM_CHARS = 2_000_000;
    // Bound the number of tolerated malformed frames — a stream that is
    // persistently garbage (proxy error page, truncated JSON) must fail loudly
    // instead of silently returning an empty/partial answer.
    let malformed = 0;
    for (;;) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (e) {
        if (timeoutKind)
          throw new ProviderError("timeout", provider, timeoutMessage(timeoutKind));
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (isNetworkFailure(e))
          throw new ProviderError("network", provider, corsCopy(info));
        throw e;
      }
      const { done, value } = readResult;
      if (done) break;
      armIdle();
      buf += dec.decode(value, { stream: true });
      if (buf.length > MAX_FRAME_CHARS)
        throw new ProviderError(
          "server",
          provider,
          "Stream frame exceeded the size limit — aborting.",
        );
      const { events, rest } = parseSseChunk(buf);
      buf = rest;
      for (const payload of events) {
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { total_tokens?: number };
            error?: { message?: string };
          };
          if (j.error?.message) {
            // Strip any accidental key echo from upstream error messages.
            throw new UpstreamError(
              kindFromInStream(j.error.message),
              provider,
              redactKeyEcho(j.error.message),
            );
          }
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            if (text.length > MAX_STREAM_CHARS)
              throw new ProviderError(
                "server",
                provider,
                "Streamed answer exceeded the size limit — aborting.",
              );
            onDelta(delta);
          }
          if (j.usage?.total_tokens) tokens = j.usage.total_tokens;
        } catch (e) {
          if (e instanceof UpstreamError) throw e;
          if (e instanceof Error && !e.message.includes("JSON")) throw e;
          // Tolerate occasional malformed frames — SSE chunks sometimes split
          // a JSON object across network boundaries — but only a few.
          if (++malformed > 3)
            throw new ProviderError(
              "server",
              provider,
              "Stream contained too many malformed frames — aborting.",
            );
        }
      }
    }
    if (!text.trim())
      throw new ProviderError(
        "empty",
        provider,
        "The model returned an empty answer.",
      );
    return { text, tokens };
  } finally {
    if (signal) signal.removeEventListener("abort", onCallerAbort);
    clearTimeout(connectTimer);
    clearTimeout(maxTimer);
    if (idleTimer) clearTimeout(idleTimer);
    // Release the stream on every exit path — success, error, timeout,
    // user cancel — so the underlying connection cannot linger.
    try {
      await reader?.cancel();
    } catch {
      /* already released */
    }
  }
}

