/** Shared domain types for Lemniscate. No `any` — keep the contract explicit. */

import type { ProviderId } from "./providers";

export type SourceType =
  | "pdf"
  | "epub"
  | "docx"
  | "pptx"
  | "markdown"
  | "txt"
  | "html";
export type DocumentStatus = "processing" | "ready" | "error";
export type BotId = "luma" | "ouro" | "ankaa";

export type ChunkKind = "p" | "h";
export interface Chunk {
  id: string;
  kind: ChunkKind;
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  /** global index of this chapter's first chunk */
  startChunk: number;
  chunks: Chunk[];
}

export interface QualityReport {
  score: number;
  notes: string[];
}

export interface ParsedDoc {
  title: string;
  author: string;
  language: string;
  sourceType: SourceType;
  chapters: Chapter[];
  wordCount: number;
  charCount: number;
  quality: QualityReport;
  warnings: string[];
}

export interface DocumentRow {
  id: string;
  userId: string;
  title: string;
  author: string;
  sourceType: SourceType;
  mimeType: string;
  byteSize: number;
  status: DocumentStatus;
  error: string | null;
  warnings: string[];
  summary: string | null;
  language: string;
  coverGradient: string;
  chapterCount: number;
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
  lastReadAt: number | null;
  readingProgress: number; // 0..100
  lastChunkIndex: number;
  favorite: boolean;
  tags: string[];
  collection: string | null;
}

/** Chapter content of one document, stored separately from its metadata
 *  since DB v5 so library/progress queries never clone whole books. Keyed
 *  by the document's id. */
export interface DocContentRow {
  id: string;
  userId: string;
  chapters: Chapter[];
}

/** A DocumentRow joined with its chapter content — assembled in the
 *  view/AI layer (metadata from the `documents` store, chapters from
 *  `docContent`). The database never stores this shape; it exists so
 *  reading/AI helpers receive one object. */
export type DocWithContent = DocumentRow & {
  contentJson: { chapters: Chapter[] };
};

export interface BookmarkRow {
  id: string;
  userId: string;
  documentId: string;
  chunkIndex: number;
  label: string;
  note: string;
  createdAt: number;
}

export type AnnotationColor = "gold" | "ouro" | "ankaa" | "ok";
export interface AnnotationRow {
  id: string;
  userId: string;
  documentId: string;
  chunkIndex: number;
  start: number;
  end: number;
  text: string;
  note: string;
  color: AnnotationColor;
  createdAt: number;
}

export type ActivityType =
  | "upload"
  | "read"
  | "bookmark"
  | "annotation"
  | "summary"
  | "scenes"
  | "delete"
  | "favorite"
  | "story"
  | "analyze"
  | "finish";

export interface ActivityRow {
  id: string;
  userId: string;
  documentId: string | null;
  type: ActivityType;
  detail: string;
  createdAt: number;
}

export interface AiSceneRow {
  id: string;
  userId: string;
  documentId: string;
  chapterIndex: number;
  ordinal: number;
  title: string;
  body: string;
  mood: string;
  characters: string[];
  createdAt: number;
  /* ── Scene Atlas (v3) fields. Optional so pre-atlas rows (and scenes2:
     caches) keep rendering unchanged; consumers must treat absence as
     "legacy scene" and fall back to estimate-based source lookup. ── */
  setting?: string;
  sensory?: string[];
  /** emotional movement — the scene's turn. Absent when unsupported. */
  movement?: string;
  /** recurring motifs actually present in the chapter text (verified). */
  motifs?: string[];
  /** explicit, verified source-passage anchors. */
  anchors?: SceneAnchor[];
  /** one-sentence link to the next scene, when the text genuinely continues. */
  thread?: string;
  /** procedural plate parameters derived from the scene's own content. */
  art?: SceneArt;
  /** true when at least one anchor was verified against the source text. */
  grounded?: boolean;
  /** which engine produced the row — "ankaa" (model) or "anchor" (offline). */
  engine?: "ankaa" | "anchor";
}

/** A reader's own note attached to one scene of one chapter. The id is
 *  deterministic (`docId:chapter:ordinal`) so saving is an upsert and notes
 *  survive scene regeneration (pruned only when the scene count shrinks). */
export interface SceneNoteRow {
  id: string;
  userId: string;
  documentId: string;
  chapterIndex: number;
  ordinal: number;
  note: string;
  updatedAt: number;
}

export interface UsageRow {
  id: string;
  userId: string;
  bot: BotId;
  documentId: string | null;
  kind: string;
  estTokens: number;
  latencyMs: number;
  status: "ok" | "error" | "offline";
  createdAt: number;
  /** Model ID that actually served the call, when known — feeds the
   *  adaptive health loop in ./modelHealth. Optional for legacy rows. */
  model?: string;
}

export interface DeepAnalysis {
  summary: string;
  themes: { name: string; note: string }[];
  characters: { name: string; note: string }[];
  criticism: string;
}

export interface AnalysisJob {
  id: string;
  documentId: string;
  userId: string;
  status: "queued" | "running" | "done" | "failed";
  step: string;
  progress: number; // 0..100
  etaSec: number | null;
  results: DeepAnalysis | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  /* optional metadata for the background job tray */
  label?: string;
  bot?: BotId;
  words?: number;
  /** live writing rate (words / minute) — populated when `words > 0`. */
  wordsPerMinute?: number | null;
}

export type AnkaaMode =
  | "continue"
  | "alternate"
  | "chapter"
  | "lore"
  | "children"
  | "whatif";
export interface StoryRow {
  id: string;
  userId: string;
  title: string;
  mode: AnkaaMode;
  body: string;
  sourceDocumentId: string | null;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  step: string;
  error: string | null;
  createdAt: number;
}

/** Book-reading faces: Literata & Spectral & Source Serif 4 (designed for
 *  sustained screen reading), EB Garamond & Baskerville & Palatino (classic
 *  novel typography), Georgia (ubiquitous screen serif), Bookerly/Charter
 *  (Kindle-grade system stacks). */
export type ReaderFontId =
  | "literata"
  | "garamond"
  | "spectral"
  | "sourceserif"
  | "georgia"
  | "bookerly"
  | "baskerville"
  | "palatino";
export type ReaderThemeId = "light" | "dark" | "sepia";

export interface ReaderSettings {
  fontFamily: ReaderFontId;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number; // em * 100
  width: number; // ch
  theme: ReaderThemeId;
  focusMode: boolean;
  accent: string;
  contrast: "normal" | "high";
  motion: boolean;
  animSpeed: number; // 0.5..1.5
  kbdHints: boolean;
}

export interface Prefs {
  reader: ReaderSettings;
  accent: string;
  maxUploadMB: number;
  /** active AI provider (see ./providers). Persisted — model choices are
   *  fine to persist; API keys are NOT, they stay in-memory only. */
  provider: ProviderId;
  /** per-bot model selection, kept separately per provider so choices never
   *  leak across providers. Persisted alongside `provider`. */
  aiModelsByProvider: Record<ProviderId, Partial<Record<BotId, string>>>;
  /** per-companion provider preference — a companion pinned to a specific
   *  keyed provider routes through it first, before the global active
   *  provider. Empty (default): every companion follows `provider`. */
  aiProviderByBot: Partial<Record<BotId, ProviderId>>;
  /** when true, Meridian may fail over to OTHER keyed providers when the
   *  preferred one errors, before falling back to the offline Anchor engine. */
  aiFailover: boolean;
  dailyQuota: number;
  ring: "normal" | "strong";
  /** App-wide interface zoom (CSS `zoom` on <html>): 1 = default.
   *  Scales the whole room — text, spacing, art — like browser zoom,
   *  independent of the reader-only typography settings. */
  uiScale: number;
  /** "large" enforces ≥44px targets on every pointer (WCAG 2.5.5);
   *  "default" keeps compact controls on precise pointers. */
  touchTargets: "default" | "large";
  /** Underline every link app-wide for link visibility. */
  underlineLinks: boolean;
  seeded: boolean;
  /** when true and a key is set, imports get an AI structure-refinement pass */
  aiRefine: boolean;
  /** Explicit consent state for AI import refinement — the only flow that
   *  can send a document’s full imported text to a provider. "ask" (the
   *  default) requires an explicit, informed grant before the first send;
   *  "declined" keeps every import fully local. Refinement can never send
   *  text without a recorded "granted". */
  aiRefineConsent: "ask" | "granted" | "declined";
  /** local profile — display name + monogram color, purely on this device */
  profile: { name: string; color: string };
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudyData {
  summary: string;
  guide: string[];
  themes: { name: string; note: string }[];
  characters: { name: string; note: string }[];
  vocab: { term: string; context: string }[];
  quiz: QuizQuestion[];
  cards: Flashcard[];
  /** Learning objectives — added by the academic upgrade; optional for old caches. */
  objectives?: string[];
  /** Essay / discussion prompts. */
  essays?: string[];
}

/** Honest pricing classification for a catalog entry. Evidence rules:
 *  "free" — the API itself marks the model free (OpenRouter `:free` ids,
 *  zero-priced on every field). "tier" — the model sits on a provider's
 *  curated free tier (documented quotas, from the registry's knownFreeModels).
 *  "paid" — the API reported nonzero pricing. "unknown" — no pricing
 *  information available; never guessed from the model's name. */
export type ModelTier = "free" | "tier" | "paid" | "unknown";

export interface AiModelInfo {
  id: string;
  name: string;
  context: number;
  /** USD per 1M prompt tokens */
  inPerM: number;
  /** USD per 1M completion tokens */
  outPerM: number;
  /** true when the model sits on the provider's free tier — `:free` ids on
   *  OpenRouter, knownFreeModels entries elsewhere. Optional: legacy cached
   *  catalogs predate the flag and derive free-ness from zero pricing. */
  free?: boolean;
  /** Evidence-based pricing tier (see ModelTier). Optional: legacy cached
   *  catalogs predate the field — consumers fall back to `free`/pricing
   *  heuristics, exactly as before. */
  tier?: ModelTier;
}

/** An explicit, verified source-passage anchor: an exact quotation plus the
 *  stable chunk reference (local index within the chapter) it was found in.
 *  Produced by the Scene Atlas pipeline; `chunkIndex` is corrected during
 *  grounding when a model cites the wrong paragraph, and unverifiable
 *  quotes are dropped rather than displayed as evidence. */
export interface SceneAnchor {
  /** verbatim quotation from the source chapter (12–60 words) */
  quote: string;
  /** local chunk index within the chapter — stable across renders */
  chunkIndex: number;
}

/** Procedural plate parameters for a scene card's artwork — derived from the
 *  scene's actual content (mood/setting/sensory words) plus a deterministic
 *  seed, so each scene gets a distinct composition instead of a generic
 *  gradient. See components/scene-atlas.tsx. */
export interface SceneArt {
  palette:
    | "dawn"
    | "night"
    | "storm"
    | "ember"
    | "forest"
    | "sea"
    | "interior"
    | "atlas";
  seed: number;
}

export interface SceneDraft {
  title: string;
  mood: string;
  characters: string[];
  body: string;
  /* ── Scene Atlas (v3). All optional: legacy scenes2 caches and pre-atlas
     DB rows render unchanged with estimate-based source lookup. ── */
  setting?: string;
  sensory?: string[];
  /** emotional movement — the scene's turn. */
  movement?: string;
  /** recurring motifs present in the chapter (grounding keeps only
          text-supported ones). */
  motifs?: string[];
  /** explicit passage anchors (grounding corrects or drops each). */
  anchors?: SceneAnchor[];
  /** narrative link to the following scene, when the text supports it. */
  thread?: string;
  art?: SceneArt;
  /** at least one anchor verified against the source text. */
  grounded?: boolean;
  /** which engine produced the draft. */
  engine?: "ankaa" | "anchor";
}

export type View =
  | "landing"
  | "dashboard"
  | "library"
  | "upload"
  | "reader"
  | "settings"
  | "account"
  | "analytics"
  | "history"
  | "create"
  | "legal";
