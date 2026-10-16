import type { DeepAnalysis, DocWithContent, StudyData } from "../types";
import { memo, ANALYSIS_CACHE } from "./memo";
import { sentences } from "./tokenize";
import { topKeywords } from "./keywords";
import { extractiveSummary, finishText } from "./summarize";
import { findCharacters } from "./characters";
import { moodOf } from "./mood";
import { extractThemes, extractVocab } from "./themes";
import { buildFlashcards, clozeQuiz } from "./quiz";
import { cap, chapterText, docText, truncateWords } from "./doc-utils";

/* ═══════════════════════════════════════════════════
   13. Deep literary analysis (LOA)
   ═══════════════════════════════════════════════════ */

export function offlineAnalysis(doc: DocWithContent): DeepAnalysis {
  return memo(ANALYSIS_CACHE, `${doc.id}\u0000${docText(doc)}`, () => offlineAnalysisUncached(doc));
}

function offlineAnalysisUncached(doc: DocWithContent): DeepAnalysis {
  const text = docText(doc);
  const themes = extractThemes(text, 4);
  const chars = findCharacters(text, 5);
  const kw = topKeywords(text, 6);
  const keyPassage = extractiveSummary(text, 1);
  const moodHead = moodOf(text).split("·")[0]?.trim() ?? "";
  return {
    summary: extractiveSummary(text, 6),
    themes,
    characters: chars,
    criticism:
      `"${doc.title}" moves by ${kw.slice(0, 3).join(", ") || "its images"} more than by event. ` +
      `The prose is ${doc.warnings.length === 0 ? "clean and well-preserved" : "somewhat degraded; refinement would help close reading"}. ` +
      `Its recurring vocabulary (${kw.slice(0, 4).join(", ")}) gives the piece a ${moodHead} register, and the pacing (${doc.wordCount.toLocaleString()} words across ${doc.chapterCount} chapter${doc.chapterCount === 1 ? "" : "s"}) rewards slow re-reading.` +
      // Evidence-grounded observations: name the figure who carries the motif
      // and quote the passage the ranking actually selected.
      (chars.length
        ? ` Watch how ${chars[0]?.name ?? "the central figure"} absorbs every turn of the motif; the book's real argument happens in that character's vicinity.`
        : "") +
      (keyPassage ? ` Key evidence: “${truncateWords(keyPassage, 40)}”` : ""),
  };
}

/* ═══════════════════════════════════════════════════
   14. Study set builder (LOA Ouro)
   ═══════════════════════════════════════════════════ */

export function buildStudy(
  doc: DocWithContent,
  chapterIndex: number | null,
): StudyData {
  const text =
    chapterIndex === null ? docText(doc) : chapterText(doc, chapterIndex);
  const scope =
    chapterIndex === null
      ? "the whole text"
      : `"${doc.contentJson.chapters[chapterIndex]?.title ?? "the selected chapter"}"`;
  const summary = extractiveSummary(text, chapterIndex === null ? 6 : 4);
  const chars = findCharacters(text, 4);
  const kw = topKeywords(text, 10);
  const vocab = extractVocab(text, 6);
  const cards = buildFlashcards(doc, text);
  // House-style sentence for the guide's key-passage line: finishText
  // guarantees terminal punctuation, and an empty scope gets an honest
  // fallback instead of a dangling "Key passage: " fragment.
  const keySentence = finishText(sentences(text)[0] ?? "");
  const themes = kw.slice(0, 4).map((k) => ({
    name: cap(k),
    note:
      extractiveSummary(
        sentences(text)
          .filter((s) => s.toLowerCase().includes(k))
          .join(" "),
        2,
      ) || `Threads through ${scope}.`,
  }));
  return {
    summary,
    guide: [
      `Scope: ${scope} of "${doc.title}" by ${doc.author}.`,
      `Central movements: ${kw.slice(0, 5).join(", ") || "none extracted"}.`,
      keySentence
        ? `Key passage: ${keySentence}`
        : "Key passage: none could be isolated in this scope.",
      chars.length
        ? `Figures to track: ${chars.map((c) => c.name).join(", ")}.`
        : "No recurring figures detected; this passage is mostly landscape or reflection.",
      `Ask yourself: why does ${kw[0] ?? "the opening image"} return when it does?`,
    ],
    objectives: [
      `Identify how ${kw[0] ?? "the central image"} functions as a motif across ${scope}.`,
      `Trace the shift in register from the opening to the closing sentences, citing two passages.`,
      chars.length
        ? `Compare what ${chars[0]?.name ?? "the protagonist"} says with what ${chars[0]?.name ?? "the protagonist"} does; locate the gap on the page.`
        : `Explain how setting performs the work usually assigned to character.`,
      `Formulate one question the text answers and one it deliberately withholds.`,
    ],
    essays: [
      `"${themes[0]?.name ?? "The recurring image"} is less a symbol than a habit of attention." Discuss with reference to ${scope}.`,
      `Analyze the pacing of ${scope}: where does the prose accelerate, where does it wait, and what does the reader learn in the waiting?`,
      chars.length >= 2
        ? `Compare ${chars[0]?.name ?? "the first figure"} and ${chars[1]?.name ?? "the second figure"} as competing definitions of the same virtue.`
        : `What does the narrator refuse to say? Argue from silence, syntax and omission.`,
    ],
    themes,
    characters: chars,
    vocab,
    quiz: clozeQuiz(text, 6),
    cards,
  };
}
