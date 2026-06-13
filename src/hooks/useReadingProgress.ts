/**
 * useReadingProgress — Reading progress tracking hook
 *
 * Manages reading progress initialization, time tracking, and chapter marking.
 * Extracted from CinematicReader to reduce component complexity.
 */

import { useEffect, useRef } from 'react';
import { useBookStore, useReaderStore } from '../store';
import { saveReadingProgress, loadReadingProgress } from '../lib/runtime/cinematifierDb';
import { createReadingProgress } from '../lib/engine/cinematifier';

export function useReadingProgress() {
    const book = useBookStore(s => s.book);
    const readingProgress = useBookStore(s => s.readingProgress);
    const setReadingProgress = useBookStore(s => s.setReadingProgress);
    const updateReadingProgress = useBookStore(s => s.updateReadingProgress);
    const markChapterRead = useBookStore(s => s.markChapterRead);
    const addReadingTime = useBookStore(s => s.addReadingTime);
    const toggleBookmark = useBookStore(s => s.toggleBookmark);

    const currentChapterIndex = useReaderStore(s => s.currentChapterIndex);

    const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const bookmarks = readingProgress?.bookmarks ?? [];
    const isBookmarked = bookmarks.includes(currentChapterIndex);

    // Initialize reading progress on mount
    useEffect(() => {
        if (!book) return;
        if (readingProgress && readingProgress.bookId === book.id) return;

        loadReadingProgress(book.id)
            .then(stored => {
                if (stored) {
                    setReadingProgress(stored);
                    if (stored.currentChapter > 1) {
                        const idx = stored.currentChapter - 1;
                        if (idx < book.chapters.length) {
                            useReaderStore.getState().setCurrentChapter(idx);
                        }
                    }
                    if (stored.readingMode) {
                        useReaderStore.getState().setReaderMode(stored.readingMode);
                    }
                } else {
                    setReadingProgress(createReadingProgress(book.id));
                }
            })
            .catch(() => {
                setReadingProgress(createReadingProgress(book.id));
            });
    }, [book, readingProgress, setReadingProgress]);

    // Track reading time (increment every 30 seconds while reader is open)
    useEffect(() => {
        readingTimerRef.current = setInterval(() => {
            addReadingTime(30);
        }, 30_000);

        return () => {
            if (readingTimerRef.current) clearInterval(readingTimerRef.current);
            const progress = useBookStore.getState().readingProgress;
            if (progress)
                saveReadingProgress(progress).catch(e => {
                    console.warn('[CinematicReader] Failed to persist reading progress:', e);
                });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: addReadingTime is stable (Zustand selector)
    }, []);

    // Track chapter changes in reading progress
    useEffect(() => {
        if (!readingProgress || !book) return;

        updateReadingProgress({ currentChapter: currentChapterIndex + 1 });
        const timer = setTimeout(() => {
            markChapterRead(currentChapterIndex + 1);
        }, 5_000);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks chapter index only; Zustand actions are stable
    }, [currentChapterIndex]);

    return {
        readingProgress,
        bookmarks,
        isBookmarked,
        toggleBookmark,
    };
}
