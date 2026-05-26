/**
 * reader.ts — Reader State and Navigation Types
 */

export type ReaderMode = 'original' | 'cinematified';

export type ImmersionLevel = 'minimal' | 'balanced' | 'cinematic';

export interface ReadingProgress {
    id: string;
    bookId: string; // Foreign key to Book
    currentChapter: number; // Chapter number (1-based)
    scrollPosition: number; // Scroll position in current chapter
    readingMode: ReaderMode; // User preference
    bookmarks: number[]; // Chapter numbers that are bookmarked
    completed: boolean; // Has finished the book
    lastReadAt: number; // Timestamp
    readChapters: number[]; // List of completed chapter numbers
    totalReadTime: number; // Cumulative reading time in seconds
}
