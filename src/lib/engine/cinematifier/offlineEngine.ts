/**
 * offlineEngine.ts — Offline/Fallback Cinematification Engine
 *
 * Provides a sophisticated rule-based NLP pipeline when AI processing is unavailable.
 * Models character conversations, tension curves, persistent ambience, and cinematic
 * camera angles client-side without AI dependencies.
 */

import type {
    CinematicBlock,
    CinematificationResult,
    EmotionCategory,
    TransitionType,
    CinematicBlockType,
} from '../../../types/cinematifier';
import { detectSceneBreaks, deriveSceneTitle } from './sceneDetection';
import { extractEntities } from './entityExtractor';
import { analyzeMood } from './moodLexicon';

function generateBlockId(): string {
    return Math.random().toString(36).substring(2, 11);
}

// ─── Title / Chapter Detection ─────────────────────────────

/** Matches traditional chapter/part/book headers (e.g. "Chapter 1", "Prologue") */
const CHAPTER_HEADER_PATTERN = /^(chapter|part|book|prologue|epilogue)\s*[\d\w]+/i;

/** Matches Act/Scene/Section headers (e.g. "Act I", "Scene 3", "Section 12") */
const ACT_SCENE_SECTION_PATTERN = /^(act|scene|section)\s+(\d+|[IVXLCDM]+)\b/i;

/** Matches standalone Roman numeral lines used as numbered chapter titles */
const ROMAN_NUMERAL_PATTERN = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Detect whether a trimmed paragraph is an ALL-CAPS title.
 * Must be short (≤ 8 words), fully uppercase letters/spaces/punctuation,
 * contain at least one letter, and not look like a regular sentence.
 */
function isAllCapsTitle(line: string): boolean {
    if (line.length === 0) return false;
    const words = line.split(/\s+/);
    if (words.length > 8) return false;
    if (!/^[A-Z\s\d:.,!?'"\-—]+$/.test(line)) return false;
    if ((line.match(/[A-Z]/g) || []).length < 2) return false;
    return true;
}

/**
 * Check if a standalone line is a Roman numeral title (e.g. "I", "IV", "XII").
 * Only matches valid Roman numerals that evaluate to at least 1.
 */
function isRomanNumeralTitle(line: string): boolean {
    const trimmed = line.trim();
    if (!ROMAN_NUMERAL_PATTERN.test(trimmed)) return false;
    return trimmed.length > 0;
}

// ─── Scene Transition Detection ────────────────────────────

const TRANSITION_PATTERNS = [
    /^(later|meanwhile|the next|hours later|days later|suddenly|elsewhere)/i,
    /^\*{3,}/,
    /^---+/,
    /^(INT\.|EXT\.)\s+/i,
    /^(FLASHBACK|DREAM SEQUENCE|MEMORY|END FLASHBACK|END DREAM)\b/i,
];

// ─── SFX Vocabulary ────────────────────────────────────────

const SFX_COMBINED =
    /\b(explod|blast|detona|thunder|lightning|crash|shatter|smash|gunshot|shot|fires?\b|knock|door|creak|whisper|murmur|hush|scream|shout|yell|footstep|stride|stomp|rain|storm|wind|heart|pulse|beat|clang|clatter|ring|chime|splash|drip|gurgle|rush|rustle|howl|chirp|growl|sigh|gasp|sob|laugh|groan|cough|click|buzz|hum|grind|whir|engine|motor|thud|crack|snap|pop|rip|tear)\b/i;

const SFX_LOOKUP: Record<string, [string, 'soft' | 'medium' | 'loud' | 'explosive']> = {
    explod: ['EXPLOSION', 'explosive'],
    blast: ['EXPLOSION', 'explosive'],
    detona: ['EXPLOSION', 'explosive'],
    thunder: ['THUNDER', 'loud'],
    lightning: ['THUNDER', 'loud'],
    crash: ['CRASH', 'loud'],
    shatter: ['CRASH', 'loud'],
    smash: ['CRASH', 'loud'],
    gunshot: ['GUNSHOT', 'loud'],
    shot: ['GUNSHOT', 'loud'],
    fire: ['GUNSHOT', 'loud'],
    knock: ['DOOR', 'medium'],
    door: ['DOOR', 'medium'],
    creak: ['DOOR', 'medium'],
    whisper: ['WHISPER', 'soft'],
    murmur: ['WHISPER', 'soft'],
    hush: ['WHISPER', 'soft'],
    scream: ['SCREAM', 'loud'],
    shout: ['SCREAM', 'loud'],
    yell: ['SCREAM', 'loud'],
    footstep: ['FOOTSTEPS', 'medium'],
    stride: ['FOOTSTEPS', 'medium'],
    stomp: ['FOOTSTEPS', 'medium'],
    rain: ['WIND HOWLING', 'medium'],
    storm: ['WIND HOWLING', 'medium'],
    wind: ['WIND HOWLING', 'medium'],
    heart: ['HEARTBEAT', 'soft'],
    pulse: ['HEARTBEAT', 'soft'],
    beat: ['HEARTBEAT', 'soft'],
    clang: ['CLANG', 'loud'],
    clatter: ['CLATTER', 'medium'],
    ring: ['RING', 'medium'],
    chime: ['CHIME', 'soft'],
    splash: ['SPLASH', 'medium'],
    drip: ['DRIP', 'soft'],
    gurgle: ['GURGLE', 'soft'],
    rush: ['RUSHING WATER', 'medium'],
    rustle: ['RUSTLE', 'soft'],
    howl: ['HOWL', 'loud'],
    chirp: ['CHIRP', 'soft'],
    growl: ['GROWL', 'medium'],
    sigh: ['SIGH', 'soft'],
    gasp: ['GASP', 'medium'],
    sob: ['SOB', 'soft'],
    laugh: ['LAUGH', 'medium'],
    groan: ['GROAN', 'medium'],
    cough: ['COUGH', 'medium'],
    click: ['CLICK', 'soft'],
    buzz: ['BUZZ', 'medium'],
    hum: ['HUM', 'soft'],
    grind: ['GRIND', 'medium'],
    whir: ['WHIR', 'soft'],
    engine: ['ENGINE', 'medium'],
    motor: ['MOTOR', 'medium'],
    thud: ['THUD', 'medium'],
    crack: ['CRACK', 'loud'],
    snap: ['SNAP', 'medium'],
    pop: ['POP', 'medium'],
    rip: ['RIP', 'medium'],
    tear: ['TEAR', 'medium'],
};

// ─── Dialogue & Character Detection ────────────────────────

const DIALOGUE_RE_SOURCE = '"([^"]+)"';
const SPEECH_VERBS =
    'said|whispered|shouted|muttered|replied|asked|exclaimed|called|cried|growled|hissed|barked|snapped|answered|declared|insisted|demanded|pleaded|stammered|murmured';

const SPEAKER_BEFORE_PATTERN = new RegExp(
    `([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+(?:${SPEECH_VERBS})`,
);

const SPEAKER_AFTER_PATTERN = new RegExp(
    `(?:${SPEECH_VERBS})\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`,
);

const CHARACTER_ACTION_VERBS =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:walked|ran|stood|sat|looked|turned|moved|stepped|leaned|reached|grabbed|pulled|pushed|opened|closed|entered|left|paused|stopped|started|began|continued|watched|waited|listened|nodded|shook|smiled|frowned|sighed|gasped|laughed|cried|hesitated|stared|glanced|approached|retreated|followed|led|held|dropped|picked|threw|caught|fell|rose|climbed|jumped|knelt|crouched|whispered|shouted|screamed|muttered)\b/;

const ASTERISK_THOUGHT_PATTERN = /^\*([^*]+)\*$/;
const UNDERSCORE_THOUGHT_PATTERN = /^_([^_]+)_$/;

const INTROSPECTIVE_PATTERN =
    /^(he|she|they|i)\s+(wondered|thought|realized|knew|felt|couldn't help thinking|couldn't stop thinking|asked (himself|herself|themselves)|considered|pondered|reflected|mused|recalled|remembered)\b/i;

const INTROSPECTIVE_QUESTION_PATTERN =
    /^(why|what if|how could|what had|where had|when had|could (he|she|they|it)|would (he|she|they|it)|was (he|she|they|it)|had (he|she|they|it))\b/i;

function toTitleCase(name: string): string {
    return name
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

// ─── Tension/Arousal Analyzer ──────────────────────────────

export class TensionTracker {
    private currentTension: number = 20;

    private tensionLexicon: Record<string, number> = {
        kill: 15, murder: 15, death: 15, danger: 15, bleed: 15, blood: 15, gun: 15, shoot: 15, shot: 15,
        weapon: 15, knife: 15, explode: 15, explosion: 15, panic: 15, scream: 15, shout: 15, attack: 15,
        die: 15, threat: 15, terrified: 15, horror: 15, monster: 15, sword: 15, fire: 10,
        shadow: 5, dark: 5, night: 5, cold: 5, freeze: 5, whisper: 5, search: 5, follow: 5,
        hide: 5, wait: 5, watch: 5, crawl: 5, creep: 5, silent: 5, silence: 5, wind: 5, rain: 5, storm: 5,
        tense: 5, tension: 5, noise: 5, sound: 5, shake: 5, tremble: 5, sudden: 10, suddenly: 10,
        smile: -10, laugh: -10, soft: -10, warm: -10, calm: -10, peace: -10, sleep: -10, rest: -10,
        safe: -10, light: -10, bright: -10, golden: -10, sunshine: -10, flower: -10, happy: -10,
        gentle: -10, relax: -10, relief: -10, sigh: -5
    };

    public processSentence(sentence: string): number {
        let sentenceDelta = 0;
        const words = sentence.toLowerCase().match(/\b\w+\b/g) || [];

        for (const word of words) {
            for (const [key, val] of Object.entries(this.tensionLexicon)) {
                if (word.startsWith(key)) {
                    sentenceDelta += val;
                    break;
                }
            }
        }

        if (sentence.includes('!')) {
            sentenceDelta += 15;
        }

        const uppercaseWords = sentence.match(/\b[A-Z]{2,}\b/g) || [];
        if (uppercaseWords.length > 0) {
            sentenceDelta += 10 * uppercaseWords.length;
        }

        const baseTarget = 20;
        let targetTension = baseTarget + sentenceDelta;
        targetTension = Math.max(0, Math.min(100, targetTension));

        const decay = 0.7;
        this.currentTension = this.currentTension * decay + targetTension * (1 - decay);
        return Math.round(this.currentTension);
    }

    public getTension(): number {
        return Math.round(this.currentTension);
    }

    public getEmotion(sentence: string, currentTension: number): EmotionCategory {
        const { dominantMood } = analyzeMood(sentence);
        if (dominantMood !== 'neutral') {
            return dominantMood;
        }

        if (currentTension >= 70) {
            return 'action';
        }
        if (currentTension >= 45) {
            return 'suspense';
        }
        return 'neutral';
    }

    public reset() {
        this.currentTension = 20;
    }
}

// ─── Conversational Speaker Attributor ─────────────────────

export class SpeakerAttributor {
    private recentSpeakers: string[] = [];
    private lastAssignedSpeaker: string | undefined;

    public resetScene() {
        this.recentSpeakers = [];
        this.lastAssignedSpeaker = undefined;
    }

    public registerSpeaker(name: string) {
        const cleanedName = name.trim().toUpperCase();
        if (!cleanedName) return;

        this.recentSpeakers = [
            cleanedName,
            ...this.recentSpeakers.filter(s => s !== cleanedName)
        ].slice(0, 2);
    }

    public detectSpeaker(para: string, knownCharacters: Set<string>): string | undefined {
        const beforeMatch = para.match(SPEAKER_BEFORE_PATTERN);
        if (beforeMatch) {
            const name = beforeMatch[1].toUpperCase();
            this.registerSpeaker(name);
            return name;
        }

        const afterMatch = para.match(SPEAKER_AFTER_PATTERN);
        if (afterMatch) {
            const name = afterMatch[1].toUpperCase();
            this.registerSpeaker(name);
            return name;
        }

        const actionMatch = para.match(CHARACTER_ACTION_VERBS);
        if (actionMatch) {
            const name = actionMatch[1].toUpperCase();
            this.registerSpeaker(name);
            return name;
        }

        for (const name of knownCharacters) {
            const titled = toTitleCase(name);
            if (para.startsWith(titled + ' ') || para.startsWith(titled + ',') || para.startsWith(titled + '.')) {
                this.registerSpeaker(name);
                return name;
            }
        }

        return undefined;
    }

    public attributeDialogue(explicitSpeaker: string | undefined): string | undefined {
        if (explicitSpeaker) {
            this.lastAssignedSpeaker = explicitSpeaker;
            return explicitSpeaker;
        }

        if (this.recentSpeakers.length === 2) {
            const nextSpeaker = this.lastAssignedSpeaker === this.recentSpeakers[0]
                ? this.recentSpeakers[1]
                : this.recentSpeakers[0];

            this.lastAssignedSpeaker = nextSpeaker;
            this.registerSpeaker(nextSpeaker);
            return nextSpeaker;
        } else if (this.recentSpeakers.length === 1) {
            this.lastAssignedSpeaker = this.recentSpeakers[0];
            return this.recentSpeakers[0];
        }

        return undefined;
    }

    public getDialogueIntensity(dialogue: string, para: string, tension: number): CinematicBlock['intensity'] {
        const lowerPara = para.toLowerCase();
        if (dialogue.includes('!') || /\b(shout|scream|yell|barked|snapped|shouted|screamed|yelled)\b/.test(lowerPara)) {
            return 'shout';
        }
        if (dialogue.includes('...') || dialogue.includes('\u2026') || /\b(whisper|murmur|mutter|whispered|murmured|muttered|softly)\b/.test(lowerPara)) {
            return 'whisper';
        }
        if (tension >= 65) {
            return 'emphasis';
        }
        return 'normal';
    }
}

// ─── Camera Angle Director ─────────────────────────────────

export class MockDirector {
    private lastDialogueSpeaker: string | undefined = undefined;
    private dialogueCameraToggle: boolean = false;

    public resetScene() {
        this.lastDialogueSpeaker = undefined;
        this.dialogueCameraToggle = false;
    }

    public getCameraDirection(
        type: CinematicBlockType,
        content: string,
        tension: number,
        speaker: string | undefined,
        isNewScene: boolean
    ): string {
        if (type === 'title_card' || type === 'transition' || type === 'chapter_header') {
            return 'WIDE SHOT';
        }

        if (type === 'inner_thought') {
            return tension >= 60 ? 'CLOSE ON' : 'PUSH IN';
        }

        if (type === 'dialogue') {
            this.dialogueCameraToggle = !this.dialogueCameraToggle;
            if (tension >= 75) {
                return 'HANDHELD CLOSE';
            }
            if (tension >= 50) {
                return 'CLOSE ON';
            }
            if (speaker && speaker !== this.lastDialogueSpeaker) {
                this.lastDialogueSpeaker = speaker;
                return this.dialogueCameraToggle ? 'OVER THE SHOULDER' : 'POV';
            }
            return 'MEDIUM SHOT';
        }

        if (type === 'action') {
            if (isNewScene) {
                return 'WIDE ESTABLISHING';
            }
            if (tension >= 80) {
                return 'HANDHELD CLOSE';
            }
            if (tension >= 60) {
                return 'CLOSE ON';
            }
            const wordCount = content.split(/\s+/).length;
            if (wordCount > 35) {
                return 'WIDE ESTABLISHING';
            }
            if (/\b(ran|running|rushed|fled|chased|jumped|leapt|dashed|sprinted)\b/i.test(content)) {
                return 'TRACKING SHOT';
            }
            return 'MEDIUM SHOT';
        }

        return 'MEDIUM SHOT';
    }

    public getTransitionType(
        isFlashback: boolean,
        isDream: boolean,
        tension: number,
        tensionDelta: number
    ): TransitionType {
        if (isFlashback || isDream) {
            return 'DISSOLVE TO';
        }
        if (tension >= 75 || tensionDelta >= 40) {
            return 'SMASH CUT';
        }
        return 'CUT TO';
    }
}

// ─── Ambience Tracker ──────────────────────────────────────

export class AmbienceEngine {
    private currentAmbience: string = 'ambient stillness';

    public resetScene() {
        this.currentAmbience = 'ambient stillness';
    }

    public updateAmbience(para: string, tension: number): string {
        const lower = para.toLowerCase();

        if (/\b(storm|thunder|lightning|tempest)\b/.test(lower)) {
            this.currentAmbience = 'thunderstorm';
            return this.currentAmbience;
        }
        if (/\b(rain|rainfall|drizzle|pour|shower|wet)\b/.test(lower)) {
            this.currentAmbience = 'distant rainfall';
            return this.currentAmbience;
        }
        if (/\b(wind|breeze|gale|gust|howling)\b/.test(lower)) {
            this.currentAmbience = 'howling wind';
            return this.currentAmbience;
        }
        if (/\b(snow|blizzard|ice|frost|frozen|chilly)\b/.test(lower)) {
            this.currentAmbience = 'icy wind';
            return this.currentAmbience;
        }

        if (/\b(forest|woods|trees|jungle|leaves|rustling)\b/.test(lower)) {
            this.currentAmbience = 'forest rustle';
            return this.currentAmbience;
        }
        if (/\b(city|street|traffic|cars|crowd|market|plaza)\b/.test(lower)) {
            this.currentAmbience = 'urban murmur';
            return this.currentAmbience;
        }
        if (/\b(cave|damp|dripping|echo|echoes|cavern)\b/.test(lower)) {
            this.currentAmbience = 'damp echoes';
            return this.currentAmbience;
        }
        if (/\b(fire|hearth|fireplace|flames|cozy|ember)\b/.test(lower)) {
            this.currentAmbience = 'crackling hearth';
            return this.currentAmbience;
        }
        if (/\b(ocean|sea|waves|beach|shore|surf)\b/.test(lower)) {
            this.currentAmbience = 'ocean waves';
            return this.currentAmbience;
        }
        if (/\b(tavern|inn|pub|glasses|chatter|laughter|crowded)\b/.test(lower)) {
            this.currentAmbience = 'tavern chatter';
            return this.currentAmbience;
        }

        if (this.currentAmbience === 'ambient stillness' || this.currentAmbience === 'tense silence' || this.currentAmbience === 'ominous quiet') {
            if (tension >= 70) {
                this.currentAmbience = 'tense silence';
            } else if (tension >= 45) {
                this.currentAmbience = 'ominous quiet';
            } else {
                this.currentAmbience = 'ambient stillness';
            }
        }

        return this.currentAmbience;
    }

    public getAmbience(): string {
        return this.currentAmbience;
    }
}

// ─── Pacing Heuristic ──────────────────────────────────────

function analyseParagraphPacing(para: string): {
    intensity: CinematicBlock['intensity'];
    timing?: CinematicBlock['timing'];
    emotion?: EmotionCategory;
} {
    const questionCount = (para.match(/\?/g) || []).length;
    if (questionCount >= 2) {
        return { intensity: 'normal', timing: 'normal', emotion: 'suspense' };
    }

    const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 2) {
        const shortSentences = sentences.filter(s => s.split(/\s+/).length < 5);
        if (shortSentences.length >= 2 && shortSentences.length / sentences.length >= 0.5) {
            return { intensity: 'emphasis', timing: 'rapid' };
        }
    }

    const wordCount = para.split(/\s+/).length;
    if (sentences.length === 1 && wordCount > 30) {
        return { intensity: 'normal', timing: 'slow' };
    }
    for (const sentence of sentences) {
        if (sentence.split(/\s+/).length > 30) {
            return { intensity: 'normal', timing: 'slow' };
        }
    }

    if (para.includes('!')) {
        return { intensity: 'emphasis' };
    }
    if (para.includes('...') || para.includes('\u2026')) {
        return { intensity: 'whisper' };
    }

    return { intensity: 'normal' };
}

// ─── Fallback Block Creation ───────────────────────────────

import type { ExtractedEntities } from './entityExtractor';

function createFallbackBlocks(text: string, entityRegistry: ExtractedEntities): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    const tensionTracker = new TensionTracker();
    const speakerAttributor = new SpeakerAttributor();
    const mockDirector = new MockDirector();
    const ambienceEngine = new AmbienceEngine();

    const scenes = detectSceneBreaks(paragraphs);
    const knownCharacters = new Set<string>();

    for (const char of entityRegistry.characters) {
        knownCharacters.add(char.name.toUpperCase());
        for (const alias of char.aliases) {
            knownCharacters.add(alias.toUpperCase());
        }
    }

    // Pre-scan for character names
    const characterActionVerbs = CHARACTER_ACTION_VERBS;
    for (const para of paragraphs) {
        const trimmed = para.trim();
        const actionMatch = trimmed.match(characterActionVerbs);
        if (actionMatch) {
            knownCharacters.add(actionMatch[1].toUpperCase());
        }
        const beforeMatch = trimmed.match(SPEAKER_BEFORE_PATTERN);
        if (beforeMatch) {
            knownCharacters.add(beforeMatch[1].toUpperCase());
        }
        const afterMatch = trimmed.match(SPEAKER_AFTER_PATTERN);
        if (afterMatch) {
            knownCharacters.add(afterMatch[1].toUpperCase());
        }
    }

    const dialoguePattern = new RegExp(DIALOGUE_RE_SOURCE, 'g');
    let previousSceneIndex = -1;
    let lastTension = 20;

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        let currentSceneIndex = 0;
        if (scenes.length > 1) {
            for (let s = 0; s < scenes.length; s++) {
                if (scenes[s].includes(para)) {
                    currentSceneIndex = s;
                    break;
                }
            }
        }

        const isNewScene = currentSceneIndex !== previousSceneIndex;
        if (isNewScene) {
            previousSceneIndex = currentSceneIndex;
            speakerAttributor.resetScene();
            mockDirector.resetScene();
            ambienceEngine.resetScene();

            if (currentSceneIndex > 0) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'beat',
                    content: '— ✦ —',
                    intensity: 'normal',
                    beat: { type: 'PAUSE' },
                });
            }

            const firstParaOfScene = scenes[currentSceneIndex]?.[0]?.trim();
            const firstIsHeading = firstParaOfScene && (
                CHAPTER_HEADER_PATTERN.test(firstParaOfScene) ||
                ACT_SCENE_SECTION_PATTERN.test(firstParaOfScene) ||
                isRomanNumeralTitle(firstParaOfScene) ||
                isAllCapsTitle(firstParaOfScene)
            );

            if (!firstIsHeading) {
                const sceneTitle = deriveSceneTitle(scenes[currentSceneIndex], currentSceneIndex + 1);
                blocks.push({
                    id: generateBlockId(),
                    type: 'title_card',
                    content: sceneTitle,
                    intensity: 'normal',
                });
            }
        }

        if (TRANSITION_PATTERNS.some(p => p.test(para))) {
            const isFlashback = /FLASHBACK/i.test(para);
            const isDream = /DREAM|MEMORY/i.test(para);
            const currentTension = tensionTracker.getTension();
            const transType = mockDirector.getTransitionType(isFlashback, isDream, currentTension, Math.abs(currentTension - lastTension));

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: para,
                intensity: 'normal',
                transition: { type: transType },
                cameraDirection: 'WIDE SHOT',
                ambience: ambienceEngine.getAmbience(),
                tensionScore: currentTension,
            });

            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
            continue;
        }

        if (CHAPTER_HEADER_PATTERN.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para.toUpperCase(),
                intensity: 'emphasis',
                cameraDirection: 'WIDE SHOT',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        if (ACT_SCENE_SECTION_PATTERN.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para.toUpperCase(),
                intensity: 'emphasis',
                cameraDirection: 'WIDE SHOT',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        if (isRomanNumeralTitle(para) || isAllCapsTitle(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para,
                intensity: 'emphasis',
                cameraDirection: 'WIDE SHOT',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        const asteriskMatch = para.match(ASTERISK_THOUGHT_PATTERN);
        const underscoreMatch = !asteriskMatch ? para.match(UNDERSCORE_THOUGHT_PATTERN) : null;
        if (asteriskMatch || underscoreMatch) {
            const content = asteriskMatch ? asteriskMatch[1] : underscoreMatch![1];

            let lastT = 20;
            const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);
            for (const s of sentences) {
                lastT = tensionTracker.processSentence(s);
            }
            const emotion = tensionTracker.getEmotion(content, lastT);
            const camera = mockDirector.getCameraDirection('inner_thought', content, lastT, undefined, isNewScene);
            const ambience = ambienceEngine.updateAmbience(content, lastT);

            blocks.push({
                id: generateBlockId(),
                type: 'inner_thought',
                content,
                intensity: 'whisper',
                emotion,
                tensionScore: lastT,
                cameraDirection: camera,
                ambience,
            });
            lastTension = lastT;
            continue;
        }

        if (INTROSPECTIVE_PATTERN.test(para) || INTROSPECTIVE_QUESTION_PATTERN.test(para)) {
            if (!new RegExp(DIALOGUE_RE_SOURCE).test(para)) {
                let lastT = 20;
                const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean);
                for (const s of sentences) {
                    lastT = tensionTracker.processSentence(s);
                }
                const emotion = tensionTracker.getEmotion(para, lastT);
                const camera = mockDirector.getCameraDirection('inner_thought', para, lastT, undefined, isNewScene);
                const ambience = ambienceEngine.updateAmbience(para, lastT);

                blocks.push({
                    id: generateBlockId(),
                    type: 'inner_thought',
                    content: para,
                    intensity: 'whisper',
                    emotion,
                    tensionScore: lastT,
                    cameraDirection: camera,
                    ambience,
                });
                lastTension = lastT;
                continue;
            }
        }

        dialoguePattern.lastIndex = 0;
        const dialogueMatches = [...para.matchAll(dialoguePattern)];

        if (dialogueMatches.length > 0) {
            const detectedSpeaker = speakerAttributor.detectSpeaker(para, knownCharacters);

            let lastT = 20;
            const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean);
            for (const s of sentences) {
                lastT = tensionTracker.processSentence(s);
            }
            lastTension = lastT;
            const emotion = tensionTracker.getEmotion(para, lastT);
            const ambience = ambienceEngine.updateAmbience(para, lastT);

            for (const match of dialogueMatches) {
                const dialogueContent = match[1];
                const speaker = speakerAttributor.attributeDialogue(detectedSpeaker);
                const intensity = speakerAttributor.getDialogueIntensity(dialogueContent, para, lastT);
                const camera = mockDirector.getCameraDirection('dialogue', dialogueContent, lastT, speaker, isNewScene);

                blocks.push({
                    id: generateBlockId(),
                    type: 'dialogue',
                    content: dialogueContent,
                    speaker,
                    intensity,
                    emotion,
                    tensionScore: lastT,
                    cameraDirection: camera,
                    ambience,
                });
            }

            dialoguePattern.lastIndex = 0;
            const narration = para.replace(dialoguePattern, '').trim();
            if (narration.length > 20) {
                const camera = mockDirector.getCameraDirection('action', narration, lastT, undefined, isNewScene);
                blocks.push({
                    id: generateBlockId(),
                    type: 'action',
                    content: narration,
                    intensity: lastT >= 70 ? 'emphasis' : 'normal',
                    emotion,
                    tensionScore: lastT,
                    cameraDirection: camera,
                    ambience,
                });
            }
        } else {
            let lastT = 20;
            const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean);
            for (const s of sentences) {
                lastT = tensionTracker.processSentence(s);
            }
            lastTension = lastT;

            const emotion = tensionTracker.getEmotion(para, lastT);
            const ambience = ambienceEngine.updateAmbience(para, lastT);
            const pacing = analyseParagraphPacing(para);
            const camera = mockDirector.getCameraDirection('action', para, lastT, undefined, isNewScene);

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity: pacing.intensity,
                emotion: pacing.emotion || emotion,
                tensionScore: lastT,
                cameraDirection: camera,
                ambience,
                ...(pacing.timing && { timing: pacing.timing }),
            });
        }

        const sfxMatch = para.match(SFX_COMBINED);
        if (sfxMatch) {
            const key = sfxMatch[1].toLowerCase().replace(/[sd]$/, '');
            const entry = SFX_LOOKUP[key] ?? SFX_LOOKUP[sfxMatch[1].toLowerCase()];
            if (entry) {
                const [sound, sfxIntensity] = entry;
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: sfxIntensity === 'explosive' ? 'explosive' : 'emphasis',
                    sfx: { sound, intensity: sfxIntensity },
                    tensionScore: lastTension,
                    cameraDirection: 'CLOSE ON',
                    ambience: ambienceEngine.getAmbience(),
                });
            }
        }

        if (/\.\.\.|…|—$|sudden|shock|realiz|gasp/i.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
                tensionScore: lastTension,
                cameraDirection: 'CLOSE ON',
                ambience: ambienceEngine.getAmbience(),
            });
        }
    }

    // Populate entities for each block
    const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    for (const block of blocks) {
        if (!block.content || ['sfx', 'beat', 'title_card', 'chapter_header'].includes(block.type)) continue;

        const blockContent = block.content;
        const blockCharacters = entityRegistry.characters
            .filter(c => {
                const names = [c.name, ...c.aliases];
                return names.some(n => new RegExp(`\\b${escapeRegex(n)}\\b`, 'i').test(blockContent));
            })
            .map(c => c.name);

        const blockLocations = entityRegistry.locations
            .filter(l => new RegExp(`\\b${escapeRegex(l.name)}\\b`, 'i').test(blockContent))
            .map(l => l.name);

        if (blockCharacters.length > 0 || blockLocations.length > 0) {
            block.entities = {
                characters: blockCharacters,
                locations: blockLocations,
            };
        }
    }

    return blocks;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Cinematify text using offline heuristics (no AI required).
 * Produces a full CinematificationResult with blocks, raw text, and metadata.
 *
 * @param text - Raw text to cinematify
 * @returns CinematificationResult with blocks and processing metadata
 */
export function cinematifyOffline(text: string): CinematificationResult {
    const startTime = performance.now();
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const entityRegistry = extractEntities(paragraphs);
    const blocks = createFallbackBlocks(text, entityRegistry);

    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;

    for (const block of blocks) {
        if (block.sfx) sfxCount++;
        if (block.transition) transitionCount++;
        if (block.beat) beatCount++;
    }

    return {
        blocks,
        rawText: blocks.map(b => b.content).join('\n\n'),
        entityRegistry,
        metadata: {
            originalWordCount: text.split(/\s+/).length,
            cinematifiedWordCount: blocks.reduce(
                (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                0,
            ),
            sfxCount,
            transitionCount,
            beatCount,
            processingTimeMs: Math.round(performance.now() - startTime),
        },
    };
}
