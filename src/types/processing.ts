/**
 * processing.ts — File Processing and Pipeline Result Types
 */

import type { CinematicBlock } from './cinematic';
import type { RenderPlan, PipelineStageTrace } from './rendering';
import type { CharacterEntity, LocationEntity } from './book';

export interface ProcessingProgress {
    phase:
        | 'uploading'
        | 'extracting'
        | 'segmenting'
        | 'structuring'
        | 'cinematifying'
        | 'complete'
        | 'error';
    currentChapter: number;
    totalChapters: number;
    percentComplete: number;
    message: string;
}

export interface CinematificationResult {
    blocks: CinematicBlock[];
    rawText?: string; // Full cinematified text from AI (before block parsing)
    metadata: {
        originalWordCount: number;
        cinematifiedWordCount: number;
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        processingTimeMs: number;
    };
    /** Readability metrics (populated when analytics stages are used) */
    readability?: import('../lib/engine/cinematifier/readability').ReadabilityMetrics;
    /** Emotion/sentiment flow (populated when analytics stages are used) */
    sentiment?: import('../lib/engine/cinematifier/sentimentTracker').SentimentFlowResult;
    /** Pacing analysis (populated when analytics stages are used) */
    pacing?: import('../lib/engine/cinematifier/pacingAnalyzer').PacingMetrics;
    /** Text statistics (populated when analytics stages are used) */
    textStats?: import('../lib/processing/textStatistics').TextStatistics;
    /** Detected narrative mode (populated by NarrativeAnalysisStage) */
    narrativeMode?: 'normal' | 'flashback' | 'dream' | 'memory';
    /** Detected POV character name (populated by NarrativeAnalysisStage) */
    povCharacter?: string;
    /** Scene groups from heuristic segmentation (populated by SceneSegmentationStage) */
    scenes?: { title: string; paragraphs: string[] }[];
    /** Runtime render cues/scenes derived from cinematic blocks */
    renderPlan?: RenderPlan;
    /** Per-stage execution timings for deterministic verification and debugging */
    stageTrace?: PipelineStageTrace[];
    /** Extracted entities from Compromise.js Named Entity Recognition */
    entityRegistry?: {
        characters: CharacterEntity[];
        locations: LocationEntity[];
    };
}

/** AI connection test result */
export interface AIConnectionStatus {
    ok: boolean;
    provider: string;
    message: string;
    latencyMs?: number;
}
