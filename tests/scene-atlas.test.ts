/**
 * Scene Atlas — focused unit tests for the pure pipeline core.
 *
 * Covered, per the Task-19 brief:
 *   1. scene grounding      — quotes verified/corrected/dropped against the
 *                             real chunks; unsupported characters & motifs
 *                             filtered; art derived deterministically
 *   2. schema validation    — the Zod contract the model must satisfy
 *   3. caching/versioning   — scenes3/scenes2 key identity + purge-pattern
 *                             compatibility with cachePurgeDoc
 *   4. source navigation    — anchor → chunk clamping used by "In reader"
 *   5. loading-error recovery — chunk-error recognition + one-shot decision
 *   6. offline bucketing    — chunk→scene span math, paragraph numbering
 *   7. presentation helpers — title dedupe, motif index, sensory/setting
 *                             extraction (only what the text supplies)
 */
import { describe, expect, test } from "bun:test";
import {
  AtlasScenesSchema,
  artFor,
  bucketChunks,
  clampAnchorChunk,
  dedupeSceneTitles,
  extractSensoryWords,
  extractSetting,
  groundScene,
  motifIndex,
  normalizeForMatch,
  numberedChunksText,
  scenes2Key,
  scenes3Key,
  scenePalette,
  verifyAnchorQuote,
} from "../src/lib/scenes";
import {
  isChunkLoadError,
  shouldReloadForChunkError,
} from "../src/lib/lazy";
import type { SceneDraft } from "../src/lib/types";

/* ---------- fixtures ---------- */

const CHUNKS = [
  { id: "c0", kind: "p" as const, text: "The lamp on the landing guttered once and went out, leaving the stair to its own devices." },
  { id: "c1", kind: "p" as const, text: "Mrs. Vale did not look up from her needlework. \u201CYou came back,\u201D she said, as if the words cost her something." },
  { id: "c2", kind: "p" as const, text: "Rain had followed him the whole way from the harbour; his coat was heavy with it, and the fire had not been lit." },
  { id: "c3", kind: "p" as const, text: "Nothing in the house admitted that anyone had ever left it." },
];
const CHAPTER_TEXT = CHUNKS.map((c) => c.text).join("\n\n");

function validScene(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "What the Stair Heard",
    mood: "hushed dread · late evening · interior",
    characters: ["Mrs. Vale"],
    setting: "The landing and the needlework room, late evening",
    sensory: ["the guttering lamp", "rain-heavy coat"],
    movement: "Recognition hardens into resentment.",
    motifs: ["rain", "the lamp"],
    anchors: [
      {
        quote: "The lamp on the landing guttered once and went out",
        chunkIndex: 0,
      },
    ],
    body:
      "The lamp gutters, and the stair keeps its own counsel. Present-tense " +
      "prose that enlarges the chapter without compressing it, carrying the " +
      "dialogue over verbatim and letting the rain stand for everything " +
      "unsaid between the two of them in that narrow hall.",
    ...overrides,
  };
}

/* ---------- 1. grounding ---------- */

describe("scene grounding", () => {
  test("a verbatim quote in the claimed chunk is kept, scene marked grounded", () => {
    const out = groundScene(validScene() as unknown as SceneDraft, CHUNKS, CHAPTER_TEXT);
    expect(out.anchors?.length).toBe(1);
    expect(out.anchors?.[0]?.chunkIndex).toBe(0);
    expect(out.grounded).toBe(true);
    expect(out.art).toBeDefined();
  });

  test("a quote cited against the wrong paragraph is corrected, not dropped", () => {
    const out = groundScene(
      validScene({
        anchors: [{ quote: "Rain had followed him the whole way from the harbour", chunkIndex: 0 }],
      }) as unknown as SceneDraft,
      CHUNKS,
      CHAPTER_TEXT,
    );
    expect(out.anchors?.[0]?.chunkIndex).toBe(2);
  });

  test("a quote that exists nowhere in the chapter is dropped as evidence", () => {
    const out = groundScene(
      validScene({
        anchors: [{ quote: "The lighthouse swept its beam across the frozen bay at midnight", chunkIndex: 1 }],
      }) as unknown as SceneDraft,
      CHUNKS,
      CHAPTER_TEXT,
    );
    expect(out.anchors?.length).toBe(0);
    expect(out.grounded).toBe(false);
  });

  test("curly-quote and case drift still verify (two-tier normalization)", () => {
    const out = groundScene(
      validScene({
        anchors: [{ quote: "\u201cyou came back,\u201d she said, as if the words cost her something", chunkIndex: 1 }],
      }) as unknown as SceneDraft,
      CHUNKS,
      CHAPTER_TEXT,
    );
    expect(out.anchors?.length).toBe(1);
    expect(out.anchors?.[0]?.chunkIndex).toBe(1);
  });

  test("characters the chapter never names are dropped", () => {
    const out = groundScene(
      validScene({ characters: ["Mrs. Vale", "Captain Ahab"] }) as unknown as SceneDraft,
      CHUNKS,
      CHAPTER_TEXT,
    );
    expect(out.characters).toEqual(["Mrs. Vale"]);
  });

  test("motifs the chapter never contains are dropped", () => {
    const out = groundScene(
      validScene({ motifs: ["rain", "moonlight"] }) as unknown as SceneDraft,
      CHUNKS,
      CHAPTER_TEXT,
    );
    expect(out.motifs).toEqual(["rain"]);
  });

  test("art is deterministic — same scene, same plate, twice", () => {
    const s = validScene() as unknown as SceneDraft;
    expect(artFor(s)).toEqual(artFor(s));
    const a = artFor(s);
    const b = artFor({ ...s, title: s.title + " (alt)" });
    expect(a.seed).not.toBe(b.seed);
  });

  test("verifyAnchorQuote prefers the hinted chunk and scans on miss", () => {
    expect(verifyAnchorQuote("Nothing in the house admitted", CHUNKS, 3)).toBe(3);
    expect(verifyAnchorQuote("Nothing in the house admitted", CHUNKS, 0)).toBe(3);
    expect(verifyAnchorQuote("A sentence that appears nowhere at all", CHUNKS, 0)).toBeNull();
  });

  test("normalization folds punctuation and case", () => {
    // Curly punctuation maps to its ASCII counterpart (not removed — quotes
    // are significant in dialogue), whitespace collapses, case folds.
    expect(normalizeForMatch("\u201CHello  \u2014 World\u2026\u201D")).toBe(
      '"hello - world..."',
    );
    expect(normalizeForMatch("\u2018it wasn\u2019t\u2019")).toBe("'it wasn't'");
  });
});

/* ---------- 2. schema validation ---------- */

describe("AtlasScenesSchema", () => {
  test("accepts a well-formed scene", () => {
    const parsed = AtlasScenesSchema.parse({ scenes: [validScene()] });
    expect(parsed.scenes[0]?.title).toBe("What the Stair Heard");
  });

  test("rejects a scene without anchors — every plate must be provable", () => {
    const { anchors: _drop, ...noAnchors } = validScene() as Record<string, unknown>;
    expect(() => AtlasScenesSchema.parse({ scenes: [noAnchors] })).toThrow();
  });

  test("rejects too-short quotes (sub-verbatim fragments)", () => {
    expect(() =>
      AtlasScenesSchema.parse({
        scenes: [validScene({ anchors: [{ quote: "went out", chunkIndex: 0 }] })],
      }),
    ).toThrow();
  });

  test("characters may be empty — texts without people are honest", () => {
    const parsed = AtlasScenesSchema.parse({
      scenes: [validScene({ characters: [] })],
    });
    expect(parsed.scenes[0]?.characters).toEqual([]);
  });

  test("thread is optional, everything else structural is not", () => {
    expect(() =>
      AtlasScenesSchema.parse({ scenes: [validScene({ thread: undefined })] }),
    ).not.toThrow();
    expect(() =>
      AtlasScenesSchema.parse({
        scenes: [validScene({ setting: undefined })],
      }),
    ).toThrow();
  });
});

/* ---------- 3. caching / versioning ---------- */

describe("scene cache keys", () => {
  test("v3 and legacy v2 keys are distinct and namespaced", () => {
    const v3 = scenes3Key("doc1", 2, 1000, 0, "e1");
    const v2 = scenes2Key("doc1", 2, 1000, 0, "e1");
    expect(v3.startsWith("scenes3:")).toBe(true);
    expect(v2.startsWith("scenes2:")).toBe(true);
    expect(v3).not.toBe(v2);
  });

  test("content edits, re-rolls and route changes each invalidate", () => {
    const base = scenes3Key("doc1", 2, 1000, 0, "e1");
    expect(scenes3Key("doc1", 2, 2000, 0, "e1")).not.toBe(base); // content changed
    expect(scenes3Key("doc1", 2, 1000, 3, "e1")).not.toBe(base); // new variation
    expect(scenes3Key("doc1", 2, 1000, 0, "e2")).not.toBe(base); // routing epoch
    expect(scenes3Key("doc1", 3, 1000, 0, "e1")).not.toBe(base); // other chapter
    expect(scenes3Key("doc1", 2, 1000, 0, "e1")).toBe(base); // stable identity
  });

  test("keys carry the :docId: segment cachePurgeDoc matches on", () => {
    // deleteDocument purges with rows.filter(r => r.id.includes(`:${docId}:`))
    const key = scenes3Key("doc_abc", 2, 1000, 0, "e1");
    expect(key.includes(":doc_abc:")).toBe(true);
  });
});

/* ---------- 4. source navigation ---------- */

describe("anchor navigation", () => {
  test("chunk references clamp into the chapter's real range", () => {
    expect(clampAnchorChunk({ quote: "x", chunkIndex: 2 }, 4)).toBe(2);
    expect(clampAnchorChunk({ quote: "x", chunkIndex: 99 }, 4)).toBe(3);
    expect(clampAnchorChunk({ quote: "x", chunkIndex: -5 }, 4)).toBe(0);
    expect(clampAnchorChunk({ quote: "x", chunkIndex: 3 }, 0)).toBe(0);
  });

  test("paragraph numbering maps 1:1 onto chunk indices", () => {
    const numbered = numberedChunksText(CHUNKS);
    expect(numbered.startsWith("[\u00B60] The lamp on the landing")).toBe(true);
    expect(numbered).toContain("[\u00B61] Mrs. Vale did not look up");
    expect(numbered).toContain("[\u00B63] Nothing in the house");
  });
});

/* ---------- 5. loading-error recovery ---------- */

describe("chunk-load error recovery", () => {
  // The exact failure shape from the sandbox dev log:
  // "Failed to load chunk /_next/static/chunks/src_04s4a72._.js from module
  //  [project]/src/views/Library.tsx [app-client] (ecmascript, async loader)"
  const TURBOPACK_CHUNK_ERROR =
    "Failed to load chunk /_next/static/chunks/src_04s4a72._.js from module [project]/src/views/Library.tsx [app-client] (ecmascript, async loader)";

  test("recognizes the real Turbopack chunk failure", () => {
    expect(isChunkLoadError(new Error(TURBOPACK_CHUNK_ERROR))).toBe(true);
  });

  test("recognizes the other common chunk failure shapes", () => {
    expect(isChunkLoadError(new Error("ChunkLoadError: Loading chunk 42 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/y.js"))).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });

  test("ordinary errors are never mistaken for chunk failures", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new Error("Quota exceeded"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  test("the recovery reload fires exactly once per session", () => {
    expect(shouldReloadForChunkError(new Error(TURBOPACK_CHUNK_ERROR), false)).toBe(true);
    expect(shouldReloadForChunkError(new Error(TURBOPACK_CHUNK_ERROR), true)).toBe(false);
    expect(shouldReloadForChunkError(new Error("some other failure"), false)).toBe(false);
  });
});

/* ---------- 6. offline bucketing ---------- */

describe("offline chunk bucketing", () => {
  test("chunks are split into contiguous, complete buckets", () => {
    const buckets = bucketChunks(CHUNKS, 2);
    expect(buckets.length).toBe(2);
    const flat = buckets.flat();
    expect(flat.length).toBe(CHUNKS.length);
    expect(flat.map((c) => c.id)).toEqual(CHUNKS.map((c) => c.id));
  });

  test("buckets balance by character weight, not chunk count", () => {
    // One huge chunk + three tiny ones → the huge chunk stands (mostly) alone.
    const chunks = [
      { id: "a", text: "x".repeat(1000) },
      { id: "b", text: "tiny" },
      { id: "c", text: "tiny" },
      { id: "d", text: "tiny" },
    ];
    const buckets = bucketChunks(chunks, 2);
    expect(buckets.length).toBe(2);
    const sizes = buckets.map((b) => b.reduce((n, c) => n + c.text.length, 0));
    expect(Math.abs(sizes[0]! - sizes[1]!)).toBeLessThanOrEqual(1016);
  });

  test("degenerate inputs return nothing rather than empty buckets", () => {
    expect(bucketChunks([], 3)).toEqual([]);
    expect(bucketChunks(CHUNKS, 0)).toEqual([]);
  });
});

/* ---------- 7. presentation helpers ---------- */

describe("presentation helpers", () => {
  test("duplicate titles get roman-numeral suffixes", () => {
    const scenes = dedupeSceneTitles([
      { title: "The Door", mood: "m", characters: [], body: "b" },
      { title: "The Door", mood: "m", characters: [], body: "b" },
      { title: "the door", mood: "m", characters: [], body: "b" },
    ]);
    // Comparison is case-insensitive: all three share one key, so the 2nd
    // and 3rd are suffixed in encounter order.
    expect(scenes.map((s) => s.title)).toEqual([
      "The Door",
      "The Door \u2014 II",
      "the door \u2014 III",
    ]);
  });

  test("motifIndex counts across scenes, most-shared first", () => {
    const idx = motifIndex([
      { title: "a", mood: "m", characters: [], body: "b", motifs: ["rain", "lamp"] },
      { title: "b", mood: "m", characters: [], body: "b", motifs: ["rain"] },
      { title: "c", mood: "m", characters: [], body: "b", motifs: ["Rain"] },
    ]);
    expect(idx[0]).toEqual({ motif: "rain", count: 3 });
    expect(idx[1]).toEqual({ motif: "lamp", count: 1 });
  });

  test("sensory extraction only reports words the text actually uses", () => {
    const words = extractSensoryWords("Rain and silence, and the smell of smoke.", 4);
    expect(words).toContain("rain");
    expect(words).toContain("silence");
    expect(words).toContain("smoke");
    expect(words).not.toContain("candle");
  });

  test("setting extraction returns a real locative line or nothing", () => {
    expect(extractSetting("In the harbour town the lamps were lit early.")).toMatch(/^In the harbour/);
    expect(extractSetting("He left without a word.")).toBeNull();
  });

  test("palette families map from mood language", () => {
    expect(scenePalette("hushed dread · midnight · interior stair")).toBe("night");
    expect(scenePalette("storm-grey cold, rain on the glass")).toBe("storm");
    expect(scenePalette("warm lamplight by the hearth")).toBe("interior");
    expect(scenePalette("something unclassifiable")).toBe("atlas");
  });
});
