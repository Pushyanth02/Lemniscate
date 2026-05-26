/**
 * useReaderState.ts — Consolidated Reader State Hook
 *
 * Replaces 15+ individual store selectors in CinematicReader.tsx
 * with a single hook that provides all reader data, settings,
 * actions, and derived convenience values.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { useBookStore, useReaderStore } from '../store';
import type {
    Book,
    Chapter,
    CinematicBlock,
    ReaderMode,
    ImmersionLevel,
} from '../types/cinematifier';

// ─── Return Type ───────────────────────────────────────────────────────────────

export interface ReaderState {
    // ── Data ──
    book: Book | null;
    currentChapter: Chapter | undefined;
    currentChapterIndex: number;
    chapters: Chapter[];
    blocks: CinematicBlock[];

    // ── Settings ──
    readerMode: ReaderMode;
    fontSize: number;
    lineSpacing: number;
    immersionLevel: ImmersionLevel;
    darkMode: boolean;
    dyslexiaFont: boolean;

    // ── Derived ──
    isOriginalMode: boolean;
    isCinematizedMode: boolean;
    hasBlocks: boolean;
    chapterCount: number;
    hasNextChapter: boolean;
    hasPrevChapter: boolean;

    // ── Actions ──
    setReaderMode: (mode: ReaderMode) => void;
    setCurrentChapter: (index: number) => void;
    nextChapter: () => void;
    prevChapter: () => void;
    setFontSize: (size: number) => void;
    setLineSpacing: (spacing: number) => void;
    setImmersionLevel: (level: ImmersionLevel) => void;
    toggleDarkMode: () => void;
    toggleDyslexiaFont: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useReaderState(): ReaderState {
    const book = useBookStore(s => s.book);

    // Pull raw reader setting values from the reader slice
    const {
        currentChapterIndex,
        readerMode,
        fontSize,
        lineSpacing,
        immersionLevel,
        darkMode,
        dyslexiaFont,
        setReaderMode,
        setCurrentChapter,
        setFontSize,
        setLineSpacing,
        setImmersionLevel,
        toggleDarkMode,
        toggleDyslexiaFont,
    } = useReaderStore(
        useShallow(s => ({
            currentChapterIndex: s.currentChapterIndex,
            readerMode: s.readerMode,
            fontSize: s.fontSize,
            lineSpacing: s.lineSpacing,
            immersionLevel: s.immersionLevel,
            darkMode: s.darkMode,
            dyslexiaFont: s.dyslexiaFont,
            setReaderMode: s.setReaderMode,
            setCurrentChapter: s.setCurrentChapter,
            setFontSize: s.setFontSize,
            setLineSpacing: s.setLineSpacing,
            setImmersionLevel: s.setImmersionLevel,
            toggleDarkMode: s.toggleDarkMode,
            toggleDyslexiaFont: s.toggleDyslexiaFont,
        })),
    );

    // Derived values
    const chapters = book?.chapters ?? [];
    const currentChapter = chapters[currentChapterIndex];
    const blocks = currentChapter?.cinematifiedBlocks ?? [];
    const isOriginalMode = readerMode === 'original';
    const isCinematizedMode = readerMode === 'cinematified';
    const hasBlocks = blocks.length > 0;
    const chapterCount = chapters.length;
    const hasNextChapter = currentChapterIndex < chapterCount - 1;
    const hasPrevChapter = currentChapterIndex > 0;

    // Navigation helpers
    const nextChapter = useCallback(() => {
        if (hasNextChapter) setCurrentChapter(currentChapterIndex + 1);
    }, [hasNextChapter, currentChapterIndex, setCurrentChapter]);

    const prevChapter = useCallback(() => {
        if (hasPrevChapter) setCurrentChapter(currentChapterIndex - 1);
    }, [hasPrevChapter, currentChapterIndex, setCurrentChapter]);

    return {
        // Data
        book,
        currentChapter,
        currentChapterIndex,
        chapters,
        blocks,
        // Settings
        readerMode,
        fontSize,
        lineSpacing,
        immersionLevel,
        darkMode,
        dyslexiaFont,
        // Derived
        isOriginalMode,
        isCinematizedMode,
        hasBlocks,
        chapterCount,
        hasNextChapter,
        hasPrevChapter,
        // Actions
        setReaderMode,
        setCurrentChapter,
        nextChapter,
        prevChapter,
        setFontSize,
        setLineSpacing,
        setImmersionLevel,
        toggleDarkMode,
        toggleDyslexiaFont,
    };
}
