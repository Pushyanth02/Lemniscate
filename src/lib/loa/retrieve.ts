import { isStop, sentences, stem, wordList } from "./tokenize";

/* ═══════════════════════════════════════════════════
   15. BM25 passage retrieval
   ═══════════════════════════════════════════════════ */

export interface RetrievedPassage {
  text: string;
  /** index of the passage's first source sentence within `sentences(text)` */
  index: number;
  score: number;
}

/**
 * Okapi BM25 passage retrieval (Robertson–Zaragoza) over sentence-triplet
 * windows — the grounded backbone of offline Luma answers. IDF is computed
 * from the passage collection itself, so rare query terms dominate common
 * ones, and length normalization (b=0.75, k₁=1.5) stops long passages from
 * winning on sheer word count. Replaces the naive term-overlap count that
 * treated "the" and "lantern" as equally informative.
 */
export function retrievePassages(
  text: string,
  query: string,
  n = 3,
): RetrievedPassage[] {
  const qTerms = [
    ...new Set(
      wordList(query)
        .filter((w) => w.length >= 3 && !isStop(w))
        .map(stem),
    ),
  ];
  const sents = sentences(text);
  if (!qTerms.length || sents.length === 0) return [];
  // Passages = consecutive sentence triplets cut with an OVERLAPPING stride
  // (step 2 of 3, i.e. 0.75×): enough context to quote meaningfully, and
  // adjacent windows share exactly one sentence, so a match that straddles
  // a cut isn't lost to quantization.
  const WINDOW = 3;
  const STRIDE = Math.max(1, Math.floor(WINDOW * 0.75));
  const units: { words: string[]; index: number }[] = [];
  for (let i = 0; i < sents.length; i += STRIDE) {
    const slice = sents.slice(i, i + WINDOW);
    if (slice.length === 0) continue;
    units.push({
      words: slice.flatMap((s) => wordList(s).map(stem)),
      index: i,
    });
  }
  const N = units.length;
  const df = new Map<string, number>();
  const tfs = units.map(({ words }) => {
    const m = new Map<string, number>();
    for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
    for (const t of qTerms) if (m.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
    return m;
  });
  let avgdl = 0;
  for (const u of units) avgdl += u.words.length;
  avgdl = avgdl / N || 1;
  const K1 = 1.5;
  const B = 0.75;
  const scored: RetrievedPassage[] = [];
  units.forEach((u, ui) => {
    const tfU = tfs[ui];
    if (!tfU) return;
    let score = 0;
    for (const t of qTerms) {
      const f = tfU.get(t) ?? 0;
      if (f === 0) continue;
      const dft = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - dft + 0.5) / (dft + 0.5));
      score +=
        (idf * (f * (K1 + 1))) /
        (f + K1 * (1 - B + B * (u.words.length / avgdl)));
    }
    if (score > 0) {
      scored.push({
        text: sents.slice(u.index, u.index + WINDOW).join(" "),
        index: u.index,
        score,
      });
    }
  });
  // Diversification: at most one retrieval hit per window position — a
  // candidate that shares ANY sentence with an already-selected passage is
  // skipped, so an answer cites different parts of the chapter instead of
  // three overlapping windows over the same paragraph. The overlap budget
  // only relaxes when the chapter is too homogeneous to fill n otherwise.
  const ranked = scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const picked: RetrievedPassage[] = [];
  const shared = (a: number, b: number): number =>
    Math.max(0, Math.min(a + WINDOW, b + WINDOW) - Math.max(a, b));
  for (let pass = 0; pass < 3 && picked.length < n; pass++) {
    const allow = pass === 0 ? 0 : pass === 1 ? 1 : WINDOW;
    for (const r of ranked) {
      if (picked.length >= n) break;
      if (picked.includes(r)) continue;
      if (picked.some((p) => shared(p.index, r.index) > allow)) continue;
      picked.push(r);
    }
  }
  return picked;
}
