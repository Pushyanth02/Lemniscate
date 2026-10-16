import type { AnkaaMode, DocWithContent } from "../types";
import { STOP, wordList } from "./tokenize";
import { topKeywords } from "./keywords";
import { findCharacters } from "./characters";
import { moodOf } from "./mood";
import { finishText } from "./summarize";
import { cap, docText, seeded } from "./doc-utils";

/* ═══════════════════════════════════════════════════
   12. Long-form story generation (LOA Ankaa)
   ═══════════════════════════════════════════════════ */

const ANKAA_TITLES: Record<AnkaaMode, string> = {
  continue: "What Followed",
  alternate: "The Other Door",
  chapter: "The Next Morning",
  lore: "Notes from the Ledger",
  children: "The Lamp That Needed a Friend",
  whatif: "A Day Early",
};

export interface StoryAnchors {
  cast: string[];
  hook: string;
  keywords: string[];
}

export function extractAnchors(prompt: string): StoryAnchors {
  const trimmed = prompt.trim();
  // Common prompt command words that should NOT be treated as character names.
  // These are capitalized at the start of sentences but aren't proper nouns.
  const commandWords = new Set([
    "Write",
    "A",
    "An",
    "The",
    "Tell",
    "Make",
    "Create",
    "Draft",
    "Compose",
    "Generate",
    "Describe",
    "Imagine",
    "Picture",
    "Show",
    "Give",
    "Build",
    "Continue",
    "Rewrite",
    "Retell",
    "Adapt",
    "Explore",
  ]);
  const starters = new Set(["The", "A", "An"]);
  const cast: string[] = [];
  const seqs =
    trimmed.match(/[A-Z][\w'’]*(?:\s+(?:of|the|and|'s)?\s*[A-Z][\w'’]*)*/g) ??
    [];
  for (const seq of seqs) {
    const parts = seq.split(/\s+/).filter((p) => /^[A-Z]/.test(p));
    let cores = parts;
    while (cores.length && starters.has(cores[0] ?? "")) cores = cores.slice(1);
    if (!cores.length) continue;
    // Filter out pure command words — "Write" from "Write a story..." is not a character.
    cores = cores.filter((c) => !commandWords.has(c));
    if (!cores.length) continue;
    const names = cores.length <= 2 ? [cores.join(" ")] : cores;
    for (const n of names) if (n.length > 1 && !cast.includes(n)) cast.push(n);
  }
  for (const tok of trimmed.match(/\b[A-Z]{3,}\b/g) ?? []) {
    const pretty = cap(tok.toLowerCase());
    if (!cast.includes(pretty)) cast.push(pretty);
  }
  const keywords = [
    ...new Set(wordList(trimmed).filter((w) => w.length > 3 && !STOP.has(w))),
  ].slice(0, 6);
  return { cast: cast.slice(0, 4), hook: trimmed, keywords };
}

export function offlineAnkaaLong(
  mode: AnkaaMode,
  doc: DocWithContent | null,
  prompt: string,
  nonce = 0,
  depth: "short" | "medium" | "long" = "long",
): { title: string; body: string } {
  const anchors = extractAnchors(prompt);
  const text = doc
    ? docText(doc)
    : prompt || "a story about a lamp that needed a friend";
  const vBase = topKeywords(text, 10);
  const v = doc
    ? vBase
    : [...anchors.keywords, ...vBase]
        .filter((w, i, a) => a.indexOf(w) === i)
        .slice(0, 10);
  const c = anchors.cast.length
    ? anchors.cast
    : doc
      ? findCharacters(text, 4).map((x) => x.name)
      : ["The Traveler", "The Keeper"];
  const A = c[0] ?? "the stranger";
  const B = c[1] ?? "the keeper of the house";
  const w0 = v[0] ?? "light";
  const w1 = v[1] ?? "door";
  const w2 = v[2] ?? "street";
  const w3 = v[3] ?? "window";
  const w4 = v[4] ?? "silence";
  const mood = moodOf(text).split("·")[0]?.trim() ?? "";
  const rnd = seeded(
    (mode.length * 7919 +
      text.length +
      prompt.length +
      (nonce % 1_000_003) * 9973) >>>
      0,
  );
  const pick = <T>(arr: T[]): T => {
    const v = arr[Math.floor(rnd() * arr.length)];
    if (v === undefined) throw new Error("pick() called with an empty array");
    return v;
  };

  // Depth controls beat count + closing count so a short prompt yields ~400
  // words, medium ~600, long ~800 (the offline template's natural ceiling —
  // the online path scales higher per-section via the model's token budget).
  const beatCount = depth === "short" ? 2 : depth === "medium" ? 3 : 5;
  const closingCount = depth === "short" ? 2 : depth === "medium" ? 2 : 4;

  const P: string[] = [];
  P.push(
    pick([
      `It began, as these things do, with the ${w0}: not the grand kind of beginning that histories prefer, but the small kind that actually happens, a ${w0} noticed, held, and refused to be put down. ${cap(A)} understood, perhaps before understanding anything else, that the ${mode === "whatif" ? "day" : "evening"} had made a decision and merely needed someone to witness it.`,
      `Nobody later agreed on when it began, which is how you know it began early. The ${w2} had gone the color of cooling tea, and ${A} stood where the ${w1} made its nightly argument with the dark, counting breaths the way other people count coins.`,
      `Long before anything happened, the ${w0} had already chosen its side of the room, and ${cap(A)}, punctual to disasters and late to everything else, arrived just in time to witness the choice being made without supervision.`,
    ]),
  );
  P.push(
    pick([
      `There is a grammar to waiting. ${cap(B)} had spent a lifetime conjugating it: the subjunctive of a kettle not yet boiled, the conditional of a chair kept empty. Tonight the grammar changed tense without asking, and the whole house leaned forward to hear the new verb.`,
      `The house, for its part, kept its opinions to its beams. Houses do that. But the ${w3} gave the evening away, the way a ${w3} does at this hour, holding the last of the ${w0} like a secret it has already told to everyone who matters.`,
      `${cap(B)} kept a private ledger of unfinished evenings, and this one, entered under the day's date, was already accruing interest. The ${w3} burned steadily. Steadiness, ${B} knew from long practice, is the loudest kind of warning.`,
    ]),
  );
  if (!doc && anchors.cast.length && depth !== "short") {
    P.push(
      `${cap(A)} and ${cap(B)} arrived the way such figures always arrive in the telling: announced by the weather, preceded by rumor, and followed by a ${w4} that had opinions of its own. Whatever else happened next, it happened to them first.`,
    );
  }
  const beats: [string, string][] = [
    [
      `The first thing to happen was small enough to miss: the ${w4} acquired a texture. Not emptiness but texture, the way velvet is empty and still insists on being touched. ${cap(A)} tested it with a word, and the word came back slightly warmer, like a teacup someone has been holding for you.`,
      `It is worth saying plainly: nothing was demanded of anyone yet. That is the trick of thresholds. They do not demand; they merely stop pretending that staying still is a neutral act.`,
    ],
    [
      `${cap(B)} appeared the way ${B} always appeared, from wherever lamplighters and keepers go between duties, which is to say, from nowhere you can point at. “You're early,” said ${B}, which was not true, and “or late,” which was not true either, and the space between the two statements was precisely large enough for ${A} to live in.`,
      `They spoke of ordinary things, which is what people speak of when the extraordinary is in the room and has not yet introduced itself. The ${w2} outside. The weather of the stairs. Whether the ${w1} sticks more in winter or in memory. The ${w0} listened with the patience of things that have heard every version of this conversation and love it anyway.`,
    ],
    [
      `Then the turn began to gather, quietly, the way weather gathers behind a hill you haven't named yet. A letter? A knock? A realization? The story keeps its own counsel here, but the ${w4} thinned, and somewhere under the floorboards the house revised its estimate of the evening.`,
      `${cap(A)} felt it in the hands first: the specific weight of a decision that has stopped being theoretical. There is a moment, one moment only, when a ${w1} is still merely wood, and then it isn't. Histories are written by the people who notice that moment; everyone else merely lives through it.`,
    ],
    [
      `${cap(B)}, who had seen a thousand such evenings and filed them under weather, did the only unprofessional thing possible: hesitated. The hesitation lasted perhaps three seconds, which is to say it lasted the rest of both their lives, because some durations are not measured in seconds but in before-and-after.`,
      `The ${w3} showed the ${w2} going dark in panels, one by one, like a ledger closing its accounts. Whatever was coming had finished arriving elsewhere and was now, at last, arriving here: on time, unhurried, wearing ordinary shoes.`,
    ],
    [
      `And so the hinge of the whole affair: ${A} ${mode === "alternate" ? "did not open the door, and the not-opening became its own kind of doorway, one that led inward" : mode === "children" ? "took a brave, cocoa-sized breath, which is the largest size of breath there is" : mode === "whatif" ? "acted one heartbeat earlier than the story expected, and the story, surprised, showed its hand" : "opened the door, or was opened by it; the witnesses disagree, and the door has never testified"}.`,
      `What followed was not loud. Real turns rarely are. The ${w0} simply changed owners, the ${w4} simply changed its mind, and ${A} stepped from the ${mode === "lore" ? "footnote into the text" : "threshold into the sentence"}, where the verbs are.`,
    ],
  ];
  for (let i = 0; i < beatCount; i++) {
    const beat = beats[i];
    if (!beat) break;
    P.push(beat[0]);
    P.push(beat[1]);
  }
  const closings = [
    pick([
      `Years later, because there is always a years-later and stories insist on one, someone would ask ${A} what the ${mood} felt like from the inside, and ${A} would answer honestly: like being read. Like the room was a page and the page was warm, and the hand turning it was neither cruel nor kind, only attentive, which is the only kindness that lasts.`,
      `The ${w0}, transferred, burned differently now: less like a lamp and more like a kept promise, which is what lamps secretly are. ${cap(B)} watched it settle into its new keeping and performed the lamplighter's oldest ritual: said nothing, and meant it.`,
      `What stayed, in the end, was not the event itself but its weather: the particular pressure of the ${w0} against the window, and the way ${A}'s name sounded in ${B}'s mouth afterward, like a word being returned, finally, to the dictionary where it had always been kept.`,
    ]),
    pick([
      `If there is a lesson, it is a small one, small enough to carry in a coat pocket next to the keys and the unanswered letter: every ${w1} is two doors, and the one you open is never the one that changes you; it's the one you finally stop needing to.`,
      `The house added the evening to its collection of evenings, which is to say it forgot nothing and mentioned nothing. But on certain ${mood.split(" ")[0] ?? ""} nights, if you stand on the third stair and hold your breath, you can still hear the ${w4}, textured, warm, still deciding.`,
      `The moral, if the house keeps one, is filed under miscellaneous: doors are honest only while closed. Open one, and it starts making promises in both directions at once. ${cap(A)} made peace with the ambiguity, which is what adults call courage when no one is watching.`,
    ]),
    pick([
      `${cap(A)} slept before the tea went cold, which the doctors would call impossible and the house called Tuesday. The ${w2} kept its post. The ${w0} kept its post. And somewhere between the two, the story kept its promise, not to explain but to continue, which is the only promise stories are allowed to make.`,
      `The last thing to happen, as is right and proper, was quiet: the ${w0} dimming to the exact brightness of a memory being made. ${cap(A)} did not watch it happen. ${cap(A)} was too busy being the person it happens to.`,
      `Centuries from now, when someone tallies the small histories, this evening will not appear. It will have been absorbed, quietly and completely, into the way ${B} thereafter poured tea, and the way ${A} thereafter said goodbye: briefly, and looking back.`,
    ]),
    pick([
      `And that, reader, is how it went, or how it goes, since things like this never quite agree to become past tense. The ${w1} remains. The ${w0} remains. The threshold, as thresholds do, remains exactly where you left it: waiting to be the exact place where the outside agrees to end.`,
      `If you ask whether it ended well, then well: the ${w0} still burns. The ${w1} still opens. Somewhere a ledger keeps a line no clerk can read, and every so often, on windless nights, the whole street leans an ear toward the house, listening for the rest of the sentence.`,
      `So the ledger closes, though it leaves the last line unfinished on purpose. Some books end; this one merely lowers its voice. Listen: the ${w4} is still textured, the ${w0} is still borrowed, and the next chapter is already standing on the third stair, deciding.`,
      `${cap(B)} locked up at the usual hour and left the unusual thing on its chair, where it sat behaving perfectly, which is how you know a story isn't over. It was only waiting for someone to stop watching it before it became what it had been planning to become all along.`,
    ]),
  ];
  for (let i = 0; i < closingCount; i++) {
    const closing = closings[i];
    if (closing !== undefined) P.push(closing);
  }

  const customTitle = anchors.cast.length
    ? `${anchors.cast[0]} · ${ANKAA_TITLES[mode]}`
    : ANKAA_TITLES[mode];
  const title = doc ? `${doc.title} · ${customTitle}` : customTitle;
  return { title, body: P.map(finishText).join("\n\n") };
}
