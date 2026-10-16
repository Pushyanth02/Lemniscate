import { memo, MOOD_CACHE } from "./memo";
import { stem, wordList } from "./tokenize";

/* ═══════════════════════════════════════════════════
   6. Mood / atmosphere / setting / time classification
   ═══════════════════════════════════════════════════ */

const MOOD_LEXICON: [string, string[]][] = [
  [
    "hushed anticipation",
    [
      "quiet",
      "still",
      "silence",
      "hush",
      "held",
      "waiting",
      "expect",
      "breath",
      "pause",
      "soft",
      "hush",
      "listening",
      "hovered",
    ],
  ],
  [
    "ember warmth",
    [
      "fire",
      "warm",
      "hearth",
      "candle",
      "lamp",
      "glow",
      "gold",
      "amber",
      "tea",
      "bread",
      "kettle",
      "cozy",
      "wrapped",
    ],
  ],
  [
    "cold unease",
    [
      "cold",
      "frost",
      "wind",
      "dark",
      "shadow",
      "fear",
      "dread",
      "empty",
      "iron",
      "grey",
      "gray",
      "sharp",
      "biting",
      "hollow",
    ],
  ],
  [
    "wonder",
    [
      "light",
      "star",
      "sky",
      "wonder",
      "strange",
      "bright",
      "silver",
      "moon",
      "sea",
      "glass",
      "shimmer",
      "luminous",
      "glimmer",
    ],
  ],
  [
    "tender sorrow",
    [
      "grief",
      "loss",
      "memory",
      "gone",
      "tears",
      "old",
      "forgotten",
      "farewell",
      "letter",
      "rain",
      "absence",
      "mourn",
      "lament",
    ],
  ],
  [
    "tense resolve",
    [
      "grip",
      "steel",
      "edge",
      "set",
      "jaw",
      "fist",
      "ready",
      "stance",
      "watchful",
      "poised",
      "braced",
      "steady",
    ],
  ],
  [
    "quiet joy",
    [
      "smile",
      "laugh",
      "warm",
      "glad",
      "bright",
      "light",
      "dance",
      "song",
      "music",
      "bloom",
      "sweet",
      "tender",
    ],
  ],
];

const PLACE_WORDS = [
  "room",
  "hall",
  "street",
  "kitchen",
  "door",
  "threshold",
  "window",
  "house",
  "tower",
  "library",
  "stair",
  "floor",
  "table",
  "wall",
  "garden",
  "yard",
  "cellar",
  "attic",
];
const EXTERIOR_WORDS = [
  "street",
  "road",
  "field",
  "forest",
  "sea",
  "sky",
  "hill",
  "mountain",
  "valley",
  "river",
  "bridge",
  "garden",
  "yard",
  "market",
  "square",
];

const TIME_WORDS: [string, string[]][] = [
  [
    "dusk",
    ["dusk", "evening", "lamp", "candle", "sunset", "twilight", "gloaming"],
  ],
  ["night", ["night", "midnight", "dark", "moon", "stars", "nocturnal"]],
  ["morning", ["morning", "dawn", "sunrise", "early", "breakfast", "rooster"]],
  ["noon", ["noon", "midday", "sun", "bright", "zenith"]],
  ["afternoon", ["afternoon", "late", "tea", "shadows"]],
];

export function moodOf(text: string): string {
  return memo(MOOD_CACHE, text, () => classifyMood(text));
}

function classifyMood(text: string): string {
  // Token-level tally keyed by stem: immune to substring false positives
  // ("beholden" no longer trips the "old" lexicon entry) and a single
  // O(words) pass instead of one full-text scan per lexicon word.
  const stemCounts = new Map<string, number>();
  for (const w of wordList(text)) {
    const st = stem(w);
    stemCounts.set(st, (stemCounts.get(st) ?? 0) + 1);
  }
  const tally = (list: string[]) =>
    list.reduce((a, w) => a + (stemCounts.get(stem(w)) ?? 0), 0);
  let moodName = "";
  let moodCount = 0;
  for (const [name, lex] of MOOD_LEXICON) {
    const c = tally(lex);
    if (c > moodCount) {
      moodName = name;
      moodCount = c;
    }
  }
  // Honesty guard: below a minimal signal floor, report "unmarked" rather
  // than confidently inventing an atmosphere the text doesn't support.
  if (!moodName || moodCount < 2) moodName = "unmarked atmosphere";
  let timeName = "unmarked time";
  let timeCount = 0;
  for (const [name, lex] of TIME_WORDS) {
    const c = tally(lex);
    if (c > timeCount) {
      timeName = name;
      timeCount = c;
    }
  }
  const interior = tally(PLACE_WORDS) >= tally(EXTERIOR_WORDS);
  return `${moodName} · ${timeName} · ${interior ? "interior" : "exterior"}`;
}

export function moodKey(text: string): string {
  const mood = moodOf(text);
  return (
    MOOD_LEXICON.map(([name]) => name).find((k) => mood.startsWith(k)) ??
    "hushed anticipation"
  );
}
