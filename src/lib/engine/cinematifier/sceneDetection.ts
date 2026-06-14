/**
 * sceneDetection.ts — Heuristic Scene Break Detection
 *
 * Uses regex patterns to identify time shifts, location changes, and narrative
 * jumps that typically indicate scene breaks. Provides fallback scene segmentation
 * when AI-powered segmentation is unavailable.
 *
 * Also provides POV-shift detection, narrative-mode classification (flashback,
 * dream, memory), and improved scene-title derivation.
 */

import { analyzeSentiment } from './sentimentTracker';
import {
    SCENE_BREAK_SIGNALS,
    CUSTOM_SCENE_BREAK_PATTERNS,
    LOCATION_PATTERN,
    TIME_PATTERN,
    TIME_SHIFT_PATTERN,
    LOCATION_SHIFT_PATTERN,
    NARRATIVE_TRANSITION_PATTERN,
    ORIGINAL_MODE_TIME_SHIFT_PATTERN,
    ORIGINAL_MODE_LOCATION_PATTERN,
    ORIGINAL_MODE_SCENE_DIVIDER_PATTERN,
    POV_NAME_PATTERN,
    FLASHBACK_PATTERN,
    DREAM_PATTERN,
    MEMORY_PATTERN,
    DIALOGUE_OPENING_PATTERN,
    ACTION_PATTERN,
    MOOD_PATTERNS,
} from './regexPatterns';

export {
    SCENE_BREAK_SIGNALS,
    CUSTOM_SCENE_BREAK_PATTERNS,
    LOCATION_PATTERN,
    TIME_PATTERN,
};

import type { SceneBreakReason } from '../../../types/cinematic';

export interface Scene {
    id: string;
    text: string;
    breakReason?: SceneBreakReason;
}

const EMOTIONAL_RESET_THRESHOLD = 0.55;
const SCENE_BREAK_THRESHOLD = 2;
const MAX_PARAGRAPHS_PER_SCENE = 8;
const ORIGINAL_MODE_STRONG_BREAK_NEWLINES = 3;

function extractLocationHint(paragraph: string): string | undefined {
    const match = paragraph.match(LOCATION_SHIFT_PATTERN) || paragraph.match(LOCATION_PATTERN);
    return match?.[1]?.trim().toLowerCase();
}

function hasEmotionalReset(previous: string, current: string): boolean {
    const prevSentiment = analyzeSentiment(previous);
    const currentSentiment = analyzeSentiment(current);

    if (prevSentiment.confidence < 0.05 || currentSentiment.confidence < 0.05) return false;

    const delta = Math.abs(prevSentiment.score - currentSentiment.score);
    const polarityFlipped =
        Math.sign(prevSentiment.score) !== Math.sign(currentSentiment.score) &&
        Math.abs(prevSentiment.score) >= 0.2 &&
        Math.abs(currentSentiment.score) >= 0.2;

    return delta >= EMOTIONAL_RESET_THRESHOLD || polarityFlipped;
}

function shouldStartNewScene(
    previous: string,
    current: string,
    currentSceneLength: number,
): boolean {
    const previousLocation = extractLocationHint(previous);
    const currentLocation = extractLocationHint(current);
    const locationChanged =
        Boolean(previousLocation) &&
        Boolean(currentLocation) &&
        previousLocation !== currentLocation;

    const timeShift = TIME_SHIFT_PATTERN.test(current);
    const legacySignal = SCENE_BREAK_SIGNALS.test(current);
    const narrativeTransition = NARRATIVE_TRANSITION_PATTERN.test(current);
    const modeTransition = detectNarrativeMode(previous) !== detectNarrativeMode(current);
    const emotionalReset = hasEmotionalReset(previous, current);

    let score = 0;
    if (timeShift) score += 2;
    if (locationChanged) score += 2;
    if (legacySignal || narrativeTransition || modeTransition) score += 2;
    if (emotionalReset) score += 2;

    if (currentSceneLength >= MAX_PARAGRAPHS_PER_SCENE && score >= 1) return true;
    return score >= SCENE_BREAK_THRESHOLD;
}

interface SceneWithBreak {
    paragraphs: string[];
    breakReason: SceneBreakReason;
}

function detectSignalBreakReason(previous: string, current: string): SceneBreakReason {
    const timeShift = TIME_SHIFT_PATTERN.test(current);
    if (timeShift) return 'time_shift';

    const previousLocation = extractLocationHint(previous);
    const currentLocation = extractLocationHint(current);
    const locationChanged =
        Boolean(previousLocation) &&
        Boolean(currentLocation) &&
        previousLocation !== currentLocation;
    if (locationChanged) return 'location_shift';

    const narrativeTransition = NARRATIVE_TRANSITION_PATTERN.test(current);
    if (narrativeTransition) return 'narrative_transition';

    const modeTransition = detectNarrativeMode(previous) !== detectNarrativeMode(current);
    if (modeTransition) return 'mode_transition';

    const emotionalReset = hasEmotionalReset(previous, current);
    if (emotionalReset) return 'emotional_reset';

    return 'threshold_reached';
}

function segmentParagraphsUniversal(paragraphs: string[]): SceneWithBreak[] {
    const scenes: SceneWithBreak[] = [];
    let currentScene: string[] = [];

    for (const paragraph of paragraphs) {
        const p = paragraph.trim();
        if (!p) continue;

        const isStructuralDivider = CUSTOM_SCENE_BREAK_PATTERNS.some(re => re.test(p));
        if (isStructuralDivider) {
            if (currentScene.length) {
                scenes.push({ paragraphs: currentScene, breakReason: 'structural_divider' });
                currentScene = [];
            }
            continue;
        }

        if (
            currentScene.length > 0 &&
            shouldStartNewScene(currentScene[currentScene.length - 1], p, currentScene.length)
        ) {
            const reason = detectSignalBreakReason(currentScene[currentScene.length - 1], p);
            scenes.push({ paragraphs: currentScene, breakReason: reason });
            currentScene = [];
        }

        currentScene.push(p);
    }

    if (currentScene.length) {
        const isFirst = scenes.length === 0;
        scenes.push({ paragraphs: currentScene, breakReason: isFirst ? 'start' : 'threshold_reached' });
    }
    return scenes;
}

function extractOriginalModeLocation(paragraph: string): string | undefined {
    const match = paragraph.match(ORIGINAL_MODE_LOCATION_PATTERN);
    return match?.[1]?.trim().toLowerCase();
}

function splitParagraphsWithBreakStrength(
    text: string,
): Array<{ paragraph: string; breakNewlines: number }> {
    const normalized = text.replace(/\r\n|\r/g, '\n').trim();
    if (!normalized) return [];

    const tokens = normalized.split(/(\n\s*\n+)/);
    const units: Array<{ paragraph: string; breakNewlines: number }> = [];

    for (let i = 0; i < tokens.length; i += 2) {
        const paragraph = (tokens[i] ?? '').trim();
        if (!paragraph) continue;

        const separator = tokens[i + 1] ?? '';
        const breakNewlines = (separator.match(/\n/g) || []).length;
        units.push({ paragraph, breakNewlines });
    }

    return units;
}

/**
 * Deterministic scene detection for original reader mode.
 * Splits scenes on time shifts, location changes, explicit dividers, and strong paragraph breaks.
 */
export function detectOriginalModeScenes(text: string): Scene[] {
    const units = splitParagraphsWithBreakStrength(text);
    if (units.length === 0) return [];

    const scenes: Array<{ paragraphs: string[]; reason: SceneBreakReason }> = [];
    let currentScene: string[] = [];
    let currentLocation: string | undefined;

    for (let i = 0; i < units.length; i++) {
        const { paragraph, breakNewlines } = units[i];

        if (ORIGINAL_MODE_SCENE_DIVIDER_PATTERN.test(paragraph)) {
            if (currentScene.length > 0) {
                scenes.push({ paragraphs: currentScene, reason: 'structural_divider' });
                currentScene = [];
                currentLocation = undefined;
            }
            continue;
        }

        const detectedLocation = extractOriginalModeLocation(paragraph);
        const hasLocationShift =
            Boolean(detectedLocation) &&
            Boolean(currentLocation) &&
            detectedLocation !== currentLocation;
        const hasTimeShift = ORIGINAL_MODE_TIME_SHIFT_PATTERN.test(paragraph);
        const hasStrongBreak =
            i > 0 && units[i - 1].breakNewlines >= ORIGINAL_MODE_STRONG_BREAK_NEWLINES;

        const shouldStartNewScene =
            currentScene.length > 0 && (hasTimeShift || hasLocationShift || hasStrongBreak);

        let reason: SceneBreakReason = 'threshold_reached';
        if (shouldStartNewScene) {
            if (hasTimeShift) reason = 'time_shift';
            else if (hasLocationShift) reason = 'location_shift';
            else if (hasStrongBreak) reason = 'narrative_transition';

            scenes.push({ paragraphs: currentScene, reason });
            currentScene = [];
            currentLocation = undefined;
        }

        currentScene.push(paragraph);
        if (detectedLocation) {
            currentLocation = detectedLocation;
        }

        if (breakNewlines >= ORIGINAL_MODE_STRONG_BREAK_NEWLINES && i < units.length - 1) {
            scenes.push({ paragraphs: currentScene, reason: 'narrative_transition' as SceneBreakReason });
            currentScene = [];
            currentLocation = undefined;
        }
    }

    if (currentScene.length > 0) {
        const isFirst = scenes.length === 0;
        scenes.push({ paragraphs: currentScene, reason: isFirst ? 'start' : 'threshold_reached' });
    }

    return scenes.map((scene, index) => ({
        id: `scene-${index + 1}`,
        text: scene.paragraphs.join('\n\n'),
        breakReason: scene.reason,
    }));
}

/**
 * Detect scene breaks in paragraphs using heuristic patterns.
 * Used as fallback when AI scene segmentation is unavailable.
 * @deprecated Returns paragraph groups only; use segmentScenesUniversal for Scene[] with break reasons.
 */
export function detectSceneBreaks(paragraphs: string[]): string[][] {
    return segmentParagraphsUniversal(paragraphs).map(s => s.paragraphs);
}

/**
 * Universal scene segmentation for arbitrary novel text.
 * Detects time shifts, location changes, narrative transitions, and emotional resets.
 */
export function segmentScenesUniversal(text: string): Scene[] {
    const paragraphs = text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean);

    const groupedScenes = segmentParagraphsUniversal(paragraphs);
    return groupedScenes.map((group, index) => ({
        id: `scene-${index + 1}`,
        text: group.paragraphs.join('\n\n'),
        breakReason: group.breakReason,
    }));
}

/** Derive a scene title from the first paragraph of a scene group */
export function deriveSceneTitle(sceneParagraphs: string[], sceneNumber: number): string {
    const first = sceneParagraphs[0] || '';

    const locationMatch = first.match(LOCATION_PATTERN);
    if (locationMatch) return locationMatch[1];

    const timeMatch = first.match(TIME_PATTERN);
    if (timeMatch) return timeMatch[1].charAt(0).toUpperCase() + timeMatch[1].slice(1);

    if (DIALOGUE_OPENING_PATTERN.test(first.trim())) {
        const actionMatch = first.match(ACTION_PATTERN);
        if (actionMatch) return `The ${capitalize(actionMatch[1])}`;
        return 'The Conversation';
    }

    const actionMatch = first.match(ACTION_PATTERN);
    if (actionMatch) return `The ${capitalize(actionMatch[1])}`;

    // Mood-based title derivation: scan all paragraphs for emotional tone
    const allText = sceneParagraphs.join(' ');
    for (const { pattern, prefix } of MOOD_PATTERNS) {
        if (pattern.test(allText)) {
            return `${prefix} Scene ${sceneNumber}`;
        }
    }

    // POV-based title: if a POV shift is detected, use the character's name (not pronoun)
    const pov = detectPOVShift(sceneParagraphs);
    const pronouns = ['He', 'She', 'They', 'We', 'I', 'You', 'It'];
    if (pov && !pronouns.includes(pov)) return `${pov}'s Scene`;

    return `Scene ${sceneNumber}`;
}

/**
 * Detect whether the first paragraph signals a POV character.
 * Looks for a capitalized name followed by an action/thought verb at the start.
 */
export function detectPOVShift(paragraphs: string[]): string | undefined {
    if (!paragraphs.length) return undefined;

    const first = paragraphs[0].trim();
    const match = first.match(POV_NAME_PATTERN);
    return match ? match[1] : undefined;
}

/**
 * Classify a paragraph's narrative mode based on flashback, dream, and
 * memory markers.
 */
export function detectNarrativeMode(
    paragraph: string,
): 'normal' | 'flashback' | 'dream' | 'memory' {
    if (FLASHBACK_PATTERN.test(paragraph)) return 'flashback';
    if (DREAM_PATTERN.test(paragraph)) return 'dream';
    if (MEMORY_PATTERN.test(paragraph)) return 'memory';
    return 'normal';
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
