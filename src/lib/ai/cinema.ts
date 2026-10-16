import { z } from "zod";
import type { DocWithContent, SceneDraft } from "../types";
import { logUsage } from "../data";
import { aiConfiguredFor, routeEpoch } from "../meridian";
import { cacheGet, cacheSwrGet, cacheSet, cachePeek, DAY } from "../cache";
import {
  AtlasScenesSchema,
  artFor,
  dedupeSceneTitles,
  groundScene,
  numberedChunksText,
  scenes2Key,
  scenes3Key,
} from "../scenes";
import { offlineScenes } from "../loa/dramatize";
import { SWR_GRACE_MS } from "./ouro";
import {
  AiUnavailable,
  extractJson,
  offlineReasonOf,
  requestValidatedJson,
  type OfflineReason,
} from "./core";

/* ================= Scene Atlas (Ankaa) ================= */

export const CINEMA_STEPS = [
  "Reading the chapter",
  "Casting & marking the passages",
  "Writing the scenes",
  "Verifying the evidence",
];

export interface CinematizeResult {
  scenes: SceneDraft[];
  offline: boolean;
  model?: string;
  /** why the Anchor engine served, when it did */
  reason?: OfflineReason;
  /** true when the scenes came from a pre-atlas (scenes2) cache and carry
   *  no verified anchors — the atlas UI shows an honest “regenerate to
   *  attach passages” hint instead of pretending they are grounded. */
  legacy?: boolean;
}

/** Shared system prompt for the Scene Atlas. The single source of truth
 *  used by both `cinematizeChapter` (parallel) and `regenerateScene`
 *  (single), so any change to the rules applies to both paths.
 *
 *  The atlas contract, binding on every scene card:
 *  - elevate, never compress — every beat of the source stays present
 *  - anchors are the reader's PROOF: exact quotations copied
 *    character-for-character from the numbered [¶N] paragraphs, cited by
 *    number; a post-generation grounding pass re-verifies each quote
 *    against the actual text and drops any that fail
 *  - honesty over completeness: no invented plot, names, places or turns;
 *    unsupported fields come back empty or omitted
 *  - unique, source-specific titles (TITLE VARIETY RULE below) */
const ATLAS_SYS =
  `You are Ankaa, Lemniscate's scene cartographer. Your job is to ELEVATE, never compress — dramatize the chapter into plates of a living atlas. Never abridge, summarize or paraphrase the chapter; every beat of the source must remain present, only enlarged. ` +
  `Scene card fields: "title" (evocative, specific to THIS scene's moment), "mood" (three parts: tone · time-of-day · interior/exterior), "characters" (ONLY names that literally appear in the chapter; an empty array when the text has no people), "setting" (where and when this scene stands, in the text's own places), "sensory" (1-5 concrete sensory details this passage actually contains), "movement" (the emotional turn — what shifts inside the scene), "motifs" (1-4 recurring words or images that genuinely appear in the chapter), "anchors" (1-3 EXACT quotations, 12-60 words each, copied verbatim from the numbered paragraphs, each with the paragraph's number in "chunkIndex"), "thread" (OPTIONAL: one sentence naming what carries forward into the next scene — include it ONLY when the chapter genuinely continues; omit the field otherwise), "body" (170-260 words of ORIGINAL present-tense scene prose: what is seen, heard and felt; atmosphere; the emotional turn; carry over at least one line of the chapter's dialogue verbatim when present). ` +
  `EVIDENCE RULE (binding): anchors are the reader's proof. Copy each quote EXACTLY from its [¶N] paragraph — same words, same order, same punctuation. Never paraphrase, never mend, never merge lines from different paragraphs. If you are not certain a phrase is verbatim, do not use it. ` +
  `HONESTY RULE (binding): never invent plot, names, places, or events the text does not contain. When the text does not support a field — no people, no clear setting, no genuine continuation — return the empty array or omit the field rather than filling the slot with invention. ` +
  `TITLE VARIETY RULE (binding): Each scene MUST have a unique, vivid title that captures its specific moment. Titles must be 2-6 words. FORBIDDEN titles: the chapter name, generic phrases ("The Beginning", "The End", "The Scene", "The Moment"), or any title that could apply to a different scene. Instead, use a concrete image, action, or sensory detail from THIS scene (e.g. "The Lamp Refuses", "Salt on the Landing", "What the Stair Heard"). No two scenes may share a title or be close variations of each other. ` +
  `Write the body as literature — the chapter's own next draft — NOT as a screenplay. Strictly forbidden: camera or lens language, INT/EXT slugs, shot lists, sound-design or blocking jargon, bullet points, and any sentence that could apply to a different book. ` +
  `Ground every image in this chapter's actual sentences, characters and vocabulary; enlarge them, never replace them. ` +
  `Variety rule (binding): vary sentence openings; never start two sentences the same way — vary the syntactic shape, the lead word, the length. Vary sentence length too. ` +
  `Respond ONLY with JSON: {"scenes":[{title,mood,characters,setting,sensory,movement,motifs,anchors:[{quote,chunkIndex}],thread,body}]} (thread optional, characters may be []).`;

/** Five cinematic angles — opening → rising action → turn → aftermath →
 *  final image. Indexed by ordinal; if `sceneCount` is less than 5, the
 *  later angles are simply unused. */
const CINEMA_ANGLES = [
  "Adapt the chapter's opening movement — its first gesture and atmosphere.",
  "Adapt the chapter's rising action — where tension or stakes build.",
  "Adapt the chapter's turn — its hinge moment, the pivot.",
  "Adapt the chapter's aftermath — the immediate consequence of the turn.",
  "Adapt the chapter's final image — its closing note and resonance.",
];

/** Cinematize a chapter into Scene Atlas plates with the Ankaa model —
 *  dramatize and ELEVATE the prose, then ground every scene with verified
 *  source-passage anchors. Scenes are requested in PARALLEL and delivered
 *  progressively via onScene (buffered to narrative order), so the first
 *  plate appears as soon as its single call resolves. */
export async function cinematizeChapter(
  doc: DocWithContent,
  chapterIndex: number,
  salt: number,
  onStep: (stepIndex: number, fraction: number) => void,
  onScene?: (scene: SceneDraft) => void,
  opts?: { revalidate?: boolean },
): Promise<CinematizeResult> {
  // Background revalidation (SWR): the same generation path runs quietly —
  // no step events, no scene replays — so it can never pollute the live UI.
  // Revalidation SKIPS the cache reads entirely: reading the stale row back
  // would (a) return it instead of regenerating, and (b) spawn another
  // revalidation from the stale branch — a self-sustaining chain that never
  // regenerates until the grace window lapses (audit 2-b).
  if (opts?.revalidate) {
    onStep = () => {};
    onScene = undefined;
  }
  const t0 = performance.now();
  onStep(0, 0.5);
  const epoch = routeEpoch("ankaa");
  const key = scenes3Key(doc.id, chapterIndex, doc.updatedAt, salt, epoch);
  const hit = opts?.revalidate
    ? null
    : await cacheSwrGet<{ scenes: SceneDraft[]; offline: boolean }>(
        key,
        SWR_GRACE_MS,
      );
  if (hit && hit.value.scenes.length) {
    if (hit.stale)
      void cinematizeChapter(doc, chapterIndex, salt, () => {}, undefined, {
        revalidate: true,
      }).catch(() => {});
    for (const s of hit.value.scenes) onScene?.(s);
    onStep(CINEMA_STEPS.length - 1, 1);
    return { scenes: hit.value.scenes, offline: hit.value.offline };
  }
  // Read-compatibility: a pre-atlas (scenes2) cache still serves — the
  // scenes render unchanged, flagged `legacy` so the atlas UI says honestly
  // that their passages are estimates, not verified anchors. (Also skipped
  // in revalidate mode — a revalidation must regenerate, not re-serve.)
  const legacyKey = scenes2Key(
    doc.id,
    chapterIndex,
    doc.updatedAt,
    salt,
    epoch,
  );
  const legacy = opts?.revalidate
    ? null
    : await cacheGet<{
        scenes: SceneDraft[];
        offline: boolean;
      }>(legacyKey);
  if (legacy && legacy.scenes.length) {
    const migrated = legacy.scenes.map((s) => ({
      ...s,
      art: s.art ?? artFor(s),
    }));
    for (const s of migrated) onScene?.(s);
    onStep(CINEMA_STEPS.length - 1, 1);
    return { scenes: migrated, offline: legacy.offline, legacy: true };
  }

  const chapter = doc.contentJson.chapters[chapterIndex];
  const chapterChunks = chapter?.chunks ?? [];
  const chapterRaw = chapterChunks.map((c) => c.text).join("\n\n");

  let reason: OfflineReason = "no-key";
  if (aiConfiguredFor("ankaa")) {
    try {
      onStep(1, 0.3);
      // Paragraph-numbered source: the model cites [¶N] references that
      // map 1:1 onto stable local chunk indices (lib/scenes.numberedChunksText).
      const text = numberedChunksText(chapterChunks).slice(0, 9200);
      const chTitle = chapter?.title ?? `Chapter ${chapterIndex + 1}`;
      // Scale scene count with chapter length: <2500 chars → 2 scenes,
      // 2500-5000 → 2, 5000-7500 → 3, 7500-10000 → 4, >10000 → 5 (capped
      // at 5 since the source is sliced above).
      const sceneCount = Math.max(
        2,
        Math.min(5, Math.ceil(Math.min(chapterRaw.length, 9000) / 2500)),
      );
      // Parallel per-scene calls → first card arrives fast, total ≈ slowest call.
      // BUT: scenes are buffered and emitted in narrative order so the live
      // streaming experience is sequential, not random. A scene only emits
      // when all prior scenes have already emitted.
      const buffered: (SceneDraft | null)[] = new Array(sceneCount).fill(null);
      let nextToEmit = 0;
      const calls = Array.from({ length: sceneCount }, (_, i) =>
        (async () => {
          const sceneRes = await requestValidatedJson(
            "ankaa",
            `cinema:${chapterIndex}:${i}`,
            [
              { role: "system", content: ATLAS_SYS },
              {
                role: "user",
                content: `Chapter "${chTitle}" of "${doc.title}" by ${doc.author}. The paragraphs are numbered [¶N]; quote anchors verbatim and cite each quote's paragraph number in chunkIndex:\n<<<${text}>>>\n${CINEMA_ANGLES[i] ?? CINEMA_ANGLES[CINEMA_ANGLES.length - 1]}${salt > 0 ? ` Variation seed ${salt} — find a different angle than before.` : ""}`,
              },
            ],
            (r) => AtlasScenesSchema.parse(extractJson(r)),
            doc.id,
            1150,
          );
          const parsedScenes = sceneRes.data as z.infer<
            typeof AtlasScenesSchema
          >;
          const one = parsedScenes.scenes[0] ?? null;
          // The grounding pass: verify each claimed quote against the real
          // chunks (correcting wrong paragraph cites, dropping unverifiable
          // quotes), keep only text-supported characters and motifs, and
          // derive the plate parameters from the scene's own content.
          const grounded = one
            ? groundScene(
                { ...one, engine: "ankaa" },
                chapterChunks,
                chapterRaw,
              )
            : null;
          buffered[i] = grounded;
          // Emit all buffered scenes that are now contiguous from nextToEmit.
          // This guarantees onScene fires in narrative order 0,1,2,... even
          // though the parallel calls resolve in arbitrary order.
          if (grounded) {
            while (nextToEmit < sceneCount && buffered[nextToEmit]) {
              onScene?.(buffered[nextToEmit]!);
              nextToEmit++;
            }
          }
          return { one: grounded, model: sceneRes.model };
        })(),
      );
      const settled = await Promise.allSettled(calls);
      onStep(2, 0.9);
      const rawScenes = settled
        .filter(
          (
            r,
          ): r is PromiseFulfilledResult<{
            one: SceneDraft | null;
            model: string | undefined;
          }> => r.status === "fulfilled" && !!r.value.one,
        )
        .map((r) => r.value.one!);
      if (!rawScenes.length) throw new Error("no_scene_cards");
      // Guarantee unique titles even when the model returns duplicates.
      const scenes = dedupeSceneTitles(rawScenes);
      onStep(3, 1);
      await cacheSet(key, { scenes, offline: false }, 7 * DAY);
      const servedModel = settled.find(
        (r): r is PromiseFulfilledResult<{
          one: SceneDraft | null;
          model: string | undefined;
        }> => r.status === "fulfilled" && !!r.value.model,
      );
      return {
        scenes,
        offline: false,
        model: servedModel?.value.model,
      };
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      // model hiccup → Anchor engine still elevates the chapter
      reason = offlineReasonOf(e);
    }
  }

  // offline path — quick staged reveal (extractive, honestly anchored)
  onStep(1, 0.6);
  await new Promise((r) => setTimeout(r, 140));
  onStep(2, 0.7);
  const scenes = offlineScenes(doc, chapterIndex, salt);
  for (const s of scenes) onScene?.(s);
  await new Promise((r) => setTimeout(r, 160));
  onStep(3, 1);
  /* Downgrade guard (audit 2-b #2): a transient provider failure during
     background revalidation must not overwrite an existing ONLINE scene
     row with the offline plates. The offline result is still returned
     honestly (and metered below); the better row stays cached. */
  let keepOnlineRow = false;
  if (opts?.revalidate) {
    const prior = await cachePeek<{ scenes: SceneDraft[]; offline: boolean }>(
      key,
    );
    keepOnlineRow = !!prior && prior.offline === false;
  }
  if (!keepOnlineRow) {
    await cacheSet(key, { scenes, offline: true }, 7 * DAY);
  }
  void logUsage(
    "ankaa",
    `cinema:${chapterIndex}`,
    Math.round(scenes.reduce((a, s) => a + s.body.length, 0) / 4),
    Math.round(performance.now() - t0),
    "offline",
    doc.id,
  );
  return { scenes, offline: true, reason };
}

/** Re-run a SINGLE scene of an already-cinematized chapter with a fresh
 *  salt. Used by the per-scene "Regenerate" button on the Scene Atlas so a
 *  reader can ask Ankaa for a different angle on one plate without
 *  re-staging the whole chapter.
 *
 *  Mirrors the system prompt + angle of `cinematizeChapter` for the given
 *  ordinal, then applies the same grounding pass; falls back to the Anchor
 *  engine's matching scene if the model is unavailable or hiccups. Returns
 *  `null` only if both paths produce nothing. */
export async function regenerateScene(
  doc: DocWithContent,
  chapterIndex: number,
  ordinal: number,
  salt: number,
): Promise<SceneDraft | null> {
  const chapter = doc.contentJson.chapters[chapterIndex];
  const chapterChunks = chapter?.chunks ?? [];
  const chapterRaw = chapterChunks.map((c) => c.text).join("\n\n");
  const text = numberedChunksText(chapterChunks).slice(0, 9200);
  const chTitle = chapter?.title ?? `Chapter ${chapterIndex + 1}`;
  const angle = CINEMA_ANGLES[ordinal] ?? CINEMA_ANGLES[0];

  if (aiConfiguredFor("ankaa")) {
    try {
      const sceneRes = await requestValidatedJson(
        "ankaa",
        `cinema:${chapterIndex}:${ordinal}`,
        [
          { role: "system", content: ATLAS_SYS },
          {
            role: "user",
            content: `Chapter "${chTitle}" of "${doc.title}" by ${doc.author}. The paragraphs are numbered [¶N]; quote anchors verbatim and cite each quote's paragraph number in chunkIndex:\n<<<${text}>>>\n${angle} Variation seed ${salt} — find a different angle than before.`,
          },
        ],
        (r) => AtlasScenesSchema.parse(extractJson(r)),
        doc.id,
        1150,
      );
      const one = sceneRes.data as z.infer<typeof AtlasScenesSchema>;
      const scene = one.scenes[0];
      if (scene) {
        return groundScene(
          { ...scene, engine: "ankaa" },
          chapterChunks,
          chapterRaw,
        );
      }
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      // model hiccup → fall through to the Anchor engine
    }
  }

  const offline = offlineScenes(doc, chapterIndex, salt);
  return offline[ordinal] ?? offline[0] ?? null;
}
