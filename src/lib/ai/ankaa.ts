import { z } from "zod";
import type { AnkaaMode, DocumentRow, DocWithContent } from "../types";
import { logUsage } from "../data";
import { aiConfiguredFor } from "../meridian";
import { rollCreativeDevices } from "../prompts";
import { docText, wordCount } from "../loa/doc-utils";
import { offlineAnkaaLong } from "../loa/longform";
import {
  AiUnavailable,
  aiRequest,
  extractJson,
  offlineReasonOf,
  requestValidatedJson,
  type Msg,
  type OfflineReason,
} from "./core";

/* ================= Ankaa — long-form agent ================= */

export const ANKAA_SECTIONS = 5;

/** Length tiers for Ankaa drafts. Drives section count, per-section word
 *  targets and token budgets so a short prompt ("a scene about a lamp")
 *  produces ~400 words, while a long prompt or a source-document continuation
 *  warrants the full ~2,500-word five-section treatment. */
export type AnkaaDepth = "short" | "medium" | "long";

/** Number of writing sections Ankaa produces for a given depth. */
export function ankaaSectionsFor(depth: AnkaaDepth = "long"): number {
  return depth === "short" ? 2 : depth === "medium" ? 3 : ANKAA_SECTIONS;
}

/** Per-section word target + token budget per depth. */
const DEPTH_PROFILE: Record<
  AnkaaDepth,
  { wordsMin: number; wordsMax: number; maxTokens: number }
> = {
  short: { wordsMin: 180, wordsMax: 280, maxTokens: 500 },
  medium: { wordsMin: 300, wordsMax: 420, maxTokens: 700 },
  long: { wordsMin: 420, wordsMax: 560, maxTokens: 950 },
};

/** Detect how long a draft the user's prompt warrants.
 *
 *  - **short** (~400-600 words, 2 sections): very terse prompt (<40 chars)
 *    OR explicit short-form cue words ("short", "brief", "scene", "moment",
 *    "flash", "vignette", "drabble", "paragraph").
 *  - **long** (~2000-2800 words, 5 sections): long prompt (>120 chars), OR
 *    explicit long-form cue words ("novel", "novella", "epic", "saga",
 *    "long", "detailed", "full", "comprehensive"), OR a source document is
 *    attached — continuing a book warrants long-form.
 *  - **medium** (~1000-1500 words, 3 sections): everything in between, or
 *    prompts mentioning "chapter", "story", "tale", "episode". */
export function detectDepth(
  prompt: string,
  doc: DocumentRow | null,
): AnkaaDepth {
  // Source document attached → continuing a book warrants long-form.
  if (doc !== null) return "long";
  const p = prompt.trim();
  const q = p.toLowerCase();
  // Long-form cue words win, even on short prompts ("write a long essay on X").
  if (
    /\b(novel|novella|epic|saga|long(?:\s+-?\s*form)?|detailed|full|comprehensive|extended|in-depth)\b/.test(
      q,
    )
  )
    return "long";
  // Short-form cue words.
  if (
    /\b(short|brief|scene|moment|flash|vignette|drabble|paragraph|sketch)\b/.test(
      q,
    )
  )
    return "short";
  // Length-based fallback.
  if (p.length < 40) return "short";
  if (p.length > 120) return "long";
  // Mid-range: "chapter", "story", "tale", "episode" tip toward medium.
  return "medium";
}

/** Build the step list Ankaa reports through the progress UI. The list
 *  matches the section count for the given depth so the progress bar stays
 *  accurate (no orphaned or missing steps). Defaults to "long" so existing
 *  callers that don't pass a depth see the original 5-section behaviour. */
export function ankaaSteps(depth: AnkaaDepth = "long"): string[] {
  const sections = ankaaSectionsFor(depth);
  return [
    "Reading the room",
    "Sketching the outline",
    ...Array.from(
      { length: sections },
      (_, i) => `Writing section ${i + 1} of ${sections}`,
    ),
    "Binding the pages",
  ];
}

const OutlineSchema = z.object({
  title: z.string().min(2),
  logline: z.string().min(10),
  beats: z.array(z.string()).min(3),
});

export interface AnkaaResult {
  title: string;
  body: string;
  offline: boolean;
  model?: string;
  /** why the Anchor engine served, when it did */
  reason?: OfflineReason;
  words: number;
}

/** Long-form pipeline: outline → N section calls with rolling context → bind.
 *  Section count and per-section word targets scale with `depth` so a short
 *  prompt produces ~400 words (2 sections) while a long prompt or a source
 *  document warrants the full ~2,500-word five-section treatment. Online
 *  drafts respect the depth; the Anchor engine respects it too. */
export async function runAnkaaLong(
  mode: AnkaaMode,
  prompt: string,
  doc: DocWithContent | null,
  report: (stepIndex: number, fraction: number, words: number) => void,
  nonce = Math.floor(Math.random() * 1_000_000_000),
  depth: AnkaaDepth = "long",
): Promise<AnkaaResult> {
  const sections = ankaaSectionsFor(depth);
  const steps = ankaaSteps(depth);
  const profile = DEPTH_PROFILE[depth];
  /* One seeded roll of narrative devices per draft (pov, tense, mood, device,
     motif, constraint). The same roll shapes every section so the draft holds
     one voice; a different draft (new nonce) tells the story differently. */
  const devices = rollCreativeDevices(nonce);
  const t0 = performance.now();
  const docId = doc?.id ?? null;
  const tick = (i: number, f: number, words = 0) => report(i, f, words);

  tick(0, 0.2);
  await new Promise((r) => setTimeout(r, 300));

  let reason: OfflineReason = "no-key";
  if (aiConfiguredFor("ankaa")) {
    try {
      const ctx = doc ? docText(doc).slice(-9000) : "";
      const modeBrief: Record<AnkaaMode, string> = {
        continue: "continue the story seamlessly from where the text ends",
        alternate:
          "rewrite the ending from its last turning point, taking the other fork",
        chapter: "write the next chapter as if it always belonged to the book",
        lore: "write the world's hidden histories — lore the text only implies",
        children:
          "retell the story for children, gently, without condescension",
        whatif:
          "explore a what-if: one small hinge changed, and the consequences",
      };
      // 1 — outline. The writer's request is DIRECTION, not dialogue: its
      //    characters, places, events and tone must drive the plot, but the
      //    request itself must NEVER appear in the output — no quoting, no
      //    meta-references, no "the thread you asked for", no breaking the
      //    fourth wall. The story reads as if the writer's request never existed
      //    as text; only its creative intent lives in the narrative.
      tick(1, 0.15);
      const canon = prompt.trim()
        ? `WRITER'S DIRECTION (private — never quote or reference this in the output): "${prompt.trim()}". Use its characters, places, events and tone as creative direction to shape the plot and atmosphere. Derive the beats from this direction. The final story must read as if this direction was never written down — no meta-commentary, no "as you asked", no breaking the fourth wall.`
        : "";
      const outlineMsgs: Msg[] = [
        {
          role: "system",
          content: `You are Ankaa, a literary long-form agent. Respond ONLY with JSON: {"title": string, "logline": string, "beats": string[${sections}]} — exactly ${sections} beats, each one sentence. The title must be evocative and specific to THIS story (not generic like "A New Beginning"); draw it from the writer's direction. ${canon}`,
        },
        {
          role: "user",
          content: `Mode: ${modeBrief[mode]}. ${doc ? `Source text (ending shown last):\n<<<${ctx}>>>` : "No source text — write an original story."}`,
        },
      ];
      const outlineRes = await requestValidatedJson(
        "ankaa",
        `outline:${mode}`,
        outlineMsgs,
        (r) => OutlineSchema.parse(extractJson(r)),
        docId,
        700,
      );
      const outline = outlineRes.data as z.infer<typeof OutlineSchema>;
      const beats = outline.beats.slice(0, sections);
      while (beats.length < sections)
        beats.push(`Deepen the consequences of what came before.`);

      // 2..N — sections with rolling context. The writer's direction is passed
      //    as a reminder but the model is explicitly forbidden from quoting it
      //    or referencing it meta-textually in the prose.
      const parts: string[] = [];
      let written = "";
      let servedBy: string | undefined;
      for (let i = 0; i < beats.length; i++) {
        tick(2 + i, 0.05, wordCount(written));
        const tail = written.slice(-3200);
        const raw = await aiRequest(
          "ankaa",
          `section:${i + 1}`,
          [
            {
              role: "system",
              content:
                `You are Ankaa writing section ${i + 1}/${beats.length} of “${outline.title}” (${modeBrief[mode]}). ` +
                `Write ${profile.wordsMin}-${profile.wordsMax} words: 3-5 paragraphs of rich literary prose. No headings, no meta-commentary, no "in this section". ` +
                `Anti-repetition rule: vary sentence openings and lengths; never reuse an image, phrase or syntactic pattern from an earlier section; give each section its own texture and a fresh first line. ` +
                devices.instructions +
                " " +
                (canon ? canon + " " : "") +
                `FORBIDDEN: never quote the writer's direction, never reference "the thread you asked for", never break the fourth wall, never include any meta-text about the request itself. The prose must read as pure story. ` +
                (i === beats.length - 1
                  ? `This is the final section — land the ending with weight.`
                  : `Leave room for what follows.`),
            },
            {
              role: "user",
              content: `Logline: ${outline.logline}\nThis section's beat: ${beats[i]}\n${tail ? `Immediately preceding prose:\n<<<${tail}>>>\n` : ""}Write the section now.`,
            },
          ],
          docId,
          profile.maxTokens,
          (m) => {
            servedBy = m;
          },
        );
        written += (written ? "\n\n" : "") + raw.trim();
        parts.push(raw.trim());
        tick(2 + i, 0.95, wordCount(written));
      }

      tick(steps.length - 1, 1, wordCount(written));
      await new Promise((r) => setTimeout(r, 250));
      const title = doc ? `${doc.title} — ${outline.title}` : outline.title;
      return {
        title,
        body: written,
        offline: false,
        model: servedBy,
        words: wordCount(written),
      };
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      // provider hiccup mid-draft → Anchor engine still delivers a full draft
      reason = offlineReasonOf(e);
    }
  }

  // offline long-form with visible progress
  const out = offlineAnkaaLong(mode, doc, prompt, nonce, depth);
  const paras = out.body.split("\n\n");
  let acc = "";
  for (let i = 0; i < paras.length; i++) {
    acc += (acc ? "\n\n" : "") + paras[i];
    const stepIdx = Math.min(
      steps.length - 2,
      2 + Math.floor((i / paras.length) * sections),
    );
    tick(stepIdx, (i + 1) / paras.length, wordCount(acc));
    await new Promise((r) => setTimeout(r, 130));
  }
  tick(steps.length - 1, 1, wordCount(out.body));
  await new Promise((r) => setTimeout(r, 220));
  void logUsage(
    "ankaa",
    "longform",
    Math.round(out.body.length / 4),
    Math.round(performance.now() - t0),
    "offline",
    docId,
  );
  return { ...out, offline: true, reason, words: wordCount(out.body) };
}
