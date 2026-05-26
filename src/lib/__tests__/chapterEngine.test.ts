import { describe, it, expect } from 'vitest';
import {
    createChapterPipeline,
    createPreprocessedChapterPipeline,
    runChapterEngine,
} from '../cinematifier';

describe('chapterEngine', () => {
    it('builds offline pipeline with strict stage ordering', () => {
        const names = createChapterPipeline().getStageNames();
        expect(names).toEqual([
            'Text Cleaning',
            'Paragraph Reconstruction',
            'Scene Segmentation',
            'Narrative Analysis',
            'Offline Cinematification',
            'Readability Analysis',
            'Text Statistics',
            'Sentiment Enrichment',
            'Pacing Analysis',
            'Renderer',
        ]);
    });

    it('builds preprocessed pipeline without duplicate cleaning stages', () => {
        const names = createPreprocessedChapterPipeline().getStageNames();
        expect(names).toEqual([
            'Scene Segmentation',
            'Narrative Analysis',
            'Offline Cinematification',
            'Readability Analysis',
            'Text Statistics',
            'Sentiment Enrichment',
            'Pacing Analysis',
            'Renderer',
        ]);
    });

    it('runs offline chapter engine and returns cinematic output with scene metadata', async () => {
        const text =
            'At dawn the station was silent. Wind scraped the signs.\n\n"Move now," Mara whispered.\n\nA siren broke the stillness.';

        const result = await runChapterEngine(text);

        expect(result.blocks.length).toBeGreaterThan(0);
        expect(result.scenes && result.scenes.length > 0).toBe(true);
        expect(result.renderPlan).toBeDefined();
        expect((result.renderPlan?.cues.length ?? 0) > 0).toBe(true);
        expect(result.stageTrace).toBeDefined();
        expect(result.stageTrace?.at(-1)?.stageName).toBe('Renderer');
        expect(result.metadata.originalWordCount).toBeGreaterThan(0);
    });
});

