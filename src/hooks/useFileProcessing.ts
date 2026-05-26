/**
 * useFileProcessing — File ingestion and processing hook (Composition Hook)
 */

import { useCallback } from 'react';
import { useBookStore, useProcessingStore } from '../store';
import { enrichBookMetadataFromFreeApis } from '../lib/runtime/freeApis';
import { useDocumentParser, toProcessingPhase, toUserFacingError } from './useDocumentParser';
import { useProcessingPipeline } from './useProcessingPipeline';
import type { Book } from '../types/cinematifier';

const AVERAGE_READING_WPM = 220;

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function useFileProcessing(onComplete: () => void) {
    const setBook = useBookStore(s => s.setBook);
    const updateBook = useBookStore(s => s.updateBook);
    const setProcessing = useProcessingStore(s => s.setProcessing);
    const setProgress = useProcessingStore(s => s.setProgress);
    const setError = useProcessingStore(s => s.setError);

    const { parseDocument } = useDocumentParser();
    const { runPipeline } = useProcessingPipeline();

    const processFile = useCallback(
        async (file: File) => {
            setProcessing(true);
            setError(null);

            try {
                setProgress({
                    phase: 'uploading',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 2,
                    message: `Preparing ${file.name}...`,
                });

                const ingestionResult = await parseDocument(file, (update) => {
                    setProgress({
                        phase: toProcessingPhase(update.stage),
                        currentChapter: 0,
                        totalChapters: 0,
                        percentComplete: clampPercent(update.percentComplete),
                        message: update.message,
                    });
                });

                const totalWords = ingestionResult.totalWords;
                const now = Date.now();
                const bookId = `book-${now}`;
                const bookData = {
                    id: bookId,
                    title: ingestionResult.title,
                    genre: 'other' as const,
                    status: 'processing' as const,
                    totalChapters: ingestionResult.chapters.length,
                    processedChapters: 0,
                    isPublic: false,
                    chapters: ingestionResult.chapters.map((chapter, index) => ({
                        id: `chapter-${now}-${index}`,
                        bookId,
                        number: index + 1,
                        title: chapter.title || `Chapter ${index + 1}`,
                        originalText: chapter.content,
                        cinematifiedBlocks: [],
                        status: 'pending' as const,
                        wordCount: chapter.narrative.stats.totalWords,
                        isProcessed: false,
                        estimatedReadTime: Math.max(
                            1,
                            Math.ceil(chapter.narrative.stats.totalWords / AVERAGE_READING_WPM),
                        ),
                    })),
                    totalWordCount: totalWords,
                    createdAt: now,
                };

                const bookWithId: Book = {
                    ...bookData,
                    status: 'processing',
                };

                setBook(bookWithId);

                // Non-blocking metadata enrichment from free public APIs.
                void enrichBookMetadataFromFreeApis({ title: ingestionResult.title, timeoutMs: 2200 })
                    .then(metadata => {
                        if (!metadata) return;

                        const updates: Partial<Book> = {};
                        if (metadata.title && metadata.title !== 'Untitled Novel') {
                            updates.title = metadata.title;
                        }
                        if (metadata.author) updates.author = metadata.author;
                        if (metadata.description) updates.description = metadata.description;
                        if (metadata.genre && metadata.genre !== 'other') {
                            updates.genre = metadata.genre;
                        }

                        if (Object.keys(updates).length > 0) {
                            updateBook(updates);
                        }
                    })
                    .catch(error => {
                        console.warn('[Cinematifier] Free API metadata enrichment skipped:', error);
                    });

                const summary = await runPipeline(bookWithId);

                if (summary.failedChapters > 0 || ingestionResult.warnings.length > 0) {
                    const chapterLabel = summary.failedChapters === 1 ? 'chapter' : 'chapters';
                    let errorMessage = '';
                    if (summary.failedChapters > 0) {
                        errorMessage =
                            summary.failedChapters === bookWithId.chapters.length
                                ? `Processing failed for all chapters. Please check the file formatting and retry.`
                                : `Processed with warnings: ${summary.failedChapters} ${chapterLabel} failed and were marked for retry.`;
                    }
                    if (ingestionResult.warnings.length > 0) {
                        const prefix = errorMessage ? ' Also detected: ' : '';
                        errorMessage += `${prefix}${ingestionResult.warnings.join(' ')}`;
                    }
                    setError(errorMessage);
                }

                if (summary.failedChapters < bookWithId.chapters.length) {
                    onComplete();
                }
            } catch (err) {
                console.error('[Cinematifier] Processing error:', err);
                setProgress({
                    phase: 'error',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 100,
                    message: 'Processing failed. Please retry.',
                });
                setError(toUserFacingError(err));

                // Keep failed state visible briefly so users can read the status update.
                await new Promise(resolve => setTimeout(resolve, 700));
                setProcessing(false);
            }
        },
        [setBook, updateBook, setProcessing, setProgress, setError, parseDocument, runPipeline, onComplete],
    );

    return processFile;
}
