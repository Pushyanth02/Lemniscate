/**
 * readerStore.ts — Reader State Slice
 */

import type { StateCreator } from 'zustand';
import type { ReaderMode, ImmersionLevel } from '../types/cinematifier';
import type { CinematifierState } from './cinematifierStore';

export interface ReaderState {
    readerMode: ReaderMode;
    currentChapterIndex: number;
    font: string;
    fontSize: number;
    lineSpacing: number;
    immersionLevel: ImmersionLevel;
    dyslexiaFont: boolean;
    darkMode: boolean;

    setReaderMode: (mode: ReaderMode) => void;
    setCurrentChapter: (index: number) => void;
    setFont: (font: string) => void;
    setFontSize: (size: number) => void;
    setLineSpacing: (spacing: number) => void;
    setImmersionLevel: (level: ImmersionLevel) => void;
    toggleDyslexiaFont: () => void;
    toggleDarkMode: () => void;
}

export const createReaderSlice: StateCreator<
    CinematifierState,
    [],
    [],
    ReaderState
> = (set, get) => ({
    readerMode: 'cinematified',
    currentChapterIndex: 0,
    font: 'default',
    fontSize: 18,
    lineSpacing: 1.8,
    immersionLevel: 'balanced',
    dyslexiaFont: false,
    darkMode: true,

    setReaderMode: (mode: ReaderMode) => {
        set({ readerMode: mode });
        const { readingProgress } = get();
        if (readingProgress) {
            set({
                readingProgress: {
                    ...readingProgress,
                    readingMode: mode,
                    lastReadAt: Date.now(),
                },
            });
        }
    },

    setCurrentChapter: (index: number) => {
        const { book } = get();
        if (book && index >= 0 && index < book.chapters.length) {
            set({ currentChapterIndex: index });
        }
    },

    setFont: (font: string) => set({ font }),

    setFontSize: (size: number) => set({ fontSize: Math.max(12, Math.min(32, size)) }),

    setLineSpacing: (spacing: number) =>
        set({ lineSpacing: Math.max(1.4, Math.min(2.4, spacing)) }),

    setImmersionLevel: (level: ImmersionLevel) => set({ immersionLevel: level }),

    toggleDyslexiaFont: () => set(state => ({ dyslexiaFont: !state.dyslexiaFont })),

    toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),
});
