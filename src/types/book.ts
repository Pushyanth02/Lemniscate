/**
 * book.ts — Book Entity Types
 */

import type { Chapter } from './chapter';

export type BookGenre =
    | 'fantasy'
    | 'romance'
    | 'thriller'
    | 'sci_fi'
    | 'mystery'
    | 'historical'
    | 'literary_fiction'
    | 'horror'
    | 'adventure'
    | 'other';

export type BookStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface Book {
    id: string;
    title: string;
    author?: string;
    description?: string; // Synopsis
    fileUrl?: string; // Uploaded PDF URL (for cloud storage)
    genre: BookGenre;
    status: BookStatus;
    totalChapters: number;
    processedChapters: number; // Progress tracking
    isPublic: boolean; // Library visibility
    errorMessage?: string; // If processing failed
    chapters: Chapter[];
    totalWordCount: number;
    createdAt: number;
    updatedAt?: number;
    characters?: Record<string, CharacterAppearance>;
    entityRegistry?: ExtractedEntities;
}

export interface ExtractedEntities {
    characters: CharacterEntity[];
    locations: LocationEntity[];
}

export interface CharacterAppearance {
    appearances: number[]; // Block/Paragraph indices
    dialogueCount: number;
}

export interface CharacterEntity {
    name: string;
    appearances: number;
    aliases: string[];
}

export interface LocationEntity {
    name: string;
    appearances: number;
    firstMentionParagraphIndex?: number;
}

export interface ChapterSegment {
    title: string;
    content: string;
    startIndex: number;
    endIndex: number;
}
