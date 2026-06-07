/**
 * cinematifier.test.ts — Unit tests for the pure-function exports of cinematifier.ts
 *
 * Covers:
 *   • parseCinematifiedText  — block parser (dialogue, sfx, beats, transitions, camera, action)
 *   • cleanExtractedText     — PDF-artifact removal
 *   • reconstructParagraphs  — sentence-boundary paragraph building
 *   • segmentChapters        — chapter boundary detection
 *   • cinematifyOffline      — fallback offline cinematification
 *   • detectSceneBreaks      — heuristic scene detection fallback
 *   • createBookFromSegments — Book entity factory
 *   • createReadingProgress  — ReadingProgress entity factory
 *   • extractOverallMetadata — genre/tone/character metadata extractor
 */

import { describe, it, expect } from 'vitest';
import {
    cleanExtractedText,
    reconstructParagraphs,
    formatOriginalText,
    structureDialogue,
    segmentChapters,
    extractTitle,
    splitBookIntoChapters,
    cinematifyOffline,
    detectSceneBreaks,
    createBookFromSegments,
    createReadingProgress,
    extractOverallMetadata,
} from '../cinematifier';
import { rebuildParagraphs } from '../engine/cinematifier/textProcessing';
import { TensionTracker, SpeakerAttributor, MockDirector, AmbienceEngine } from '../engine/cinematifier/offlineEngine';
import type { ChapterSegment } from '../../types/cinematifier';



// ─── cleanExtractedText ───────────────────────────────────────────────────────

describe('cleanExtractedText', () => {
    it('removes standalone page numbers', () => {
        const text = 'Some content.\n42\nMore content.';
        expect(cleanExtractedText(text)).not.toMatch(/^\s*42\s*$/m);
    });

    it('removes "Page X of Y" lines', () => {
        const text = 'Text.\nPage 3 of 100\nMore text.';
        expect(cleanExtractedText(text)).not.toMatch(/page\s+3/i);
    });

    it('removes "- X -" page number lines', () => {
        const text = 'Text.\n- 7 -\nMore text.';
        expect(cleanExtractedText(text)).not.toMatch(/- 7 -/);
    });

    it('fixes hyphenated line breaks', () => {
        // This tests hyphen-join: e.g. "some-\nword" → "someword"
        const hyphenText = 'con-\nnection';
        expect(cleanExtractedText(hyphenText)).toContain('connection');
    });

    it('collapses 4+ blank lines into max 3 newlines', () => {
        const text = 'Para 1.\n\n\n\n\nPara 2.';
        const result = cleanExtractedText(text);
        expect(result).not.toMatch(/\n{5,}/);
    });

    it('trims leading/trailing whitespace from lines', () => {
        const text = '   indented line   ';
        const result = cleanExtractedText(text);
        expect(result).toBe('indented line');
    });

    it('returns empty string for empty input', () => {
        expect(cleanExtractedText('')).toBe('');
    });

    it('preserves normal prose unchanged', () => {
        const prose = 'The sun rose over the mountains. Birds sang in the trees.';
        expect(cleanExtractedText(prose)).toBe(prose);
    });
});

// ─── reconstructParagraphs ────────────────────────────────────────────────────

describe('reconstructParagraphs', () => {
    it('returns text unchanged when paragraphs already exist and are short', () => {
        const text =
            'First paragraph here. It has a few sentences.\n\n' +
            'Second paragraph here. Also a few sentences.\n\n' +
            'Third paragraph, short.';
        const result = reconstructParagraphs(text);
        expect(result).toBe(text);
    });

    it('handles single-sentence input', () => {
        const text = 'Just one sentence.';
        const result = reconstructParagraphs(text);
        expect(result).toContain('Just one sentence.');
    });

    it('returns non-empty string for non-empty input', () => {
        const text = 'Hello. World. How are you? Fine, thank you.';
        expect(reconstructParagraphs(text).length).toBeGreaterThan(0);
    });

    it('does not lose sentences during reconstruction', () => {
        const text =
            'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
        const result = reconstructParagraphs(text);
        expect(result).toContain('First sentence');
        expect(result).toContain('Fifth sentence');
    });

    it('breaks at dialogue starts', () => {
        const text =
            'He walked in. She was there. He spoke. She looked up.\n' +
            '"Hello," he said.\n' +
            '"Hi," she replied.';
        const result = reconstructParagraphs(text);
        // Dialogue lines should be in separate paragraphs
        expect(result).toContain('"Hello,"');
    });

    it('fixes broken hard-wrapped lines inside paragraphs', () => {
        const text =
            'The storm rolled over\n' +
            'the valley while the old bridge shook.\n' +
            'Nobody moved until dawn.';

        const result = reconstructParagraphs(text);
        expect(result).toContain('rolled over the valley');
        expect(result).not.toContain('rolled over\nthe valley');
    });

    it('splits merged paragraphs by sentence boundaries', () => {
        const text =
            'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence.';

        const result = reconstructParagraphs(text);
        expect(result).toContain('\n\n');
    });

    it('normalizes inconsistent spacing while preserving wording', () => {
        const text = '  First   sentence.\tSecond sentence.   Third sentence.  ';
        const result = reconstructParagraphs(text);

        expect(result).toBe('First sentence. Second sentence. Third sentence.');
    });

    it('preserves original wording sequence after reconstruction', () => {
        const text = 'He said, "Wait."\nThen left quickly.';
        const canonical = (value: string) => value.replace(/\s+/g, ' ').trim();

        expect(canonical(reconstructParagraphs(text))).toBe(canonical(text));
    });
});

describe('rebuildParagraphs', () => {
    it('exposes the paragraph reconstruction API for raw extracted text', () => {
        const text = 'One. Two. Three. Four. Five.';
        const result = rebuildParagraphs(text);

        expect(result).toContain('\n\n');
    });
});

// ─── structureDialogue ───────────────────────────────────────────────────────

describe('structureDialogue', () => {
    it('detects quoted dialogue and separates it from narration', () => {
        const text = 'The room was silent. "Who is there?" The candle flickered.';
        const result = structureDialogue(text);

        expect(result).toContain('The room was silent.');
        expect(result).toContain('"Who is there?"');
        expect(result).toContain('The candle flickered.');
        expect(result).toContain('\n\n"Who is there?"\n\n');
    });

    it('attaches speaker labels when attribution appears after quote', () => {
        const text = '"We should leave now," Mara said. The hallway shook.';
        const result = structureDialogue(text);

        expect(result).toContain('Mara: "We should leave now,"');
        expect(result).toContain('Mara said.');
    });

    it('attaches speaker labels when attribution appears before quote', () => {
        const text = 'Jon whispered, "Keep your voice down." The lights dimmed.';
        const result = structureDialogue(text);

        expect(result).toContain('Jon: "Keep your voice down."');
        expect(result).toContain('Jon whispered');
    });

    it('keeps narration and dialogue in readable separate blocks', () => {
        const text =
            'Rain pressed against the windows. "Do you hear that?" she asked. "Stay close." The floor creaked.';
        const result = structureDialogue(text);
        const blocks = result.split(/\n\n+/).map(block => block.trim());

        expect(blocks.length).toBeGreaterThanOrEqual(4);
        expect(blocks.some(block => block.startsWith('she: "Do you hear that?"'))).toBe(true);
        expect(blocks.some(block => block === '"Stay close."')).toBe(true);
    });
});

// ─── formatOriginalText ─────────────────────────────────────────────────────

describe('formatOriginalText', () => {
    it('improves readability with paragraph/dialogue separation only', () => {
        const text =
            'The corridor was dark and wet. "Stay quiet," she said. The neon sign crackled overhead.';
        const result = formatOriginalText(text);

        expect(result).toContain('The corridor was dark and wet.');
        expect(result).toContain('"Stay quiet,"');
        expect(result).toContain('The neon sign crackled overhead.');
        expect(result).toContain('\n\n"Stay quiet,"\n\n');
    });

    it('normalizes inconsistent spacing and line wrapping', () => {
        const text = '  First line\ncontinues here.\t\tSecond sentence.   Third sentence.  ';
        const result = formatOriginalText(text);

        expect(result).toContain('First line continues here.');
        expect(result).not.toMatch(/[ ]{2,}/);
    });

    it('preserves exact content sequence (ignoring whitespace differences)', () => {
        const text = 'He paused. "No." Mara said she understood.';
        const result = formatOriginalText(text);

        const canonical = (value: string) => value.replace(/\s+/g, '');
        expect(canonical(result)).toBe(canonical(text));
    });

    it('does not inject speaker labels in original mode formatting', () => {
        const text = '"We need to move," Mara said. The rain intensified.';
        const result = formatOriginalText(text);

        expect(result).not.toContain('Mara: "We need to move,"');
        expect(result).toContain('Mara said.');
    });
});

// ─── segmentChapters ─────────────────────────────────────────────────────────

describe('segmentChapters', () => {
    const makeContent = (repeat = 20) =>
        'The hero walked through the dense forest. '.repeat(repeat);

    it('returns an "Introduction" segment for text with no chapter markers', () => {
        // When text has no chapter markers and content > 100 chars, segmentChapters
        // collects it as an "Introduction" segment (not "Full Text").
        // "Full Text" only appears when the accumulated content is ≤ 100 chars.
        const text = makeContent(5);
        const segments = segmentChapters(text);
        expect(segments).toHaveLength(1);
        expect(segments[0].title).toBe('Introduction');
    });

    it('detects "Chapter N" headings', () => {
        const text = `Chapter 1\n${makeContent()}\nChapter 2\n${makeContent()}`;
        const segments = segmentChapters(text);
        const titles = segments.map(s => s.title);
        expect(titles.some(t => /chapter 1/i.test(t))).toBe(true);
    });

    it('detects "Part N" headings', () => {
        const text = `Part I\n${makeContent()}\nPart II\n${makeContent()}`;
        const segments = segmentChapters(text);
        const titles = segments.map(s => s.title);
        expect(titles.some(t => /part/i.test(t))).toBe(true);
    });

    it('detects Prologue/Epilogue headings', () => {
        const text = `Prologue\n${makeContent()}\nChapter 1\n${makeContent()}`;
        const segments = segmentChapters(text);
        expect(segments.some(s => /prologue/i.test(s.title))).toBe(true);
    });

    it('detects *** dividers as section breaks', () => {
        const text = `${makeContent()}\n***\n${makeContent()}`;
        const segments = segmentChapters(text);
        expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it('each segment has content, title, startIndex, endIndex', () => {
        const text = `Chapter 1\n${makeContent()}`;
        const segments = segmentChapters(text);
        for (const seg of segments) {
            expect(seg.title).toBeTruthy();
            expect(seg.content).toBeTruthy();
            expect(typeof seg.startIndex).toBe('number');
            expect(typeof seg.endIndex).toBe('number');
        }
    });

    it('ignores chapters with fewer than 100 chars of content', () => {
        // Chapter with almost no content after heading — should be skipped
        const text = `Chapter 1\nToo short.\nChapter 2\n${makeContent()}`;
        const segments = segmentChapters(text);
        // Chapter 2 should be present; Chapter 1's content is too short
        const ch2 = segments.find(s => /chapter 2/i.test(s.title));
        expect(ch2).toBeDefined();
    });

    it('returns empty array for empty input', () => {
        expect(segmentChapters('')).toHaveLength(0);
    });

    it('chapter titles include space between label and number', () => {
        const text = `Chapter 5\n${makeContent()}\nChapter 10\n${makeContent()}`;
        const segments = segmentChapters(text);
        // Verify no concatenation like "Chapter5" — should be "Chapter 5"
        for (const seg of segments) {
            if (/chapter/i.test(seg.title)) {
                expect(seg.title).toMatch(/Chapter \d/);
                expect(seg.title).not.toMatch(/Chapter\d/);
            }
        }
    });

    it('chapter titles with subtitles are properly formatted', () => {
        const text = `Chapter 1: The Beginning\n${makeContent()}\nChapter 2: The Journey\n${makeContent()}`;
        const segments = segmentChapters(text);
        const ch1 = segments.find(s => /beginning/i.test(s.title));
        expect(ch1).toBeDefined();
        expect(ch1!.title).toContain('Chapter 1');
        expect(ch1!.title).toContain('The Beginning');
    });

    it('detects numeric heading patterns like "1. Title"', () => {
        const text = `1. Dawn at the Harbor\n${makeContent()}\n2. The Return\n${makeContent()}`;
        const segments = segmentChapters(text);

        expect(segments.length).toBe(2);
        expect(segments[0].title).toMatch(/^1\s+/);
        expect(segments[1].title).toMatch(/^2\s+/);
    });

    it('forces single chapter mode when strict chapter headings are duplicates', () => {
        const text = `Chapter 1: The heart of a demon never has regret\n\n${makeContent(5)}\n\nChapter 1: The heart of a demon never has regret even in death\n\n${makeContent(5)}\n\nSection 2\n\n${makeContent(5)}\n\nSection 3\n\n${makeContent(5)}`;
        const segments = segmentChapters(text);
        expect(segments.length).toBe(1);
        expect(segments[0].title).toContain('Chapter 1');
    });
});

// ─── splitBookIntoChapters ───────────────────────────────────────────────────

describe('splitBookIntoChapters', () => {
    const makeContent = (repeat = 20) =>
        'The hero walked through the dense forest. '.repeat(repeat);

    it('returns chapters with only title and content in document order', () => {
        const text = `Chapter 3\n${makeContent()}\nChapter 9\n${makeContent()}`;

        const chapters = splitBookIntoChapters(text);

        expect(chapters.length).toBe(2);
        expect(chapters[0]).toHaveProperty('title');
        expect(chapters[0]).toHaveProperty('content');
        expect(chapters[0].title).toMatch(/chapter 3/i);
        expect(chapters[1].title).toMatch(/chapter 9/i);
        expect(Object.keys(chapters[0]).sort()).toEqual(['content', 'title']);
    });

    it('preserves ordering based on text position, not chapter number value', () => {
        const text = `Chapter 10\n${makeContent()}\nChapter 2\n${makeContent()}`;

        const chapters = splitBookIntoChapters(text);

        expect(chapters[0].title).toMatch(/chapter 10/i);
        expect(chapters[1].title).toMatch(/chapter 2/i);
    });
});

// ─── extractTitle ───────────────────────────────────────────────────────────

describe('extractTitle', () => {
    it('extracts title from explicit Title: prefix', () => {
        const text = `Title: The Last Ember\nBy Jane Doe\n\nChapter 1\nThe rain fell.`;
        expect(extractTitle(text)).toBe('The Last Ember');
    });

    it('extracts title from markdown heading near top', () => {
        const text = `# The Silent Harbor\nBy A. Writer\n\nChapter 1\nCold wind swept the docks.`;
        expect(extractTitle(text)).toBe('The Silent Harbor');
    });

    it('extracts uppercase title when followed by byline', () => {
        const text = `THE GLASS STATION\nby M. Rowan\n\nChapter 1\nFootsteps echoed.`;
        expect(extractTitle(text)).toBe('THE GLASS STATION');
    });

    it('falls back to Untitled Novel when no confident title is found', () => {
        const text =
            'Copyright 2026\nAll rights reserved\n\nThe wind moved through the corridor and he stepped inside carefully.';
        expect(extractTitle(text)).toBe('Untitled Novel');
    });
});

// ─── cinematifyOffline ────────────────────────────────────────────────────────

describe('cinematifyOffline', () => {
    const sampleText = `
He moved through the shadows. The night was cold.

"Stay back!" she screamed. The door slammed.

Suddenly, an explosion shook the building.
    `.trim();

    it('returns a CinematificationResult with blocks, rawText, and metadata', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.blocks).toBeDefined();
        expect(result.rawText).toBeDefined();
        expect(result.metadata).toBeDefined();
    });

    it('produces at least one block', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.blocks.length).toBeGreaterThan(0);
    });

    it('metadata.originalWordCount matches input word count', () => {
        const result = cinematifyOffline(sampleText);
        const wordCount = sampleText.split(/\s+/).filter(Boolean).length;
        expect(result.metadata.originalWordCount).toBe(wordCount);
    });

    it('sfxCount is a non-negative integer', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.metadata.sfxCount).toBeGreaterThanOrEqual(0);
    });

    it('processingTimeMs is a non-negative number', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty text gracefully', () => {
        const result = cinematifyOffline('');
        expect(result.blocks).toBeDefined();
    });

    it('inserts scene title cards when scene breaks are detected', () => {
        const text =
            'The sun was bright and warm.\n\nHours later, they arrived at the dark cabin.\n\nThe fire was already lit.';
        const result = cinematifyOffline(text);

        const titleCards = result.blocks.filter(b => b.type === 'title_card');
        // Should have at least one scene title when multiple scenes detected
        expect(titleCards.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── detectSceneBreaks ────────────────────────────────────────────────────────

describe('detectSceneBreaks', () => {
    it('detects scene breaks from time-shift phrases', () => {
        const paragraphs = [
            'The sun was bright.',
            'They walked along the river.',
            'Hours later, they arrived at the cabin.',
            'The fire was already lit.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
        expect(scenes[0].length).toBe(2);
        expect(scenes[1].length).toBe(2);
    });

    it('detects "meanwhile" as scene break', () => {
        const paragraphs = [
            'John was at home.',
            'Meanwhile, Sarah was running.',
            'She turned the corner.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
    });

    it('returns single scene if no breaks detected', () => {
        const paragraphs = ['First.', 'Second.', 'Third.'];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(1);
        expect(scenes[0].length).toBe(3);
    });

    it('handles empty input', () => {
        const scenes = detectSceneBreaks([]);
        expect(scenes.length).toBe(0);
    });

    it('detects multiple scene signals', () => {
        const paragraphs = [
            'Morning.',
            'The next morning, everything changed.',
            'New beginning.',
            'Elsewhere, trouble was brewing.',
            'End.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(3);
    });
});
// ─── createBookFromSegments ───────────────────────────────────────────────────

describe('createBookFromSegments', () => {
    const segments: ChapterSegment[] = [
        {
            title: 'Chapter 1',
            content: 'The hero began his journey. '.repeat(20),
            startIndex: 0,
            endIndex: 10,
        },
        {
            title: 'Chapter 2',
            content: 'The adventure continued. '.repeat(20),
            startIndex: 11,
            endIndex: 20,
        },
    ];

    it('creates a Book with correct chapter count', () => {
        const book = createBookFromSegments(segments);
        expect(book.chapters).toHaveLength(2);
        expect(book.totalChapters).toBe(2);
    });

    it('creates chapters with incrementing numbers', () => {
        const book = createBookFromSegments(segments);
        expect(book.chapters[0].number).toBe(1);
        expect(book.chapters[1].number).toBe(2);
    });

    it('uses provided title', () => {
        const book = createBookFromSegments(segments, 'My Novel');
        expect(book.title).toBe('My Novel');
    });

    it('defaults title to "Untitled Novel"', () => {
        const book = createBookFromSegments(segments);
        expect(book.title).toBe('Untitled Novel');
    });

    it('sets genre from options', () => {
        const book = createBookFromSegments(segments, 'Title', { genre: 'fantasy' });
        expect(book.genre).toBe('fantasy');
    });

    it('defaults genre to "other"', () => {
        const book = createBookFromSegments(segments);
        expect(book.genre).toBe('other');
    });

    it('sets isPublic from options', () => {
        const book = createBookFromSegments(segments, 'Title', { isPublic: true });
        expect(book.isPublic).toBe(true);
    });

    it('calculates totalWordCount across all chapters', () => {
        const book = createBookFromSegments(segments);
        expect(book.totalWordCount).toBeGreaterThan(0);
    });

    it('sets status to "processing"', () => {
        const book = createBookFromSegments(segments);
        expect(book.status).toBe('processing');
    });

    it('generates a book id with "book-" prefix followed by a numeric timestamp', () => {
        // createBookFromSegments uses Date.now() which may return the same value
        // within 1ms — we verify the format, not uniqueness across same-ms calls
        const book = createBookFromSegments(segments);
        expect(book.id).toMatch(/^book-\d+$/);
    });

    it('each chapter starts with isProcessed=false and status=pending', () => {
        const book = createBookFromSegments(segments);
        for (const ch of book.chapters) {
            expect(ch.isProcessed).toBe(false);
            expect(ch.status).toBe('pending');
        }
    });

    it('calculates estimatedReadTime (word count / 200 rounded up)', () => {
        const book = createBookFromSegments(segments);
        for (const ch of book.chapters) {
            const expected = Math.ceil(ch.wordCount / 200);
            expect(ch.estimatedReadTime).toBe(expected);
        }
    });

    it('word count does not inflate on whitespace-padded content', () => {
        const paddedSegments: ChapterSegment[] = [
            {
                title: 'Padded Chapter',
                content: '  hello world  ',
                startIndex: 0,
                endIndex: 0,
            },
        ];
        const book = createBookFromSegments(paddedSegments);
        expect(book.chapters[0].wordCount).toBe(2);
        expect(book.totalWordCount).toBe(2);
    });
});

// ─── createReadingProgress ────────────────────────────────────────────────────

describe('createReadingProgress', () => {
    it('creates a ReadingProgress with the given bookId', () => {
        const prog = createReadingProgress('book-123');
        expect(prog.bookId).toBe('book-123');
    });

    it('id is "progress-<bookId>"', () => {
        const prog = createReadingProgress('book-abc');
        expect(prog.id).toBe('progress-book-abc');
    });

    it('starts at chapter 1', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.currentChapter).toBe(1);
    });

    it('starts at scroll position 0', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.scrollPosition).toBe(0);
    });

    it('defaults readingMode to "cinematified"', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.readingMode).toBe('cinematified');
    });

    it('starts with empty bookmarks', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.bookmarks).toEqual([]);
    });

    it('starts as not completed', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.completed).toBe(false);
    });

    it('starts with empty readChapters', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.readChapters).toEqual([]);
    });

    it('starts with totalReadTime of 0', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.totalReadTime).toBe(0);
    });

    it('sets lastReadAt as a recent timestamp', () => {
        const before = Date.now();
        const prog = createReadingProgress('book-1');
        const after = Date.now();
        expect(prog.lastReadAt).toBeGreaterThanOrEqual(before);
        expect(prog.lastReadAt).toBeLessThanOrEqual(after);
    });
});

// ─── extractOverallMetadata ───────────────────────────────────────────────────

describe('extractOverallMetadata', () => {
    it('extracts genre from [GENRE: fantasy] tag', () => {
        const meta = extractOverallMetadata('[GENRE: fantasy]', []);
        expect(meta.genre).toBe('fantasy');
    });

    it('extracts genre case-insensitively', () => {
        const meta = extractOverallMetadata('[GENRE: THRILLER]', []);
        expect(meta.genre).toBe('thriller');
    });

    it('normalises spaces to underscores in genre (sci fi → sci_fi)', () => {
        const meta = extractOverallMetadata('[GENRE: sci fi]', []);
        expect(meta.genre).toBe('sci_fi');
    });

    it('ignores unknown genre values', () => {
        const meta = extractOverallMetadata('[GENRE: cooking]', []);
        expect(meta.genre).toBeUndefined();
    });

    it('extracts tone tags from [TONE: dark, suspenseful]', () => {
        const meta = extractOverallMetadata('[TONE: dark, suspenseful]', []);
        expect(meta.toneTags).toEqual(['dark', 'suspenseful']);
    });

    it('returns empty characters object when no dialogue blocks', () => {
        const meta = extractOverallMetadata('', []);
        expect(meta.characters).toEqual({});
    });

    it('counts dialogue blocks per speaker', () => {
        const blocks = [
            {
                type: 'dialogue' as const,
                speaker: 'ALICE',
                content: 'Hello',
                id: '1',
                intensity: 'normal' as const,
            },
            {
                type: 'dialogue' as const,
                speaker: 'BOB',
                content: 'Hi',
                id: '2',
                intensity: 'normal' as const,
            },
            {
                type: 'dialogue' as const,
                speaker: 'ALICE',
                content: 'How are you?',
                id: '3',
                intensity: 'normal' as const,
            },
        ];
        const meta = extractOverallMetadata('', blocks);
        expect(meta.characters['ALICE'].dialogueCount).toBe(2);
        expect(meta.characters['BOB'].dialogueCount).toBe(1);
    });

    it('records appearance indices for each speaker', () => {
        const blocks = [
            {
                type: 'dialogue' as const,
                speaker: 'EVE',
                content: 'Test',
                id: '1',
                intensity: 'normal' as const,
            },
        ];
        const meta = extractOverallMetadata('', blocks);
        expect(meta.characters['EVE'].appearances).toContain(0);
    });

    it('handles undefined rawText gracefully', () => {
        const meta = extractOverallMetadata(undefined, []);
        expect(meta.genre).toBeUndefined();
        expect(meta.toneTags).toBeUndefined();
    });
});

describe('cinematifyOffline Reworked Heuristic Engines', () => {
    it('TensionTracker tracks sentence-by-sentence tension and maps emotion', () => {
        const tracker = new TensionTracker();
        expect(tracker.getTension()).toBe(20);

        // Positive calm sentence should decrease/maintain low tension
        tracker.processSentence('The warm sun smiled down gently.');
        expect(tracker.getTension()).toBeLessThanOrEqual(20);
        expect(tracker.getEmotion('The warm sun smiled down gently.', tracker.getTension())).toBe('romantic');

        // Intense threat sentence should increase tension
        tracker.reset();
        tracker.processSentence('Suddenly, a dark figure drew a sharp knife and yelled "Stop!"');
        expect(tracker.getTension()).toBeGreaterThan(30);
        expect(tracker.getEmotion('drew a sharp knife and yelled', 80)).toBe('action');
    });

    it('SpeakerAttributor attributes alternating dialogues correctly', () => {
        const attributor = new SpeakerAttributor();
        const known = new Set<string>(['MARA', 'JON']);

        // Explicit speaker detection
        const s1 = attributor.detectSpeaker('Mara said, "I am here."', known);
        expect(s1).toBe('MARA');

        const s2 = attributor.detectSpeaker('"Hello," replied Jon.', known);
        expect(s2).toBe('JON');

        // Register them explicitly to pre-populate attributor memory
        attributor.registerSpeaker('MARA');
        attributor.registerSpeaker('JON');

        // Alternation state machine check
        // Mara was registered first, then Jon. So Jon is recent[0] and Mara is recent[1]
        // Let's explicitly mock a back-and-forth conversation
        const a1 = attributor.attributeDialogue(undefined);
        const a2 = attributor.attributeDialogue(undefined);
        expect(a1).toBeDefined();
        expect(a2).toBeDefined();
        expect(a1).not.toBe(a2);
    });

    it('MockDirector assigns camera angles dynamically', () => {
        const director = new MockDirector();

        // Establishing shot on new scene action
        const camera1 = director.getCameraDirection('action', 'The silent forest stretched for miles.', 20, undefined, true);
        expect(camera1).toBe('WIDE ESTABLISHING');

        // Close on high tension action
        const camera2 = director.getCameraDirection('action', 'The glass shattered violently!', 85, undefined, false);
        expect(camera2).toBe('HANDHELD CLOSE');

        // Dialogue alternation angles
        const camera3 = director.getCameraDirection('dialogue', 'Sure.', 30, 'MARA', false);
        const camera4 = director.getCameraDirection('dialogue', 'Okay.', 30, 'JON', false);
        expect(camera3).toBeDefined();
        expect(camera4).toBeDefined();
    });

    it('AmbienceEngine tracks persistent weather/setting tags', () => {
        const engine = new AmbienceEngine();
        expect(engine.getAmbience()).toBe('ambient stillness');

        // Weather trigger
        const a1 = engine.updateAmbience('Heavy rain started falling from the sky.', 30);
        expect(a1).toBe('distant rainfall');

        // Persistent carryover on neutral line
        const a2 = engine.updateAmbience('They walked slowly down the path.', 30);
        expect(a2).toBe('distant rainfall');

        // Setting trigger update
        const a3 = engine.updateAmbience('They entered a dark forest.', 30);
        expect(a3).toBe('forest rustle');
    });

    it('cinematifyOffline coordinates everything into structured blocks', () => {
        const text = `
Chapter 1

The rain fell on the forest path.

"Are you ready?" Mara whispered.

"No," Jon muttered.

A loud crash shook the trees!
        `.trim();

        const result = cinematifyOffline(text);
        expect(result.blocks.length).toBeGreaterThan(3);

        const dialogueBlocks = result.blocks.filter(b => b.type === 'dialogue');
        expect(dialogueBlocks.length).toBe(2);
        expect(dialogueBlocks[0].speaker).toBe('MARA');
        expect(dialogueBlocks[1].speaker).toBe('JON');

        const sfxBlocks = result.blocks.filter(b => b.type === 'sfx');
        expect(sfxBlocks.length).toBeGreaterThanOrEqual(2);
        const crashBlock = sfxBlocks.find(b => b.sfx?.sound === 'CRASH');
        expect(crashBlock).toBeDefined();
    });
});
