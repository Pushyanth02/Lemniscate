import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCachedChapter, cacheChapter, invalidateBookCache, isChapterCached, ENGINE_VERSION } from '../runtime/cinematifiedCache';
import { db } from '../runtime/cinematifierDb';

// Mock the Dexie database instance
vi.mock('../runtime/cinematifierDb', () => {
    const mockTable = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        where: vi.fn(),
    };

    return {
        db: {
            cinematifiedChapters: mockTable,
        },
    };
});

describe('cinematifiedCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getCachedChapter', () => {
        it('returns null when no chapter is cached', async () => {
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(undefined);

            const result = await getCachedChapter('book1', 1);

            expect(result).toBeNull();
            expect(db.cinematifiedChapters.get).toHaveBeenCalledWith('book1_1');
        });

        it('returns cached chapter when valid engine version matches', async () => {
            const mockChapter = {
                id: 'book1_1',
                bookId: 'book1',
                chapterIndex: 1,
                blocks: [{ id: 'b1', type: 'action', content: 'test', intensity: 'normal' }],
                entityRegistry: { characters: [], locations: [] },
                processedAt: Date.now(),
                engineVersion: ENGINE_VERSION,
            };
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(mockChapter as any);

            const result = await getCachedChapter('book1', 1);

            expect(result).toEqual(mockChapter);
        });

        it('deletes cached chapter and returns null when engine version is stale', async () => {
            const mockStaleChapter = {
                id: 'book1_1',
                bookId: 'book1',
                chapterIndex: 1,
                blocks: [],
                entityRegistry: { characters: [], locations: [] },
                processedAt: Date.now(),
                engineVersion: 'stale-version',
            };
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(mockStaleChapter as any);

            const result = await getCachedChapter('book1', 1);

            expect(result).toBeNull();
            expect(db.cinematifiedChapters.delete).toHaveBeenCalledWith('book1_1');
        });

        it('handles exceptions gracefully and returns null', async () => {
            vi.mocked(db.cinematifiedChapters.get).mockRejectedValue(new Error('IndexedDB error'));

            const result = await getCachedChapter('book1', 1);

            expect(result).toBeNull();
        });
    });

    describe('cacheChapter', () => {
        it('puts chapter cache into database with correct structure', async () => {
            const blocks = [{ id: 'b1', type: 'action', content: 'test', intensity: 'normal' }] as any;
            const entities = { characters: [], locations: [] };

            await cacheChapter('book1', 1, blocks, entities, { originalModeText: 'original' });

            expect(db.cinematifiedChapters.put).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'book1_1',
                    bookId: 'book1',
                    chapterIndex: 1,
                    blocks,
                    entityRegistry: entities,
                    engineVersion: ENGINE_VERSION,
                    originalModeText: 'original',
                })
            );
        });
    });

    describe('invalidateBookCache', () => {
        it('deletes all cached chapters matching the bookId', async () => {
            const mockWhereResult = {
                equals: vi.fn().mockReturnValue({
                    delete: vi.fn().mockResolvedValue(3),
                }),
            };
            vi.mocked(db.cinematifiedChapters.where).mockReturnValue(mockWhereResult as any);

            await invalidateBookCache('book1');

            expect(db.cinematifiedChapters.where).toHaveBeenCalledWith('bookId');
            expect(mockWhereResult.equals).toHaveBeenCalledWith('book1');
        });
    });

    describe('isChapterCached', () => {
        it('returns true if valid cache entry exists', async () => {
            const mockChapter = {
                id: 'book1_1',
                engineVersion: ENGINE_VERSION,
            };
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(mockChapter as any);

            const result = await isChapterCached('book1', 1);

            expect(result).toBe(true);
        });

        it('returns false if cache entry is stale', async () => {
            const mockChapter = {
                id: 'book1_1',
                engineVersion: 'stale-version',
            };
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(mockChapter as any);

            const result = await isChapterCached('book1', 1);

            expect(result).toBe(false);
        });

        it('returns false if cache entry does not exist', async () => {
            vi.mocked(db.cinematifiedChapters.get).mockResolvedValue(undefined);

            const result = await isChapterCached('book1', 1);

            expect(result).toBe(false);
        });
    });
});
