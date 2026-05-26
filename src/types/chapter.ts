/**
 * chapter.ts — Chapter Entity Types
 */

import type { CharacterAppearance, ExtractedEntities } from './book';
import type { CinematicBlock, OriginalModeScene } from './cinematic';
import type { RenderPlan, PipelineStageTrace } from './rendering';

export type ChapterStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface Chapter {
    id: string;
    bookId: string; // Foreign key to Book
    number: number; // Sequential: 1, 2, 3...
    title: string; // "Chapter 1", "The Awakening", etc.
    originalText: string; // 2,000-5,000 words typical
    originalModeText?: string; // Readability-formatted original mode text
    originalModeScenes?: OriginalModeScene[]; // Original-mode scene segmentation
    cinematifiedText?: string; // AI-enhanced version (serialized blocks)
    cinematifiedBlocks: CinematicBlock[];
    status: ChapterStatus;
    wordCount: number;
    isProcessed: boolean; // Legacy compat
    estimatedReadTime: number; // in minutes
    errorMessage?: string; // If processing failed
    toneTags?: string[];
    characters?: Record<string, CharacterAppearance>;
    entityRegistry?: ExtractedEntities;
    cinematizedScenes?: { title: string; paragraphs: string[] }[];
    renderPlan?: RenderPlan;
    stageTrace?: PipelineStageTrace[];
    narrativeMode?: 'normal' | 'flashback' | 'dream' | 'memory';
    povCharacter?: string;
}
