/**
 * cinematic.ts — Core Cinematic Element Types
 */

import type { EmotionCategory } from './emotion';

// ─── Scene Narrative Mode ──────────────────────────────────
export type NarrativeMode = 'normal' | 'flashback' | 'dream' | 'memory';

// ─── Reason a Scene Boundary was Detected ─────────────────
export type SceneBreakReason =
    | 'start'
    | 'time_shift'
    | 'location_shift'
    | 'narrative_transition'
    | 'emotional_reset'
    | 'structural_divider'
    | 'pov_change'
    | 'mode_transition'
    | 'threshold_reached';

// ─── Per-Scene Metadata ────────────────────────────────────
export interface SceneMetadata {
    id: string;
    title: string;
    index: number;
    wordCount: number;
    paragraphCount: number;
    narrativeMode: NarrativeMode;
    narrativeModeConfidence: number; // 0–1
    povCharacter?: string;
    sentimentScore: number; // –1 to 1
    breakReason: SceneBreakReason;
    tensionProfile: number[]; // per-paragraph tension (0–100)
    dominantEmotion: EmotionCategory;
    characters: string[];
    locations: string[];
    ambience: string;
    sfxCount: number;
    beatCount: number;
}

export type TransitionType =
    | 'FADE IN'
    | 'FADE OUT'
    | 'FADE TO BLACK'
    | 'CUT TO'
    | 'DISSOLVE TO'
    | 'SMASH CUT'
    | 'MATCH CUT'
    | 'JUMP CUT'
    | 'WIPE TO'
    | 'IRIS IN'
    | 'IRIS OUT';

export type BeatType = 'BEAT' | 'PAUSE' | 'LONG PAUSE' | 'SILENCE' | 'TENSION' | 'RELEASE';

export type SFXIntensity = 'soft' | 'medium' | 'loud' | 'explosive';

export interface SFXAnnotation {
    sound: string; // e.g., "BOOM", "CRASH", "WHISPER"
    intensity: SFXIntensity;
    duration?: 'brief' | 'sustained' | 'lingering';
}

export interface CinematicBeat {
    type: BeatType;
    duration?: number; // in seconds, for pacing
    description?: string;
}

export interface SceneTransition {
    type: TransitionType;
    description?: string;
    toLocation?: string;
}

export interface OriginalModeScene {
    id: string;
    text: string;
}

export type CinematicBlockType =
    | 'action' // Descriptive action/scene setting
    | 'dialogue' // Character dialogue
    | 'inner_thought' // Character internal monologue
    | 'sfx' // Sound effect annotation
    | 'beat' // Dramatic pause/beat
    | 'transition' // Scene transition
    | 'title_card' // Chapter/scene title
    | 'chapter_header'; // Chapter header

/** Runtime list of valid CinematicBlockType values for server response validation */
export const VALID_BLOCK_TYPES: readonly CinematicBlockType[] = [
    'action',
    'dialogue',
    'inner_thought',
    'sfx',
    'beat',
    'transition',
    'title_card',
    'chapter_header',
];

/** Safely convert server blocks (type: string) to typed CinematicBlock[] */
export function toClientBlocks(
    blocks: Array<{ type: string; [key: string]: unknown }>,
): CinematicBlock[] {
    return blocks.map(b => ({
        ...b,
        type: (VALID_BLOCK_TYPES as readonly string[]).includes(b.type)
            ? (b.type as CinematicBlockType)
            : 'action',
    })) as CinematicBlock[];
}

export interface CinematicBlock {
    id: string;
    type: CinematicBlockType;
    content: string;
    speaker?: string;
    sfx?: SFXAnnotation;
    beat?: CinematicBeat;
    transition?: SceneTransition;
    intensity: 'whisper' | 'normal' | 'emphasis' | 'shout' | 'explosive';
    timing?: 'slow' | 'normal' | 'quick' | 'rapid';
    emotion?: EmotionCategory;
    tensionScore?: number; // 0-100
    cameraCue?: string; // e.g. "HANDHELD CLOSE", "WIDE ESTABLISHING"
    ambience?: string; // e.g. "eerie silence", "thunderous"
    entities?: {
        characters: string[]; // character names found in this block
        locations: string[]; // location names found in this block
    };
}
