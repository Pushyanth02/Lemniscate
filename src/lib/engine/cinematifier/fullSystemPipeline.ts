import type { CinematicBlock, CinematificationResult, SceneMetadata } from '../../../types/cinematic';
import type { Scene } from './sceneDetection';
import { detectOriginalModeScenes, deriveSceneTitle } from './sceneDetection';
import { rebuildParagraphs, structureDialogue } from './textProcessing';
import { runChapterEngine } from './chapterEngine';
import { buildAllSceneMetadata } from './sceneMetadata';
import { extractEntities } from './entityExtractor';

export interface FullSystemPipelineOptions {
    onProgress?: (percent: number, message: string) => void;
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
    signal?: AbortSignal;
    inputIsRebuilt?: boolean;
}

export interface OriginalModeResult {
    text: string;
    scenes: Scene[];
}

export interface FullSystemPipelineResult {
    rebuiltText: string;
    dialogueText: string;
    originalMode: OriginalModeResult;
    cinematizedMode: CinematificationResult;
    cacheHit: boolean;
    sceneMetadata: SceneMetadata[];
}

function canonicalWithoutWhitespace(text: string): string {
    return text.replace(/\s+/g, '').trim();
}

function isCanonicalMatch(a: string, b: string): boolean {
    return canonicalWithoutWhitespace(a) === canonicalWithoutWhitespace(b);
}

function normalizeOriginalMode(text: string): string {
    return text
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ ]+/g, '\n')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeBlockContent(text: string): string {
    return text
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ ]+/g, '\n')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function sanitizeCinematicBlocks(blocks: CinematicBlock[]): CinematicBlock[] {
    const sanitized: CinematicBlock[] = [];
    let previousKey = '';

    for (const block of blocks) {
        const content = normalizeBlockContent(block.content || '');
        if (!content) continue;

        const normalizedBlock: CinematicBlock = {
            ...block,
            content,
        };

        const key = `${normalizedBlock.type}|${normalizedBlock.speaker ?? ''}|${canonicalWithoutWhitespace(content)}`;
        if (key === previousKey) {
            continue;
        }

        previousKey = key;
        sanitized.push(normalizedBlock);
    }

    return sanitized;
}

function normalizeSceneSet(scenes: Scene[]): Scene[] {
    const normalized: Scene[] = [];
    let previousCanonical = '';

    for (const scene of scenes) {
        const sceneText = normalizeOriginalMode(scene.text || '');
        if (!sceneText) continue;

        const sceneCanonical = canonicalWithoutWhitespace(sceneText);
        if (!sceneCanonical || sceneCanonical === previousCanonical) {
            continue;
        }

        normalized.push({
            id: `scene-${normalized.length + 1}`,
            text: sceneText,
        });
        previousCanonical = sceneCanonical;
    }

    return normalized;
}

function ensureSceneConsistency(originalModeText: string, scenes: Scene[]): Scene[] {
    const normalizedOriginal = normalizeOriginalMode(originalModeText);
    if (!normalizedOriginal) return [];

    const tryValidate = (candidateScenes: Scene[]): Scene[] => {
        const normalizedScenes = normalizeSceneSet(candidateScenes);
        const stitched = normalizedScenes.map(scene => scene.text).join('\n\n');
        return isCanonicalMatch(stitched, normalizedOriginal) ? normalizedScenes : [];
    };

    const providedValid = tryValidate(scenes);
    if (providedValid.length > 0) return providedValid;

    const detectedValid = tryValidate(detectOriginalModeScenes(normalizedOriginal));
    if (detectedValid.length > 0) return detectedValid;

    return [
        {
            id: 'scene-1',
            text: normalizedOriginal,
        },
    ];
}

/**
 * Run the complete chapter data flow:
 * Rebuild -> Dialogue -> Scenes -> Original Mode -> Cinematized Mode -> Render.
 */
export async function runFullSystemPipeline(
    chapterText: string,
    options: FullSystemPipelineOptions = {},
): Promise<FullSystemPipelineResult> {
    const normalizedInput = chapterText.replace(/\r\n|\r/g, '\n').trim();
    if (!normalizedInput) {
        throw new Error('Cannot process an empty chapter text.');
    }

    options.onProgress?.(0.04, 'Rebuilding chapter text...');
    const rebuiltText = options.inputIsRebuilt
        ? normalizeOriginalMode(normalizedInput)
        : normalizeOriginalMode(rebuildParagraphs(normalizedInput));

    options.onProgress?.(0.12, 'Structuring dialogue...');
    const dialogueCandidate = normalizeOriginalMode(
        structureDialogue(rebuiltText, {
            attachSpeaker: false,
            preserveExactContent: true,
        }),
    );

    // Auto-fix any dialogue stage drift that introduces text loss/duplication.
    const dialogueText = isCanonicalMatch(dialogueCandidate, rebuiltText)
        ? dialogueCandidate
        : rebuiltText;

    options.onProgress?.(0.2, 'Detecting original mode scenes...');
    const originalModeText = dialogueText;
    const originalScenes = ensureSceneConsistency(
        originalModeText,
        detectOriginalModeScenes(originalModeText),
    );

    const engineProgressStart = 0.3;
    const engineProgressSpan = 0.7;

    const cinematizedResult = await runChapterEngine(originalModeText, {
        preprocessedInput: true,
        onProgress: (percent, message) => {
            options.onProgress?.(engineProgressStart + percent * engineProgressSpan, message);
        },
        onChunk: options.onChunk,
        signal: options.signal,
    });

    const cinematizedMode: CinematificationResult = {
        ...cinematizedResult,
        rawText: normalizeOriginalMode(cinematizedResult.rawText ?? ''),
        blocks: sanitizeCinematicBlocks(cinematizedResult.blocks),
    };

    // Build per-scene metadata using detected scenes and extracted entities
    options.onProgress?.(0.95, 'Generating scene metadata...');
    const paragraphs = originalModeText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean);
    const entities = extractEntities(paragraphs);
    const characterNames = entities.characters.map(c => c.name);
    const locationNames = entities.locations.map(l => l.name);
    const sceneTitles = originalScenes.map((_, i) => deriveSceneTitle(
        originalScenes[i].text.split(/\n\n+/).map(p => p.trim()).filter(Boolean),
        i + 1,
    ));
    const sceneMetadata = buildAllSceneMetadata(
        originalScenes,
        sceneTitles,
        characterNames,
        locationNames,
    );

    const result: FullSystemPipelineResult = {
        rebuiltText,
        dialogueText,
        originalMode: {
            text: originalModeText,
            scenes: originalScenes,
        },
        cinematizedMode,
        cacheHit: false,
        sceneMetadata,
    };

    return result;
}

export function clearFullSystemPipelineCache(): void {
    // Deprecated cache shim
}

export function getFullSystemPipelineCacheSize(): number {
    return 0;
}
