/**
 * cinematifiedCache.ts — Dexie cache operations for cinematified chapters
 */

import { db, type CinematifiedChapterCache } from './cinematifierDb';
import type { CinematicBlock, ExtractedEntities } from '../../types/cinematifier';

export const ENGINE_VERSION = '2.0.0-rulebased';

/**
 * Retrieves a cached chapter from IndexedDB, checking version validity.
 */
export async function getCachedChapter(
    bookId: string,
    chapterIndex: number,
): Promise<CinematifiedChapterCache | null> {
    try {
        const id = `${bookId}_${chapterIndex}`;
        const cached = await db.cinematifiedChapters.get(id);
        if (!cached) return null;

        // Invalidate stale cache if the engine version has upgraded
        if (cached.engineVersion !== ENGINE_VERSION) {
            await db.cinematifiedChapters.delete(id);
            return null;
        }

        return cached;
    } catch (e) {
        console.error('Error loading chapter from cache:', e);
        return null;
    }
}

export async function cacheChapter(
    bookId: string,
    chapterIndex: number,
    blocks: CinematicBlock[],
    entityRegistry: ExtractedEntities,
    extras?: Partial<Omit<CinematifiedChapterCache, 'id' | 'bookId' | 'chapterIndex' | 'blocks' | 'entityRegistry' | 'processedAt' | 'engineVersion'>>,
): Promise<void> {
    try {
        const id = `${bookId}_${chapterIndex}`;
        await db.cinematifiedChapters.put({
            id,
            bookId,
            chapterIndex,
            blocks,
            entityRegistry,
            processedAt: Date.now(),
            engineVersion: ENGINE_VERSION,
            ...extras,
        });
    } catch (e) {
        console.error('Error caching chapter:', e);
    }
}

/**
 * Clears cached chapters for a specific book.
 */
export async function invalidateBookCache(bookId: string): Promise<void> {
    try {
        await db.cinematifiedChapters.where('bookId').equals(bookId).delete();
    } catch (e) {
        console.error('Error invalidating book cache:', e);
    }
}

/**
 * Checks if a specific chapter has a valid cache entry.
 */
export async function isChapterCached(bookId: string, chapterIndex: number): Promise<boolean> {
    try {
        const id = `${bookId}_${chapterIndex}`;
        const cached = await db.cinematifiedChapters.get(id);
        return Boolean(cached && cached.engineVersion === ENGINE_VERSION);
    } catch {
        return false;
    }
}
