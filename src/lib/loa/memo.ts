import type { DeepAnalysis } from "../types";

/* ═══════════════════════════════════════════════════
   2. Memoization (bounded, size-guarded)
   ═══════════════════════════════════════════════════ */

export const SENT_CACHE = new Map<string, string[]>();
export const FREQ_CACHE = new Map<string, Map<string, number>>();
export const CHAR_CACHE = new Map<string, { name: string; note: string }[]>();
export const MOOD_CACHE = new Map<string, string>();
const CACHE_MAX = 8;
const CACHE_TEXT_LIMIT = 400_000;

/* The three heavyweight passes (keyword scoring, TextRank summaries, the full
   deep-analysis pipeline) are the slowest things LOA does, and every companion
   re-asks them for the same chapter across a session (chat grounding, study
   sets, insights, the online handoff). They now ride the same bounded LRU as
   the lighter passes; determinism is untouched, a hit returns exactly what a
   recomputation would have produced. */
export const KEYWORD_CACHE = new Map<string, string[]>();

export const SUMMARY_CACHE = new Map<string, string>();

export const ANALYSIS_CACHE = new Map<string, DeepAnalysis>();

/** FNV-1a 32-bit hash run twice with independent multipliers, rendered as a
 *  compact pair — a low-collision fingerprint of arbitrarily long text.
 *  Used both for cache keys (so we never retain whole documents as Map keys)
 *  and as a deterministic RNG seed for quiz generation. */
export function textHash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}${s.length.toString(36)}`;
}

/** Short keys pass through unchanged; long ones are replaced by their
 *  fingerprint so cached entries don't pin entire document strings in memory.
 *  The CACHE_TEXT_LIMIT bypass now correctly checks the RAW key length.
 *  Eviction is LRU-ish and cheap: a hit re-inserts the entry (O(1)) so the
 *  Map's insertion order tracks recency, and the evicted head is always
 *  the least recently used entry. */
export function memo<T>(map: Map<string, T>, rawKey: string, compute: () => T): T {
  const key = rawKey.length > 256 ? textHash(rawKey) : rawKey;
  const hit = map.get(key);
  if (hit !== undefined) {
    if (map.size > 1) {
      map.delete(key);
      map.set(key, hit);
    }
    return hit;
  }
  const val = compute();
  if (rawKey.length > CACHE_TEXT_LIMIT) return val;
  if (map.size >= CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
  return val;
}
