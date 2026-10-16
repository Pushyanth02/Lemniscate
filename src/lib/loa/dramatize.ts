import type { DocWithContent, SceneDraft } from "../types";
import { clamp } from "../utils";
import {
  artFor,
  bucketChunks,
  extractSensoryWords,
  extractSetting,
  verifyAnchorQuote,
} from "../scenes";
import { sentences } from "./tokenize";
import { findCharacters } from "./characters";
import { moodKey, moodOf } from "./mood";
import { topKeywords } from "./keywords";
import { finishText } from "./summarize";
import { cap, seeded } from "./doc-utils";

/* ═══════════════════════════════════════════════════
   11. Scene Atlas — offline dramatization with real anchors
   ═══════════════════════════════════════════════════ */

const SCENE_BRIDGES: Record<string, string[]> = {
  "hushed anticipation": [
    "Everything here is waiting without admitting it: the {thing} holds its small argument against the hour, and the {place} keeps the quiet like a hand over a mouth.",
    "The air has the particular weight of a held breath. Nothing in the {place} moves that doesn't have to, and the {thing} seems to lean toward whoever will speak first.",
    "Silence here is not absence but presence: the {place} listening, the {thing} bearing witness, everything tuned to the frequency of what hasn't happened yet.",
  ],
  "ember warmth": [
    "Warmth pools where the {thing} throws it, turning the {place} into the kind of shelter people remember for years without knowing why.",
    "There is a lamplight logic to the {place}: everything near the {thing} is forgiven, everything beyond it is merely weather.",
    "The {thing} keeps its own time, slower than clocks and kinder than hours, and the {place} has learned to breathe in that rhythm.",
  ],
  "cold unease": [
    "The cold here is not weather but attention: the {place} notices whoever crosses it, and the {thing} keeps its own counsel.",
    "A draft moves through the {place} like an uninvited guest. The {thing} does not flicker; that is somehow the unsettling part.",
    "Shadows in the {place} have edges they shouldn't. The {thing} throws them long and deliberate, as though marking territory.",
  ],
  wonder: [
    "The {place} has stopped being ordinary and hasn't apologized for it. Even the {thing} looks borrowed from a brighter story.",
    "Light behaves strangely here, as if the {place} has opinions. The {thing} catches it and holds it a second longer than physics allows.",
    "There's a quality to the air in the {place}, thinner and more transparent, as though the {thing} has thinned the veil between this and wherever it came from.",
  ],
  "tender sorrow": [
    "The {place} keeps its losses politely: in the {thing}, in the worn places, in the way dust settles like something remembered.",
    "Grief has made the {place} quieter than silence. The {thing} is the only witness that never learned to look away.",
    "Memory lives in the {place} like a tenant who never quite moved out; the {thing} still holds the shape of hands that aren't coming back.",
  ],
  "tense resolve": [
    "The {place} has gone still the way a blade goes still before it moves. The {thing} holds its position, ready.",
    "Every object in the {place} has gone deliberate, the {thing} especially, set like a word held between the teeth.",
    "There's a coiled quality to the {place}: the {thing} at its center, waiting for the hand that will decide what it becomes.",
  ],
  "quiet joy": [
    "The {place} has gone golden at the edges, the {thing} at its center throwing warmth like a small private sun.",
    "Something has eased in the {place}; the {thing} catches the light differently now, as though it knows it's been forgiven.",
    "The {place} keeps its happiness quietly, the way good houses do: in the {thing}, in the dust-motes, in the particular angle of afternoon.",
  ],
};

const SCENE_CODAS: string[] = [
  "What lingers is not an ending but a door left exactly as the chapter left it: open, and slightly warm.",
  "The last thing to settle is the smallest: a {thing}, a hand, a held word. Small things, carrying everything.",
  "And the {place}, which has been listening all along, files the evening away under weather it will mention again.",
  "Outside, the world goes on its way. Inside, the {thing} keeps its post, and the {place} keeps its secret.",
  "So the scene holds, not finished, not beginning, but paused in the particular way that {place}s pause when something has been decided and not yet said.",
];

const SPEECH_TAGS = [
  "quietly",
  "at last",
  "without looking up",
  "from the doorway",
  "to no one in particular",
  "as if answering a question nobody asked",
  "almost too late",
  "with the weight of something long considered",
  "into the silence that had been holding its breath",
];

export function offlineScenes(
  doc: DocWithContent,
  chapterIndex: number,
  salt = 0,
): SceneDraft[] {
  const chapters = doc.contentJson.chapters;
  const ch = chapters[clamp(chapterIndex, 0, chapters.length - 1)];
  if (!ch) return [];
  const chunks = ch.chunks;
  if (!chunks.length) return [];
  const text = chunks.map((c) => c.text).join("\n\n");
  if (!text.trim()) return [];

  const characters = findCharacters(text, 4).map((c) => c.name);
  const cast = characters.length ? characters : ["The Reader", "The House"];
  const mood = moodOf(text);
  const mk = moodKey(text);
  const kw = topKeywords(text, 8);
  const rnd = seeded(chapterIndex * 1013 + salt * 31 + text.length);
  const pick = <T>(arr: T[]): T => {
    const v = arr[Math.floor(rnd() * arr.length)];
    if (v === undefined) throw new Error("pick() called with an empty array");
    return v;
  };
  const quotes = (
    text.match(/[\u201C"]([^\u201D"\n]{6,180})[\u201D"]/g) ?? []
  ).map((q) => q.replace(/^[\u201C"]|[\u201D"]$/g, "").trim());

  // Scale scene count with chapter length, matching the online path:
  // <2500 chars → 2 scenes, 5000-7500 → 3, 7500-10000 → 4, >10000 → 5.
  const sceneCount = Math.max(2, Math.min(5, Math.ceil(text.length / 2500)));

  // Scene spans are chunk buckets, balanced by character weight, so every
  // scene owns a contiguous, equal-sized stretch of the ACTUAL text — and
  // every anchor below cites a real chunk inside its own bucket.
  const buckets = bucketChunks(chunks, sceneCount);
  if (!buckets.length) return [];

  const k0 = kw[0] ?? "light";
  const k1 = kw[1] ?? "room";
  const fill = (s: string) =>
    s.split("{thing}").join(k0).split("{place}").join(k1);

  const saltedKw = kw[salt % Math.max(1, kw.length)];
  const titleSeed =
    ch.title !== "Opening" &&
    ch.title !== "Full text" &&
    !/^Part /.test(ch.title)
      ? ch.title
      : saltedKw
        ? `The ${cap(saltedKw)}`
        : "The Threshold";

  // Unique per-scene subtitle so no two scenes share the same title even
  // when sceneCount > 3 (the previous "the turn / coda" only covered 3).
  const SUBTITLES = ["opening", "the turn", "deepening", "the hinge", "coda"];

  const bridges =
    SCENE_BRIDGES[mk] ?? SCENE_BRIDGES["hushed anticipation"] ?? [];

  /** Pick up to two verbatim anchors for a bucket: its most substantial
   *  sentence that lives wholly inside one chunk, plus its opening sentence
   *  when distinct. Every quote is verified against the bucket's own chunks
   *  — dropped silently when segmentation split across a paragraph break,
   *  so an offline scene never cites text it cannot show. */
  const anchorsForBucket = (
    bucket: typeof chunks,
    bucketText: string,
  ): SceneDraft["anchors"] => {
    const sents = sentences(bucketText)
      .map((s) => s.trim())
      .filter((s) => s.length >= 24 && s.length <= 400);
    if (!sents.length) return [];
    const byLen = [...sents].sort((a, b) => b.length - a.length);
    const chosen: { quote: string; chunkIndex: number }[] = [];
    const seen = new Set<string>();
    for (const cand of [byLen[0]!, sents[0]!]) {
      const key = cand.slice(0, 60);
      if (seen.has(key)) continue;
      // Local chunk index within the BUCKET must become a chapter-local
      // index — verifyAnchorQuote scans the bucket, so add the offset of
      // the bucket's first chunk in the chapter.
      const local = verifyAnchorQuote(cand, bucket, 0);
      if (local === null) continue;
      const chapterLocal = chunkOffset(chunks, bucket[0]!) + local;
      seen.add(key);
      chosen.push({ quote: cand, chunkIndex: chapterLocal });
      if (chosen.length >= 2) break;
    }
    return chosen;
  };

  const scenes: SceneDraft[] = [];
  buckets.forEach((bucket, i) => {
    const bucketText = bucket.map((c) => c.text).join("\n\n");
    const bucketSents = sentences(bucketText);
    if (!bucketSents.length) return;
    const spineA = bucketSents[0] ?? "";
    const spineB = bucketSents[1] ?? bucketSents[0] ?? "";
    const closing =
      bucketSents[bucketSents.length - 1] && bucketSents.length > 2
        ? bucketSents[bucketSents.length - 1]
        : "";
    const quote = quotes[i % Math.max(1, quotes.length)];
    const castHere = cast.filter((c) =>
      bucketText.toLowerCase().includes(c.toLowerCase()),
    );
    const speech =
      quote && castHere.length
        ? `\n\n\u201C${quote}\u201D \u00B7 ${castHere[i % castHere.length]}, ${pick(SPEECH_TAGS)}.`
        : quote
          ? `\n\n\u201C${quote}\u201D`
          : "";
    const body = [
      finishText(`${spineA} ${fill(pick(bridges))}`),
      finishText(`${spineB}${closing ? ` ${closing}` : ""}${speech}`),
      finishText(fill(pick(SCENE_CODAS))),
    ].join("\n\n");
    const subtitle = SUBTITLES[i] ?? `movement ${i + 1}`;

    // Honest extraction, never invention: sensory words and the locative
    // opening exist in the UI only when the text itself supplies them.
    const sensory = extractSensoryWords(bucketText, 4);
    const settingHere = extractSetting(bucketText);
    const motifsHere = kw
      .filter((k) => bucketText.toLowerCase().includes(k.toLowerCase()))
      .slice(0, 4);
    const anchors = anchorsForBucket(bucket, bucketText);

    const draft: SceneDraft = {
      title: buckets.length > 1 ? `${titleSeed} · ${subtitle}` : titleSeed,
      mood:
        i === Math.floor(buckets.length / 2)
          ? moodOf(bucketText)
          : mood,
      characters: i === Math.floor(buckets.length / 2)
        ? castHere.slice(0, 2)
        : castHere,
      body,
      setting: settingHere ?? undefined,
      sensory: sensory.length ? sensory : undefined,
      motifs: motifsHere.length ? motifsHere : undefined,
      anchors,
      grounded: (anchors?.length ?? 0) > 0,
      engine: "anchor",
    };
    draft.art = artFor(draft);
    scenes.push(draft);
  });

  if (scenes.length) return scenes;
  const sents = sentences(text);
  return [
    {
      title: titleSeed,
      mood,
      characters: cast,
      body: finishText(
        `${sents.slice(0, 2).join(" ")} ${fill(bridges[0] ?? "")}`,
      ),
      engine: "anchor",
      grounded: false,
    },
  ];
}

/** Index of `needle` inside the chapter's chunk list — the offset that turns
 *  a bucket-local chunk reference into a chapter-local one. Pure. */
function chunkOffset(
  chunks: readonly { id: string }[],
  needle: { id: string },
): number {
  const idx = chunks.findIndex((c) => c.id === needle.id);
  return idx === -1 ? 0 : idx;
}
