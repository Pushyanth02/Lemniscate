/**
 * pipeline.ts — Core Cinematification Pipeline Engine
 *
 * Provides a composable pipeline architecture for the cinematification process.
 * Each stage handles a specific task and passes its output to the next stage,
 * producing the final CinematificationResult.
 *
 * Usage:
 *   // AI pipeline
 *   const pipeline = CinematificationPipeline.createAIPipeline(aiConfig);
 *   const result = await pipeline.execute(rawText, { onProgress, onChunk });
 *
 *   // Offline pipeline
 *   const pipeline = CinematificationPipeline.createOfflinePipeline();
 *   const result = await pipeline.execute(rawText);
 *
 *   // Custom pipeline
 *   const pipeline = new CinematificationPipeline()
 *     .addStage(new TextCleaningStage())
 *     .addStage(new ParagraphReconstructionStage())
 *     .addStage(new OfflineCinematificationStage());
 *   const result = await pipeline.execute(rawText);
 */

import type {
    CinematicBlock,
    CinematificationResult,
    PipelineStageTrace,
    RenderPlan,
} from '../../../types/cinematifier';
import { buildRenderPlan } from '../../runtime/renderer';
import { cleanExtractedText, reconstructParagraphs } from './textProcessing';
import { cinematifyOffline } from './offlineEngine';
import { analyzeReadability, type ReadabilityMetrics } from './readability';
import { analyzeSentimentFlow, type SentimentFlowResult } from './sentimentTracker';
import { analyzePacing, type PacingMetrics } from './pacingAnalyzer';
import { computeTextStatistics, type TextStatistics } from '../../processing/textStatistics';
import {
    detectPOVShift,
    detectNarrativeMode,
    detectSceneBreaks,
    deriveSceneTitle,
} from './sceneDetection';

// Import analytics stage classes for instanceof checks
// Note: These classes are defined in this file, so we can't import them.
// We'll check stage names instead of using instanceof.

// ─── LRU Cache for Expensive Operations ───────────────────────────────────

/**
 * Simple LRU (Least Recently Used) cache with size limit.
 * Optimizes expensive text analysis operations by caching results.
 */
class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, V>;
    private accessOrder: K[];

    constructor(capacity: number = 100) {
        this.capacity = capacity;
        this.cache = new Map<K, V>();
        this.accessOrder = new Array<K>();
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.accessOrder.push(key);
            return value;
        }
        return undefined;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            // Update existing
            this.accessOrder = this.accessOrder.filter(k => k !== key);
        } else if (this.cache.size >= this.capacity) {
            // Remove least recently used
            const lruKey = this.accessOrder.shift();
            if (lruKey !== undefined) {
                this.cache.delete(lruKey);
            }
        }
        // Add to end (most recently used)
        this.cache.set(key, value);
        this.accessOrder.push(key);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    size(): number {
        return this.cache.size;
    }
}

// Create cache instances for expensive analysis operations
const readabilityCache = new LRUCache<string, ReadabilityMetrics>(50);
const sentimentCache = new LRUCache<string, SentimentFlowResult>(50);
const pacingCache = new LRUCache<string, PacingMetrics>(50);
const textStatsCache = new LRUCache<string, TextStatistics>(50);
const narrativeCache = new LRUCache<string, { povCharacter: string; narrativeMode: 'normal' | 'flashback' | 'dream' | 'memory' }>(50);

// ─── Pipeline Context ──────────────────────────────────────

/** Mutable context passed between pipeline stages */
export interface PipelineContext {
    /** The text being processed — stages may transform it */
    text: string;
    /** Accumulated cinematic blocks from processing */
    blocks: CinematicBlock[];
    /** Raw AI/engine output text */
    rawText: string;
    /** Processing metadata counters */
    metadata: {
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        originalWordCount: number;
    };
    /** Pipeline start time for timing measurement */
    startTime: number;
    /** Optional progress callback */
    onProgress?: (percent: number, message: string) => void;
    /** Optional chunk callback for streaming updates */
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
    /** Optional abort signal for cancellation */
    signal?: AbortSignal;
    /** Readability analysis results (populated by ReadabilityAnalysisStage) */
    readability?: ReadabilityMetrics;
    /** Sentiment flow analysis (populated by SentimentEnrichmentStage) */
    sentiment?: SentimentFlowResult;
    /** Pacing analysis results (populated by PacingAnalysisStage) */
    pacing?: PacingMetrics;
    /** Text statistics (populated by TextStatisticsStage) */
    textStats?: TextStatistics;
    /** Detected narrative mode for the text (populated by NarrativeAnalysisStage) */
    narrativeMode?: 'normal' | 'flashback' | 'dream' | 'memory';
    /** Detected POV character name (populated by NarrativeAnalysisStage) */
    povCharacter?: string;
    /** Scene groups from heuristic segmentation (populated by SceneSegmentationStage) */
    scenes?: { title: string; paragraphs: string[] }[];
    /** Runtime render plan generated from cinematic blocks and scene boundaries */
    renderPlan?: RenderPlan;
    /** Per-stage execution timings for verification/debugging */
    stageTrace: PipelineStageTrace[];
}

// ─── Pipeline Stage Interface ──────────────────────────────

/** A single stage in the cinematification pipeline */
export interface PipelineStage {
    /** Human-readable stage name for progress reporting */
    readonly name: string;
    /**
     * Execute this stage, mutating the pipeline context.
     * Should check for cancellation (context.signal) and report progress (context.onProgress).
     */
    execute(context: PipelineContext): Promise<void> | void;
}
// Utility: Check for cancellation and throw if aborted
export function checkCancelled(context: PipelineContext) {
    if (context.signal?.aborted) {
        throw new Error('Pipeline cancelled');
    }
}

// ─── Built-in Stages ───────────────────────────────────────

/** Stage 1: Cleans raw extracted text (PDF artifacts, whitespace, hyphenation) */
export class TextCleaningStage implements PipelineStage {
    readonly name = 'Text Cleaning';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.05, 'Cleaning text...');
        context.text = cleanExtractedText(context.text);
    }
}

/** Stage 2: Reconstructs paragraph boundaries for texts lacking proper breaks */
export class ParagraphReconstructionStage implements PipelineStage {
    readonly name = 'Paragraph Reconstruction';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.1, 'Reconstructing paragraphs...');
        context.text = reconstructParagraphs(context.text);
    }
}



/** Stage 3b: Offline heuristic-based cinematification (no AI needed) */
export class OfflineCinematificationStage implements PipelineStage {
    readonly name = 'Offline Cinematification';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.2, 'Cinematifying (offline)...');
        const result = cinematifyOffline(context.text);

        context.blocks = result.blocks;
        context.rawText = result.rawText ?? '';
        context.metadata.sfxCount = result.metadata.sfxCount;
        context.metadata.transitionCount = result.metadata.transitionCount;
        context.metadata.beatCount = result.metadata.beatCount;
    }
}

// ─── Analytics Stages ──────────────────────────────────────

/** Post-processing stage: Analyze text readability metrics */
export class ReadabilityAnalysisStage implements PipelineStage {
    readonly name = 'Readability Analysis';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.6, 'Analyzing readability...');

        // Use cache for expensive readability analysis
        const cached = readabilityCache.get(context.text);
        if (cached !== undefined) {
            context.readability = cached;
        } else {
            const result = analyzeReadability(context.text);
            readabilityCache.set(context.text, result);
            context.readability = result;
        }
    }
}

/** Post-processing stage: Enrich blocks with sentiment data */
export class SentimentEnrichmentStage implements PipelineStage {
    readonly name = 'Sentiment Enrichment';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.7, 'Analyzing sentiment...');

        // Use cache for expensive sentiment analysis
        const cached = sentimentCache.get(context.text);
        if (cached !== undefined) {
            context.sentiment = cached;
        } else {
            const result = analyzeSentimentFlow(context.text);
            sentimentCache.set(context.text, result);
            context.sentiment = result;
        }

        // Enrich blocks that lack emotion tags with sentiment-derived emotions
        if (context.blocks.length > 0 && context.sentiment.flow.length > 0) {
            // Map flow points to blocks using proportional indexing
            const ratio = context.sentiment.flow.length / context.blocks.length;
            for (let i = 0; i < context.blocks.length; i++) {
                if (!context.blocks[i].emotion) {
                    const flowIdx = Math.min(
                        Math.floor(i * ratio),
                        context.sentiment.flow.length - 1,
                    );
                    context.blocks[i].emotion = context.sentiment.flow[flowIdx].emotion;
                }
            }
        }
    }
}

/** Post-processing stage: Analyze pacing of cinematified blocks */
export class PacingAnalysisStage implements PipelineStage {
    readonly name = 'Pacing Analysis';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.8, 'Analyzing pacing...');

        // Use cache for expensive pacing analysis
        // Create a string representation of blocks for caching
        const blocksKey = JSON.stringify(context.blocks.map(b => ({
            id: b.id,
            type: b.type,
            content: b.content.substring(0, 100), // Truncate for reasonable key size
            speaker: b.speaker
        })));

        const cached = pacingCache.get(blocksKey);
        if (cached !== undefined) {
            context.pacing = cached;
        } else {
            const result = analyzePacing(context.blocks);
            pacingCache.set(blocksKey, result);
            context.pacing = result;
        }
    }
}

/** Post-processing stage: Compute comprehensive text statistics */
export class TextStatisticsStage implements PipelineStage {
    readonly name = 'Text Statistics';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.85, 'Computing text statistics...');

        // Use cache for expensive text statistics
        const cached = textStatsCache.get(context.text);
        if (cached !== undefined) {
            context.textStats = cached;
        } else {
            const result = computeTextStatistics(context.text);
            textStatsCache.set(context.text, result);
            context.textStats = result;
        }
    }
}

/** Post-processing stage: Detect narrative mode and POV character */
export class NarrativeAnalysisStage implements PipelineStage {
    readonly name = 'Narrative Analysis';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.9, 'Analyzing narrative mode...');

        // Use dedicated cache for narrative analysis
        const narrativeKey = `narrative:${context.text}`;
        const cachedNarrative = narrativeCache.get(narrativeKey);
        if (cachedNarrative !== undefined) {
            context.povCharacter = cachedNarrative.povCharacter;
            context.narrativeMode = cachedNarrative.narrativeMode;
            return;
        }

        const paragraphs = context.text
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(Boolean);

        const povCharacter = detectPOVShift(paragraphs);

        // Determine dominant narrative mode from all paragraphs
        const modes = paragraphs.map(p => detectNarrativeMode(p));
        const nonNormal = modes.filter(m => m !== 'normal');
        const narrativeMode = nonNormal.length > 0 ? nonNormal[0] : 'normal';

        // Cache the results
        narrativeCache.set(narrativeKey, { povCharacter, narrativeMode });

        context.povCharacter = povCharacter;
        context.narrativeMode = narrativeMode;
    }
}

/** Post-processing stage: Segment text into scenes with derived titles */
export class SceneSegmentationStage implements PipelineStage {
    readonly name = 'Scene Segmentation';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.95, 'Segmenting scenes...');
        const paragraphs = context.text
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(Boolean);

        const sceneGroups = detectSceneBreaks(paragraphs);
        context.scenes = sceneGroups.map((group, i) => ({
            title: deriveSceneTitle(group, i + 1),
            paragraphs: group,
        }));
    }
}

/** Final stage: Convert cinematic blocks into runtime render cues and scene plans */
export class RendererStage implements PipelineStage {
    readonly name = 'Renderer';

    execute(context: PipelineContext): void {
        checkCancelled(context);
        context.onProgress?.(0.99, 'Preparing renderer plan...');
        context.renderPlan = buildRenderPlan(context.blocks, context.scenes);
    }
}

// ─── Pipeline Engine ───────────────────────────────────────

/**
 * Composable cinematification pipeline that executes stages sequentially.
 *
 * Each stage receives and modifies a shared PipelineContext. The pipeline
 * assembles the final CinematificationResult from the context after all
 * stages have completed.
 */
export class CinematificationPipeline {
    private stages: PipelineStage[] = [];

    /** Add a stage to the pipeline. Returns this for chaining. */
    addStage(stage: PipelineStage): this {
        this.stages.push(stage);
        return this;
    }

    /** Get the list of registered stage names */
    getStageNames(): string[] {
        return this.stages.map(s => s.name);
    }

    /**
     * Execute the pipeline on the given text.
     *
     * @param text - Raw input text to process
     * @param options - Optional callbacks and AI configuration
     * @returns The final CinematificationResult
     */
    async execute(
        text: string,
        options: {
            onProgress?: (percent: number, message: string, stage?: string, stageProgress?: { stage: string; progress: number; }[]) => void;
            onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
            signal?: AbortSignal;
        } = {},
    ): Promise<CinematificationResult> {
        const context: PipelineContext = {
            text,
            blocks: [],
            rawText: '',
            metadata: {
                sfxCount: 0,
                transitionCount: 0,
                beatCount: 0,
                originalWordCount: text.split(/\s+/).filter(Boolean).length,
            },
            startTime: performance.now(),
            onProgress: options.onProgress,
            onChunk: options.onChunk,
            signal: options.signal,
            stageTrace: [],
        };

        // Execute stages sequentially, but run independent analytics stages in parallel
        for (let i = 0; i < this.stages.length; i++) {
            const stage = this.stages[i];

            // Check if this is an analytics stage that can be run in parallel
            // We check stage names instead of instanceof since classes are defined in this file
            const isAnalyticsStage = stage.name === 'Readability Analysis' ||
                                 stage.name === 'Sentiment Enrichment' ||
                                 stage.name === 'Pacing Analysis' ||
                                 stage.name === 'Text Statistics' ||
                                 stage.name === 'Narrative Analysis';

            // For the enriched offline pipeline, run analytics stages in parallel after cinematification
            if (isAnalyticsStage &&
                i > 0 &&
                (this.stages[i-1] as any).name === 'Offline Cinematification') {

                // Collect all consecutive analytics stages
                const analyticsStages: PipelineStage[] = [];
                let j = i;
                while (j < this.stages.length) {
                    const stageName = this.stages[j].name;
                    if (stageName === 'Readability Analysis' ||
                        stageName === 'Sentiment Enrichment' ||
                        stageName === 'Pacing Analysis' ||
                        stageName === 'Text Statistics' ||
                        stageName === 'Narrative Analysis') {
                        analyticsStages.push(this.stages[j]);
                        j++;
                    } else {
                        break;
                    }
                }

                // Execute all analytics stages in parallel
                await Promise.all(
                    analyticsStages.map(async (analyticsStage) => {
                        checkCancelled(context);
                        const startedAtMs = performance.now();
                        try {
                            await analyticsStage.execute(context);
                        } finally {
                            const finishedAtMs = performance.now();
                            context.stageTrace.push({
                                stageName: analyticsStage.name,
                                startedAtMs,
                                finishedAtMs,
                                durationMs: Math.max(0, Math.round(finishedAtMs - startedAtMs)),
                            });
                        }
                    })
                );

                // Skip the stages we just processed in parallel
                i += analyticsStages.length - 1;
                continue;
            }

            // Execute stage normally
            checkCancelled(context);
            const startedAtMs = performance.now();
            try {
                await stage.execute(context);
            } finally {
                const finishedAtMs = performance.now();
                context.stageTrace.push({
                    stageName: stage.name,
                    startedAtMs,
                    finishedAtMs,
                    durationMs: Math.max(0, Math.round(finishedAtMs - startedAtMs)),
                });
            }
        }

        const processingTimeMs = Math.round(performance.now() - context.startTime);

        const result: CinematificationResult = {
            blocks: context.blocks,
            rawText: context.rawText,
            metadata: {
                originalWordCount: context.metadata.originalWordCount,
                cinematifiedWordCount: context.blocks.reduce(
                    (acc, b) => acc + (b.content?.split(/\s+/).filter(Boolean).length || 0),
                    0,
                ),
                sfxCount: context.metadata.sfxCount,
                transitionCount: context.metadata.transitionCount,
                beatCount: context.metadata.beatCount,
                processingTimeMs,
            },
        };

        // Attach analytics if computed by analytics stages
        if (context.readability) result.readability = context.readability;
        if (context.sentiment) result.sentiment = context.sentiment;
        if (context.pacing) result.pacing = context.pacing;
        if (context.textStats) result.textStats = context.textStats;
        if (context.narrativeMode) result.narrativeMode = context.narrativeMode;
        if (context.povCharacter) result.povCharacter = context.povCharacter;
        if (context.scenes) result.scenes = context.scenes;
        if (context.renderPlan) result.renderPlan = context.renderPlan;
        result.stageTrace = context.stageTrace;

        return result;
    }

    // ─── Factory Methods ───────────────────────────────────

    /**
     * Create a pipeline for offline/fallback cinematification.
     *
     * Stages: TextCleaning → ParagraphReconstruction → OfflineCinematification
     */
    static createOfflinePipeline(): CinematificationPipeline {
        return new CinematificationPipeline()
            .addStage(new TextCleaningStage())
            .addStage(new ParagraphReconstructionStage())
            .addStage(new OfflineCinematificationStage());
    }

    /**
     * Create an enriched offline pipeline with analytics stages.
     *
     * Stages: TextCleaning → ParagraphReconstruction → SceneSegmentation
     *         → NarrativeAnalysis → OfflineCinematification
     *         → ReadabilityAnalysis → TextStatistics
     *         → SentimentEnrichment → PacingAnalysis → Renderer
     */
    static createEnrichedOfflinePipeline(): CinematificationPipeline {
        return new CinematificationPipeline()
            .addStage(new TextCleaningStage())
            .addStage(new ParagraphReconstructionStage())
            .addStage(new SceneSegmentationStage())
            .addStage(new NarrativeAnalysisStage())
            .addStage(new OfflineCinematificationStage())
            .addStage(new ReadabilityAnalysisStage())
            .addStage(new TextStatisticsStage())
            .addStage(new SentimentEnrichmentStage())
            .addStage(new PacingAnalysisStage())
            .addStage(new RendererStage());
    }
}
