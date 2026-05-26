/**
 * regexPatterns.ts — Centralized Regex Patterns for Cinematification
 *
 * Holds standard pattern recognition constants for structural markers, chapter headings,
 * time/location shifts, dialogue, narrative modes, and SFX.
 */

// ─── Roman Numerals & Base Separators ─────────────────────────
export const ROMAN_PATTERN_SRC = '(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
export const SEPARATOR_CHARACTERS = '[\\-:.–—]';

// ─── Chapter / Structural Headings ────────────────────────────
export const STRICT_CHAPTER_RE = /\bChapter\s*(\d+|(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))\b[:-]?\s*(.*)/i;
export const SUB_CHAPTER_RE = /^\s*(section|scene|part)\s+[\divxlcdm]+/i;

export const CHAPTER_HEADER_PATTERN = /^(chapter|part|book|prologue|epilogue)\s*[\d\w]+/i;
export const ACT_SCENE_SECTION_PATTERN = /^(act|scene|section)\s+(\d+|[IVXLCDM]+)\b/i;
export const ROMAN_NUMERAL_PATTERN = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;

// ─── Scene Break & Structural Dividers ────────────────────────
export const SCENE_BREAK_SIGNALS =
    /(later that night|meanwhile|hours later|at dawn|suddenly|in another place|elsewhere|the next (morning|day|evening|night)|days later|weeks later|months later|years later|across town|back at|far away|on the other side|that morning|at nightfall|before sunrise|after sunset|in a flash|without warning|in an instant|moments later|a while later|at the same time|at that moment|\*\*\*|---|###|\.{3,}|\s{3,})/i;

export const CUSTOM_SCENE_BREAK_PATTERNS: RegExp[] = [
    /^\s*[*\-#=~_]{3,}\s*$/,  // e.g. *** --- ###
    /^\s*\.{3,}\s*$/,        // e.g. ...
    /^\s*\s*$/,              // blank lines
    /^\s*[◆•][\s◆•]{2,}\s*$/, // ornamental dividers like ◆ ◆ ◆, • • •
];

export const DIVIDER_RE = /^[-*#=~_]{3,}\s*$|^\.{3,}\s*$|^\s*[◆•][\s◆•]{2,}\s*$/;

// ─── Time & Location Shift Patterns ───────────────────────────
export const TIME_PATTERN =
    /\b(that night|that morning|the next day|at dawn|at dusk|hours later|days later|meanwhile)\b/i;

export const TIME_SHIFT_PATTERN =
    /\b(later|earlier|meanwhile|the next (?:morning|day|night|evening)|at (?:dawn|dusk|sunrise|sunset|nightfall)|that (?:night|morning|evening)|hours later|days later|weeks later|months later|years later)\b/i;

export const LOCATION_PATTERN =
    /\b(?:[Ii]n|[Aa]t|[Oo]n|[Nn]ear|[Bb]eside|[Ii]nside|[Oo]utside|[Bb]eneath|[Aa]bove|[Aa]cross)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

export const LOCATION_SHIFT_PATTERN =
    /\b(?:[Ii]n|[Aa]t|[Oo]n|[Ii]nside|[Oo]utside|[Nn]ear|[Aa]cross|[Bb]ack at|[Bb]eyond)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

export const NARRATIVE_TRANSITION_PATTERN =
    /\b(meanwhile|elsewhere|back in|back at|on the other side|later|earlier|in another place|at the same time|as for)\b/i;

export const ORIGINAL_MODE_TIME_SHIFT_PATTERN =
    /\b(later that night|later that day|hours later|days later|weeks later|months later|years later|meanwhile|the next morning|the next day|the following morning|at dawn|at dusk|at nightfall|before sunrise|after sunset|that night|that morning)\b/i;

export const ORIGINAL_MODE_LOCATION_PATTERN =
    /\b(?:in|at|on|inside|outside|near|within|beneath|beyond|across)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i;

export const ORIGINAL_MODE_SCENE_DIVIDER_PATTERN = /^\s*(?:\*{3,}|-{3,}|#{3,}|\.{3,}|—\s*✦\s*—)\s*$/;

// ─── Character / POV Shift Detection ──────────────────────────
export const POV_NAME_PATTERN =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:walked|thought|felt|saw|heard|knew|looked|stood|turned|ran|sat|watched|wondered|realized|remembered|noticed|whispered|said|spoke|asked|replied|muttered|sighed|screamed|cried|laughed|smiled|frowned|gazed|stared|glanced|moved|stepped|entered|left|opened|closed|grabbed|held|dropped|pulled|pushed|reached|waited|paused|hesitated|decided|began|started|continued|tried|wanted|needed|wished|hoped|feared|loved|hated)\b/;

// ─── Narrative Mode Patterns ──────────────────────────────────
export const FLASHBACK_PATTERN =
    /\b(he remembered|she remembered|they remembered|remembered when|she recalled|he recalled|they recalled|memories flooded|years ago|long ago)\b/i;

export const DREAM_PATTERN = /\b(dreaming|in the dream|the dream faded|woke with a start)\b/i;
export const MEMORY_PATTERN = /\b(the memory|recollection)\b/i;

// ─── Dialogue & Action Patterns ───────────────────────────────
export const DIALOGUE_OPENING_PATTERN = /^[""\u201C]/;
export const ACTION_PATTERN =
    /\b(explosion|attack|battle|fight|chase|escape|collision|confrontation|argument|scream|crash|gunshot|ambush|pursuit)\b/i;

export const TITLE_LABEL_RE = /^(?:title|book\s*title)\s*[:-–—]\s*(.+)$/i;
export const MARKDOWN_TITLE_RE = /^#{1,2}\s+(.+)$/;
export const BYLINE_RE = /^by\s+[\p{L}\d][\p{L}\d\s.'’-]{1,80}$/iu;
export const CHAPTER_HEADING_RE =
    /^(chapter|part|book|act|scene|section|prologue|epilogue|introduction|foreword|afterword|preface|appendix|postscript)\b/i;
export const NOISE_LINE_RE =
    /^(copyright|all rights reserved|published by|printed in|isbn|project gutenberg|www\.|https?:\/\/|table of contents|contents)\b/i;

// ─── Mood Reference Patterns ──────────────────────────────────
export const MOOD_PATTERNS: { pattern: RegExp; prefix: string }[] = [
    { pattern: /\b(terror|dread|horror|fear|scream|dark|shadow|death)\b/i, prefix: 'Dark' },
    { pattern: /\b(joy|laugh|smile|happy|delight|celebrate|cheer)\b/i, prefix: 'Joyful' },
    { pattern: /\b(sorrow|tears|grief|mourn|weep|loss|tragic)\b/i, prefix: 'Sorrowful' },
    { pattern: /\b(tense|danger|threat|warn|urgent|desperate)\b/i, prefix: 'Tense' },
    { pattern: /\b(calm|peace|quiet|gentle|serene|still|rest)\b/i, prefix: 'Quiet' },
];

// ─── Comprehensive Chapter Split Patterns ─────────────────────
export const CHAPTER_PATTERNS: RegExp[] = [
    // Chapter / Part / Book headings
    new RegExp(`^(chapter\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    new RegExp(`^(part\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    new RegExp(`^(book\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    // Act / Scene headings
    new RegExp(`^(act\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    new RegExp(`^(scene\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    // Section headings (e.g. "Section 1", "Section III")
    new RegExp(`^(section\\s+)(\\d+|${ROMAN_PATTERN_SRC}|\\w+)(?:\\s*${SEPARATOR_CHARACTERS}\\s*(.*))?$`, 'im'),
    // Prologue / Epilogue / other book parts with optional subtitle
    /^(prologue|epilogue|introduction|foreword|afterword|preface|appendix|postscript)(?:\s*[:.\-–—]\s*(.*))?$/im,
    // Book/Part/Section/Volume/Act/Scene with Roman numerals or words (e.g., "Book One", "Part I")
    /^\s*(book|part|section|volume|act|scene)[ .:,-]*([\divxlc]+)?[ .:,-]*([\w\s'"-]*)$/i,
    // Numbered chapter headings: "1. The Beginning" or "II. The Return"
    new RegExp(`^(\\d+|${ROMAN_PATTERN_SRC})[.)]\\s+(.+)$`, 'im'),
    // Numbered chapter headings: "1 - The Beginning" or "IV: The Return"
    new RegExp(`^(\\d+|${ROMAN_PATTERN_SRC})\\s*${SEPARATOR_CHARACTERS}\\s*(.+)$`, 'im'),
    // Standalone PROLOGUE/EPILOGUE
    /^\s*(prologue|epilogue)\s*$/i,
    // Dividers (***, ---, ###, ..., etc.)
    /^\*{3,}\s*$/m,
    /^-{3,}\s*$/m,
    /^#{3,}\s*$/m,
    /^\.{3,}\s*$/m,
    /^\s*[◆•][\s◆•]{2,}\s*$/m,
    // ALL-CAPS standalone named titles (≥ 4 uppercase letters/spaces, e.g. "THE AWAKENING")
    /^([A-Z][A-Z ]{2,}[A-Z])\s*$/m,
];
