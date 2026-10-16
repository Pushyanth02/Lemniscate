import type { DocumentRow, QuizQuestion } from "../types";
import { textHash } from "./memo";
import { freqMap } from "./keywords";
import { isStop, sentences, stem, wordList } from "./tokenize";
import { extractVocab } from "./themes";
import { findCharacters } from "./characters";
import { finishText } from "./summarize";
import { seeded } from "./doc-utils";

/* ═══════════════════════════════════════════════════
   9. Cloze-deletion quiz generation
   ═══════════════════════════════════════════════════ */

export function clozeQuiz(text: string, n = 6): QuizQuestion[] {
  const sents = sentences(text).filter(
    (s) => wordList(s).length >= 6 && s.length < 280,
  );
  const freq = freqMap(text);
  const candidates = [...freq.entries()]
    .filter(([, c]) => c >= 2 && c <= 12)
    .map(([w]) => w);
  // Deterministic per (text, n): the RNG is seeded from the text fingerprint,
  // so a retry reproduces the identical quiz (the previous Math.random()
  // calls violated the module's own determinism contract).
  let seedStr = `${textHash(text)}:${n}`;
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++)
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  const rnd = seeded(h);
  seedStr = ""; // release the builder string early
  const qs: QuizQuestion[] = [];
  const used = new Set<string>();
  for (const s of sents) {
    if (qs.length >= n) break;
    const words = s.split(/\s+/);
    const idx = words.findIndex((w, i) => {
      const clean = w.toLowerCase().replace(/[^a-z']/g, "");
      return (
        clean.length >= 5 &&
        !isStop(clean) &&
        freq.has(clean) &&
        !used.has(clean) &&
        i > 0 &&
        i < words.length - 1
      );
    });
    if (idx === -1) continue;
    const answerWord = (words[idx] ?? "").replace(/[,.!?;:]+$/, "");
    const clean = answerWord.toLowerCase().replace(/[^a-z']/g, "");
    used.add(clean);
    const answerFreq = freq.get(clean) ?? 1;
    // Distractors: real corpus words from THIS document that (a) never share
    // a stem with the answer — an inflection gives the answer away —
    // (b) differ from the answer by at least 3 characters (edit distance,
    // with a cheap length-difference fast path), (c) never appear in the
    // quiz sentence itself (stem-level check), then ranked by length
    // similarity first and frequency proximity second so elimination isn't
    // trivial. A seeded shuffle over the top band keeps variety without
    // sacrificing determinism.
    const sentStems = new Set(wordList(s).map(stem));
    const nearByLength = candidates
      .filter(
        (c) => c !== clean && stem(c) !== stem(clean) && !sentStems.has(stem(c)),
      )
      .sort(
        (a, b) =>
          Math.abs(a.length - clean.length) -
            Math.abs(b.length - clean.length) ||
          Math.abs((freq.get(a) ?? 1) - answerFreq) -
            Math.abs((freq.get(b) ?? 1) - answerFreq),
      )
      .slice(0, 24);
    const pool = nearByLength
      .filter(
        (c) =>
          Math.abs(c.length - clean.length) >= 3 || editDistance(c, clean) >= 3,
      )
      .slice(0, 9);
    const distractors = seededShuffle(pool, rnd).slice(0, 3);
    if (distractors.length < 3) continue;
    const options = seededShuffle([answerWord, ...distractors], rnd);
    qs.push({
      q: `Choose the word that completes the passage: “${words.slice(0, idx).join(" ")} ____ ${words.slice(idx + 1).join(" ")}”`,
      options,
      answer: options.indexOf(answerWord),
      why: s,
    });
  }
  return qs;
}

/** Levenshtein edit distance — used only on short quiz words, so the full
 *  DP (no early exit needed) is plenty cheap and exactly correct. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1).fill(0);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

/** In-place Fisher-Yates driven by an injected RNG (deterministic when `rnd`
 *  is deterministic — unlike `Array.sort(() => Math.random() - 0.5)`, which
 *  was both biased and non-reproducible). */
function seededShuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/* ═══════════════════════════════════════════════════
   10. Flashcard generation
   ═══════════════════════════════════════════════════ */

/** Title-case a flashcard front ("white whale" → "White Whale"), leaving
 *  already-capitalized and acronymic fronts untouched. Pattern follows the
 *  engine.ts titleCase helper (kept local to avoid coupling the analysis
 *  module to the ingestion module). */
const TITLE_SMALL = new Set([
  "of",
  "the",
  "a",
  "an",
  "and",
  "or",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
]);

function cardTitle(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return s;
  if (words.some((w) => /^[A-Z]{2,}/.test(w))) return s; // acronymic — leave
  return words
    .map((w, i) =>
      i > 0 && TITLE_SMALL.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export function buildFlashcards(
  doc: DocumentRow,
  text: string,
): { front: string; back: string }[] {
  const vocab = extractVocab(text, 4);
  const chars = findCharacters(text, 3);
  return [
    ...vocab.map((v) => ({
      front: cardTitle(v.term),
      back: finishText(v.context) || `Appears in ${doc.title}.`,
    })),
    ...chars.map((c) => ({ front: c.name, back: finishText(c.note) })),
  ];
}
