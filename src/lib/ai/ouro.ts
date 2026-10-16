import { z } from "zod";
import type { DocWithContent, QuizQuestion } from "../types";
import { clamp } from "../utils";
import { logUsage } from "../data";
import { aiConfiguredFor, routeEpoch } from "../meridian";
import { cacheSwrGet, cacheSet, cachePeek, DAY, HOUR } from "../cache";
import { MASTER_STUDY } from "../prompts";
import { sentences } from "../loa/tokenize";
import { freqMap, topKeywords } from "../loa/keywords";
import { extractiveSummary } from "../loa/summarize";
import { findCharacters } from "../loa/characters";
import { cap, chapterText, docText, truncateWords } from "../loa/doc-utils";
import { clozeQuiz } from "../loa/quiz";
import { buildStudy } from "../loa/analysis";
import {
  AiUnavailable,
  extractJson,
  offlineReasonOf,
  requestValidatedJson,
  type Msg,
  type OfflineReason,
} from "./core";

/* ================= Ouro — academic study companion ================= */

const StudySchema = z.object({
  summary: z.string().min(20),
  guide: z.array(z.string()).min(1),
  themes: z.array(z.object({ name: z.string(), note: z.string() })),
  characters: z.array(z.object({ name: z.string(), note: z.string() })),
  vocab: z.array(z.object({ term: z.string(), context: z.string() })),
  quiz: z.array(
    z.object({
      q: z.string(),
      options: z.array(z.string()).min(3),
      answer: z.number().int().min(0).max(9),
      why: z.string(),
    }),
  ),
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
  objectives: z.array(z.string()).optional(),
  essays: z.array(z.string()).optional(),
});

/* ---------- task-based study artifacts ----------
   Ouro no longer dumps one giant set: the reader asks for what they need
   (summary, quiz, guide, …) and gets a focused, cached artifact. Chapter
   scope reads closely; whole-text scope builds arc-level material — the
   two are generated from different inputs and read distinctly. */

export type OuroTask =
  | "summary"
  | "quiz"
  | "guide"
  | "themes"
  | "vocab"
  | "essays"
  | "full";

export interface OuroArtifact {
  task: OuroTask;
  scope: "chapter" | "whole";
  title: string;
  body: string; // markdown-lite (**bold**, "- " bullets, "> " quotes)
  quiz?: QuizQuestion[];
  offline: boolean;
  model?: string;
  /** why the Anchor engine served, when it did */
  reason?: OfflineReason;
}

const TASK_SCHEMA: Partial<Record<OuroTask, z.ZodTypeAny>> = {
  summary: z.object({ summary: z.string().min(40) }),
  quiz: z.object({
    quiz: z
      .array(
        z.object({
          q: z.string(),
          options: z.array(z.string()).min(3),
          answer: z.number().int().min(0).max(9),
          why: z.string(),
        }),
      )
      .min(3),
  }),
  guide: z.object({
    guide: z.array(z.string()).min(3),
    objectives: z.array(z.string()).optional(),
  }),
  themes: z.object({
    themes: z.array(z.object({ name: z.string(), note: z.string() })).min(2),
    characters: z
      .array(z.object({ name: z.string(), note: z.string() }))
      .optional(),
  }),
  vocab: z.object({
    vocab: z.array(z.object({ term: z.string(), context: z.string() })).min(3),
  }),
  essays: z.object({ essays: z.array(z.string()).min(2) }),
  full: StudySchema,
};

const TASK_PROMPT: Record<OuroTask, string> = {
  summary: `Write a precise summary: 120-180 words for a chapter, 200-280 for a whole text (trace the arc, chapter by chapter). JSON: {"summary": string}.`,
  quiz: `Build 6 close-reading quiz questions with 4 options each; every "why" must quote the source sentence. JSON: {"quiz": [{q, options[4], answer, why}]}.`,
  guide: `Write a study guide: 4-6 concrete learning objectives plus 5-7 step-by-step close-reading instructions that cite specific passages. JSON: {"objectives": string[], "guide": string[]}.`,
  themes: `Identify 3-5 major themes with evidence notes, plus the key characters and their functions. JSON: {"themes": [{name,note}], "characters": [{name,note}]}.`,
  vocab: `Select 6-8 words worth studying (uncommon or load-bearing), each with its sentence from the text. JSON: {"vocab": [{term,context}]}.`,
  essays: `Write 3 university-level essay prompts that require argument and evidence from the text. JSON: {"essays": string[]}.`,
  full: `Build the complete study set. JSON: {summary, guide[], objectives[], themes[{name,note}], characters[{name,note}], vocab[{term,context}], quiz[{q,options[4],answer,why}], cards[{front,back}], essays[]}. Summary 150-220 words; 6 quiz questions with sourced "why"; 2-3 essay prompts; everything strictly grounded in the text.`,
};

function scopeText(
  doc: DocWithContent,
  chapterIndex: number | null,
): { text: string; label: string } {
  if (chapterIndex === null) {
    // whole text: keep every chapter visible with headings so arc answers stay grounded
    const fullText = doc.contentJson.chapters
      .map((c) => `## ${c.title}\n${c.chunks.map((k) => k.text).join("\n\n")}`)
      .join("\n\n");
    const text = fullText.slice(0, 11000);
    // Be honest about truncation: if we only see a slice of a long document,
    // label it accordingly so the AI's response sets the right expectation.
    const isTruncated = fullText.length > 11000;
    return {
      text,
      label: isTruncated
        ? "the opening of the text (truncated for context)"
        : "the whole text",
    };
  }
  const ch =
    doc.contentJson.chapters[
      clamp(chapterIndex, 0, doc.contentJson.chapters.length - 1)
    ];
  return {
    text: chapterText(doc, chapterIndex).slice(0, 10000),
    label: `the chapter "${ch?.title}"`,
  };
}

/* ---------- safe typed accessors for Zod-validated JSON ----------
   These replace the previous `as unknown as StudyData` casts. Each accessor
   validates the runtime shape and returns a sensible default on mismatch,
   so a malformed provider response degrades gracefully instead of crashing. */

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}
function asNameNoteArray(v: unknown): { name: string; note: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
    )
    .map((x) => ({ name: asString(x.name), note: asString(x.note) }))
    .filter((x) => x.name.length > 0);
}
function asTermContextArray(v: unknown): { term: string; context: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
    )
    .map((x) => ({ term: asString(x.term), context: asString(x.context) }))
    .filter((x) => x.term.length > 0);
}
function asQuizArray(v: unknown): QuizQuestion[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
    )
    .map((x) => {
      const options = Array.isArray(x.options)
        ? x.options.filter((o): o is string => typeof o === "string")
        : [];
      // Clamp the answer index into the actual option range so an
      // out-of-range model value can never produce an unanswerable question.
      const maxIdx = Math.max(0, options.length - 1);
      return {
        q: asString(x.q),
        options,
        answer:
          typeof x.answer === "number"
            ? Math.max(0, Math.min(Math.floor(x.answer), maxIdx))
            : 0,
        why: asString(x.why),
      };
    })
    .filter((x) => x.q.length > 0 && x.options.length >= 3);
}

function renderOuroBody(
  task: OuroTask,
  data: Record<string, unknown>,
  scopeLabel: string,
): { body: string; quiz?: QuizQuestion[] } {
  switch (task) {
    case "summary":
      return { body: asString(data.summary) };
    case "quiz": {
      const quiz = asQuizArray(data.quiz);
      return {
        body: `${quiz.length || 6} questions on ${scopeLabel}. Answer, then read the source line beneath each.`,
        quiz,
      };
    }
    case "guide": {
      const objectives = asStringArray(data.objectives);
      const guide = asStringArray(data.guide);
      return {
        body:
          (objectives.length
            ? `**Objectives**\n${objectives.map((o) => `- ${o}`).join("\n")}\n\n`
            : "") +
          `**Close-reading steps**\n${guide.map((g, i) => `- ${i + 1}. ${g}`).join("\n")}`,
      };
    }
    case "themes": {
      const themes = asNameNoteArray(data.themes);
      const chars = asNameNoteArray(data.characters);
      return {
        body:
          `**Themes**\n${themes.map((t) => `- **${t.name}** — ${t.note}`).join("\n")}` +
          (chars.length
            ? `\n\n**Cast & function**\n${chars.map((c) => `- **${c.name}** — ${c.note}`).join("\n")}`
            : ""),
      };
    }
    case "vocab": {
      const vocab = asTermContextArray(data.vocab);
      return {
        body: `**Words worth keeping**\n${vocab.map((v) => `- **${v.term}** — ${v.context}`).join("\n")}`,
      };
    }
    case "essays": {
      const essays = asStringArray(data.essays);
      return {
        body: `**Essay prompts**\n${essays.map((e, i) => `- ${i + 1}. ${e}`).join("\n")}`,
      };
    }
    case "full": {
      const summary = asString(data.summary);
      const objectives = asStringArray(data.objectives);
      const guide = asStringArray(data.guide);
      const themes = asNameNoteArray(data.themes);
      const characters = asNameNoteArray(data.characters);
      const vocab = asTermContextArray(data.vocab);
      const essays = asStringArray(data.essays);
      const quiz = asQuizArray(data.quiz);
      return {
        body:
          `**Summary**\n${summary}\n\n` +
          (objectives.length
            ? `**Objectives**\n${objectives.map((o) => `- ${o}`).join("\n")}\n\n`
            : "") +
          `**Study guide**\n${guide.map((g, i) => `- ${i + 1}. ${g}`).join("\n")}\n\n` +
          `**Themes**\n${themes.map((t) => `- **${t.name}** — ${t.note}`).join("\n")}\n\n` +
          (characters.length
            ? `**Characters**\n${characters.map((c) => `- **${c.name}** — ${c.note}`).join("\n")}\n\n`
            : "") +
          (vocab.length
            ? `**Vocabulary**\n${vocab.map((v) => `- **${v.term}** — ${v.context}`).join("\n")}\n\n`
            : "") +
          (essays.length
            ? `**Essay prompts**\n${essays.map((e, i) => `- ${i + 1}. ${e}`).join("\n")}`
            : ""),
        quiz,
      };
    }
  }
}

function offlineOuroTask(
  doc: DocWithContent,
  chapterIndex: number | null,
  task: OuroTask,
): { body: string; quiz?: QuizQuestion[] } {
  const whole = chapterIndex === null;
  const chapters = doc.contentJson.chapters;
  const { label } = scopeText(doc, chapterIndex);
  const text = whole ? docText(doc) : chapterText(doc, chapterIndex);

  if (task === "summary") {
    if (!whole) return { body: extractiveSummary(text, 4) };
    // arc summary: one distilled sentence per chapter + a closing turn
    const beats = chapters.map((c, i) => {
      const ct = c.chunks.map((k) => k.text).join(" ");
      return `- **${i + 1}. ${c.title}** — ${extractiveSummary(ct, 1)}`;
    });
    return {
      body: `The arc of “${doc.title}”, chapter by chapter:\n${beats.join("\n")}\n\nTaken whole: ${extractiveSummary(text, 2)}`,
    };
  }
  if (task === "quiz") {
    return {
      body: `Six questions drawn from ${label}. Answer, then read the source line beneath each.`,
      quiz: clozeQuiz(text, 6),
    };
  }
  if (task === "guide") {
    const kw = topKeywords(text, 5);
    const sents = sentences(text);
    if (!whole) {
      return {
        body:
          `**Objectives**\n- Trace how ${kw[0] ?? "the opening image"} develops across ${label}.\n- Locate the sentence where the register shifts and explain why it works.\n- Connect ${kw[1] ?? "a recurring word"} to the chapter's closing image.\n\n` +
          `**Close-reading steps**\n- 1. Read the opening paragraph aloud — note what the syntax withholds.\n- 2. Find every occurrence of “${kw[0] ?? "light"}”; mark how its meaning bends.\n- 3. Compare the first and last sentences of the chapter: what has been exchanged?\n- 4. Choose one passage (${sents.length ? `e.g. “${truncateWords(sents[Math.floor(sents.length / 3)] ?? "", 18)}”` : "any turning point"}) and annotate its verbs.\n- 5. Write two lines on what the chapter refuses to say outright.`,
      };
    }
    const per = chapters.map((c, i) => {
      const ck = topKeywords(c.chunks.map((k) => k.text).join(" "), 2);
      return `- ${i + 1}. **${c.title}** — read for ${ck[0] ?? "its opening gesture"}; watch how it turns on ${ck[1] ?? "its final image"}.`;
    });
    return {
      body:
        `**Objectives**\n- Map the arc: what does ${kw[0] ?? "the central image"} mean at the start vs. the end?\n- Track the cast across chapters — who changes, who merely repeats?\n- Identify the structural hinge of the whole text and defend it.\n\n` +
        `**Chapter-by-chapter plan**\n${per.join("\n")}\n\n- Then: re-read only the first and last paragraphs of each chapter and revise your arc claim.`,
    };
  }
  if (task === "themes") {
    if (!whole) {
      const kw = topKeywords(text, 4);
      const chars = findCharacters(text, 3);
      return {
        body:
          `**Themes in ${label}**\n${kw
            .map(
              (k) =>
                `- **${cap(k)}** — ${extractiveSummary(
                  sentences(text)
                    .filter((s) => s.toLowerCase().includes(k))
                    .join(" "),
                  1,
                )}`,
            )
            .join("\n")}` +
          (chars.length
            ? `\n\n**Cast & function**\n${chars.map((c) => `- **${c.name}** — ${truncateWords(c.note, 24)}`).join("\n")}`
            : ""),
      };
    }
    // whole: global themes with chapter distribution
    const kw = topKeywords(text, 4);
    const rows = kw.map((k) => {
      const per = chapters.map((c, i) => ({
        i,
        n: c.chunks.filter((ch) => ch.text.toLowerCase().includes(k)).length,
      }));
      const strongest = [...per].sort((a, b) => b.n - a.n)[0];
      return `- **${cap(k)}** — strongest in “${chapters[strongest?.i ?? 0]?.title ?? label}”; ${extractiveSummary(
        sentences(text)
          .filter((s) => s.toLowerCase().includes(k))
          .join(" "),
        1,
      )}`;
    });
    const chars = findCharacters(text, 4);
    return {
      body:
        `**Themes across the whole text**\n${rows.join("\n")}` +
        (chars.length
          ? `\n\n**Cast & function**\n${chars.map((c) => `- **${c.name}** — ${truncateWords(c.note, 24)}`).join("\n")}`
          : ""),
    };
  }
  if (task === "vocab") {
    const vocab = [...freqMap(text).entries()]
      .filter(([w, c]) => w.length >= 7 && c >= 1 && c <= 4)
      .sort((a, b) => b[0].length - a[0].length)
      .slice(0, 7)
      .map(
        ([w]) =>
          `- **${w}** — ${sentences(text).find((s) => s.toLowerCase().includes(w)) ?? `appears in ${label}`}`,
      );
    return { body: `**Words worth keeping**\n${vocab.join("\n")}` };
  }
  if (task === "essays") {
    const kw = topKeywords(text, 3);
    const chars = findCharacters(text, 2);
    return {
      body:
        `**Essay prompts**\n- 1. “${cap(kw[0] ?? "The central image")} is less a symbol than a habit of attention.” Discuss with reference to ${label}.\n` +
        `- 2. Analyze the pacing of ${label}: where does the prose accelerate, where does it wait — and what is learned in the waiting?\n` +
        (chars.length >= 2
          ? `- 3. Compare ${chars[0]?.name ?? "the first figure"} and ${chars[1]?.name ?? "the second figure"} as competing definitions of the same virtue.`
          : `- 3. What does the narrator refuse to say? Argue from silence, syntax and omission.`),
    };
  }
  // full — buildStudy returns a StudyData, which is already the correct shape
  const d = buildStudy(doc, chapterIndex);
  return renderOuroBody("full", d as unknown as Record<string, unknown>, label);
}

/* The cast above is safe: StudyData is a record of string-keyed fields that
   renderOuroBody reads via the safe accessors. The `as unknown as` is needed
   only because TypeScript can't prove StudyData is assignable to
   Record<string, unknown> (it has specific field types, not unknown). The
   safe accessors (asString, asStringArray, etc.) validate at runtime. */

/* Stale-while-revalidate grace for cached artifacts (study sets, deep
   analyses, scene cards; all 7-day TTL). A row that expired within the
   last 36h still serves instantly while a fresh copy regenerates in the
   background — the reader never waits for a cache that is merely old. */
export const SWR_GRACE_MS = 36 * HOUR;

export async function getOuroArtifact(
  doc: DocWithContent,
  chapterIndex: number | null,
  task: OuroTask,
  force = false,
): Promise<OuroArtifact> {
  const scope: "chapter" | "whole" =
    chapterIndex === null ? "whole" : "chapter";
  const scopeKey = chapterIndex === null ? "all" : String(chapterIndex);
  const key = `ouro:${doc.id}:${scopeKey}:${task}:${doc.updatedAt}:${routeEpoch("ouro")}`;
  if (!force) {
    const hit = await cacheSwrGet<OuroArtifact>(key, SWR_GRACE_MS);
    if (hit) {
      if (hit.stale)
        void getOuroArtifact(doc, chapterIndex, task, true).catch(() => {});
      return { ...hit.value, offline: hit.value.offline };
    }
  }
  /* Downgrade guard (audit 2-b #2): when regenerating over an existing
     ONLINE artifact, a transient provider failure must not overwrite it
     with the offline fallback for another 7 days. The offline result is
     still returned honestly to the caller — but the better artifact stays
     cached, and the next read re-attempts revalidation. */
  let keepOnlineRow = false;
  if (force) {
    const prior = await cachePeek<OuroArtifact>(key);
    keepOnlineRow = !!prior && prior.offline === false;
  }
  const t0 = performance.now();
  const { text, label } = scopeText(doc, chapterIndex);
  let out: { body: string; quiz?: QuizQuestion[] } | null = null;
  let offline = true;
  let model: string | undefined;
  let reason: OfflineReason = "no-key";

  if (aiConfiguredFor("ouro")) {
    try {
      const chapterTitle =
        chapterIndex === null
          ? null
          : (doc.contentJson.chapters[chapterIndex]?.title ?? null);
      const sys =
        `${MASTER_STUDY}\n\n` +
        `Scope: ${label} of "${doc.title}" by ${doc.author}.${chapterTitle ? ` Chapter: "${chapterTitle}".` : ""} Respond ONLY with the JSON object in exactly the shape specified below. ${TASK_PROMPT[task]}`;
      const msgs: Msg[] = [
        { role: "system", content: sys },
        { role: "user", content: `Text:\n<<<${text}>>>` },
      ];
      const refined = await requestValidatedJson(
        "ouro",
        `study:${task}`,
        msgs,
        (r) => {
          const s = TASK_SCHEMA[task];
          return s ? s.parse(extractJson(r)) : extractJson(r);
        },
        doc.id,
        task === "full" ? 2200 : 1100,
      );
      out = renderOuroBody(
        task,
        refined.data as Record<string, unknown>,
        label,
      );
      offline = false;
      // Attribute the model that actually served (a fallback deep in the
      // chain may have answered), not the configured head.
      model = refined.model;
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      out = null;
      reason = offlineReasonOf(e);
    }
  }
  if (!out) {
    out = offlineOuroTask(doc, chapterIndex, task);
    void logUsage(
      "ouro",
      `study:${task}`,
      Math.round(out.body.length / 4) + 250,
      Math.round(performance.now() - t0),
      "offline",
      doc.id,
    );
    await new Promise((r) => setTimeout(r, 240));
  }
  const chTitle =
    chapterIndex === null
      ? undefined
      : doc.contentJson.chapters[chapterIndex]?.title;
  const artifact: OuroArtifact = {
    task,
    scope,
    title: `${TASK_TITLES[task]} · ${scope === "whole" ? doc.title : (chTitle ?? "chapter")}`,
    body: out.body,
    quiz: out.quiz,
    offline,
    model,
    reason,
  };
  if (!(offline && keepOnlineRow)) {
    await cacheSet(key, artifact, 7 * DAY);
  }
  return artifact;
}

export const TASK_TITLES: Record<OuroTask, string> = {
  summary: "Summary",
  quiz: "Quiz",
  guide: "Study guide",
  themes: "Themes & cast",
  vocab: "Vocabulary",
  essays: "Essay prompts",
  full: "Full study set",
};
