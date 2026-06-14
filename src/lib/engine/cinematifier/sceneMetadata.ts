/**
 * sceneMetadata.ts — Per-Scene Metadata Generation
 *
 * Generates rich metadata for each detected scene including narrative mode,
 * POV character, sentiment, tension profile, characters, locations, ambience,
 * and the reason the scene boundary was created.
 */

import type { EmotionCategory } from '../../../types/emotion';
import type {
    NarrativeMode,
    SceneBreakReason,
    SceneMetadata,
} from '../../../types/cinematic';
import type { Scene } from './sceneDetection';
import { detectNarrativeMode, detectPOVShift } from './sceneDetection';
import { analyzeSentiment, scoreToEmotion } from './sentimentTracker';
import { analyzeScene } from './corePipeline';
import { detectAmbienceLabel, detectSfxLabel } from './corePipeline';

// ─── Break Reason Detection ─────────────────────────────────

/**
 * Determine why a scene boundary was created by analyzing the paragraph
 * that starts the new scene and the one that ended the previous scene.
 */
export function detectBreakReason(
    previousParagraph: string | undefined,
    currentParagraph: string,
): SceneBreakReason {
    if (!previousParagraph) return 'start';

    const current = currentParagraph.trim();
    const previous = previousParagraph.trim();

    // Structural dividers (***, ---, etc.)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(current)) return 'structural_divider';

    // Time shift patterns
    const timeShiftRe =
        /\b(hours? later|days? later|weeks? later|months? later|years? later|the next (morning|day|evening|night)|meanwhile|afterwards|before dawn|at dawn|at dusk|at midnight|at noon)\b/i;
    if (timeShiftRe.test(current)) return 'time_shift';

    // Location shift patterns
    const locationShiftRe =
        /\b(at the|in the|on the|arrived at|reached|entered|left|departed from|returned to)\b/i;
    if (locationShiftRe.test(current) && !locationShiftRe.test(previous)) return 'location_shift';

    // Narrative transition words
    const narrativeTransitionRe =
        /\b(meanwhile|elsewhere|back at|elsewhere|in another place|across the|far away)\b/i;
    if (narrativeTransitionRe.test(current)) return 'narrative_transition';

    // Mode transition (flashback, dream, memory)
    const prevMode = detectNarrativeMode(previous);
    const currMode = detectNarrativeMode(current);
    if (prevMode !== currMode && currMode !== 'normal') return 'mode_transition';
    if (prevMode !== currMode && prevMode !== 'normal') return 'mode_transition';

    // Emotional reset (sentiment polarity flip)
    const prevSentiment = analyzeSentiment(previous);
    const currSentiment = analyzeSentiment(current);
    const delta = Math.abs(prevSentiment.score - currSentiment.score);
    const polarityFlipped =
        Math.sign(prevSentiment.score) !== Math.sign(currSentiment.score) &&
        Math.abs(prevSentiment.score) >= 0.2 &&
        Math.abs(currSentiment.score) >= 0.2;
    if (delta >= 0.55 || polarityFlipped) return 'emotional_reset';

    // POV change
    const prevPOV = detectPOVShift([previous]);
    const currPOV = detectPOVShift([current]);
    if (prevPOV && currPOV && prevPOV !== currPOV) return 'pov_change';

    return 'threshold_reached';
}

// ─── Narrative Mode with Confidence ─────────────────────────

/**
 * Detect narrative mode with a confidence score based on the density
 * of mode-indicating patterns in the text.
 */
export function detectNarrativeModeWithConfidence(
    text: string,
): { mode: NarrativeMode; confidence: number } {
    const lower = text.toLowerCase();

    // Flashback patterns with weights
    const flashbackPatterns = [
        { pattern: /\b(years? earlier|years? ago|months? ago|days? ago)\b/i, weight: 0.9 },
        { pattern: /\b(flashback|in the past|once upon a time|long ago)\b/i, weight: 0.95 },
        { pattern: /\b(he remembered|she remembered|they remembered)\b/i, weight: 0.6 },
        { pattern: /\b(it was back in|back when|those days)\b/i, weight: 0.7 },
    ];

    // Dream patterns
    const dreamPatterns = [
        { pattern: /\b(dream(?:ed|ing)?|dream sequence|in the dream)\b/i, weight: 0.95 },
        { pattern: /\b(woke up|waking up|opened (?:his|her|their) eyes)\b/i, weight: 0.5 },
        { pattern: /\b(it was all a dream|it had been a dream)\b/i, weight: 0.98 },
        { pattern: /\b(floating|weightless|surreal|impossible)\b/i, weight: 0.3 },
    ];

    // Memory patterns
    const memoryPatterns = [
        { pattern: /\b(remembered|recalled|reminisced|thought back to)\b/i, weight: 0.7 },
        { pattern: /\b(the memory of|memories of|couldn't forget)\b/i, weight: 0.8 },
        { pattern: /\b(never forgot|always remembered|etched in (?:his|her|their) memory)\b/i, weight: 0.85 },
    ];

    const flashbackScore = flashbackPatterns.reduce(
        (sum, { pattern, weight }) => sum + (pattern.test(lower) ? weight : 0),
        0,
    );
    const dreamScore = dreamPatterns.reduce(
        (sum, { pattern, weight }) => sum + (pattern.test(lower) ? weight : 0),
        0,
    );
    const memoryScore = memoryPatterns.reduce(
        (sum, { pattern, weight }) => sum + (pattern.test(lower) ? weight : 0),
        0,
    );

    const maxScore = Math.max(flashbackScore, dreamScore, memoryScore);

    if (maxScore === 0) return { mode: 'normal', confidence: 1.0 };
    if (maxScore === flashbackScore) return { mode: 'flashback', confidence: Math.min(maxScore, 1.0) };
    if (maxScore === dreamScore) return { mode: 'dream', confidence: Math.min(maxScore, 1.0) };
    return { mode: 'memory', confidence: Math.min(maxScore, 1.0) };
}

// ─── Per-Scene Metadata Builder ─────────────────────────────

/**
 * Build complete metadata for a single scene.
 */
export function buildSceneMetadata(
    scene: Scene,
    sceneIndex: number,
    title: string,
    breakReason: SceneBreakReason,
    characters: string[],
    locations: string[],
): SceneMetadata {
    const text = scene.text;
    const paragraphs = text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean);

    // Word count
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Narrative mode with confidence
    const { mode: narrativeMode, confidence: narrativeModeConfidence } =
        detectNarrativeModeWithConfidence(text);

    // POV character
    const povCharacter = detectPOVShift(paragraphs);

    // Sentiment
    const sentiment = analyzeSentiment(text);

    // Tension profile (per-paragraph)
    const tensionProfile = paragraphs.map(para => {
        const analysis = analyzeScene(para);
        return analysis.tensionScore;
    });

    // Dominant emotion
    const dominantEmotion: EmotionCategory = scoreToEmotion(sentiment.score);

    // Ambience
    const ambience = detectAmbienceLabel(text) || '';

    // SFX count
    const sfxCount = paragraphs.filter(p => detectSfxLabel(p) !== null).length;

    // Beat count (dramatic short lines)
    const beatCount = text
        .split(/\n+/)
        .filter(line => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            const words = trimmed.split(/\s+/).length;
            return words > 0 && words <= 5;
        }).length;

    return {
        id: scene.id,
        title,
        index: sceneIndex,
        wordCount,
        paragraphCount: paragraphs.length,
        narrativeMode,
        narrativeModeConfidence,
        povCharacter,
        sentimentScore: sentiment.score,
        breakReason,
        tensionProfile,
        dominantEmotion,
        characters,
        locations,
        ambience,
        sfxCount,
        beatCount,
    };
}

// ─── Batch Metadata Generation ──────────────────────────────

/**
 * Generate metadata for all scenes in a chapter, tracking break reasons
 * between consecutive scenes.
 */
export function buildAllSceneMetadata(
    scenes: Scene[],
    titles: string[],
    characters: string[],
    locations: string[],
): SceneMetadata[] {
    return scenes.map((scene, index) => {
        const previousText = index > 0 ? scenes[index - 1].text : undefined;
        const currentFirstParagraph = scene.text.split(/\n\n+/)[0] || '';
        const breakReason = detectBreakReason(previousText, currentFirstParagraph);

        return buildSceneMetadata(
            scene,
            index,
            titles[index] || `Scene ${index + 1}`,
            breakReason,
            characters,
            locations,
        );
    });
}
