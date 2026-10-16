import { memo, CHAR_CACHE } from "./memo";
import { sentences, wordList } from "./tokenize";

/* ═══════════════════════════════════════════════════
   5. Character detection (proper-noun + dialogue-verb)
   ═══════════════════════════════════════════════════ */

/* Speech verbs: a capitalized word immediately adjacent to one of these
 * ("Name said", "said Name", after a quoted line) is the strongest
 * character-name signal in prose. Attribution verbs first, then motion/
 * perception verbs that co-occur with names. */
const CHAR_VERBS =
  /\b(said|asked|replied|whispered|shouted|answered|called|cried|murmured|told|added|remarked|responded|inquired|demanded|insisted|muttered|mumbled|grumbled|growled|snarled|hissed|exclaimed|announced|declared|stated|began|continued|concluded|interrupted|interjected|objected|agreed|conceded|admitted|confessed|suggested|offered|promised|warned|urged|begged|pleaded|scoffed|mocked|joked|sobbed|wailed|gasped|breathed|whined|purred|rasped|drawled|stammered|stuttered|echoed|repeated|watched|smiled|nodded|thought|remembered|wondered|noticed|turned|stood|sat|walked|ran|looked|gazed|stared|glanced|frowned|laughed|wept|sighed)\b/i;

export function findCharacters(
  text: string,
  n = 6,
): { name: string; note: string }[] {
  return memo(CHAR_CACHE, `${n}\u0001${text}`, () =>
    findCharactersScan(text, n),
  );
}

/** Common words and possessives that are NEVER character names, regardless
 *  of context. These must always be filtered — the `mentionsVerb` flag only
 *  affects weighting, never filter bypass. */
const NEVER_CHARACTER = new Set([
  // Pronouns
  "He",
  "She",
  "It",
  "They",
  "We",
  "You",
  "I",
  "Me",
  "Him",
  "Her",
  "Us",
  "Them",
  // Possessives (the source of the "Hers" false positive)
  "His",
  "Hers",
  "Its",
  "Theirs",
  "Ours",
  "Yours",
  "Mine",
  // Articles
  "The",
  "A",
  "An",
  // Conjunctions
  "But",
  "And",
  "Or",
  "Nor",
  "Yet",
  "So",
  "For",
  // Prepositions
  "In",
  "On",
  "At",
  "To",
  "Of",
  "With",
  "From",
  "By",
  "As",
  "Into",
  "Over",
  "Under",
  "Through",
  "Between",
  "Against",
  "During",
  "Before",
  "After",
  "Above",
  "Below",
  // Demonstratives
  "This",
  "That",
  "These",
  "Those",
  "There",
  "Here",
  // Question words
  "What",
  "Which",
  "Who",
  "Whom",
  "Whose",
  "Why",
  "How",
  "When",
  "Where",
  // Common sentence starters
  "When",
  "Then",
  "Now",
  "Soon",
  "Later",
  "Today",
  "Tonight",
  "Yesterday",
  "Tomorrow",
  // Quantifiers
  "All",
  "Some",
  "Many",
  "Most",
  "Few",
  "More",
  "Less",
  "Every",
  "Each",
  "Both",
  "Either",
  "Neither",
  "Other",
  "Such",
  "Another",
  // Negation
  "No",
  "Not",
  "Never",
  "Nothing",
  "Nobody",
  "None",
  // Affirmation
  "Yes",
  "Yeah",
  // Modal verbs (capitalized at sentence start)
  "Will",
  "Would",
  "Can",
  "Could",
  "Should",
  "Must",
  "May",
  "Might",
  "Shall",
  // Common adverbs
  "Only",
  "Even",
  "Still",
  "Also",
  "Just",
  "Quite",
  "Very",
  "Rather",
]);

/** Words that, when they appear at a sentence start, are likely sentence-openers
 *  rather than character names — UNLESS they're followed by a dialogue verb
 *  pattern like "Name said". These are filtered from `sentenceStarts` so they
 *  don't suppress real character detection. */
const COMMON_SENTENCE_STARTERS = new Set([
  "The",
  "A",
  "An",
  "It",
  "He",
  "She",
  "They",
  "But",
  "And",
  "When",
  "Then",
  "There",
  "This",
  "That",
  "In",
  "On",
  "At",
  "For",
  "With",
  "His",
  "Her",
  "Its",
  "Their",
  "What",
  "Why",
  "How",
  "No",
  "Yes",
  "Not",
  "I",
  "We",
  "You",
  "Some",
  "Every",
  "All",
  "Many",
  "Most",
  "Other",
  "Such",
  "His",
  "Hers",
]);

function findCharactersScan(
  text: string,
  n: number,
): { name: string; note: string }[] {
  const sents = sentences(text);
  const counts = new Map<string, number>();
  const firstMention = new Map<string, string>();
  const sentenceStarts = new Set<string>();

  // Build sentence-starts set, but EXCLUDE common openers — "The door opened"
  // should not make "The" a sentence-start candidate.
  for (const s of sents) {
    const first = s.match(/^["'“”‘’\s]*([A-Z][\p{L}'’-]*)/u)?.[1];
    if (first && !COMMON_SENTENCE_STARTERS.has(first))
      sentenceStarts.add(first);
  }

  // Build a frequency map of lowercase word forms. A capitalized word whose
  // lowercase form appears MUCH more often than its capitalized form is likely
  // a common noun capitalized at sentence/quote start (e.g. "Lamps" from
  // `"Lamps don't mind waiting,"` — "lamps" appears 3× lowercase, 1× capitalized).
  // But "Ember" (a character name) appears mostly capitalized, even if "ember"
  // the common noun appears once or twice lowercase. We use a ratio: if the
  // lowercase count is ≥ 2× the capitalized count, treat it as a common noun.
  const lowerFreq = new Map<string, number>();
  const capFreq = new Map<string, number>();
  for (const w of wordList(text)) {
    if (w.length < 2) continue;
    lowerFreq.set(w, (lowerFreq.get(w) ?? 0) + 1);
  }
  // Count capitalized occurrences from the raw tokens
  for (const s of sents) {
    for (const tok of s.split(/\s+/)) {
      const clean = tok
        .replace(/^["'“”‘’([]+/, "")
        .replace(/["'“”’”),.!?;:]+$/, "");
      if (/^[A-Z][\p{L}'’-]{1,20}$/u.test(clean)) {
        const lower = clean.toLowerCase();
        capFreq.set(lower, (capFreq.get(lower) ?? 0) + 1);
      }
    }
  }

  for (const s of sents) {
    const tokens = s.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const raw = (tokens[i] ?? "")
        .replace(/^["'“”‘’([]+/, "")
        .replace(/["'“”’”),.!?;:]+$/, "");
      // Must be a capitalized word, 2-20 chars
      if (!/^[A-Z][\p{L}'’-]{1,20}$/u.test(raw)) continue;
      // ALWAYS filter common words — they are never character names,
      // even if the sentence contains a dialogue verb. This was the root
      // cause of "Hers", "She", "In" appearing as scene characters.
      if (NEVER_CHARACTER.has(raw)) continue;
      // Lowercase-frequency ratio filter: distinguishes proper names from
      // common nouns capitalized at sentence/quote start.
      //   - "Ember" (character): appears 4× cap, 0× lower → proper name ✓
      //   - "Lamps" (common noun): appears 1× cap, 1× lower → common noun ✗
      //   - "Door" (common noun): appears 1× cap, 3× lower → common noun ✗
      // Rule: if the lowercase form exists AND capitalized count is low (≤1),
      // it's likely a common noun. Real character names appear multiple times
      // capitalized — a single capitalized occurrence is usually sentence-start.
      const lower = raw.toLowerCase();
      const capCount = capFreq.get(lower) ?? 0;
      const lowerCount = (lowerFreq.get(lower) ?? 0) - capCount; // lowercase-only occurrences
      if (lowerCount >= 1 && capCount <= 1) continue;
      // Check if this is a plural/common noun by looking at the prev token:
      // if the previous token is an article ("the lamps"), skip it.
      const prev = i > 0 ? (tokens[i - 1] ?? "") : "";
      const prevIsArticle =
        /\b(the|a|an|some|many|these|those|all|both|each|every|his|her|its|their|our|your|my)\b/i.test(
          prev,
        );
      if (prevIsArticle) continue;
      // Dialogue-verb adjacency: only words DIRECTLY ADJACENT to a dialogue
      // verb ("Ember said", "said Ember") get the 2× weight bonus. The old
      // sentence-level `mentionsVerb` flag gave "Lamps" (in `"Lamps don't
      // mind waiting," he said`) a 2× bonus even though "Lamps" is nowhere
      // near "said" — "he said" is the speaker, not "Lamps".
      const nextRaw =
        i < tokens.length - 1
          ? (tokens[i + 1] ?? "")
              .replace(/^["'“”‘’([]+/, "")
              .replace(/["'“”’”),.!?;:]+$/, "")
          : "";
      const prevRaw = prev
        .replace(/^["'“”‘’([]+/, "")
        .replace(/["'“”’”),.!?;:]+$/, "");
      const adjacentVerb = CHAR_VERBS.test(nextRaw) || CHAR_VERBS.test(prevRaw);
      // If the word appears at sentence start AND is in the common-starters
      // set, skip it unless it's directly adjacent to a dialogue verb.
      if (
        sentenceStarts.has(raw) &&
        COMMON_SENTENCE_STARTERS.has(raw) &&
        !adjacentVerb
      )
        continue;
      // ALL-CAPS tokens longer than 3 letters are usually shouted emphasis
      // in dialogue, not proper names ("NO!", "STOP THAT"): heavy penalty
      // (0.25×) so a genuinely-caps character can still surface but noise
      // can't.
      const capsEmphasis =
        raw.length > 3 && raw === raw.toUpperCase() && /^[A-Z'’-]+$/.test(raw);
      // Weight: a word directly adjacent to a dialogue verb ("Ember said",
      // "said Ember") gets 2× weight — the strongest character-name signal.
      const weight = (adjacentVerb ? 2 : 1) * (capsEmphasis ? 0.25 : 1);
      counts.set(raw, (counts.get(raw) ?? 0) + weight);
      if (!firstMention.has(raw)) firstMention.set(raw, s);
    }
  }

  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => ({ name, note: firstMention.get(name) ?? "" }));
}
