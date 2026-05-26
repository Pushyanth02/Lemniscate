/**
 * bookStore.ts — Book State Slice
 */

import type { StateCreator } from 'zustand';
import type { Book, Chapter, ReadingProgress } from '../types/cinematifier';
import type { CinematifierState } from './cinematifierStore';

export interface BookState {
    book: Book | null;
    readingProgress: ReadingProgress | null;

    setBook: (book: Book | null) => void;
    updateBook: (updates: Partial<Book>) => void;
    updateChapter: (chapterIndex: number, updates: Partial<Chapter>) => void;
    setReadingProgress: (progress: ReadingProgress | null) => void;
    updateReadingProgress: (updates: Partial<ReadingProgress>) => void;
    markChapterRead: (chapterNumber: number) => void;
    addReadingTime: (seconds: number) => void;
    toggleBookmark: (chapterIndex: number) => void;
}

export const createBookSlice: StateCreator<
    CinematifierState,
    [],
    [],
    BookState
> = (set, get) => ({
    book: null,
    readingProgress: null,

    setBook: (book: Book | null) => set({ book, currentChapterIndex: 0, error: null }),

    updateBook: (updates: Partial<Book>) => {
        const { book } = get();
        if (!book) return;
        set({ book: { ...book, ...updates, updatedAt: Date.now() } });
    },

    updateChapter: (chapterIndex: number, updates: Partial<Chapter>) => {
        const { book } = get();
        if (!book || chapterIndex < 0 || chapterIndex >= book.chapters.length) return;

        const updatedChapters = [...book.chapters];
        updatedChapters[chapterIndex] = {
            ...updatedChapters[chapterIndex],
            ...updates,
        };

        const processedCount = updatedChapters.filter(
            ch => ch.status === 'ready' || ch.isProcessed,
        ).length;
        const allReady = processedCount === updatedChapters.length;

        set({
            book: {
                ...book,
                chapters: updatedChapters,
                processedChapters: processedCount,
                status: allReady ? 'ready' : book.status,
                updatedAt: Date.now(),
            },
        });
    },

    setReadingProgress: (progress: ReadingProgress | null) =>
        set({ readingProgress: progress }),

    updateReadingProgress: (updates: Partial<ReadingProgress>) => {
        const { readingProgress } = get();
        if (!readingProgress) return;
        set({
            readingProgress: {
                ...readingProgress,
                ...updates,
                lastReadAt: Date.now(),
            },
        });
    },

    markChapterRead: (chapterNumber: number) => {
        const { readingProgress, book } = get();
        if (!readingProgress) return;

        const readChapters = readingProgress.readChapters.includes(chapterNumber)
            ? readingProgress.readChapters
            : [...readingProgress.readChapters, chapterNumber];

        const completed = book ? readChapters.length >= book.totalChapters : false;

        set({
            readingProgress: {
                ...readingProgress,
                readChapters,
                completed,
                lastReadAt: Date.now(),
            },
        });
    },

    addReadingTime: (seconds: number) => {
        const { readingProgress } = get();
        if (!readingProgress) return;
        set({
            readingProgress: {
                ...readingProgress,
                totalReadTime: readingProgress.totalReadTime + seconds,
                lastReadAt: Date.now(),
            },
        });
    },

    toggleBookmark: (chapterIndex: number) => {
        const { readingProgress } = get();
        if (!readingProgress) return;
        const bookmarks = readingProgress.bookmarks.includes(chapterIndex)
            ? readingProgress.bookmarks.filter(i => i !== chapterIndex)
            : [...readingProgress.bookmarks, chapterIndex];
        set({
            readingProgress: {
                ...readingProgress,
                bookmarks,
                lastReadAt: Date.now(),
            },
        });
    },
});
