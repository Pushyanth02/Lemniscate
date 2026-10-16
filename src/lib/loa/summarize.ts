import { memo, SUMMARY_CACHE } from "./memo";
import { isStop, sentences, stem, wordList } from "./tokenize";

/* ═══════════════════════════════════════════════════
   4. Extractive summarization (true TextRank)
   ═══════════════════════════════════════════════════ */

/**
 * Mihalcea–Tarau TextRank (2004), adapted for single-document use, with a
 * composite re-ranker and bigram-level MMR redundancy control:
 *   1. content-word sets per sentence (stemmed, stop-filtered),
 *   2. weighted undirected similarity graph — overlap / (log|Sa|+log|Sb|),
 *   3. PageRank power iteration (d=0.85, ε=1e-4, ≤40 iters),
 *   4. composite score: TextRank centrality + keyword density + position
 *      bias (openings and endings carry disproportionate meaning) + length
 *      normalization (tiny fragments and run-ons are damped),
 *   5. greedy MMR selection — a candidate whose BIGRAM-Jaccard overlap with
 *      any already-selected sentence exceeds 0.6 is skipped, which kills
 *      near-duplicate sentences that unigram overlap can miss. The ceiling
 *      only relaxes when the text is too homogeneous to fill n.
 * Long inputs are pre-filtered to a density-ranked candidate pool (≤140
 * sentences) so graph construction stays comfortably O(pool²).
 */


export function extractiveSummary(text: string, n = 5): string {
  return memo(SUMMARY_CACHE, `${text}\u0000${n}`, () => extractiveSummaryUncached(text, n));
}

function extractiveSummaryUncached(text: string, n = 5): string {
  const sents = sentences(text);
  if (sents.length <= n) return finishText(sents.join(" "));
  const sets = sents.map((s) => {
    const ws = wordList(s).filter((w) => w.length >= 3 && !isStop(w));
    return new Set(ws.map(stem));
  });
  const lens = sents.map((s) => wordList(s).length);
  const POOL = 140;
  let pool: number[] = sents.map((_, i) => i);
  const tf = new Map<string, number>();
  for (const set of sets) for (const w of set) tf.set(w, (tf.get(w) ?? 0) + 1);
  if (sents.length > POOL) {
    pool = sets
      .map((set, i) => [
        [...set].reduce((a, w) => a + (tf.get(w) ?? 0), 0),
        i,
      ] as const)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .slice(0, POOL)
      .map(([, i]) => i)
      .sort((a, b) => a - b);
  }
  // Similarity graph over pool-local indices: adj[i] = Map<neighbor, weight>.
  const N = pool.length;
  const sim: Map<number, number>[] = [];
  for (let a = 0; a < N; a++) sim.push(new Map());
  for (let a = 0; a < N; a++) {
    const sa = sets[pool[a] ?? 0];
    if (!sa || sa.size === 0) continue;
    for (let b = a + 1; b < N; b++) {
      const sb = sets[pool[b] ?? 0];
      if (!sb || sb.size === 0) continue;
      let overlap = 0;
      for (const w of sa) if (sb.has(w)) overlap++;
      if (overlap === 0) continue;
      const weight = overlap / (Math.log(sa.size + 1) + Math.log(sb.size + 1));
      sim[a]?.set(b, weight);
      sim[b]?.set(a, weight);
    }
  }
  // PageRank power iteration.
  const D = 0.85;
  let rank: number[] = new Array(N).fill(1 / N);
  for (let it = 0; it < 40; it++) {
    const next: number[] = new Array(N).fill((1 - D) / N);
    for (let a = 0; a < N; a++) {
      const neighbors = sim[a];
      if (!neighbors) continue;
      let outSum = 0;
      for (const w of neighbors.values()) outSum += w;
      if (outSum === 0) {
        // dangling node — distribute rank evenly
        for (let b = 0; b < N; b++) next[b] = (next[b] ?? 0) + (D * (rank[a] ?? 0)) / N;
        continue;
      }
      for (const [b, w] of neighbors)
        next[b] = (next[b] ?? 0) + (D * (rank[a] ?? 0) * w) / outSum;
    }
    let delta = 0;
    for (let a = 0; a < N; a++) delta += Math.abs((next[a] ?? 0) - (rank[a] ?? 0));
    rank = next;
    if (delta < 1e-4) break;
  }
  // Composite re-rank: centrality, keyword density, position bias, length.
  const maxRank = Math.max(...rank);
  const density = pool.map((si) => {
    const set = sets[si] ?? new Set<string>();
    if (!set.size) return 0;
    let sum = 0;
    for (const w of set) sum += tf.get(w) ?? 0;
    return sum / set.size;
  });
  const maxDensity = Math.max(...density);
  const total = sents.length;
  const lateStart = Math.max(0, total - Math.max(2, Math.round(total * 0.1)));
  const cand = pool
    .map((si, local) => {
      const pr = maxRank > 0 ? (rank[local] ?? 0) / maxRank : 0;
      const dens = maxDensity > 0 ? (density[local] ?? 0) / maxDensity : 0;
      const pos = total > 1 ? si / (total - 1) : 0;
      const position = 0.8 + 0.2 * (1 - pos) + (si >= lateStart ? 0.12 : 0);
      const wds = lens[si] ?? 0;
      const lenF = wds < 6 ? 0.55 : wds < 12 ? 0.85 : wds <= 45 ? 1 : 0.9;
      return { si, s: (0.7 * pr + 0.3 * dens) * position * lenF };
    })
    .sort((a, b) => b.s - a.s || a.si - b.si);
  // Bigram-Jaccard redundancy check: bigram overlap catches near-duplicates
  // ("He closed the door." vs "She closed the door.") that unigram Jaccard
  // scores as only mildly similar.
  const bigs = sents.map((s) => bigramSetOf(s));
  const bjac = (x: Set<string>, y: Set<string>): number => {
    if (!x.size || !y.size) return 0;
    let inter = 0;
    for (const w of x) if (y.has(w)) inter++;
    return inter / (x.size + y.size - inter);
  };
  const chosen: number[] = [];
  let ceiling = 0.6;
  while (chosen.length < n && ceiling <= 1.01) {
    for (const c of cand) {
      if (chosen.length >= n) break;
      if (chosen.includes(c.si)) continue;
      if (
        !chosen.some((k) =>
          bjac(bigs[c.si] ?? new Set<string>(), bigs[k] ?? new Set<string>()) >
          ceiling,
        )
      )
        chosen.push(c.si);
    }
    ceiling += 0.2;
  }
  return finishText(
    chosen
      .sort((a, b) => a - b)
      .map((si) => sents[si] ?? "")
      .join(" "),
  );
}

/** Stemmed adjacent content-word pairs of a sentence — the redundancy
 *  fingerprint used by the summarizer's MMR pass. */
function bigramSetOf(s: string): Set<string> {
  const ws = wordList(s)
    .filter((w) => w.length >= 3 && !isStop(w))
    .map(stem);
  const out = new Set<string>();
  for (let i = 0; i + 1 < ws.length; i++)
    out.add(`${ws[i] ?? ""} ${ws[i + 1] ?? ""}`);
  return out;
}

/** House-style finisher for generated prose: collapses doubled whitespace,
 *  trims dangling separators (commas, colons, middots) and guarantees the
 *  string ends in terminal punctuation. */
export function finishText(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  t = t.replace(/[\s,;:·|]+$/, "");
  if (!t) return "";
  if (!/[.!?…'’"”»)]$/.test(t)) t += ".";
  return t;
}
