import { memo, FREQ_CACHE, KEYWORD_CACHE } from "./memo";
import { isStop, sentences, stem, wordList } from "./tokenize";

/* ═══════════════════════════════════════════════════
   3. Frequency analysis & keyword extraction
   ═══════════════════════════════════════════════════ */

export function freqMap(text: string): Map<string, number> {
  return memo(FREQ_CACHE, text, () => {
    // Surface-form counts first, then merge morphological variants
    // (ember/embers, walk/walked/walking) under their most frequent surface
    // form so motifs register their true weight. Purely numeric tokens are
    // skipped — page numbers and dates are never literary keywords.
    const surface = new Map<string, number>();
    for (const w of wordList(text)) {
      if (w.length < 3 || isStop(w) || /^\d+$/.test(w)) continue;
      surface.set(w, (surface.get(w) ?? 0) + 1);
    }
    const groups = new Map<
      string,
      { rep: string; repCount: number; count: number }
    >();
    for (const [w, c] of surface) {
      const st = stem(w);
      const g = groups.get(st);
      if (!g) groups.set(st, { rep: w, repCount: c, count: c });
      else {
        g.count += c;
        if (c > g.repCount) {
          g.rep = w;
          g.repCount = c;
        }
      }
    }
    const m = new Map<string, number>();
    for (const g of groups.values()) m.set(g.rep, g.count);
    return m;
  });
}

/** Count occurrences of a (possibly multi-word) keyword inside text using
 *  stemmed token windows — accurate where naive substring splitting counted
 *  matches inside unrelated words ("art" inside "particular"). */
export function keywordHits(text: string, key: string): number {
  const words = wordList(text).map(stem);
  const target = key.split(/\s+/).map(stem);
  if (!target.length || words.length < target.length) return 0;
  let hits = 0;
  outer: for (let i = 0; i <= words.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (words[i + j] !== target[j]) continue outer;
    }
    hits++;
  }
  return hits;
}

/**
 * YAKE-inspired keyword extraction (Campos et al., ECIR 2018 — simplified for
 * zero-dependency use): unigrams scored by frequency × sentence-spread ×
 * early-position × length, deduplicated through the stemmer. Recurring
 * adjacent pairs — bigram motifs of two non-stop words co-occurring ≥ 3
 * times, like “white whale” or “dark tower” — claim reserved slots ahead of
 * their component words so genuine phrases are never fragmented away, and
 * their co-occurrence count feeds back as evidence boosting the component
 * unigrams. Stays a pure string[]-returning function. */


export function topKeywords(text: string, n = 12): string[] {
  return memo(KEYWORD_CACHE, `${text}\u0000${n}`, () => topKeywordsUncached(text, n));
}

function topKeywordsUncached(text: string, n = 12): string[] {
  const sents = sentences(text);
  const tf = new Map<string, number>();
  const spread = new Map<string, number>();
  const posSum = new Map<string, number>();
  // Bigrams are keyed by their stem pair so inflectional variants
  // ("white whales") merge with the canonical surface form.
  const bigrams = new Map<string, { rep: string; count: number }>();
  for (let si = 0; si < sents.length; si++) {
    const ws = wordList(sents[si] ?? "");
    const seen = new Set<string>();
    let prev = "";
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i] ?? "";
      if (w.length < 3 || isStop(w) || /^\d+$/.test(w)) {
        prev = "";
        continue;
      }
      seen.add(w);
      tf.set(w, (tf.get(w) ?? 0) + 1);
      posSum.set(w, (posSum.get(w) ?? 0) + si);
      if (prev && prev !== w) {
        const key = `${stem(prev)} ${stem(w)}`;
        const g = bigrams.get(key);
        if (!g) bigrams.set(key, { rep: `${prev} ${w}`, count: 1 });
        else g.count++;
      }
      prev = w;
    }
    for (const w of seen) spread.set(w, (spread.get(w) ?? 0) + 1);
  }
  // Co-occurrence evidence: words that ride inside recurring phrases rank
  // higher as single keywords too (bounded so a phrase-heavy text can't
  // drown everything else).
  const evidence = new Map<string, number>();
  for (const [key, g] of bigrams) {
    if (g.count < 3) continue;
    for (const part of key.split(" "))
      evidence.set(part, (evidence.get(part) ?? 0) + g.count);
  }
  // Unigram scores, stem-deduplicated (keep the best-scoring surface form).
  const ranked = [...tf.entries()]
    .map(([w]) => {
      const f = tf.get(w) ?? 1;
      const sp = spread.get(w) ?? 1;
      const meanPos = (posSum.get(w) ?? 0) / f;
      const positionFactor = 1 + 1 / (1 + meanPos);
      const lengthBoost = w.length >= 7 ? 1.15 : w.length >= 5 ? 1.05 : 1;
      const ev = evidence.get(stem(w)) ?? 0;
      const evBoost = 1 + Math.min(0.4, ev * 0.04);
      return {
        k: w,
        s:
          Math.sqrt(f) *
          Math.sqrt(sp / Math.max(1, sents.length) + 0.25) *
          positionFactor *
          lengthBoost *
          evBoost,
      };
    })
    .sort((a, b) => b.s - a.s || (a.k < b.k ? -1 : 1));
  const usedStems = new Set<string>();
  const uni: string[] = [];
  for (const item of ranked) {
    const st = stem(item.k);
    if (usedStems.has(st)) continue;
    usedStems.add(st);
    uni.push(item.k);
  }
  // Reserve slots for recurring bigram motifs first (up to half the list).
  const bigramBudget = Math.ceil(n / 2);
  const out: string[] = [];
  const bigramRanked = [...bigrams.entries()]
    .filter(([, g]) => g.count >= 3)
    .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1));
  const phraseStems = new Set<string>();
  for (const [, g] of bigramRanked) {
    if (out.length >= bigramBudget) break;
    const parts = g.rep.split(" ");
    const sts = parts.map((p) => stem(p));
    if (sts.some((st) => phraseStems.has(st))) continue;
    for (const st of sts) phraseStems.add(st);
    out.push(g.rep);
  }
  for (const k of uni) {
    if (out.length >= n) break;
    if (phraseStems.has(stem(k))) continue;
    out.push(k);
  }
  return out;
}
