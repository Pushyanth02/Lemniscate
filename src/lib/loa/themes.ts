import { topKeywords, keywordHits } from "./keywords";
import { extractiveSummary } from "./summarize";
import { isStop, sentences, stem, wordList } from "./tokenize";
import { cap } from "./doc-utils";

/* ═══════════════════════════════════════════════════
   7. Theme extraction with chapter distribution
   ═══════════════════════════════════════════════════ */

export function extractThemes(
  text: string,
  n = 4,
  chapters?: { title: string; text: string }[],
): {
  name: string;
  note: string;
  distribution?: { chapter: string; count: number }[];
}[] {
  const kw = topKeywords(text, n + 2).slice(0, n);
  return kw.map((k) => {
    const relevant = sentences(text).filter(
      (s) => keywordHits(s, k) > 0,
    );
    const note =
      extractiveSummary(relevant.join(" "), 1) || `Threads through the text.`;
    const distribution = chapters?.map((c) => ({
      chapter: c.title,
      count: keywordHits(c.text, k),
    }));
    return { name: cap(k), note, distribution };
  });
}

/* ═══════════════════════════════════════════════════
   8. Vocabulary selection
   ═══════════════════════════════════════════════════ */

/** Frequent-but-unremarkable content words (6+ letters) that are not
 *  definition-worthy however rare they are in a given text: nobody needs a
 *  flashcard for "moment" or "silence". Supplements STOP as the top-common
 *  filter for the rarity rank. */
const COMMON_CONTENT = new Set(
  "moment moments silence silent evening morning afternoon midnight darkness little father mother brother sister children window garden street village forest candle shadow shadows people looked turned seemed wanted needed better matter thought perhaps quarter minutes seconds summer winter spring autumn season weather strange feeling feelings happiness sorrow memory memories yesterday tomorrow history stories letters answer question questions school master servant soldier captain country mountains valley flowers silver breath whisper whispered almost already around asking believe beside beyond brought called carried certain chance change closed coming corner course covered curtain decided deeply despite different distance enough exactly except expected finally followed forever forward friend friends further future gentle gently glanced happened hardly helped higher holding hoping hundred towards through though within without because before started stopped opened leaving keeping turned turning looked looking seemed spoken speaking written writing walked running given giving taken taking heard hearing watched watching stood standing sat sitting light color colour voice black white green golden silver river ocean mountain forest field meadow garden library kitchen chamber chamber door table floor ceiling remember remembered wondered answered replied another others anyone someone everyone anything something nothing anyone everyone return returned arrived departed entered".split(
    /\s+/,
  ),
);

export function extractVocab(
  text: string,
  n = 7,
): { term: string; context: string }[] {
  const sents = sentences(text);
  // Raw surface counts (not stem-merged): vocab entries must be real words
  // a learner can look up, and rarity is judged per surface form.
  const tf = new Map<string, number>();
  for (const w of wordList(text)) {
    if (w.length < 6 || isStop(w)) continue;
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  // Rarity rank: uncommon words (outside STOP + COMMON_CONTENT) appearing
  // 2-5 times are the sweet spot — repeated enough to be load-bearing, rare
  // enough to be definition-worthy. Words seen 6+ times lose the window
  // bonus; hapax legomena (single occurrences) are usually typos or OCR
  // noise and only serve as a ranked fallback when the text is too short
  // to repeat anything.
  const windowBonus = (c: number) => (c >= 2 && c <= 5 ? 1.15 : 0.8);
  const rarity = (w: string) => (COMMON_CONTENT.has(w) ? 0.45 : 1);
  const score = (w: string, c: number) =>
    (w.length * windowBonus(c) * rarity(w)) / Math.log(2 + c);
  const ranked = [
    ...[...tf.entries()]
      .filter(([, c]) => c >= 2 && c <= 6)
      .map(([w, c]) => ({ w, c, s: score(w, c) })),
    ...[...tf.entries()]
      .filter(([w, c]) => c === 1 && w.length >= 7 && !COMMON_CONTENT.has(w))
      .map(([w, c]) => ({ w, c, s: score(w, c) * 0.6 })),
  ].sort((a, b) => b.s - a.s || (a.w < b.w ? -1 : 1));
  // Deduplicate by stem so "lantern" and "lanterns" can't both be cards.
  const seenStems = new Set<string>();
  const picked: { w: string }[] = [];
  for (const r of ranked) {
    const st = stem(r.w);
    if (seenStems.has(st)) continue;
    seenStems.add(st);
    picked.push({ w: r.w });
    if (picked.length >= n) break;
  }
  return picked.map(({ w }) => {
    // Context = the sentence containing the term that carries the most
    // total content-word weight — the most representative usage.
    let context = "";
    let bestScore = -1;
    for (const s of sents) {
      if (!s.toLowerCase().includes(w)) continue;
      const sc = wordList(s).reduce(
        (a, x) => a + (x === w ? 0 : (tf.get(x) ?? 0)),
        0,
      );
      if (sc > bestScore) {
        bestScore = sc;
        context = s;
      }
    }
    return { term: w, context: context.trim() };
  });
}
