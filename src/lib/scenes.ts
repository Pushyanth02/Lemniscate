/**
 * Scene Atlas engine — the pure, browser-free core of Lemniscate's scene
 * pipeline. Everything here is deterministic and unit-testable: the Zod
 * schema for model output, the grounding pass that verifies claimed
 * quotations against the actual chapter text (correcting chunk references
 * or dropping unverifiable quotes), the palette/art derivation that gives
 * every scene a distinct procedural plate, the versioned cache keys, and
 * the offline chunk-bucketing used by the Anchor engine.
 *
 * Companion modules: ./ai (model orchestration), ./loa (offline scenes),
 * ./data (persistence), components/scene-atlas.tsx (rendering).
 */
import { z } from "zod";
import type { Chunk, SceneAnchor, SceneArt, SceneDraft } from "./types";

/* ═══════════════════════════════════════════════════
   1. Schema — the shape a model must return for one scene
   ═══════════════════════════════════════════════════ */

export const AtlasAnchorSchema = z.object({
  /** verbatim quotation, 12–60 words (24–400 chars after trim) */
  quote: z.string().trim().min(24).max(400),
  /** the [¶N] paragraph number the quote was copied from */
  chunkIndex: z.number().int().min(0).max(999),
});

export const AtlasSceneSchema = z.object({
  title: z.string().trim().min(2).max(80),
  mood: z.string().trim().min(4).max(120),
  /** ONLY names that literally appear in the chapter — may be empty */
  characters: z.array(z.string().trim().min(2).max(48)).max(6).default([]),
  body: z.string().trim().min(120),
  setting: z.string().trim().min(4).max(160),
  /** concrete sensory details grounded in this scene's passage */
  sensory: z.array(z.string().trim().min(3).max(60)).min(1).max(5),
  /** the emotional movement — what turns */
  movement: z.string().trim().min(4).max(200),
  /** recurring words/images that actually appear in the chapter */
  motifs: z.array(z.string().trim().min(3).max(32)).min(1).max(4),
  /** 1–3 verbatim source quotations with their paragraph references */
  anchors: z.array(AtlasAnchorSchema).min(1).max(3),
  /** optional: the narrative link forward, only when the text continues */
  thread: z.string().trim().min(8).max(220).optional(),
});

export const AtlasScenesSchema = z.object({
  scenes: z.array(AtlasSceneSchema).min(1).max(5),
});

/* ═══════════════════════════════════════════════════
   2. Grounding — verify every claim against the source
   ═══════════════════════════════════════════════════ */

/** Normalization for quote matching: Unicode NFC, curly punctuation to its
 *  ASCII counterpart, collapsed whitespace, case-folded. Pure. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Loose normalization — letters and digits only, single-spaced. Used as the
 *  second-tier match so a dropped comma or curly quote never rejects an
 *  otherwise-verbatim quotation. Still order-sensitive: reordered words do
 *  NOT match. */
function normalizeLoose(s: string): string {
  return normalizeForMatch(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Verify a claimed quotation against the chapter's chunks. Returns the
 *  chunk index the quote was actually found in (correcting a model's wrong
 *  paragraph citation), or null when the quote cannot be found verbatim —
 *  in which case it must be dropped, never displayed as evidence.
 *
 *  The hinted chunk is checked first (O(1) for the common honest case),
 *  then the whole chapter. Pure. */
export function verifyAnchorQuote(
  quote: string,
  chunks: readonly { text: string }[],
  hintChunkIndex: number,
): number | null {
  const nq = normalizeForMatch(quote);
  if (nq.length < 12) return null;
  const hinted = chunks[hintChunkIndex];
  if (hinted && normalizeForMatch(hinted.text).includes(nq)) {
    return hintChunkIndex;
  }
  const loose = normalizeLoose(quote);
  if (loose.length >= 12 && hinted && normalizeLoose(hinted.text).includes(loose)) {
    return hintChunkIndex;
  }
  for (let i = 0; i < chunks.length; i++) {
    if (i === hintChunkIndex) continue;
    const t = chunks[i]?.text ?? "";
    if (normalizeForMatch(t).includes(nq)) return i;
    if (loose.length >= 12 && normalizeLoose(t).includes(loose)) return i;
  }
  return null;
}

/** The grounding pass: takes a validated model scene (or any SceneDraft
 *  with claimed anchors) and the chapter's chunks, and returns a scene
 *  whose every displayed "from the text" claim survived verification.
 *
 *  - anchors: cited chunk corrected when the quote lives elsewhere;
 *    unverifiable quotes are dropped (never shown as evidence)
 *  - characters: only names actually present in the chapter survive
 *  - motifs: only words/images actually present in the chapter survive
 *  - art: derived deterministically from the scene's own content
 *  - grounded: true when at least one verified anchor remains
 *
 *  Pure — identical inputs give identical outputs. */
export function groundScene(
  scene: SceneDraft,
  chunks: readonly { text: string }[],
  chapterText: string,
): SceneDraft {
  const normChapter = normalizeForMatch(chapterText);
  const looseChapter = normalizeLoose(chapterText);

  const present = (s: string): boolean => {
    const n = normalizeForMatch(s);
    if (n.length < 2) return false;
    return normChapter.includes(n) || looseChapter.includes(normalizeLoose(s));
  };

  const anchors: SceneAnchor[] = [];
  for (const a of scene.anchors ?? []) {
    const found = verifyAnchorQuote(a.quote, chunks, a.chunkIndex);
    if (found !== null) anchors.push({ quote: a.quote, chunkIndex: found });
  }

  const characters = (scene.characters ?? []).filter((c) => present(c));
  const motifs = (scene.motifs ?? []).filter((m) => present(m));

  return {
    ...scene,
    characters,
    motifs: motifs.length ? motifs : scene.motifs?.length ? [] : undefined,
    anchors,
    grounded: anchors.length > 0,
    art: scene.art ?? artFor(scene),
  };
}

/* ═══════════════════════════════════════════════════
   3. Art derivation — a distinct plate per scene
   ═══════════════════════════════════════════════════ */

/** FNV-1a 32-bit string hash — deterministic across sessions and devices. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const PALETTES: { key: SceneArt["palette"]; test: RegExp }[] = [
  { key: "dawn", test: /dawn|morn|sun|gold|amber|cream|sunrise/ },
  { key: "night", test: /night|dark|midnight|shadow|gloom|moon|star/ },
  { key: "storm", test: /storm|rain|grey|gray|cold|winter|frost|wind|fog/ },
  { key: "ember", test: /dusk|sunset|ember|red|fire|blood|crimson|flame/ },
  { key: "forest", test: /forest|green|nature|spring|moss|leaf|wood|garden|tree/ },
  { key: "sea", test: /sea|ocean|water|aqua|river|shore|tide|harbor|boat/ },
  { key: "interior", test: /interior|indoors|lamp|candle|hearth|room|study|desk|fireplace/ },
];

/** Map a scene's mood/setting/sensory language to a palette family. The
 *  order encodes precedence (time-of-light cues beat generic warmth). */
export function scenePalette(text: string): SceneArt["palette"] {
  const t = (text || "").toLowerCase();
  for (const p of PALETTES) if (p.test.test(t)) return p.key;
  return "atlas";
}

/** Derive a scene's procedural plate parameters from its own content.
 *  Deterministic: same scene, same plate, across sessions and devices. */
export function artFor(scene: SceneDraft): SceneArt {
  const basis = [
    scene.mood,
    scene.setting ?? "",
    (scene.sensory ?? []).join(" "),
  ].join(" ");
  return {
    palette: scenePalette(basis),
    seed: hashString(`${scene.title}|${scene.body.slice(0, 160)}`),
  };
}

/* ═══════════════════════════════════════════════════
   4. Prompt helpers — stable chunk references for the model
   ═══════════════════════════════════════════════════ */

/** Render a chapter's chunks as paragraph-numbered text so the model can
 *  cite stable references: "[¶0] First paragraph…\n[¶1] …". The numbers are
 *  LOCAL chunk indices within the chapter — exactly what SceneAnchor
 *  .chunkIndex and the reader's jump math expect. Pure. */
export function numberedChunksText(
  chunks: readonly { text: string }[],
): string {
  return chunks.map((c, i) => `[¶${i}] ${c.text}`).join("\n\n");
}

/* ═══════════════════════════════════════════════════
   5. Offline bucketing — Anchor-engine scene spans
   ═══════════════════════════════════════════════════ */

/** Split a chapter's chunks into `sceneCount` contiguous buckets, balanced
 *  by character count so scenes cover equal spans of the actual text (not
 *  equal chunk counts, which vary wildly in size). Every chunk lands in
 *  exactly one bucket; empty buckets are dropped. Pure. */
export function bucketChunks<T extends { text: string }>(
  chunks: readonly T[],
  sceneCount: number,
): T[][] {
  if (!chunks.length || sceneCount < 1) return [];
  const total = chunks.reduce((a, c) => a + c.text.length, 0);
  const target = total / sceneCount;
  const buckets: T[][] = [];
  let cur: T[] = [];
  let acc = 0;
  for (const c of chunks) {
    cur.push(c);
    acc += c.text.length;
    // Close the bucket at the target — but never leave a trailing bucket
    // with less than half a target's worth of text (merge it back).
    if (acc >= target && buckets.length < sceneCount - 1) {
      buckets.push(cur);
      cur = [];
      acc = 0;
    }
  }
  if (cur.length) buckets.push(cur);
  return buckets.filter((b) => b.length > 0);
}

/** Sense lexicon for offline sensory extraction — every entry is a concrete
 *  sensory word; only words actually present in the text are ever shown. */
const SENSE_LEXICON = [
  "light", "lamp", "shadow", "candle", "flame", "fire", "smoke", "scent",
  "perfume", "smell", "sound", "voice", "silence", "whisper", "echo",
  "cold", "warmth", "heat", "chill", "wind", "rain", "mist", "fog",
  "dust", "damp", "salt", "bitter", "sweet", "darkness", "sunlight",
  "moonlight", "twilight", "noise", "footstep", "bell", "song", "cry",
] as const;

/** Extract the sensory words genuinely present in a text (word-boundary,
 *  case-insensitive). Max `max` entries, first-seen order. Pure. */
export function extractSensoryWords(text: string, max = 4): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  for (const w of SENSE_LEXICON) {
    if (found.length >= max) break;
    if (new RegExp(`\\b${w}\\b`).test(t)) found.push(w);
  }
  return found;
}

/** Extract a locative opening for the offline `setting` field: the first
 *  short sentence that begins by placing the action ("In the…", "At the…").
 *  Returns null when the text offers no such placement — the field is then
 *  simply omitted rather than invented. Pure. */
export function extractSetting(text: string): string | null {
  const m = text.match(
    /^(?:In|At|On|Inside|Beyond|Under|Beside|Near|Above|Across|Within)\s+(?:the|a|an|his|her|their|its)\b[^\n.!?]{6,140}[.!?]/im,
  );
  const s = m?.[0]?.trim();
  return s && s.length >= 10 ? s : null;
}

/* ═══════════════════════════════════════════════════
   6. Cache keys — versioned, purge-compatible
   ═══════════════════════════════════════════════════ */

/** Scene Atlas cache key (v3 — the grounded, anchor-carrying shape). Keyed
 *  on document content (updatedAt), variation salt and the Ankaa route
 *  epoch, so content edits, re-rolls and model-routing changes each
 *  invalidate exactly what they should. The `:${docId}:` segment keeps
 *  cachePurgeDoc able to orphan these on document deletion. */
export function scenes3Key(
  docId: string,
  chapterIndex: number,
  updatedAt: number,
  salt: number,
  epoch: string,
): string {
  return `scenes3:${docId}:${chapterIndex}:${updatedAt}:${salt}:${epoch}`;
}

/** Legacy (pre-atlas) cache key — probed read-only when a v3 key misses, so
 *  users who cached scenes before the upgrade keep them. */
export function scenes2Key(
  docId: string,
  chapterIndex: number,
  updatedAt: number,
  salt: number,
  epoch: string,
): string {
  return `scenes2:${docId}:${chapterIndex}:${updatedAt}:${salt}:${epoch}`;
}

/* ═══════════════════════════════════════════════════
   7. Presentation helpers
   ═══════════════════════════════════════════════════ */

/** Post-process scene cards so no two scenes in a single set share a title.
 *  If the model returned duplicates, the second+ occurrence gets a
 *  roman-numeral suffix ("The Door" → "The Door — II"). Comparison is
 *  case-insensitive, trims whitespace, and strips pre-existing roman
 *  suffixes before counting. Pure. */
export function dedupeSceneTitles(scenes: SceneDraft[]): SceneDraft[] {
  const seen = new Map<string, number>();
  const numerals = [
    "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  ];
  return scenes.map((s) => {
    const base = s.title.replace(/\s+—\s+[IVXLC]+$/, "").trim();
    const key = base.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) {
      const suffix = numerals[n - 1] ?? String(n);
      return { ...s, title: `${base} — ${suffix}` };
    }
    return s;
  });
}

/** Roman numerals for scene ordinals — the atlas's plate numbering. */
export function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = Math.max(1, Math.min(39, Math.floor(n)));
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

/** Clamp an anchor's chunk reference into the chapter's valid local range —
 *  the math behind "Open at this passage" navigation. Pure. */
export function clampAnchorChunk(
  anchor: SceneAnchor,
  chunkCount: number,
): number {
  if (chunkCount <= 0) return 0;
  return Math.max(0, Math.min(chunkCount - 1, anchor.chunkIndex));
}

/** Aggregate motif frequencies across a set of scenes — the chapter's motif
 *  index, used by the motif-exploration strip. Only scenes that carry
 *  verified motifs contribute. Pure. */
export function motifIndex(
  scenes: readonly SceneDraft[],
): { motif: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of scenes) {
    for (const m of s.motifs ?? []) {
      const key = m.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([motif, count]) => ({ motif, count }))
    .sort((a, b) => b.count - a.count || a.motif.localeCompare(b.motif));
}

/** Type-only re-export so callers can build Chunk arrays without importing
 *  the whole domain module. */
export type { Chunk };
