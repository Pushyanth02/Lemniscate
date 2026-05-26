/**
 * rendering.ts — Renderer Planning and Cue Types
 */

import type { CinematicBlockType, CinematicBlock } from './cinematic';
import type { EmotionCategory } from './emotion';

export interface RenderCue {
    blockId: string;
    blockType: CinematicBlockType;
    sceneIndex: number;
    content: string;
    estimatedDurationMs: number;
    intensity: CinematicBlock['intensity'];
    timing: CinematicBlock['timing'];
    speaker?: string;
    cameraDirection?: string;
    ambience?: string;
    emotion?: EmotionCategory;
    tensionScore?: number;
}

export interface RenderScenePlan {
    id: string;
    title: string;
    sourceParagraphCount: number;
    blockStartIndex: number;
    blockEndIndex: number;
    cueCount: number;
    estimatedDurationMs: number;
    dominantEmotion?: EmotionCategory;
    averageTensionScore?: number;
}

export interface RenderPlan {
    cues: RenderCue[];
    scenes: RenderScenePlan[];
    totalEstimatedDurationMs: number;
    generatedAt: number;
}

export interface PipelineStageTrace {
    stageName: string;
    startedAtMs: number;
    finishedAtMs: number;
    durationMs: number;
}
