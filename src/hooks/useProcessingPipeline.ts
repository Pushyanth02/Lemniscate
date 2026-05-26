/**
 * useProcessingPipeline.ts — Orchestrates the 7-stage cinematification pipeline
 */

import { useCallback } from 'react';
import { useBookStore, useProcessingStore } from '../store';
import { saveBook } from '../lib/runtime/cinematifierDb';
import {
    cinematifyOffline,
    runFullSystemPipeline,
    extractOverallMetadata,
} from '../lib/cinematifier';
import type { Book, CharacterAppearance } from '../types/cinematifier';

const CINEMATIFY_PROGRESS_START = 68;
const CINEMATIFY_PROGRESS_END = 98;

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

function accumulateCharacters(
    target: Record<string, CharacterAppearance>,
    source: Record<string, CharacterAppearance>,
) {
    for (const [charName, charData] of Object.entries(source)) {
        if (!target[charName]) {
            target[charName] = {
                appearances: [],
                dialogueCount: 0,
            };
        }
        target[charName].appearances.push(...charData.appearances);
        target[charName].dialogueCount += charData.dialogueCount;
    }
}

export function useProcessingPipeline() {
    const updateChapter = useBookStore(s => s.updateChapter);
    const updateBook = useBookStore(s => s.updateBook);
    const setProgress = useProcessingStore(s => s.setProgress);
    const setProcessing = useProcessingStore(s => s.setProcessing);

    const runPipeline = useCallback(
        async (bookWithId: Book, onPipelineProgress?: (percent: number) => void) => {
            const totalChapters = bookWithId.chapters.length;
            const totalCinematifySpan = CINEMATIFY_PROGRESS_END - CINEMATIFY_PROGRESS_START;
            const progressPerChapter = totalCinematifySpan / Math.max(1, totalChapters);

            let detectedGenre: Book['genre'] | undefined;
            const allCharacters: Record<string, CharacterAppearance> = {};
            let failedChapters = 0;

            for (let i = 0; i < totalChapters; i++) {
                const chapterNum = i + 1;
                const baseProgress = CINEMATIFY_PROGRESS_START + i * progressPerChapter;
                updateChapter(i, { status: 'processing', errorMessage: undefined });

                setProgress({
                    phase: 'cinematifying',
                    currentChapter: chapterNum,
                    totalChapters,
                    percentComplete: clampPercent(Math.round(baseProgress)),
                    message: `Cinematifying chapter ${chapterNum} of ${totalChapters}...`,
                });
                onPipelineProgress?.(clampPercent(Math.round(baseProgress)));

                // Yield to the event loop so React can paint progress updates
                await new Promise(r => setTimeout(r, 0));

                try {
                    const chapter = bookWithId.chapters[i];
                    const result = await runFullSystemPipeline(chapter.originalText, {
                        inputIsRebuilt: true,
                        onProgress: (pct, msg) => {
                            const percent = clampPercent(
                                Math.round(baseProgress + pct * progressPerChapter),
                            );
                            setProgress({
                                phase: 'cinematifying',
                                currentChapter: chapterNum,
                                totalChapters,
                                percentComplete: percent,
                                message: msg,
                            });
                            onPipelineProgress?.(percent);
                        },
                    });

                    const metadata = extractOverallMetadata(
                        result.cinematizedMode.rawText,
                        result.cinematizedMode.blocks,
                    );

                    updateChapter(i, {
                        originalModeText: result.originalMode.text,
                        originalModeScenes: result.originalMode.scenes,
                        cinematifiedBlocks: result.cinematizedMode.blocks,
                        cinematifiedText: result.cinematizedMode.rawText,
                        isProcessed: true,
                        status: 'ready',
                        errorMessage: undefined,
                        toneTags: metadata.toneTags,
                        characters: metadata.characters,
                        renderPlan: result.cinematizedMode.renderPlan,
                        stageTrace: result.cinematizedMode.stageTrace,
                        cinematizedScenes: result.cinematizedMode.scenes,
                        narrativeMode: result.cinematizedMode.narrativeMode,
                        povCharacter: result.cinematizedMode.povCharacter,
                    });

                    // Accumulate book-level metadata
                    if (i === 0 && metadata.genre && bookWithId.genre === 'other') {
                        detectedGenre = metadata.genre;
                    }

                    accumulateCharacters(allCharacters, metadata.characters);
                } catch (chapterErr) {
                    console.warn(`[Cinematifier] Chapter ${chapterNum} fallback:`, chapterErr);
                    // Use offline fallback for this chapter
                    try {
                        const chapter = bookWithId.chapters[i];
                        const fallbackResult = cinematifyOffline(chapter.originalText);
                        const metadata = extractOverallMetadata(
                            fallbackResult.rawText,
                            fallbackResult.blocks,
                        );
                        updateChapter(i, {
                            originalModeText: chapter.originalModeText ?? chapter.originalText,
                            cinematifiedBlocks: fallbackResult.blocks,
                            cinematifiedText: fallbackResult.rawText,
                            isProcessed: true,
                            status: 'ready',
                            errorMessage: 'AI provider failed; offline fallback applied for this chapter.',
                            toneTags: metadata.toneTags,
                            characters: metadata.characters,
                            renderPlan: undefined,
                            stageTrace: undefined,
                            cinematizedScenes: undefined,
                            narrativeMode: undefined,
                            povCharacter: undefined,
                        });

                        // Accumulate characters from fallback
                        accumulateCharacters(allCharacters, metadata.characters);
                    } catch (fallbackErr) {
                        failedChapters += 1;
                        updateChapter(i, {
                            status: 'error',
                            isProcessed: false,
                            errorMessage:
                                fallbackErr instanceof Error
                                    ? fallbackErr.message
                                    : 'Failed to process chapter. You can retry later.',
                        });
                    }
                }
            }

            // Push accumulated book-level metadata to the store
            const bookUpdates: Partial<Book> = {
                status: failedChapters === totalChapters ? 'error' : ('ready' as const),
            };
            if (detectedGenre) bookUpdates.genre = detectedGenre;
            if (Object.keys(allCharacters).length > 0) bookUpdates.characters = allCharacters;
            if (failedChapters > 0) {
                bookUpdates.errorMessage = `${failedChapters} chapter${failedChapters === 1 ? '' : 's'} failed to process.`;
            }
            updateBook(bookUpdates);

            if (failedChapters === totalChapters) {
                setProgress({
                    phase: 'error',
                    currentChapter: totalChapters,
                    totalChapters,
                    percentComplete: 100,
                    message:
                        'Unable to process chapters. Please retry with another provider or offline mode.',
                });
                onPipelineProgress?.(100);
            } else {
                // Complete
                setProgress({
                    phase: 'complete',
                    currentChapter: totalChapters,
                    totalChapters,
                    percentComplete: 100,
                    message:
                        failedChapters > 0
                            ? 'Processing complete with some chapter failures.'
                            : 'Ready to read!',
                });
                onPipelineProgress?.(100);
            }

            // Persist processed book to IndexedDB
            const finalBook = useBookStore.getState().book;
            if (finalBook) {
                try {
                    await saveBook(finalBook);
                } catch (err: unknown) {
                    console.warn('[Cinematifier] Failed to persist book:', err);
                }
            }

            // Short delay then show reader
            await new Promise(r => setTimeout(r, 500));
            setProcessing(false);
            return { failedChapters };
        },
        [updateChapter, setProgress, updateBook, setProcessing],
    );

    return { runPipeline };
}
