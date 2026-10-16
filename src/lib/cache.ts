/**
 * TTL cache persisted in IndexedDB (`aiCache` store).
 *
 * Used for expensive, reusable AI artifacts: study sets, deep analyses,
 * the OpenRouter model catalog. Keys are namespaced and versioned so a
 * schema change simply orphans old entries instead of breaking them.
 */
import { idbAll, idbClear, idbDelete, idbGet, idbPut } from "./db";

interface CacheRow {
  id: string;
  value: unknown;
  expiresAt: number;
  createdAt: number;
}

const P = "c:";

/* ────────────────────────────────────────────────────────────
   Session metrics — hit/miss/store/invalidation counters for the
   Settings panel. In-memory only (per-tab); they describe THIS
   session's cache behaviour, not the persisted store's contents.
   ──────────────────────────────────────────────────────────── */

export interface CacheMetrics {
  hits: number;
  misses: number;
  /** rows found expired at read time (counted as misses) */
  expired: number;
  stores: number;
  invalidations: number;
  /** stale-while-revalidate: rows past TTL but inside the grace window,
   *  served instantly while a fresh copy regenerates in the background */
  swrServed: number;
}

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  expired: 0,
  stores: 0,
  invalidations: 0,
  swrServed: 0,
};

export function cacheMetrics(): Readonly<CacheMetrics> {
  return { ...metrics };
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    if (!row) {
      metrics.misses++;
      return null;
    }
    if (row.expiresAt < Date.now()) {
      metrics.misses++;
      metrics.expired++;
      void idbDelete("aiCache", row.id);
      return null;
    }
    metrics.hits++;
    return row.value as T;
  } catch {
    metrics.misses++;
    return null;
  }
}

/** Same as cacheGet, but also returns the cache row's createdAt (epoch ms)
 *  so callers can implement stale-while-revalidate. */
export async function cacheGetWithMeta<T>(
  key: string,
): Promise<{ value: T; createdAt: number; expiresAt: number } | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    if (!row) {
      metrics.misses++;
      return null;
    }
    if (row.expiresAt < Date.now()) {
      metrics.misses++;
      metrics.expired++;
      void idbDelete("aiCache", row.id);
      return null;
    }
    metrics.hits++;
    return {
      value: row.value as T,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  } catch {
    metrics.misses++;
    return null;
  }
}

/** Stale-while-revalidate read. Live rows serve as normal hits. Rows past
 *  their TTL but within graceMs of expiring serve as STALE — the caller
 *  shows them instantly and regenerates a fresh copy in the background.
 *  Hit-rate win: a row that expired an hour ago no longer reads as a cold
 *  miss, so artifact reads stay warm across the TTL boundary. Rows past
 *  the grace window behave exactly like cacheGet: miss + delete. */
export async function cacheSwrGet<T>(
  key: string,
  graceMs: number,
): Promise<{ value: T; stale: boolean } | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    if (!row) {
      metrics.misses++;
      return null;
    }
    const now = Date.now();
    if (row.expiresAt >= now) {
      metrics.hits++;
      return { value: row.value as T, stale: false };
    }
    if (now - row.expiresAt <= graceMs) {
      metrics.hits++;
      metrics.swrServed++;
      return { value: row.value as T, stale: true };
    }
    metrics.misses++;
    metrics.expired++;
    void idbDelete("aiCache", row.id);
    return null;
  } catch {
    metrics.misses++;
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  metrics.stores++;
  try {
    await idbPut("aiCache", {
      id: P + key,
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  } catch {
    /* cache is best-effort */
  }
}

/** Non-destructive, non-counting read for revalidation guards: returns the
 *  raw row (any age) without touching metrics and without deleting an
 *  expired row — cacheGet/cacheSwrGet both mutate on expiry. Used to check
 *  what a regeneration would overwrite before deciding to write. */
export async function cachePeek<T>(key: string): Promise<T | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    return row ? (row.value as T) : null;
  } catch {
    return null;
  }
}

export async function cacheClearAll(): Promise<void> {
  metrics.invalidations++;
  try {
    await idbClear("aiCache");
  } catch {
    /* ignore */
  }
}

/** Purge every cached artifact belonging to a document (study sets, deep
 *  analyses, scene cards, Ouro artifacts). Called by `deleteDocument` so
 *  orphaned entries don't linger until their TTL expires. Best-effort. */
export async function cachePurgeDoc(docId: string): Promise<void> {
  metrics.invalidations++;
  try {
    const rows = await idbAll<CacheRow>("aiCache");
    const doomed = rows.filter((r) => r.id.includes(`:${docId}:`));
    for (const d of doomed) await idbDelete("aiCache", d.id);
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheStats(): Promise<{
  entries: number;
  bytes: number;
}> {
  try {
    const rows = await idbAll<CacheRow>("aiCache");
    const bytes = rows.reduce((a, r) => a + JSON.stringify(r.value).length, 0);
    return { entries: rows.length, bytes };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

/* ---------------- well-known keys ---------------- */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const analysisKey = (docId: string, updatedAt: number): string =>
  `analysis:v2:${docId}:${updatedAt}`;

export const MODELS_KEY = "models:v3";

/* ────────────────────────────────────────────────────────────
   Boot-time reaper. Reads delete expired rows lazily, but a row
   that is never read again (e.g. old `scenes3:` keys orphaned by
   every content-bearing patch) would otherwise live in the store
   forever — unbounded growth. This sweep bounds it. Conservative
   by design: only rows past every possible stale-while-revalidate
   grace window (expired more than REAP_AFTER_MS ago) are deleted,
   so nothing a live SWR read could still serve is ever reaped.
   Runs once per session; best-effort, failures never surface.
   ──────────────────────────────────────────────────────────── */

const REAP_AFTER_MS = 7 * DAY;

let sweepDone = false;

export async function cacheSweepExpired(): Promise<void> {
  if (sweepDone) return;
  sweepDone = true;
  try {
    const rows = await idbAll<CacheRow>("aiCache");
    const cutoff = Date.now() - REAP_AFTER_MS;
    const doomed = rows.filter((r) => r.expiresAt < cutoff);
    for (const d of doomed) await idbDelete("aiCache", d.id);
  } catch {
    /* best-effort */
  }
}
