import { z } from "zod";
import type { ParsedDoc } from "../types";
import { logUsage } from "../data";
import { getPrefs } from "../store";
import { toChapters } from "../engine";
import { aiConfiguredFor } from "../meridian";
import { extractJson, requestValidatedJson, type Msg } from "./core";

/* ================= AI-enhanced structure refinement (import pipeline) =================
   After the Anchor parser has done its deterministic work, an optional AI pass
   re-checks chapter boundaries (Arabic AND Roman numerals, "Chapter",
   "Part"), mends paragraph breaks and gives every speaker's dialogue its
   own paragraph. Text is preserved verbatim — a safeguard refuses any
   result that lost more than 8% of the words. */

const StructureSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().min(1),
        paragraphs: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

/** The complete precondition for sending imported text to a provider:
 *  a key, the refinement toggle, AND an explicit recorded consent grant.
 *  Exported for tests — this is the architectural consent gate. */
export function refinementAllowed(): boolean {
  return (
    aiConfiguredFor("ouro") &&
    getPrefs().aiRefine &&
    getPrefs().aiRefineConsent === "granted"
  );
}

export async function refineStructure(
  parsed: ParsedDoc,
): Promise<{ parsed: ParsedDoc; refined: boolean }> {
  if (!refinementAllowed()) return { parsed, refined: false };
  // Skip AI refinement for very long documents: the 30k-char context window
  // means we'd only see the opening, and the 92% word-count safeguard would
  // reject the result anyway (the slice's word count << the full doc's).
  // Better to skip silently than waste a network call that's destined to no-op.
  const fullLen = parsed.chapters.reduce(
    (a, c) => a + c.chunks.reduce((b, k) => b + k.text.length, 0),
    0,
  );
  if (fullLen > 30000) return { parsed, refined: false };
  const t0 = performance.now();
  try {
    const plain = parsed.chapters
      .map((c) => `# ${c.title}\n${c.chunks.map((k) => k.text).join("\n\n")}`)
      .join("\n\n")
      .slice(0, 30000);
    const msgs: Msg[] = [
      {
        role: "system",
        content:
          `You are a book-structure engine. Fix chapter boundaries and paragraphing ONLY — preserve every word of the text (no abridging, no rewriting, no translation). ` +
          `Recognize chapter numbering in all forms (Arabic "7.", Roman "IV.", "Chapter", "Part"). Start a new paragraph whenever a new speaker's dialogue begins. ` +
          `Merge lines that are one broken paragraph; never merge separate paragraphs. Respond ONLY with JSON: {"chapters":[{"title":string,"paragraphs":string[]}]}.`,
      },
      { role: "user", content: plain },
    ];
    // One parse: the validate callback inside requestValidatedJson already
    // runs StructureSchema.parse (and one repair round); an outer re-parse
    // would validate the same data twice for nothing.
    const refined = await requestValidatedJson(
      "ouro",
      "refine",
      msgs,
      (r) => StructureSchema.parse(extractJson(r)),
      null,
      4000,
    );
    const data = refined.data as z.infer<typeof StructureSchema>;
    const chapters = toChapters(
      data.chapters.map((c) => ({ title: c.title, paras: c.paragraphs })),
    );
    const text = chapters
      .flatMap((c) => c.chunks.map((k) => k.text))
      .join("\n\n");
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < parsed.wordCount * 0.92) {
      // refinement lost text — keep the deterministic parse
      return { parsed, refined: false };
    }
    return {
      parsed: { ...parsed, chapters, wordCount: words, charCount: text.length },
      refined: true,
    };
  } catch {
    // Any refinement failure (including AiUnavailable with no key) keeps
    // the deterministic parse — the branches used to be identical.
    void logUsage(
      "ouro",
      "refine",
      0,
      Math.round(performance.now() - t0),
      "error",
      null,
    );
    return { parsed, refined: false };
  }
}
