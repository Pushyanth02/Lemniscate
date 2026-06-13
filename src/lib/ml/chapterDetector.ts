/**
 * chapterDetector.ts — ML-Powered Chapter Detection Service
 *
 * Provides intelligent chapter boundary detection using ML models as an
 * enhancement/replacement for the rule-based chapterSegmentation.ts approach.
 * Designed to work with the existing @xenova/transformers infrastructure.
 */

import type { ChapterSegment } from '../../types/cinematifier';

// Configuration for the chapter detection model
const CHAPTER_DETECTION_MODEL = 'Xenova/bert-base-chapter-detection';
const MODEL_CONFIDENCE_THRESHOLD = 0.7;
const ENABLE_ML_DETECTION = true; // Toggle for feature flag

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipeline = any;

// Global model instance to avoid reloading
let chapterDetectionPipeline: AnyPipeline | null = null;

/**
 * Initialize the chapter detection model lazily
 */
async function initializeChapterDetectionModel(): Promise<AnyPipeline | null> {
  if (!ENABLE_ML_DETECTION) return null;

  if (chapterDetectionPipeline) return chapterDetectionPipeline;

  try {
    console.info('[ChapterDetector] Loading ML model for chapter detection...');
    // Dynamically import @xenova/transformers to avoid build errors when not installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { pipeline, PipelineType } = await import('@xenova/transformers' as any).catch(() => ({ pipeline: null, PipelineType: null }));
    if (!pipeline) return null;
    chapterDetectionPipeline = await pipeline(
      'text-classification' as typeof PipelineType,
      CHAPTER_DETECTION_MODEL,
      {
        // Quantization for smaller model size and faster inference
        quantized: true,
      }
    );
    console.info('[ChapterDetector] ML model loaded successfully');
    return chapterDetectionPipeline;
  } catch (error) {
    console.error(
      '[ChapterDetector] Failed to load ML chapter detection model:',
      error
    );
    // Return null to fall back to rule-based detection
    return null;
  }
}

/**
 * Detect chapter boundaries using ML model
 * @param text Input text to analyze for chapter boundaries
 * @returns Array of potential chapter boundary positions with confidence scores
 */
export async function detectChapterBoundariesML(
  text: string
): Promise<
  Array<{ position: number; confidence: number; suggestedTitle?: string }>
> {
  if (!ENABLE_ML_DETECTION) return [];

  try {
    const model = await initializeChapterDetectionModel();
    if (!model) {
      console.warn(
        '[ChapterDetector] ML model not available, falling back to rule-based'
      );
      return [];
    }

    // Split text into chunks for processing (preserving context)
    const chunks = splitTextIntoChunks(text, 500, 50); // 500 chars with 50 char overlap
    const boundaries: Array<{
      position: number;
      confidence: number;
      suggestedTitle?: string;
    }> = [];

    let runningPosition = 0;

    for (const chunk of chunks) {
      try {
        // Use the model to classify if this chunk contains a chapter boundary
        const result = await model(chunk);

        // Process results - assuming model returns boundary predictions
        if (Array.isArray(result)) {
          for (const prediction of result) {
            if (
              prediction.label.includes('CHAPTER') ||
              prediction.label.includes('BOUNDARY') ||
              prediction.label.includes('TITLE')
            ) {
              if (prediction.score >= MODEL_CONFIDENCE_THRESHOLD) {
                // Approximate position in original text
                const position =
                  runningPosition +
                  Math.round((prediction.start ?? 0) * (chunk.length / 100));

                boundaries.push({
                  position: Math.max(0, position),
                  confidence: prediction.score,
                  suggestedTitle:
                    prediction.label.includes('TITLE')
                      ? extractTitleFromContext(chunk, prediction)
                      : undefined,
                });
              }
            }
          }
        }
      } catch (chunkError) {
        console.warn(
          '[ChapterDetector] Error processing chunk:',
          chunkError
        );
        // Continue with other chunks
      }

      runningPosition += chunk.length - 50; // Account for overlap
    }

    // Post-process boundaries to remove duplicates and sort
    return postProcessBoundaries(boundaries, text.length);
  } catch (error) {
    console.error('[ChapterDetector] ML detection failed:', error);
    return []; // Fall back to rule-based
  }
}

/**
 * Split text into overlapping chunks for processing
 */
function splitTextIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }

  return chunks;
}

/**
 * Extract potential chapter title from context around a boundary
 */
function extractTitleFromContext(
  text: string,
  prediction: any
): string | undefined {
  // Simple heuristic: look for title-like text near the prediction
  const contextStart = Math.max(0, (prediction.start ?? 0) - 100);
  const contextEnd = Math.min(
    text.length,
    (prediction.end ?? 0) + 100
  );
  const context = text.slice(contextStart, contextEnd);

  // Look for title patterns in the context
  const titlePatterns = [
    /^Chapter\s+\d+[:.\s]+(.+)$/im,
    /^Part\s+[IVXLCDM\d]+[:.\s]+(.+)$/im,
    /^Section\s+\d+[:.\s]+(.+)$/im,
    /^[A-Z][A-Z\s\-\':]{10,}$/m, // ALL CAPS potential title
  ];

  for (const pattern of titlePatterns) {
    const match = context.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0]?.trim();
    }
  }

  return undefined;
}

/**
 * Post-process detected boundaries to remove duplicates and invalid positions
 */
function postProcessBoundaries(
  boundaries: Array<{ position: number; confidence: number; suggestedTitle?: string }>,
  textLength: number
): Array<{
  position: number;
  confidence: number;
  suggestedTitle?: string;
}> {
  if (boundaries.length === 0) return [];

  // Sort by position
  const sorted = [...boundaries].sort((a, b) => a.position - b.position);

  // Filter out invalid positions and merge close detections
  const filtered: typeof sorted = [];
  let lastPosition = -100; // Initialize to allow first boundary at position 0

  for (const boundary of sorted) {
    // Skip if position is invalid
    if (
      boundary.position < 0 ||
      boundary.position > textLength ||
      boundary.confidence < MODEL_CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    // Merge boundaries that are too close (within 50 characters)
    if (boundary.position - lastPosition < 50) {
      // Keep the one with higher confidence
      if (
        filtered.length > 0 &&
        boundary.confidence > filtered[filtered.length - 1].confidence
      ) {
        filtered[filtered.length - 1] = boundary;
      }
    } else {
      filtered.push(boundary);
    }

    lastPosition = boundary.position;
  }

  // Ensure we don't have boundaries at the very end unless significant
  return filtered.filter(
    (b) => b.position < textLength - 20 || b.confidence > 0.9
  );
}

/**
 * Convert ML-detected boundaries to chapter segments
 * @param text Full text to segment
 * @param boundaries ML-detected boundary positions
 * @returns Array of chapter segments
 */
export async function segmentChaptersWithML(
  text: string
): Promise<ChapterSegment[]> {
  if (!ENABLE_ML_DETECTION) {
    // Fallback to rule-based - import dynamically to avoid circular deps
    const { segmentChapters } = await import('../engine/cinematifier/chapterSegmentation');
    return segmentChapters(text);
  }

  try {
    const boundaries = await detectChapterBoundariesML(text);

    if (boundaries.length === 0) {
      // No ML detections found, fall back to rule-based
      console.info(
        '[ChapterDetector] No ML boundaries detected, using rule-based fallback'
      );
      const { segmentChapters } = await import('../engine/cinematifier/chapterSegmentation');
      return segmentChapters(text);
    }

    // Convert boundaries to segments
    const segments: ChapterSegment[] = [];
    let startIndex = 0;

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const endIndex =
        i < boundaries.length - 1
          ? boundaries[i + 1].position
          : text.length;

      // Extract content for this segment
      const content = text.slice(startIndex, endIndex).trim();

      // Only create segment if it has meaningful content
      if (content.length > 50 || segments.length === 0) {
        // Determine chapter title
        let title = `Chapter ${i + 1}`; // Default fallback

        if (boundary.suggestedTitle) {
          title = boundary.suggestedTitle;
        } else {
          // Try to extract title from the beginning of the content
          const titleMatch = content
            .split('\n')[0]
            .match(/^(?:Chapter\s+\d+[:.\s]*)?(.+)$/);
          if (titleMatch && titleMatch[1].trim().length > 0) {
            title = titleMatch[1].trim();
          }
        }

        segments.push({
          title,
          content,
          startIndex,
          endIndex: endIndex - 1, // Convert to inclusive end index
        });
      }

      startIndex = boundary.position;
    }

    // Handle final segment after last boundary
    if (startIndex < text.length) {
      const content = text.slice(startIndex).trim();
      if (content.length > 50 || segments.length === 0) {
        const title =
          segments.length === 0
            ? 'Full Text'
            : `Chapter ${segments.length + 1}`;

        segments.push({
          title,
          content,
          startIndex,
          endIndex: text.length - 1,
        });
      }
    }

    return segments;
  } catch (error) {
    console.error('[ChapterDetector] ML segmentation failed, falling back:', error);
    // Fallback to rule-based
    const { segmentChapters } = await import('../engine/cinematifier/chapterSegmentation');
    return segmentChapters(text);
  }
}

/**
 * Hybrid approach: Use ML to enhance rule-based detection
 * @param text Full text to segment
 * @returns Array of chapter segments
 */
export async function segmentChaptersHybrid(
  text: string
): Promise<ChapterSegment[]> {
  // Get rule-based results first
  const { segmentChapters } = await import('../engine/cinematifier/chapterSegmentation');
  const ruleBasedSegments = segmentChapters(text);

  // If ML is disabled or not available, return rule-based
  if (!ENABLE_ML_DETECTION) {
    return ruleBasedSegments;
  }

  try {
    // Get ML-enhanced boundaries
    const mlBoundaries = await detectChapterBoundariesML(text);

    // If ML didn't find anything useful, return rule-based
    if (mlBoundaries.length === 0) {
      return ruleBasedSegments;
    }

    // Enhance rule-based segments with ML insights
    // For now, we'll return ML segments if confidence is high, otherwise rule-based
    const highConfidenceBoundaries = mlBoundaries.filter(
      (b) => b.confidence >= 0.85
    );

    if (highConfidenceBoundaries.length > 0) {
      console.info(
        `[ChapterDetector] Using ML-enhanced segmentation (${highConfidenceBoundaries.length} high-confidence boundaries)`
      );
      return await segmentChaptersWithML(text);
    } else {
      console.info(
        '[ChapterDetector] ML boundaries low confidence, using rule-based'
      );
      return ruleBasedSegments;
    }
  } catch (error) {
    console.error(
      '[ChapterDetector] Hybrid approach failed, falling back to rule-based:',
      error
    );
    return ruleBasedSegments;
  }
}

// Export a configurable segmentation function
export const segmentChapters = ENABLE_ML_DETECTION
  ? segmentChaptersHybrid
  : async (text: string) => {
      const { segmentChapters } = await import('../engine/cinematifier/chapterSegmentation');
      return segmentChapters(text);
    };