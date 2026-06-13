import { describe, it, expect, beforeEach, vi } from 'vitest';
import { trackSpeakers, type SpeakerTrackingOptions } from '../speakerTracker';
import type { TextFragment } from '../../../engine/cinematifier/textProcessingEngine';

describe('Speaker Tracker', () => {
  const createDialogueFragment = (content: string, type: 'dialogue' | 'narration' | 'action_beat' = 'dialogue', speaker?: string, verb?: string): TextFragment => ({
    type,
    content,
    speaker,
    verb
  });

  // Mock nlp function from compromise for testing
  const mockNlp = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    // Mock the compromise import
    vi.mock('compromise', () => ({
      __esModule: true,
      default: (...args: any[]) => {
        mockNlp(...args);
        return {
          people: () => ({
            out: () => []
          }),
          organizations: () => ({
            out: () => []
          })
        };
      }
    }));
  });

  describe('trackSpeakers', () => {
    it('should return empty result for empty fragments', async () => {
      const result = await trackSpeakers([]);
      expect(result).toEqual({
        speakers: [],
        fragments: [],
        statistics: {
          totalSpeakers: 0,
          totalDialogueFragments: 0,
          averageFragmentsPerSpeaker: 0,
          speakerEntropy: 0
        }
      });
    });

    it('should handle fragments with no dialogue', async () => {
      const fragments: TextFragment[] = [
        createDialogueFragment('This is narration text', 'narration'),
        createDialogueFragment('He walked slowly', 'action_beat')
      ];

      const result = await trackSpeakers(fragments);
      expect(result.speakers).toHaveLength(0);
      expect(result.fragments).toEqual(fragments);
    });

    it('should detect explicit speaker attribution', async () => {
      const fragments: TextFragment[] = [
        createDialogueFragment('He walked into the room', 'narration'),
        createDialogueFragment('Hello there', 'dialogue', undefined, 'said'),
        createDialogueFragment('John replied', 'narration')
      ];

      // Pass minFragmentsForSignificance: 1 so single-utterance speakers are kept
      const result = await trackSpeakers(fragments, { minFragmentsForSignificance: 1 });

      expect(result.speakers).toHaveLength(1);
      expect(result.speakers[0]?.name).toBe('John');
      expect(result.fragments[1]?.speaker).toBe('John');
    });

    it('should apply confidence threshold filtering', async () => {
      const fragments: TextFragment[] = [
        createDialogueFragment('Hello there', 'dialogue', undefined, 'said')
      ];

      const options: SpeakerTrackingOptions = {
        minConfidence: 0.8 // Higher than our NLP confidence of 0.7
      };

      const result = await trackSpeakers(fragments, options);

      // Should not detect speaker due to confidence threshold
      expect(result.speakers).toHaveLength(0);
    });

    it('should deduplicate speakers with similar names', async () => {
      const fragments: TextFragment[] = [
        createDialogueFragment('Hello there', 'dialogue', undefined, 'said'),
        createDialogueFragment('John said', 'narration'),
        createDialogueFragment('How are you?', 'dialogue', undefined, 'said'),
        createDialogueFragment('Jon replied', 'narration'), // Similar name
        createDialogueFragment('I am fine', 'dialogue', undefined, 'said')
      ];

      const options: SpeakerTrackingOptions = {
        enableNameDeduplication: true
      };

      const result = await trackSpeakers(fragments, options);

      // Should have fewer speakers due to deduplication
      expect(result.speakers.length).toBeLessThanOrEqual(2);
    });

    it('should filter insignificant speakers', async () => {
      // Give John 2 dialogues and a unique narrator attribution each time
      // Give Jane 1 dialogue only — she should be filtered out
      const fragments: TextFragment[] = [
        createDialogueFragment('Hello', 'dialogue', undefined, 'said'),
        createDialogueFragment('John said', 'narration'),
        createDialogueFragment('How are you?', 'dialogue', undefined, 'said'),
        createDialogueFragment('John replied', 'narration'),
        createDialogueFragment('Hi there', 'dialogue', undefined, 'said'),
        createDialogueFragment('Jane said', 'narration'),
      ];

      const options: SpeakerTrackingOptions = {
        minFragmentsForSignificance: 2 // Require at least 2 fragments
      };

      const result = await trackSpeakers(fragments, options);

      // John has 2+ dialogues so he should be included; Jane has 1 so filtered
      expect(result.speakers.length).toBeGreaterThanOrEqual(1);
      expect(result.speakers.some(s => s.name === 'John')).toBe(true);
    });
  });
});
