/**
 * useDocumentParser.ts — Handles file validation, format detection, and text extraction
 */

import { useCallback } from 'react';
import { ingestDocument, IngestionError } from '../lib/processing/documentIngestion';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.epub', '.docx', '.pptx'];

export function isSupportedFile(file: File): boolean {
    const loweredName = file.name.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => loweredName.endsWith(ext));
}

export function validateInputFile(file: File): void {
    if (!file.name.trim()) {
        throw new Error('Invalid file: missing filename.');
    }
    if (!isSupportedFile(file)) {
        throw new Error('Unsupported file format. Please upload PDF, TXT, EPUB, DOCX, or PPTX.');
    }
    if (file.size <= 0) {
        throw new Error('The selected file is empty.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('File exceeds the 50 MB upload limit.');
    }
}

export function toUserFacingError(error: unknown): string {
    if (error instanceof IngestionError) {
        return error.userMessage;
    }
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached. Please retry in a moment or switch provider.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed. Please verify your provider key in settings.';
    }
    if (
        lower.includes('network') ||
        lower.includes('failed to fetch') ||
        lower.includes('timeout')
    ) {
        return 'Network issue while processing. Please retry.';
    }
    return message || 'Failed to process file';
}

export function isRetryableError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('failed to fetch')
    );
}

export async function retryAsync<T>(
    operation: () => Promise<T>,
    retries = 2,
    baseDelayMs = 800,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt >= retries || !isRetryableError(error)) break;
            const delayMs = Math.min(baseDelayMs * 2 ** attempt, 4000);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function toProcessingPhase(
    stage: 'validating' | 'extracting' | 'cleaning' | 'normalizing' | 'detecting_chapters' | 'processing_text' | 'complete',
): 'uploading' | 'extracting' | 'segmenting' | 'structuring' | 'cinematifying' | 'complete' | 'error' {
    switch (stage) {
        case 'validating':
            return 'uploading';
        case 'extracting':
        case 'cleaning':
        case 'normalizing':
            return 'extracting';
        case 'detecting_chapters':
            return 'segmenting';
        case 'processing_text':
        case 'complete':
            return 'structuring';
    }
}

export function useDocumentParser() {
    const parseDocument = useCallback(
        async (
            file: File,
            onProgress: (update: {
                stage: 'validating' | 'extracting' | 'cleaning' | 'normalizing' | 'detecting_chapters' | 'processing_text' | 'complete';
                percentComplete: number;
                message: string;
            }) => void,
        ) => {
            validateInputFile(file);
            return await retryAsync(() =>
                ingestDocument(file, {
                    onProgress,
                }),
            );
        },
        [],
    );

    return { parseDocument };
}
