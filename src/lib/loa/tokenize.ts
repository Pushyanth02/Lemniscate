import { memo, SENT_CACHE } from "./memo";

/* ═══════════════════════════════════════════════════
   1. Text segmentation & tokenization
   ═══════════════════════════════════════════════════ */

/** Stop-word set — common English function words filtered from frequency
 *  analysis. Kept conservative so literary keywords survive. Contractions are
 *  listed in straight-apostrophe form; `isStop()` normalizes curly apostrophes
 *  before lookup (the tokenizer preserves ’ as-is). */
export const STOP = new Set(
  "the a an and or of to in was is are were be been being it its this that these those with for as had have has his her their them they he she we you i not but at by on from into over under again then than there here when while which who whom what why how all any both each few more most other some such no nor only own same so too very can will just should could would might must also about up out if because until against during before after above below between don't doesn't didn't won't wouldn't couldn't shouldn't wasn't weren't isn't aren't hasn't haven't hadn't can't cannot it's that's he's she's there's what's let's i'm you're we're they're upon among among within without whose himself herself itself myself yourself ourselves themselves something nothing everything anything someone everyone anyone nobody everybody somebody anybody always never still yet toward towards per via etc".split(
    " ",
  ),
);

/** Stop check with curly-apostrophe normalization ("don’t" ≡ "don't"). */
export function isStop(w: string): boolean {
  return STOP.has(w) || (w.includes("’") && STOP.has(w.replace(/’/g, "'")));
}

/**
 * Conservative light stemmer — groups obvious inflectional variants
 * (ember/embers, walk/walked/walking) without a dictionary. Deliberately NOT
 * aggressive: it never stems below ~4 remaining chars and leaves irregulars
 * ("came", "went") untouched, so worst case two variants stay separate —
 * never that two unrelated words merge.
 */
export function stem(w: string): string {
  let s = w.toLowerCase();
  if (s.length <= 3) return s;
  s = s.replace(/'(s|re|ve|ll|d|m)$/, "");
  if (s.endsWith("ies") && s.length > 4) return `${s.slice(0, -3)}y`;
  if (s.endsWith("sses")) return s.slice(0, -2);
  if (s.endsWith("ss") || s.endsWith("us") || s.endsWith("is")) return s;
  if (s.endsWith("s") && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length > 5) {
    const base = s.slice(0, -3);
    // running → runn → run (collapse doubled final consonant)
    if (/(.)\1$/.test(base)) return base.slice(0, -1);
    return base;
  }
  if (s.endsWith("ed") && s.length > 4) {
    const base = s.slice(0, -2);
    if (/(.)\1$/.test(base)) return base.slice(0, -1);
    return base;
  }
  return s;
}


/** Abbreviations that should NOT end a sentence. */
const ABBREVS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "rev",
  "hon",
  "jr",
  "sr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "vol",
  "pp",
  "ch",
  "sec",
  "p",
  "op",
  "ed",
  "eds",
  "trans",
  "comp",
  "dept",
  "univ",
  "inc",
  "ltd",
  "co",
  "corp",
]);

/** Tokenize into lowercase words (Unicode-aware, handles apostrophes and hyphens). */
export function wordList(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
}

/** Segment text into sentences — abbreviation-aware, dialogue-aware.
 *  Splits on .!? followed by whitespace + capital, but respects common
 *  abbreviations and quoted speech boundaries. */
export function sentences(text: string): string[] {
  return memo(SENT_CACHE, text, () => segment(text));
}

function segment(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const push = () => {
    const s = buf.trim();
    if (s.length > 2) out.push(s);
    buf = "";
  };
  while (i < text.length) {
    const ch = text[i];
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      // Look ahead: is the next non-space char a capital letter or a quote?
      // If so, this is likely a sentence boundary.
      let j = i + 1;
      while (j < text.length && /\s/.test(text.charAt(j))) j++;
      const next = text[j] ?? "";
      // Check for abbreviation / initialism: known abbrev list (with or
      // without its trailing dot), or a token that IS an initialism ("J.",
      // "U.S.", "e.g."). Two older bugs lived here: the lookup kept the dot
      // so "mr." never matched "mr", and the old length-based fallback
      // misfired on ordinary short words like "in." or "he.", silently
      // merging sentences.
      const before = buf.trim().split(/\s+/).pop() ?? "";
      const wordBefore = before.toLowerCase().replace(/[^a-z.]/g, "");
      const isAbbrev =
        ABBREVS.has(wordBefore) ||
        ABBREVS.has(wordBefore.replace(/\.+$/, "")) ||
        /^([a-z]\.)+$/i.test(before);
      // Don't break inside a decimal number ("3.14"): the dot must be
      // sandwiched between digits — checking AHEAD (next non-space char)
      // because the buffer only extends up to the dot itself.
      const isDecimal =
        /\d/.test(text[i - 1] ?? "") && /\d/.test(next);
      // Don't break if next char is lowercase (e.g., "Mr. smith")
      const nextIsLower = /[a-z]/.test(next);
      // Dialogue: if we're inside quotes, only break on the closing quote
      const inQuotes =
        (buf.match(/["“]/g)?.length ?? 0) > (buf.match(/["”]/g)?.length ?? 0);
      if (!isAbbrev && !isDecimal && !nextIsLower && !inQuotes) {
        // Consume closing quote if present
        if (
          text[i + 1] === '"' ||
          text[i + 1] === "”" ||
          text[i + 1] === "’" ||
          text[i + 1] === ")" ||
          text[i + 1] === "]"
        ) {
          buf += text[i + 1];
          i += 2;
        } else {
          i++;
        }
        push();
        continue;
      }
    }
    // Hard break on double newline (paragraph boundary)
    if (ch === "\n" && text[i + 1] === "\n") {
      push();
      buf = "\n";
      i += 2;
      while (i < text.length && text[i] === "\n") i++;
      continue;
    }
    i++;
  }
  push();
  return out;
}
