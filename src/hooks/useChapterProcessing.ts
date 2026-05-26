/**
 * useChapterProcessing — Chapter cinematification hook
 *
 * Handles on-demand processing of a single chapter via the enriched
 * offline pipeline, AI provider, or offline fallback.
 * Extracted from CinematicReader.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useBookStore, useProcessingStore } from '../store';
import {
    runFullSystemPipeline,
    extractOverallMetadata,
} from '../lib/cinematifier';
import { CinematicStreamAdapter } from '../lib/rendering/cinematicStreamAdapter';
import { useRenderBridge } from './useRenderBridge';
import { saveBook, getCachedChapter, cacheChapter } from '../lib/runtime';
import type { ReaderMode, Chapter } from '../types/cinematifier';

function toChapterErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached while processing this chapter.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed for this chapter.';
    }
    if (
        lower.includes('network') ||
        lower.includes('failed to fetch') ||
        lower.includes('timeout')
    ) {
        return 'Network issue while processing this chapter.';
    }
    return message || 'Failed to process chapter.';
}

export function useChapterProcessing(
    currentChapter: Chapter | undefined,
    currentChapterIndex: number,
    readerMode: ReaderMode,
) {
    const updateChapter = useBookStore(s => s.updateChapter);
    const setError = useProcessingStore(s => s.setError);
    const [isProcessingChapter, setIsProcessingChapter] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const bridgeHook = useRenderBridge({
        mode: readerMode === 'cinematified' ? 'cinematized' : 'original',
    });

    const processCurrentChapter = useCallback(async () => {
        if (!currentChapter || currentChapter.isProcessed) return;
        if (isProcessingChapter) return;

        setIsProcessingChapter(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        updateChapter(currentChapterIndex, { status: 'processing', errorMessage: undefined });

        const book = useBookStore.getState().book;
        if (book) {
            try {
                const cached = await getCachedChapter(book.id, currentChapterIndex);
                if (cached && cached.blocks && cached.blocks.length > 0) {
                    const metadata = extractOverallMetadata(
                        cached.cinematifiedText ?? cached.blocks.map(b => b.content).join('\n\n'),
                        cached.blocks,
                    );

                    updateChapter(currentChapterIndex, {
                        originalModeText: cached.originalModeText ?? currentChapter.originalModeText ?? currentChapter.originalText,
                        originalModeScenes: cached.originalModeScenes ?? currentChapter.originalModeScenes,
                        cinematifiedBlocks: cached.blocks,
                        cinematifiedText: cached.cinematifiedText ?? cached.blocks.map(b => b.content).join('\n\n'),
                        isProcessed: true,
                        status: 'ready',
                        errorMessage: undefined,
                        toneTags: metadata.toneTags,
                        characters: metadata.characters,
                        entityRegistry: cached.entityRegistry,
                        renderPlan: cached.renderPlan,
                        cinematizedScenes: cached.cinematizedScenes,
                        narrativeMode: cached.narrativeMode,
                        povCharacter: cached.povCharacter,
                    });

                    const updatedBook = useBookStore.getState().book;
                    if (updatedBook) {
                        await saveBook(updatedBook);
                    }
                    setIsProcessingChapter(false);
                    abortControllerRef.current = null;
                    return;
                }
            } catch (e) {
                console.warn('[CinematicReader] Cache read error, falling back to processing:', e);
            }
        }

        const chapterSourceText = currentChapter.originalModeText ?? currentChapter.originalText;
        const adapter = new CinematicStreamAdapter();
        const unbindStream = bridgeHook.bindStream(adapter, [currentChapter.id]);

        try {
            adapter.start('none');
            const result = await runFullSystemPipeline(chapterSourceText, {
                inputIsRebuilt: true,
                signal: controller.signal,
            });
            adapter.complete();

            const metadata = extractOverallMetadata(
                result.cinematizedMode.rawText,
                result.cinematizedMode.blocks,
            );

            updateChapter(currentChapterIndex, {
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
                entityRegistry: result.cinematizedMode.entityRegistry,
            });

            if (book) {
                await cacheChapter(
                    book.id,
                    currentChapterIndex,
                    result.cinematizedMode.blocks,
                    result.cinematizedMode.entityRegistry || { characters: [], locations: [] },
                    {
                        originalModeText: result.originalMode.text,
                        originalModeScenes: result.originalMode.scenes,
                        cinematifiedText: result.cinematizedMode.rawText,
                        renderPlan: result.cinematizedMode.renderPlan,
                        cinematizedScenes: result.cinematizedMode.scenes,
                        narrativeMode: result.cinematizedMode.narrativeMode,
                        povCharacter: result.cinematizedMode.povCharacter,
                    }
                ).catch(e => console.warn('[CinematicReader] Failed to write cache:', e));
            }

            const updatedBook = useBookStore.getState().book;
            if (updatedBook)
                saveBook(updatedBook).catch(e => {
                    console.warn('[CinematicReader] Failed to persist book:', e);
                });
        } catch (err) {
            if (controller.signal.aborted) {
                adapter.error('Cancelled by user');
                return;
            }
            const message = toChapterErrorMessage(err);
            adapter.error(message);
            console.error('[CinematicReader] Process error:', err);
            updateChapter(currentChapterIndex, {
                status: 'error',
                isProcessed: false,
                errorMessage: message,
            });
            setError(`Chapter processing failed: ${message}`);
        } finally {
            unbindStream();
            setIsProcessingChapter(false);
            abortControllerRef.current = null;
        }
    }, [
        currentChapter,
        currentChapterIndex,
        isProcessingChapter,
        updateChapter,
        setError,
        bridgeHook,
    ]);

    const cancelProcessing = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // Auto-process chapter when it changes
    useEffect(() => {
        if (currentChapter && !currentChapter.isProcessed && readerMode === 'cinematified') {
            const timer = window.setTimeout(() => {
                void processCurrentChapter();
            }, 0);

            return () => {
                window.clearTimeout(timer);
            };
        }
    }, [currentChapter, readerMode, processCurrentChapter]);

    return {
        isProcessingChapter,
        processCurrentChapter,
        cancelProcessing,
        sceneState: bridgeHook.sceneState,
    };
}
