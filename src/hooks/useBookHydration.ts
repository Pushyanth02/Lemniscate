/**
 * useBookHydration — IndexedDB book hydration hook
 *
 * Loads the most recently saved book from IndexedDB on mount.
 * Extracted from CinematifierApp.
 */

import { useEffect } from 'react';
import { useBookStore } from '../store';
import { loadLatestBook, db, ENGINE_VERSION } from '../lib/runtime';

export function useBookHydration() {
    const book = useBookStore(s => s.book);
    const setBook = useBookStore(s => s.setBook);

    useEffect(() => {
        if (!book) {
            loadLatestBook()
                .then(async stored => {
                    if (stored) {
                        try {
                            const cachedChapters = await db.cinematifiedChapters
                                .where('bookId')
                                .equals(stored.id)
                                .toArray();

                            const cachedIndices = new Set(
                                cachedChapters
                                    .filter(c => c.engineVersion === ENGINE_VERSION)
                                    .map(c => c.chapterIndex)
                            );

                            const hydratedChapters = stored.chapters.map((ch, idx) => {
                                const isCached = cachedIndices.has(idx);
                                return {
                                    ...ch,
                                    // If not currently reading/first chapter, clear blocks from memory
                                    cinematifiedBlocks: idx === 0 ? ch.cinematifiedBlocks : [],
                                    isProcessed: idx === 0 ? ch.isProcessed : false,
                                    status: isCached ? ('ready' as const) : ch.status,
                                };
                            });

                            setBook({
                                ...stored,
                                chapters: hydratedChapters,
                            });
                        } catch {
                            setBook(stored);
                        }
                    }
                })
                .catch(() => {
                    /* IndexedDB unavailable */
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
