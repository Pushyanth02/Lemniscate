/**
 * LOA — Local On-device Analytics engine.
 *
 * LOA is the grounded, fully offline brain of Lemniscate's three companions.
 * It runs entirely on the user's device against the actual document text —
 * no network, no API key, no tokens leave the browser. Every online capability
 * (Luma chat, Ouro study sets, Ankaa long-form, scene cinematization, deep
 * analysis) has a LOA fallback that is genuinely useful, not a stub.
 *
 * Capabilities:
 *   - Sentence segmentation (abbreviation-aware, dialogue-aware)
 *   - Word frequency analysis (stop-word filtered, morphologically merged via
 *     a conservative light stemmer)
 *   - Keyword extraction (YAKE-inspired position/frequency/spread scoring
 *     with bigram motif detection)
 *   - Extractive summarization (true TextRank: sentence-similarity graph +
 *     PageRank power iteration, with MMR redundancy control)
 *   - BM25 passage retrieval (IDF-weighted grounding for offline Q&A)
 *   - Character detection (proper-noun + dialogue-verb heuristics, with
 *     first-mention context)
 *   - Mood / atmosphere / setting / time-of-day classification
 *     (word-boundary token matching — no substring false positives)
 *   - Theme extraction with chapter-distribution mapping
 *   - Vocabulary selection (uncommon + load-bearing words)
 *   - Cloze-deletion quiz generation with sourced distractors
 *   - Flashcard generation
 *   - Cinematic scene dramatization (original present-tense prose)
 *   - Long-form story generation (structured, anchor-driven, mode-aware)
 *   - Deep literary analysis (summary, themes, characters, criticism)
 *
 * Design principles:
 *   - Deterministic per (text, params) — a retry reproduces the same output
 *   - Bounded memoization — expensive passes are cached, huge texts bypass
 *   - No external dependencies — pure TypeScript
 *   - Graceful degradation — always returns *something* useful
 */

/* Barrel — the public surface of the Anchor engine, identical to the former
   flat loa.ts. Submodules import each other directly (never through this
   barrel) to keep the dependency graph acyclic. */
export { STOP, isStop, stem, wordList, sentences } from "./tokenize";
export { textHash } from "./memo";
export { freqMap, keywordHits, topKeywords } from "./keywords";
export { extractiveSummary } from "./summarize";
export { findCharacters } from "./characters";
export { moodOf, moodKey } from "./mood";
export { extractThemes, extractVocab } from "./themes";
export { clozeQuiz, buildFlashcards } from "./quiz";
export { offlineScenes } from "./dramatize";
export type { StoryAnchors } from "./longform";
export { extractAnchors, offlineAnkaaLong } from "./longform";
export { offlineAnalysis, buildStudy } from "./analysis";
export type { RetrievedPassage } from "./retrieve";
export { retrievePassages } from "./retrieve";
export { docText, chapterText, wordCount, cap, truncateWords } from "./doc-utils";
