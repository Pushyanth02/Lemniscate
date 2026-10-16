import type { DocWithContent } from "../types";
import { clamp } from "../utils";

/* ═══════════════════════════════════════════════════
   16. Helpers
   ═══════════════════════════════════════════════════ */

export function docText(doc: DocWithContent): string {
  return doc.contentJson.chapters
    .flatMap((c) => c.chunks.map((k) => k.text))
    .join("\n\n");
}

export function chapterText(doc: DocWithContent, chapterIndex: number): string {
  const ch =
    doc.contentJson.chapters[
      clamp(chapterIndex, 0, doc.contentJson.chapters.length - 1)
    ];
  return ch ? ch.chunks.map((c) => c.text).join("\n\n") : "";
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    // Divide by 2^32 (not 2^32-1) so the result is always in [0, 1) —
    // dividing by 0xffffffff can return exactly 1.0 when s === 0xffffffff,
    // which would make Math.floor(rnd() * arr.length) === arr.length (out of
    // bounds) and cause pick() to return undefined.
    return s / 0x100000000;
  };
}

/** Truncate to N words with an ellipsis. */
export function truncateWords(s: string, n: number): string {
  const w = s.split(/\s+/);
  return w.length > n ? w.slice(0, n).join(" ") + "…" : s;
}
