/**
 * Lemniscate ingestion engine.
 *
 * Pipeline: file detection → format parser → text cleanup → metadata
 * extraction → chapter detection → normalization → quality scoring.
 * Text formats are handled inline; binary formats (PDF/EPUB/DOCX) live in
 * engine-adapters.ts and are code-split via dynamic import.
 */
import type {
  Chapter,
  Chunk,
  ParsedDoc,
  QualityReport,
  SourceType,
} from "./types";
import { clamp } from "./utils";
import {
  parsePdf,
  parseEpub,
  parseDocx,
  parsePptx,
  sniffZipType,
} from "./engine-adapters";

export interface RawLine {
  text: string;
  heading?: boolean;
  brk?: boolean; // hard break (page boundary)
}
export interface RawDoc {
  lines: RawLine[];
  title?: string;
  author?: string;
  /** parser-emitted caveats (e.g. truncated pathological input) surfaced
   *  as import warnings — never fatal */
  warnings?: string[];
}

export class IngestError extends Error {
  code: "type" | "size" | "parse" | "empty" | "content";
  constructor(message: string, code: IngestError["code"]) {
    super(message);
    this.code = code;
  }
}

export const FORMATS: {
  type: SourceType;
  label: string;
  exts: string[];
  mimes: string[];
  note: string;
}[] = [
  {
    type: "pdf",
    label: "PDF",
    exts: ["pdf"],
    mimes: ["application/pdf"],
    note: "Layout-tolerant text extraction",
  },
  {
    type: "epub",
    label: "EPUB",
    exts: ["epub"],
    mimes: ["application/epub+zip"],
    note: "Spine-aware chapters + metadata",
  },
  {
    type: "docx",
    label: "DOCX",
    exts: ["docx"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    note: "Heading styles become chapters",
  },
  {
    type: "pptx",
    label: "PPTX",
    exts: ["pptx", "ppt"],
    mimes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    note: "Slide text extracted as chapters",
  },
  {
    type: "markdown",
    label: "Markdown",
    exts: ["md", "markdown"],
    mimes: ["text/markdown"],
    note: "Headings preserved as structure",
  },
  {
    type: "txt",
    label: "TXT",
    exts: ["txt", "text"],
    mimes: ["text/plain"],
    note: "Gutenberg boilerplate stripped",
  },
  {
    type: "html",
    label: "HTML",
    exts: ["html", "htm"],
    mimes: ["text/html"],
    note: "Readable content, no chrome",
  },
];

const ALL_EXTS = FORMATS.flatMap((f) => f.exts);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Detect format from extension + MIME + magic bytes. Never trusts MIME alone. */
export function detectFormat(
  name: string,
  mime: string,
  head: Uint8Array,
): SourceType | null {
  // Magic bytes win: %PDF- and PK zip signatures.
  if (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  )
    return "pdf";
  const ext = extOf(name);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) {
    if (ext === "epub") return "epub";
    if (ext === "docx") return "docx";
    if (ext === "pptx" || ext === "ppt") return "pptx";
    if (mime.includes("epub")) return "epub";
    if (mime.includes("wordprocessingml")) return "docx";
    if (mime.includes("presentationml")) return "pptx";
    return null; // unknown zip — adapters will sniff further
  }
  const byExt = FORMATS.find((f) => f.exts.includes(ext));
  if (byExt) return byExt.type;
  const byMime = FORMATS.find((f) => f.mimes.includes(mime));
  if (byMime && !ext) return byMime.type;
  return null;
}

export function validateFile(file: File, maxMB: number): SourceType {
  const ext = extOf(file.name);
  if (!ALL_EXTS.includes(ext)) {
    throw new IngestError(
      `“.${ext || "?"}” isn’t supported. Import PDF, EPUB, DOCX, PPTX, Markdown, TXT or HTML.`,
      "type",
    );
  }
  if (file.size > maxMB * 1024 * 1024) {
    throw new IngestError(
      `File exceeds the ${maxMB} MB limit (adjustable in Settings → Import).`,
      "size",
    );
  }
  if (file.size === 0) throw new IngestError("The file is empty.", "empty");
  if (ext === "htm") return "html";
  if (ext === "text") return "txt";
  if (ext === "markdown") return "markdown";
  if (ext === "ppt") return "pptx";
  return ext as SourceType;
}

/* ---------------- text normalization ---------------- */

const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
};

/** Named HTML entities that survive into plain-text exports. Anything not
 *  listed here is left untouched (a literal “&” never breaks decoding). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  sbquo: "\u201A",
  bdquo: "\u201E",
  laquo: "\u00AB",
  raquo: "\u00BB",
  deg: "\u00B0",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  euro: "\u20AC",
  pound: "\u00A3",
  yen: "\u00A5",
  cent: "\u00A2",
  sect: "\u00A7",
  para: "\u00B6",
  bull: "\u2022",
  middot: "\u00B7",
  dagger: "\u2020",
  times: "\u00D7",
  divide: "\u00F7",
  frac12: "\u00BD",
  plusmn: "\u00B1",
  szlig: "\u00DF",
  iexcl: "\u00A1",
  iquest: "\u00BF",
  agrave: "\u00E0",
  aacute: "\u00E1",
  acirc: "\u00E2",
  atilde: "\u00E3",
  auml: "\u00E4",
  aring: "\u00E5",
  aelig: "\u00E6",
  ccedil: "\u00E7",
  egrave: "\u00E8",
  eacute: "\u00E9",
  ecirc: "\u00EA",
  euml: "\u00EB",
  igrave: "\u00EC",
  iacute: "\u00ED",
  icirc: "\u00EE",
  iuml: "\u00EF",
  ntilde: "\u00F1",
  ograve: "\u00F2",
  oacute: "\u00F3",
  ocirc: "\u00F4",
  otilde: "\u00F5",
  ouml: "\u00F6",
  oslash: "\u00F8",
  ugrave: "\u00F9",
  uacute: "\u00FA",
  ucirc: "\u00FB",
  uuml: "\u00FC",
  yacute: "\u00FD",
  yuml: "\u00FF",
};

/** Numeric + named entity decoder — three simple anchored alternatives, no
 *  nested quantifiers. Codes outside the printable BMP range (controls,
 *  surrogates, replacement) are left as-is so decoding can never inject
 *  broken UTF-16. */
const ENTITY_RE =
  /&#(\d{1,6});|&#[xX]([0-9a-fA-F]{1,6});|&([a-zA-Z][a-zA-Z0-9]{1,30});/g;

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(
    ENTITY_RE,
    (m: string, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? m;
      const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
      if (
        !Number.isFinite(code) ||
        code < 0x20 ||
        code > 0xfffd ||
        (code >= 0xd800 && code <= 0xdfff)
      )
        return m;
      return String.fromCharCode(code);
    },
  );
}

/** Invisible damage detector: flags UTF-8-that-was-read-as-Latin-1 mojibake
 *  ("Ã©", "â€™", "Â ", "Ã¼"). Sample-based: long texts are checked at both
 *  ends so the cost is O(sample), not O(text). True mojibake has markers on
 *  nearly every accented word, so a 0.2% character threshold cleanly separates
 *  it from the occasional legitimate "Ã" in Portuguese capitals. */
const MOJIBAKE_TAIL =
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ¡-ÿ";
const MOJIBAKE_RE = new RegExp(
  `[ÃÂ][${MOJIBAKE_TAIL}]|â€[${MOJIBAKE_TAIL}]|Â(?![A-Za-z0-9À-ÿ])`,
  "g",
);

export function detectMojibake(text: string): boolean {
  if (text.length < 10) return false;
  const sample =
    text.length > 100_000
      ? text.slice(0, 50_000) + text.slice(-50_000)
      : text;
  const hits = (sample.match(MOJIBAKE_RE) ?? []).length;
  return (hits * 2) / sample.length > 0.002;
}

/** Convert straight `"` and `'` to contextually-correct curly quotes.
 *  - `"` → `“` when the quote opens (start of line, after whitespace or an
 *    opening bracket/dash) AND a word character follows
 *  - `"` → `”` otherwise (closing before whitespace/punctuation)
 *  - `'` → `’` between letters (contraction: don't, it's)
 *  - `'` → `’` for elided forms (’em, ’twas, ’til)
 *  - `'` → `‘` when opening, `’` otherwise
 *  Single-pass, stateless, leaves already-curly quotes untouched. */
function smartenQuotes(s: string): string {
  // Elided contractions that begin with an apostrophe: “tell ’em”, “’twas”.
  const ELISION_RE =
    /^(?:em|tis|twas|twere|til|twill|cause|round|fore|neath|cross)\b/i;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      const prev = i > 0 ? (s[i - 1] ?? " ") : " ";
      const next = i < s.length - 1 ? (s[i + 1] ?? " ") : " ";
      const opens = i === 0 || /[\s(\[{“—–]/.test(prev);
      const nextWordy = !/\s/.test(next) && !/[)\]},.;:!?…”]/.test(next);
      out += opens && nextWordy ? "\u201C" : "\u201D";
    } else if (c === "'") {
      const prev = i > 0 ? (s[i - 1] ?? " ") : " ";
      const next = i < s.length - 1 ? (s[i + 1] ?? " ") : " ";
      if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) out += "\u2019";
      else if (ELISION_RE.test(s.slice(i + 1, i + 9))) out += "\u2019";
      else if (
        (i === 0 || /[\s(\[{“—–]/.test(prev)) &&
        !/\s/.test(next) &&
        !/[)\]},.;:!?…’]/.test(next)
      )
        out += "\u2018";
      else out += "\u2019";
    } else {
      out += c;
    }
  }
  return out;
}

export function cleanInline(s: string): string {
  return smartenQuotes(
    decodeEntities(
      // 1. Strip invisible + control characters: zero-width joiners/marks,
      //    bidi overrides, and C0/C1 control bytes. Newlines and tabs survive
      //    (callers split on newlines; tabs are harmless).
      s.replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
        "",
      ),
    )
      // 2. Fix ligatures (ﬀﬁﬂﬃﬄ — the ﬀ pair was previously missed)
      .replace(/[ﬀﬁﬂﬃﬄ]/g, (m) => LIGATURES[m] ?? m)
      // 3. Collapse ALL whitespace to single spaces — this normalizes
      //    non-breaking, thin, hair and figure spaces to plain spaces
      //    (JS \s already covers U+00A0/U+2000-200A/U+202F/U+205F/U+3000)
      //    and no run of 3+ spaces can survive.
      .replace(/\s+/g, " ")
      // 4. Fix broken ellipses: ". . ." → "…", "..." → "…"
      .replace(/(?:\.\s){2}\.|\.{3,}/g, "…")
      // 5. Normalize em-dashes: " — " → "—", keep "word—word" intact.
      //    Also fold en-dashes used as parenthetical dashes to em-dash.
      .replace(/\s*[\u2014\u2013]\s*/g, "\u2014")
      // 6. Strip spaces before punctuation: "word ," → "word," (also "wait …")
      .replace(/ +([,.;:!?%)\]\u2026])/g, "$1")
      .trim(),
  );
}

/** Join hard-wrapped lines into flowing paragraphs, mending hyphen breaks. */
export function joinLines(parts: string[]): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (out.endsWith("-") && /^[a-z]/.test(p)) out = out.slice(0, -1) + p;
    else out += (out ? " " : "") + p;
  }
  return out;
}

/** Strip Project Gutenberg header/footer boilerplate. */
export function stripGutenberg(text: string): string {
  if (!/project gutenberg/i.test(text)) return text;
  const startRe =
    /\*\*\* ?START OF (THE |THIS )?(PROJECT GUTENBERG|EBOOK|E-TEXT)[^\n]*\n/i;
  const endRe = /\*\*\* ?END OF (THE |THIS )?(PROJECT GUTENBERG|EBOOK|E-TEXT)/i;
  const start = text.search(startRe);
  if (start !== -1) {
    const body = text.slice(start);
    const end = body.search(endRe);
    let core = end !== -1 ? body.slice(0, end) : body;
    core = core.replace(startRe, "");
    return core;
  }
  const license = text.search(/End of (the )?Project Gutenberg/i);
  return license !== -1 ? text.slice(0, license) : text;
}

/* ---------------- running heads / folios ---------------- */

/** Standalone page-number (folio) lines: lowercase roman front-matter ("iv"),
 *  bare arabic ("12", "144"), "Page 12", "- 12 -". UPPERCASE roman numerals
 *  are deliberately excluded: "II"/"IV" are far more likely chapter numbers
 *  (see isHeading) than printed folios. */
const FOLIO_ROMAN_RE = /^\s*[ivxlcdm]{1,7}\s*$/;
const FOLIO_ARABIC_RE = /^\s*\d{1,4}\s*$/;
const FOLIO_WORD_RE = /^\s*(?:page|pg\.?|folio)\s+\d{1,4}\s*$/i;
const FOLIO_DASH_RE = /^\s*[-–—]\s*\d{1,4}\s*[-–—]\s*$/;
/** Numbered footer form: "12 | Title", "12 · Title", "12 — Title". */
const FOOTER_NUM_RE = /^\s*\d{1,4}\s*[|·—–]\s*(.{1,60})$/;

function isFolioLine(t: string): boolean {
  return (
    FOLIO_ROMAN_RE.test(t) ||
    FOLIO_ARABIC_RE.test(t) ||
    FOLIO_WORD_RE.test(t) ||
    FOLIO_DASH_RE.test(t)
  );
}

function footerKey(t: string): string | null {
  const m = FOOTER_NUM_RE.exec(t);
  if (!m) return null;
  // Normalize the varying number away so "12 | Moby Dick" and
  // "13 | Moby Dick" collapse to one repeating footer identity.
  return (m[1] ?? "").replace(/\d+/g, "#").trim().toLowerCase();
}

/** Remove running headers/footers (short lines repeated many times),
 *  standalone page-number lines (once ≥ 5 appear anywhere in the document),
 *  and numbered footers ("12 | Title") that repeat with the same tail. */
export function dedupeRunningHeads(lines: RawLine[]): {
  lines: RawLine[];
  removed: number;
} {
  const freq = new Map<string, number>();
  let folioCount = 0;
  const footers = new Map<string, number>();
  for (const l of lines) {
    const t = l.text.trim();
    if (!t || l.heading) continue;
    if (isFolioLine(t)) {
      folioCount++;
      continue;
    }
    const fk = footerKey(t);
    if (fk !== null) {
      footers.set(fk, (footers.get(fk) ?? 0) + 1);
      continue;
    }
    if (t.length < 60)
      freq.set(t.toLowerCase(), (freq.get(t.toLowerCase()) ?? 0) + 1);
  }
  // Page numbers are individually distinct, so unlike repeated running
  // heads they only become removable as a class — 5+ of them anywhere in
  // the document is a printed-folio signature, not chapter structure
  // (headings are exempt above, and uppercase chapter numerals never
  // enter the class).
  const dropFolios = folioCount >= 5;
  const dropFooterKeys = new Set(
    [...footers.entries()].filter(([, c]) => c >= 5).map(([k]) => k),
  );
  let removed = 0;
  const kept = lines.filter((l) => {
    const t = l.text.trim();
    if (!t || l.heading) return true;
    if (dropFolios && isFolioLine(t)) {
      removed++;
      return false;
    }
    if (dropFooterKeys.size > 0) {
      const fk = footerKey(t);
      if (fk !== null && dropFooterKeys.has(fk)) {
        removed++;
        return false;
      }
    }
    const n = freq.get(t.toLowerCase()) ?? 0;
    if (
      n >= 5 &&
      n / Math.max(1, lines.length) > 0.012 &&
      t.length < 60 &&
      !l.heading
    ) {
      removed++;
      return false;
    }
    return true;
  });
  return { lines: kept, removed };
}

/* ---------------- chapter detection ---------------- */

const HEADWORD_RE =
  /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix|glossary|part|book|chapter|section|canto|act|scene|letter|entry|note|kapitel|teil|buch|chapitre|partie|livre|cap[ií]tulo|parte|libro)\b/i;

/* English word + ordinal numbers, used for "CHAPTER ONE" / "FIRST CHAPTER". */
const EN_CARDINALS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
const EN_ORDINALS =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|final|last";
const EN_WORD_NUM_RE = new RegExp(
  `\\b(?:${EN_CARDINALS}|${EN_ORDINALS})(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?\\b`,
  "i",
);

/** Value of an uppercase Roman numeral (subtractive notation), used to
 *  bound bare-numeral headings to real chapter ranges (II…L). */
const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
function romanValue(s: string): number {
  let v = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALUES[s[i] ?? ""] ?? 0;
    const next = ROMAN_VALUES[s[i + 1] ?? ""] ?? 0;
    v += cur < next ? -cur : cur;
  }
  return v;
}

/** Pronouns and contractions that mark an ALL-CAPS line as shouted dialogue
 *  or emphasis ("I SAID NO", "DON'T TOUCH IT") rather than a heading. */
const CAP_PRONOUN_RE =
  /\b(I|ME|MY|YOU|YOUR|HE|HIM|HIS|SHE|HER|IT|ITS|WE|US|OUR|OURS|THEY|THEM|THEIR|THEIRS|DON'T|DON’T|CAN'T|CAN’T|WON'T|WON’T|DIDN'T|DIDN’T|ISN'T|ISN’T|AIN'T|AIN’T|LET'S|LET’S|I'M|I’M|I'LL|I’LL|YOU'RE|YOU’RE|WE'RE|WE’RE|THEY'RE|THEY’RE|IT'S|IT’S)\b/;

export function isHeading(t: string): boolean {
  const s = t.trim();
  if (s.length < 2 || s.length > 80) return false;
  // Narrow carve-out BEFORE the punctuation guard: "Chapter 12." / "PART II."
  // — a headword + number + trailing period is a legitimate heading form
  // that would otherwise be rejected as a sentence. Bare numbered heads
  // ("12.", "IV.", "12)") belong to the same family; the roman form is
  // UPPERCASE and value-bounded (1…50) to match the bare-numeral rule
  // below, so pseudo-words spelled from roman letters ("mild.", "vivid.")
  // can't pose as numerals.
  const romanTailVal = /^[IVXL]{1,7}[.)]$/.test(s)
    ? romanValue(s.slice(0, -1))
    : 0;
  if (
    /^(?:the\s+)?(?:chapter|part|book|canto|act|scene|section)\s+(?:[ivxlcdm]+|\d{1,3})\.\s*$/i.test(
      s,
    ) ||
    /^\d{1,3}[.)]\s*$/.test(s) ||
    (romanTailVal >= 1 && romanTailVal <= 50)
  )
    return true;
  // False-positive filter: a heading never ends in sentence punctuation.
  // Trailing closing quotes/brackets are stripped first so a shouted
  // “HELLO!” or “NO, NOT THAT.” in a play can't pose as a heading.
  const core = s.replace(/["'“”‘’)\]]+$/u, "").trim();
  if (!core) return false;
  if (/[.!?…]$/.test(core)) return false;
  // German / French / Spanish / English headwords ("Kapitel", "Chapitre",
  // "Capítulo", "PROLOGUE", "EPILOGUE", "FOREWORD", "AFTERWORD", …) at
  // the start of the line.
  if (HEADWORD_RE.test(s)) return true;
  // English: "CHAPTER ONE", "PART TWO", "CHAPTER TWENTY-THREE", etc.
  if (
    /^(?:the\s+)?(?:chapter|part|book|canto|act|scene|section)\s+/i.test(s) &&
    EN_WORD_NUM_RE.test(s)
  )
    return true;
  // English: "FIRST CHAPTER", "THE THIRD BOOK", "FINAL ACT".
  if (
    new RegExp(
      `^(?:the\\s+)?(?:${EN_ORDINALS})\\s+(?:chapter|part|book|canto|act|scene|section)\\b`,
      "i",
    ).test(s)
  )
    return true;
  // Numeric / Roman forms (English) — "CHAPTER I", "Chapter 12",
  // "PART II — The Chase", with or without a title after the number.
  if (/^(chapter|part|book|canto|act)\s+[ivxlcdm0-9]+[.:—-]?(\s.*)?$/i.test(s))
    return true;
  /* CJK chapter markers: 第一章 / 第1章 / 第三节 / 第五回 … (with or without a title after) */
  if (/^第\s*[0-9０-９一二三四五六七八九十百千两]+\s*[章节回部卷篇].*$/.test(s))
    return true;
  if (/^[ivxlcdm]{1,7}[.)]\s*$/i.test(s)) return true;
  /* Bare uppercase Roman numeral chapter numbers, "II" … "XLVIII" (parsed
   * up to ~L). A lone "I" (value 1) is excluded — the pronoun in dialogue
   * is far more common than a chapter numbered I on its own line. */
  if (/^[IVXL]+$/.test(s)) {
    const v = romanValue(s);
    if (v >= 2 && v <= 50) return true;
  }
  /* Roman numeral + title ("IV. The Return", "XII — Salt") */
  if (/^[ivxlcdm]{1,7}[.):—-]\s+\S.*$/i.test(s) && s.split(/\s+/).length <= 9)
    return true;
  /* Bare number headings: "12." / "12)" */
  if (/^\d{1,3}[.)]\s*$/.test(s)) return true;
  /* Dash/colon-separated number headings: "12 - Title", "12 — The Chase",
   * "12: Arrival" — guarded like the numbered form below. */
  if (
    /^\d{1,3}\s*[-–—:]\s+\S/.test(s) &&
    s.length <= 60 &&
    s.split(/\s+/).length <= 9
  )
    return true;
  /* Arabic-numbered heading ("7. Arrival") — guarded against list items and
     long narrative sentences that merely start with a number. The terminal
     punctuation is already excluded by the guard above. */
  if (
    /^\d{1,3}[.)]\s+\S.*$/.test(s) &&
    s.length <= 60 &&
    s.split(/\s+/).length <= 9
  )
    return true;
  /* ALL-CAPS short label ("DRAMATIS PERSONAE", "PART ONE"). Filters out
     sentences which happen to be in caps via length + word-count caps, plus
     pronoun content — an ALL-CAPS line containing I/YOU/HE/SHE/DON'T… is
     shouted dialogue or emphasis, not a heading. */
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (
    letters.length >= 4 &&
    letters.length >= s.replace(/\s/g, "").length - 2 &&
    s === s.toUpperCase() &&
    !/\d{3,}/.test(s) &&
    s.split(/\s+/).length <= 8 &&
    !CAP_PRONOUN_RE.test(s)
  ) {
    return true;
  }
  return false;
}

interface AccChapter {
  title: string;
  paras: string[];
}

/** Count words in a paragraph (whitespace-split, ignoring empty). */
function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function buildChapters(
  lines: RawLine[],
): { title: string; paras: string[] }[] {
  const chapters: AccChapter[] = [];
  let cur: AccChapter | null = null;
  let buf: string[] = [];

  const flushPara = () => {
    if (!buf.length) return;
    const para = joinLines(buf.map(cleanInline)).trim();
    buf = [];
    if (para.length > 1) {
      if (!cur) cur = { title: "Opening", paras: [] };
      cur.paras.push(para);
    }
  };

  /* Dialogue-aware structuring: a line that opens a new speaker's utterance
     (quotes, guillemets, or an em-dash speech marker) always starts a fresh
     paragraph; narrative continuation lines are mended together. */
  const SPEECH_START = /^[\u201C\u201D\u2018\u2019"'«»\u2014\u2013]/;
  for (const line of lines) {
    if (line.brk) {
      flushPara();
      continue;
    }
    const t = line.text.trim();
    if (!t) {
      flushPara();
      continue;
    }
    if ((line.heading || isHeading(t)) && t.length <= 80) {
      flushPara();
      if (cur && cur.paras.length > 0) chapters.push(cur);
      cur = { title: cleanInline(t).replace(/^#+\s*/, ""), paras: [] };
      continue;
    }
    if (SPEECH_START.test(t)) {
      // a previous paragraph that ends on closed speech also breaks here,
      // so "he said." narration never swallows the next speaker's line
      flushPara();
      buf.push(t);
      continue;
    }
    buf.push(t);
  }
  flushPara();
  if (cur && cur.paras.length > 0) chapters.push(cur);

  // A heading that ends the file with no body still counts if it's all we have.
  if (chapters.length === 0 && cur) chapters.push(cur);

  /* Merge tiny interstitial chapters: a chapter with only 1–2 very short
     paragraphs (under 50 words total) is almost certainly a false-positive
     heading (a stray ALL-CAPS line, a misclassified scene label, or a tiny
     interstitial like "***" or a single epigraph). Fold its body into the
     previous chapter so the reader doesn't get a 1-paragraph "chapter". */
  const merged: AccChapter[] = [];
  for (const ch of chapters) {
    const totalWords = ch.paras.reduce((a, p) => a + wordCount(p), 0);
    const tooSmall = ch.paras.length <= 2 && totalWords < 50;
    if (tooSmall && merged.length > 0) {
      merged[merged.length - 1]?.paras.push(...ch.paras);
    } else {
      merged.push(ch);
    }
  }

  /* A trailing chapter shorter than ~120 words is almost always a trailing
   * epigraph, license note or dangling heading: fold it into the previous
   * chapter so the book doesn't end on a one-paragraph fragment. */
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    const prev = merged[merged.length - 2];
    if (last && prev) {
      const lastWords = last.paras.reduce((a, p) => a + wordCount(p), 0);
      if (lastWords < 120) {
        prev.paras.push(...last.paras);
        merged.pop();
      }
    }
  }

  /* Explosion guard: when heading detection misfires (OCR noise, ALL-CAPS
   * dialogue in plays, per-page headers that survived dedup), the split can
   * produce hundreds of micro-chapters. If there are far too many chapters
   * AND their average size is tiny, the heading evidence is noise — fall
   * back to the even part-split instead of preserving a broken structure.
   * Genuinely long books (> 200 real chapters of real size) keep their
   * structure because the average-size check saves them. */
  if (merged.length > 200) {
    const totalWords = merged.reduce(
      (a, c) => a + c.paras.reduce((x, p) => x + wordCount(p), 0),
      0,
    );
    if (totalWords / merged.length < 250) {
      return fallbackSplit(
        merged.flatMap((c) => c.paras),
        totalWords,
      );
    }
  }
  return merged;
}

/** Split an unstructured wall of text into navigable parts (only when no headings exist).
 *  Splits on paragraph boundaries (never mid-paragraph) and prefers roughly
 *  equal parts by word count, allowing flexibility so we don't end up with a
 *  tiny orphan trailing part. */
export function fallbackSplit(
  paras: string[],
  words: number,
): { title: string; paras: string[] }[] {
  if (words < 6000) return [{ title: "Full text", paras }];
  const parts: { title: string; paras: string[] }[] = [];
  let cur: string[] = [];
  let count = 0;
  const target = 2800;
  const roman = (n: number) =>
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][
      n - 1
    ] ?? String(n);

  const flush = () => {
    if (cur.length) {
      parts.push({ title: `Part ${roman(parts.length + 1)}`, paras: cur });
      cur = [];
      count = 0;
    }
  };

  for (const p of paras) {
    const w = wordCount(p);
    // Always push the full paragraph — never split mid-paragraph.
    cur.push(p);
    count += w;
    // Decide whether to close the current part AFTER this paragraph.
    // Close if we've reached the target AND adding more would risk overshoot.
    // Specifically: if we're already at/above target, close before the next
    // paragraph would push us past maxPart. This avoids tiny orphan parts
    // (a long paragraph that pushes count from 0.5×target to 1.4×target is
    // kept whole inside the current part).
    if (count >= target) {
      // At/above target: close the part now. (count >= target implies
      // count >= minPart, and the old maxPart safety valve was unreachable
      // because maxPart > target.)
      flush();
    }
  }
  // Trailing paragraphs: if they're tiny (< 30% of target), merge back into
  // the previous part rather than creating an orphan.
  if (cur.length) {
    if (parts.length > 0 && count < target * 0.3) {
      parts[parts.length - 1]?.paras.push(...cur);
    } else {
      parts.push({ title: `Part ${roman(parts.length + 1)}`, paras: cur });
    }
  }
  return parts;
}

export function toChapters(
  sections: { title: string; paras: string[] }[],
): Chapter[] {
  let cursor = 0;
  return sections.map((s, i) => {
    const id = `ch${i}`;
    const chunks: Chunk[] = s.paras.map((text, j) => ({
      id: `${id}:${j}`,
      kind: "p" as const,
      text,
    }));
    const chapter: Chapter = {
      id,
      title: s.title || `Section ${i + 1}`,
      startChunk: cursor,
      chunks,
    };
    cursor += chunks.length;
    return chapter;
  });
}

/* ---------------- metadata ---------------- */

export function metaFromFilename(name: string): {
  title: string;
  author: string;
} {
  let base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
  // Strip marketplace/library cruft before any author inference: trailing
  // " - Gutenberg" / "- Gutenberg.org" suffixes, "(z-lib" remnants, edition
  // parentheticals ("(Annotated Edition)", "(2nd ed.)"), and trailing
  // dots/underscores/hyphens.
  base = base
    .replace(/\s*[-–—]?\s*gutenberg(?:\.(?:com|org|net))?$/i, "")
    .replace(/\(\s*z-lib[^)]*\)?/gi, "")
    .replace(
      /\s*[(\[][^)\]]*\b(?:edition|ed|annotated|illustrated|revised|unabridged|abridged|special|deluxe|updated|complete|classic|centennial)\b[^)\]]*[)\]]\s*$/i,
      "",
    )
    .replace(/[.\s_-]+$/, "")
    .trim();
  const dash = base.split(/\s+[-–—]\s+/);
  const dashAuthor = dash[0];
  const dashTitle = dash[1];
  if (
    dashAuthor !== undefined &&
    dashTitle !== undefined &&
    dashAuthor.length > 1 &&
    dashTitle.length > 1
  ) {
    return { author: titleCase(dashAuthor), title: titleCase(dashTitle) };
  }
  const paren = base.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren)
    return {
      title: titleCase(paren[1] ?? ""),
      author: titleCase(paren[2] ?? ""),
    };
  return { title: titleCase(base) || "Untitled", author: "Unknown author" };
}

export function titleCase(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const hasCaps = words.some((w) => /[A-Z]{2,}/.test(w));
  if (hasCaps) return words.join(" ");
  return words
    .map((w, i) =>
      i > 0 &&
      /^(of|the|a|an|and|or|in|on|at|to|for|with)$/.test(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export function detectLanguage(sample: string): string {
  const words = sample.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 600);
  if (!words.length) return "und";
  const stops = new Set([
    "the",
    "and",
    "of",
    "to",
    "in",
    "was",
    "is",
    "that",
    "it",
    "he",
    "she",
    "with",
    "for",
    "as",
    "had",
    "his",
    "her",
    "not",
    "but",
    "be",
  ]);
  let hits = 0;
  for (const w of words) if (stops.has(w.replace(/[^a-z']/g, ""))) hits++;
  return hits / words.length > 0.045 ? "en" : "und";
}

/* ---------------- quality scoring ---------------- */

/** Optional extras for scoreQuality — supplied by ingestFile, where the
 *  paragraph count is known. Additive: callers may keep the 3-arg form. */
export interface QualityOpts {
  /** total paragraph/chunk count — powers the orphan-heading heuristic */
  paragraphs?: number;
}

export function scoreQuality(
  text: string,
  chapterCount: number,
  notes: string[],
  opts: QualityOpts = {},
): QualityReport {
  let score = 100;
  const words = text.split(/\s+/).filter(Boolean);
  const garbage = (text.match(/[^\p{L}\p{N}\p{P}\p{S}\p{Z}\n]/gu) ?? []).length;
  const garbageRatio = text.length ? garbage / text.length : 0;
  if (garbageRatio > 0.02) {
    score -= 25;
    notes.push("Unusual character noise detected (possible OCR artifacts).");
  } else if (garbageRatio > 0.005) {
    score -= 10;
    notes.push("Minor character noise detected.");
  }
  // Mojibake (UTF-8 read as Latin-1) is invisible to the garbage counter —
  // those mojibake codepoints are legitimate letters — so it needs its own
  // probe. It degrades every downstream keyword/summary pass.
  if (detectMojibake(text)) {
    score -= 15;
    notes.push("Possible encoding damage: accented words may look garbled.");
  }
  // Orphan-heading signal: many chapters but almost no paragraphs per
  // chapter means heading detection outran the actual text.
  const paragraphs = opts.paragraphs ?? 0;
  if (chapterCount > 12 && paragraphs > 0 && paragraphs / chapterCount < 1.8) {
    score -= 10;
    notes.push("Many headings with very little body text.");
  }
  if (words.length) {
    const avgLen = words.reduce((a, w) => a + w.length, 0) / words.length;
    if (avgLen < 3.1) {
      score -= 15;
      notes.push("Very short average word length: text may be fragmented.");
    }
    const shortRatio = words.filter((w) => w.length <= 2).length / words.length;
    if (shortRatio > 0.32) {
      score -= 10;
      notes.push("Many short tokens: layout debris may remain.");
    }
  }
  if (chapterCount <= 1 && words.length > 4000)
    notes.push(
      "No structural headings found; text is navigated as continuous parts.",
    );
  if (words.length < 120) {
    score -= 30;
    notes.push("Very little extractable text.");
  }
  return { score: clamp(Math.round(score), 0, 100), notes };
}

/* ---------------- parsers: text formats ---------------- */

export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 3));
  // BOM sniffing: UTF-16 LE/BE and UTF-8 BOMs are honored before the
  // utf-8 → windows-1252 cascade, so those files import as text
  // instead of mojibake.
  if (head[0] === 0xff && head[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(buf);
  if (head[0] === 0xfe && head[1] === 0xff)
    return new TextDecoder("utf-16be").decode(buf);
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf)
    return new TextDecoder("utf-8").decode(buf.slice(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function txtToLines(raw: string): RawLine[] {
  const text = stripGutenberg(raw).replace(/\r\n?/g, "\n");
  return text.split("\n").map((text2) => ({ text: text2 }));
}

export function markdownToLines(raw: string): RawLine[] {
  const out: RawLine[] = [];
  let fence = false;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push({ text: line });
      continue;
    }
    if (/^\s*(<!--.*-->|\s*)$/.test(line)) {
      if (!line.trim()) out.push({ text: "" });
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,3})\s+(.*)$/);
    if (h) {
      out.push({ text: stripMd(h[2] ?? ""), heading: true });
      continue;
    }
    // Setext underline: a run of "=" (h1) or 3+ "-" (h2) directly under a
    // short plain-text line promotes that line to a heading and consumes
    // the underline. When the previous line isn't promotable (blank,
    // already a heading, too long, sentence-like), the run is a thematic
    // break instead → chapter-break hint.
    if (/^\s*(={2,}|-{3,})\s*$/.test(line)) {
      const prev = out[out.length - 1];
      const pt = prev?.text.trim() ?? "";
      if (
        prev &&
        !prev.heading &&
        pt.length > 1 &&
        pt.length <= 60 &&
        !/[.!?…]$/.test(pt)
      ) {
        prev.heading = true;
        continue;
      }
      out.push({ text: "", brk: true });
      continue;
    }
    // Other thematic-break forms: "***", "* * *", "- - -".
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push({ text: "", brk: true });
      continue;
    }
    // Blockquotes (and nested ">> ") stay as body text; stripMd removes
    // the quote markers so only the quoted prose remains.
    out.push({ text: stripMd(line) });
  }
  return out;
}

export function stripMd(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)([^*_]+)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    // strip leading blockquote markers, one per nesting level ("> > quoted")
    .replace(/^\s*(?:>\s?)+/, "")
    .replace(/^\s*[-*+]\s+/, "• ");
}

/** Extract readable lines from an HTML document (shared by .html files and
 *  EPUB chapters). All six heading levels map to the heading flag; the
 *  DOMParser pass has already decoded numeric + named entities (&amp;,
 *  &#8212;, &nbsp;…) before any line splitting happens here, and
 *  script/style/nav/footer/aside chrome is removed outright. */
export function domToLines(
  root: Element,
  headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"],
): RawLine[] {
  root
    .querySelectorAll(
      "script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,figure > figcaption",
    )
    .forEach((n) => n.remove());
  const scope =
    root.querySelector("article") ?? root.querySelector("main") ?? root;
  const nodes = scope.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre");
  // Extraction budgets: nested structural elements (blockquote-in-
  // blockquote, li-in-li) each expose the FULL descendant text, so crafted
  // deep nesting used to amplify extracted text ~d²/2 and freeze the tab.
  // Per-element skip + a cumulative ceiling keep the walk bounded.
  const MAX_ELEMENT_CHARS = 4_000_000;
  const MAX_EXTRACT_CHARS = 60_000_000;
  let extracted = 0;
  const out: RawLine[] = [];
  nodes.forEach((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2) return;
    if (text.length > MAX_ELEMENT_CHARS) return; // pathological single element
    extracted += text.length;
    if (extracted > MAX_EXTRACT_CHARS)
      throw new IngestError(
        "This document\u2019s text layer exceeds the import budget.",
        "size",
      );
    out.push({ text, heading: headingTags.includes(el.tagName.toLowerCase()) });
  });
  return out;
}

export function htmlToLines(raw: string): {
  lines: RawLine[];
  title?: string;
  author?: string;
} {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const title =
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.title?.trim() ||
    undefined;
  const author =
    (doc.querySelector('meta[name="author"]') as HTMLMetaElement | null)
      ?.content || undefined;
  return { lines: domToLines(doc.body), title, author };
}

/* ---------------- orchestration ---------------- */

/** Post-parse verification: proves the text layer was actually retrieved
 *  (not just that the container opened) before anything touches the shelf.
 *  Hard failures return { ok: false }; soft signals (mojibake, orphan
 *  headings, wild chapter-length variance, replacement characters) are
 *  folded into the doc's existing warning list — surfaced in the UI, never
 *  fatal — so the import still succeeds with honest caveats. */
export function verifyParsed(
  p: ParsedDoc,
): { ok: true; passages: number } | { ok: false; reason: string } {
  const passages = p.chapters.reduce((a, c) => a + c.chunks.length, 0);
  if (p.chapters.length === 0)
    return { ok: false, reason: "No chapters were detected in this file." };
  if (passages === 0)
    return { ok: false, reason: "No readable passages were extracted." };
  const nonEmpty = p.chapters.every((c) =>
    c.chunks.some((k) => k.text.trim().length > 0),
  );
  if (!nonEmpty)
    return {
      ok: false,
      reason:
        "Extracted chapters contain no text: the file may be image-only.",
    };
  if (p.wordCount < 10)
    return {
      ok: false,
      reason: "Extracted text is too short to be a document.",
    };

  const allText = p.chapters
    .flatMap((c) => c.chunks.map((k) => k.text))
    .join("\n");
  if (!allText.trim())
    return { ok: false, reason: "No readable text survived cleanup." };

  const warn = (msg: string) => {
    if (!p.warnings.includes(msg)) p.warnings.push(msg);
  };
  if (detectMojibake(allText))
    warn("Possible encoding damage: accented words may look garbled.");
  const fffd = (allText.match(/\uFFFD/g) ?? []).length;
  if (fffd > 0 && fffd / Math.max(1, allText.length) > 0.0005)
    warn("Replacement characters detected: some text could not be decoded.");
  // Orphan-heading ratio: headings massively outnumber real paragraphs.
  if (p.chapters.length > 10 && passages / p.chapters.length < 2)
    warn("Structure looks fragmented: many headings with little body text.");
  // Chapter length variance: one giant chapter among tiny ones (or the
  // reverse) usually means a split error, not an authorial choice.
  if (p.chapters.length > 3) {
    const sizes = p.chapters.map((c) =>
      c.chunks.reduce(
        (a, k) => a + k.text.split(/\s+/).filter(Boolean).length,
        0,
      ),
    );
    const sorted = [...sizes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    if (median > 40 && max / median > 12)
      warn("Chapter lengths vary widely; check for split errors.");
  }
  return { ok: true, passages };
}

export async function ingestFile(
  file: File,
  maxMB: number,
): Promise<ParsedDoc> {
  validateFile(file, maxMB);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  let fmt = detectFormat(file.name, file.type, head);
  // Extension/mime unknown but the file is a zip container (PK\x03\x04)?
  // Identify it by its internal structure (EPUB mimetype entry, OOXML parts)
  // so mislabeled or extension-less archives still import.
  if (!fmt && head[0] === 0x50 && head[1] === 0x4b) {
    fmt = await sniffZipType(file);
  }
  if (!fmt)
    throw new IngestError(
      "Couldn’t identify this file’s format from its content.",
      "content",
    );

  let raw: RawDoc;
  if (fmt === "txt") {
    raw = { lines: txtToLines(await readTextFile(file)) };
  } else if (fmt === "markdown") {
    raw = { lines: markdownToLines(await readTextFile(file)) };
  } else if (fmt === "html") {
    raw = htmlToLines(await readTextFile(file));
  } else if (fmt === "pdf") {
    raw = await parsePdf(file);
  } else if (fmt === "epub") {
    raw = await parseEpub(file);
  } else if (fmt === "pptx") {
    raw = await parsePptx(file);
  } else {
    raw = await parseDocx(file);
  }

  const deduped = dedupeRunningHeads(raw.lines);
  const notes: string[] = [];
  if (deduped.removed > 0)
    notes.push(`Removed ${deduped.removed} repeated running-header lines.`);
  notes.push(...(raw.warnings ?? []));

  let sections = buildChapters(deduped.lines);
  if (sections.length === 0)
    throw new IngestError(
      "No readable text could be extracted from this file.",
      "empty",
    );

  const allText = sections.flatMap((s) => s.paras).join("\n");
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  if (sections.length === 1)
    sections = fallbackSplit(sections[0]?.paras ?? [], wordCount);

  const chapters = toChapters(sections);
  const paragraphs = chapters.reduce((a, c) => a + c.chunks.length, 0);
  const fallback = metaFromFilename(file.name);
  const title = raw.title?.trim() || fallback.title;
  const author = raw.author?.trim() || fallback.author;

  return {
    title,
    author,
    language: detectLanguage(allText.slice(0, 4000)),
    sourceType: fmt,
    chapters,
    wordCount,
    charCount: allText.length,
    quality: scoreQuality(allText, chapters.length, notes, { paragraphs }),
    warnings: notes,
  };
}

/* ---------------- chapter/chunk helpers (used by the reader) ---------------- */

export function globalChunkCount(chapters: Chapter[]): number {
  return chapters.reduce((a, c) => a + c.chunks.length, 0);
}

export function chapterAtChunk(
  chapters: Chapter[],
  globalIdx: number,
): { chapterIndex: number; localIndex: number } {
  let acc = 0;
  for (let i = 0; i < chapters.length; i++) {
    const len = chapters[i]?.chunks.length ?? 0;
    if (globalIdx < acc + len)
      return { chapterIndex: i, localIndex: globalIdx - acc };
    acc += len;
  }
  return { chapterIndex: Math.max(0, chapters.length - 1), localIndex: 0 };
}
