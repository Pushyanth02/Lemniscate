/**
 * chapterSegmentation.ts — Chapter Boundary Detection
 *
 * Splits raw book text into chapter segments by detecting heading patterns
 * (Chapter N, Part I, Act II, Scene 3, Section IV, Prologue, etc.),
 * ALL-CAPS named titles, and divider markers (***, ---).
 *
 * Supports both uppercase and lowercase Roman numerals (I–L+ and beyond),
 * multi-line titles, and colon / dash / en-dash / em-dash subtitle separators.
 */

import type { ChapterSegment } from '../../../types/cinematifier';
import {
    STRICT_CHAPTER_RE,
    SUB_CHAPTER_RE,
    CHAPTER_PATTERNS,
    DIVIDER_RE,
    TITLE_LABEL_RE,
    MARKDOWN_TITLE_RE,
    BYLINE_RE,
    CHAPTER_HEADING_RE,
    NOISE_LINE_RE,
} from './regexPatterns';

const TITLE_FALLBACK = 'Untitled Novel';

function normalizeTitleCandidate(line: string): string {
    return line
        .replace(/^[\s"'“”‘’[\](){}]+/, '')
        .replace(/[\s"'“”‘’[\](){}]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyTitleCase(line: string): boolean {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 14) return false;

    const connectorWords = new Set([
        'a',
        'an',
        'and',
        'as',
        'at',
        'by',
        'for',
        'from',
        'in',
        'of',
        'on',
        'or',
        'the',
        'to',
        'with',
    ]);

    let titleLikeWords = 0;
    for (let i = 0; i < words.length; i++) {
        const bare = words[i].replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
        if (!bare) continue;

        const lower = bare.toLowerCase();
        if (connectorWords.has(lower) && i > 0) {
            titleLikeWords++;
            continue;
        }

        if (/^[A-Z\d]/.test(bare)) {
            titleLikeWords++;
        }
    }

    return titleLikeWords / words.length >= 0.75;
}

function looksLikeNarrativeSentence(line: string): boolean {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 7) return false;

    return /[.!?]$/.test(line) || /\b(he|she|they|we|i|the)\b/i.test(line);
}

/**
 * Extract likely book title from early document lines.
 * Strategy:
 *  - inspect first lines of text
 *  - detect explicit title patterns
 *  - score candidates and fallback if confidence is low
 */
export function extractTitle(text: string): string {
    const normalizedText = text.replace(/\r\n|\r/g, '\n').trim();
    if (!normalizedText) return TITLE_FALLBACK;

    const earlyLines = normalizedText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 40);

    if (earlyLines.length === 0) return TITLE_FALLBACK;

    // Priority 1: explicit title labels in the first lines.
    for (let i = 0; i < Math.min(12, earlyLines.length); i++) {
        const labelMatch = earlyLines[i].match(TITLE_LABEL_RE);
        if (!labelMatch) continue;

        const candidate = normalizeTitleCandidate(labelMatch[1]);
        if (candidate.length >= 2 && candidate.length <= 120) {
            return candidate;
        }
    }

    let bestCandidate = '';
    let bestScore = -Infinity;

    for (let i = 0; i < earlyLines.length; i++) {
        const raw = earlyLines[i];
        const markdownMatch = raw.match(MARKDOWN_TITLE_RE);
        const line = normalizeTitleCandidate(markdownMatch ? markdownMatch[1] : raw);
        if (!line) continue;

        if (line.length < 2 || line.length > 120) continue;
        if (NOISE_LINE_RE.test(line) || BYLINE_RE.test(line) || CHAPTER_HEADING_RE.test(line))
            continue;

        const words = line.split(/\s+/).filter(Boolean);
        let score = 0;

        // Earlier lines are stronger title candidates.
        score += Math.max(0, 30 - i * 2);

        if (markdownMatch) score += 40;
        if (/^[A-Z\d][A-Z\d\s'’&,:\-–—]+$/.test(line) && words.length >= 2) score += 35;
        if (isLikelyTitleCase(line)) score += 28;
        if (words.length >= 2 && words.length <= 12) score += 16;
        if (words.length > 16) score -= 15;
        if (looksLikeNarrativeSentence(line)) score -= 25;
        if (/[;:]$/.test(line)) score -= 8;

        // Boost if followed by a byline.
        const next = earlyLines[i + 1];
        if (next && BYLINE_RE.test(next)) score += 20;

        if (score > bestScore) {
            bestScore = score;
            bestCandidate = line;
        }
    }

    return bestScore >= 40 ? bestCandidate : TITLE_FALLBACK;
}

/** Tests whether a trimmed line matches any chapter heading pattern. */
function matchesAnyPattern(line: string): boolean {
    return CHAPTER_PATTERNS.some(p => p.test(line));
}

/**
 * Returns true if `line` qualifies as a multi-line subtitle continuation:
 * non-empty, reasonably short, and not itself a heading.
 */
function isSubtitleLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length > 0 && trimmed.length < 80 && !matchesAnyPattern(trimmed);
}

/**
 * Pre-scan text to count strict chapter headings ("Chapter N" only).
 * Used to decide whether sub-chapter markers should create new segments.
 */
function countStrictChapters(lines: string[]): number {
    let count = 0;
    for (const line of lines) {
        if (STRICT_CHAPTER_RE.test(line.trim())) {
            count++;
        }
    }
    return count;
}

function getChapterIdentifier(line: string): string | null {
    const match = line.match(STRICT_CHAPTER_RE);
    if (!match) return null;
    return match[1].trim().toLowerCase();
}

/**
 * Pre-scan text to count major structural heading candidates (including "Part", "Section", "Scene", "Prologue", "Epilogue", or numeric headings).
 * Only counts sub-chapter markers (Section/Scene/Part) if strict chapters are NOT present.
 */
function countMajorStructuralHeadings(lines: string[], strictChapterCount: number): number {
    let count = 0;
    const hasStrictChapters = strictChapterCount > 0;
    let skipTo = -1;

    for (let i = 0; i < lines.length; i++) {
        if (i < skipTo) continue;
        const line = lines[i].trim();

        // If we have strict chapters, skip sub-chapter markers (they are nested under chapters)
        if (hasStrictChapters && SUB_CHAPTER_RE.test(line) && !STRICT_CHAPTER_RE.test(line)) {
            continue;
        }

        let isStructural = false;
        let hasSubtitle = false;

        for (const pattern of CHAPTER_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                if (DIVIDER_RE.test(line)) {
                    break; // Dividers are visual breaks, not major structural headings
                }
                isStructural = true;
                if (match[3]) {
                    hasSubtitle = true;
                }
                break;
            }
        }

        if (isStructural) {
            count++;
            // Handle multi-line subtitle peek to mirror main loop skipTo logic
            if (!hasSubtitle) {
                let nextIdx = i + 1;
                while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
                    nextIdx++;
                }
                if (nextIdx < lines.length && isSubtitleLine(lines[nextIdx])) {
                    skipTo = nextIdx + 1;
                }
            }
        }
    }
    return count;
}

export function segmentChapters(fullText: string): ChapterSegment[] {
    if (fullText.trim().length === 0) return [];
    const lines = fullText.split('\n');
    const segments: ChapterSegment[] = [];
    let currentSegment: { title: string; startLine: number; lines: string[]; sections: string[] } | null = null;
    let skipTo = -1;

    // Pre-scan: count how many strict "Chapter N" headings exist.
    const strictChapterCount = countStrictChapters(lines);
    
    // Extract distinct strict chapter identifiers (e.g. {"1"} for duplicate "Chapter 1" headings)
    const distinctStrictIdentifiers = new Set<string>();
    for (const line of lines) {
        const trimmed = line.trim();
        if (STRICT_CHAPTER_RE.test(trimmed)) {
            const id = getChapterIdentifier(trimmed);
            if (id) {
                distinctStrictIdentifiers.add(id);
            }
        }
    }

    const majorHeadingsCount = countMajorStructuralHeadings(lines, strictChapterCount);
    
    // Force single chapter mode if:
    // 1. There is at most 1 major structural heading candidate overall, OR
    // 2. There are multiple strict chapter headings, but they all refer to the same chapter (e.g., duplicates of "Chapter 1")
    const isSingleChapterMode =
        majorHeadingsCount <= 1 ||
        (distinctStrictIdentifiers.size <= 1 && strictChapterCount > 1);

    for (let i = 0; i < lines.length; i++) {
        if (i < skipTo) continue;

        const line = lines[i].trim();

        // Check if this line is a chapter marker
        let isChapterStart = false;
        let chapterTitle = '';
        let hasSubtitle = false;

        // If strict chapters are present, fold sub-chapter markers (Section/Scene/Part) into sections
        if (strictChapterCount > 0 && SUB_CHAPTER_RE.test(line) && !STRICT_CHAPTER_RE.test(line)) {
            if (currentSegment) {
                currentSegment.sections.push(line);
                currentSegment.lines.push(lines[i]);
            }
            continue;
        }

        for (const pattern of CHAPTER_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                isChapterStart = true;
                // Build chapter title from match groups
                if (match[3]) {
                    chapterTitle = match[1].trim() + ' ' + match[2] + ': ' + match[3];
                    hasSubtitle = true;
                } else if (match[2]) {
                    chapterTitle = match[1].trim() + ' ' + match[2];
                } else if (match[1]) {
                    chapterTitle = match[1].trim();
                } else {
                    chapterTitle = line;
                }
                break;
            }
        }

        // Handle dividers — in single-chapter mode, fold dividers into
        // the current segment instead of splitting into new "Section N" segments.
        if (DIVIDER_RE.test(line)) {
            if (isSingleChapterMode && currentSegment) {
                // Just keep content flowing — divider is visual, not structural
                currentSegment.lines.push(lines[i]);
                continue;
            }
            isChapterStart = true;
            chapterTitle = 'Section ' + String(segments.length + 1);
        }

        // Multi-line title: when the heading has no inline subtitle, peek ahead
        // at the next non-blank line and treat it as a subtitle if it is short
        // and doesn't look like another heading.
        if (isChapterStart && !hasSubtitle && !DIVIDER_RE.test(line)) {
            let nextIdx = i + 1;
            while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
                nextIdx++;
            }
            if (nextIdx < lines.length && isSubtitleLine(lines[nextIdx])) {
                chapterTitle += ': ' + lines[nextIdx].trim();
                skipTo = nextIdx + 1;
            }
        }

        if (isChapterStart) {
            // Save previous segment
            if (currentSegment && currentSegment.lines.length > 0) {
                const content = currentSegment.lines.join('\n').trim();
                if (content.length > 100 || segments.length === 0) {
                    // Minimum chapter length, but always allow first segment
                    segments.push({
                        title: currentSegment.title,
                        content,
                        startIndex: currentSegment.startLine,
                        endIndex: i - 1,
                    });
                }
            }

            // Start new segment
            currentSegment = {
                title: chapterTitle,
                startLine: i,
                lines: [],
                sections: [],
            };
        } else if (currentSegment) {
            currentSegment.lines.push(lines[i]);
        } else {
            // Content before first chapter marker — create an implicit introduction segment
            currentSegment = {
                title: 'Introduction',
                startLine: 0,
                lines: [],
                sections: [],
            };
            currentSegment.lines.push(lines[i]);
        }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.lines.length > 0) {
        const content = currentSegment.lines.join('\n').trim();
        if (content.length > 100 || segments.length === 0) {
            segments.push({
                title: currentSegment.title,
                content,
                startIndex: currentSegment.startLine,
                endIndex: lines.length - 1,
            });
        }
    }

    // ── Single Chapter Enforcement ──
    // When only one strict chapter heading was found and the segmentation
    // produced multiple segments (from stray sub-headings or dividers that
    // slipped through), collapse everything into the single chapter.
    if (isSingleChapterMode && segments.length > 1) {
        const primaryTitle = segments.find(s => STRICT_CHAPTER_RE.test(s.title))?.title
            ?? segments[0].title;
        const mergedContent = segments.map(s => s.content).join('\n\n');
        return [{
            title: primaryTitle,
            content: mergedContent,
            startIndex: segments[0].startIndex,
            endIndex: segments[segments.length - 1].endIndex,
        }];
    }

    // If no chapters were found, create one chapter from all text (AI fallback stub)
    if (segments.length === 0 && fullText.trim().length > 0) {
        // TODO: In future, call AI/ML model to suggest boundaries
        segments.push({
            title: 'Full Text',
            content: fullText.trim(),
            startIndex: 0,
            endIndex: lines.length - 1,
        });
    }

    return segments;
}

export interface ChapterContent {
    title: string;
    content: string;
}

/**
 * Split full book text into ordered chapters with only title/content fields.
 */
export function splitBookIntoChapters(fullText: string): ChapterContent[] {
    return segmentChapters(fullText)
        .sort((a, b) => a.startIndex - b.startIndex)
        .map(segment => ({
            title: segment.title,
            content: segment.content,
        }));
}
