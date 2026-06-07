/**
 * speakerTracker.ts — Offline NLP Speaker Tracking Service
 *
 * Detects and tracks speakers in dialogue using linguistic patterns,
 * contextual analysis, and heuristics for offline processing.
 * Part of the Milestone 4: Engine Modernization & Feature Decoupling.
 */

import type { TextFragment, ProcessedParagraph } from '../../engine/cinematifier/textProcessingEngine';

/**
 * Speaker information with tracking metadata
 */
export interface SpeakerInfo {
    /** Unique identifier for the speaker */
    id: string;
    /** Display name of the speaker */
    name: string;
    /** First occurrence index in the text */
    firstSeen: number;
    /** Last occurrence index in the text */
    lastSeen: number;
    /** Number of dialogue fragments attributed to this speaker */
    dialogueCount: number;
    /** Typical speech patterns/verbs used by this speaker */
    speechPatterns: string[];
    /** Confidence score in speaker identification (0-1) */
    confidence: number;
}

/**
 * Result of speaker tracking analysis
 */
export interface SpeakerTrackingResult {
    /** All identified speakers */
    speakers: SpeakerInfo[];
    /** Updated fragments with speaker information */
    fragments: TextFragment[];
    /** Statistics about speaker distribution */
    statistics: {
        totalSpeakers: number;
        totalDialogueFragments: number;
        averageFragmentsPerSpeaker: number;
        dominantSpeaker?: string; // Speaker with most dialogue
        speakerEntropy: number; // Diversity of speaker distribution (0-1)
    };
}

/**
 * Configuration options for speaker tracking
 */
export interface SpeakerTrackingOptions {
    /** Minimum confidence threshold for speaker assignment */
    minConfidence?: number;
    /** Maximum distance to search for speaker attribution (characters) */
    attributionWindow?: number;
    /** Enable heuristic-based speaker inference */
    enableHeuristics?: boolean;
    /** Merge speakers with similar names */
    enableNameDeduplication?: boolean;
    /** Minimum fragments to consider a speaker significant */
    minFragmentsForSignificance?: number;
}

const DEFAULT_OPTIONS: SpeakerTrackingOptions = {
    minConfidence: 0.6,
    attributionWindow: 200,
    enableHeuristics: true,
    enableNameDeduplication: true,
    minFragmentsForSignificance: 2,
};

/**
 * Extended regex patterns for speaker detection
 */
const SPEAKER_NAME_PATTERNS = [
    // Standard capitalized names: John Smith
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g,
    // Names with titles: Mr. John Smith, Dr. Jane Doe
    /((?:Mrs?|Ms|Dr|Prof|Rev|Hon|Sir|Lady)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g,
    // Nicknames or quoted names: "Johnny" Smith
    /(["']([A-Z][a-z]+)["'](?:\s+[A-Z][a-z]+){0,2})/g,
];

const SPEECH_VERBS = new Set([
    'said', 'asked', 'replied', 'whispered', 'shouted', 'muttered', 'cried',
    'yelled', 'called', 'answered', 'snapped', 'growled', 'sighed', 'added',
    'remarked', 'told', 'exclaimed', 'stammered', 'mumbled', 'screamed',
    'pleaded', 'demanded', 'insisted', 'suggested', 'declared', 'announced',
    'repeated', 'continued', 'interrupted', 'protested', 'agreed', 'warned',
    'promised', 'threatened', 'begged', 'urged', 'laughed', 'sobbed',
    'groaned', 'hissed', 'barked', 'breathed', 'rasped', 'bellowed',
    'mused', 'wondered', 'observed', 'noted', 'commented', 'remarked',
]);

const PRONOUN_SPEAKERS = new Set(['he', 'she', 'they', 'i', 'we']);

/**
 * Track speakers in processed text fragments
 */
export async function trackSpeakers(
    fragments: TextFragment[],
    options: SpeakerTrackingOptions = {}
): Promise<SpeakerTrackingResult> {
    const config = { ...DEFAULT_OPTIONS, ...options };

    // Initialize speaker map
    const speakerMap = new Map<string, SpeakerInfo>();
    const updatedFragments: TextFragment[] = [];

    // Process each fragment to detect and attribute speakers
    for (let i = 0; i < fragments.length; i++) {
        const fragment = { ...fragments[i] }; // Clone to avoid mutation

        // Only process dialogue fragments for speaker attribution
        if (fragment.type === 'dialogue' && fragment.content.trim().length > 0) {
            const speakerInfo = await detectSpeakerInContext(
                fragment,
                fragments,
                i,
                config
            );

            if (speakerInfo && speakerInfo.confidence >= config.minConfidence!) {
                // Update or create speaker entry
                let speaker = speakerMap.get(speakerInfo.id);
                if (!speaker) {
                    speaker = {
                        ...speakerInfo,
                        firstSeen: i,
                        lastSeen: i,
                        dialogueCount: 1,
                        speechPatterns: [],
                    };
                    speakerMap.set(speakerInfo.id, speaker);
                } else {
                    // Update existing speaker
                    speaker.lastSeen = i;
                    speaker.dialogueCount += 1;
                    // Add new speech patterns if not already present
                    if (fragment.verb && !speaker.speechPatterns.includes(fragment.verb)) {
                        speaker.speechPatterns.push(fragment.verb);
                    }
                }

                // Attach speaker to fragment
                fragment.speaker = speaker.name;
                if (!fragment.verb && speakerInfo.speechPatterns.length > 0) {
                    // Infer verb from speaker's typical patterns if not present
                    fragment.verb = speaker.speechPatterns[0];
                }
            }
        }

        updatedFragments.push(fragment);
    }

    // Post-process speakers: apply deduplication, filter insignificant speakers
    let finalSpeakers = Array.from(speakerMap.values());

    if (config.enableNameDeduplication) {
        finalSpeakers = deduplicateSpeakers(finalSpeakers);
    }

    if (config.minFragmentsForSignificance) {
        finalSpeakers = finalSpeakers.filter(
            s => s.dialogueCount >= config.minFragmentsForSignificance!
        );
    }

    // Calculate statistics
    const statistics = calculateSpeakerStatistics(finalSpeakers, updatedFragments);

    return {
        speakers: finalSpeakers,
        fragments: updatedFragments,
        statistics,
    };
}

/**
 * Detect speaker in the context of a dialogue fragment
 */
async function detectSpeakerInContext(
    fragment: TextFragment,
    allFragments: TextFragment[],
    fragmentIndex: number,
    options: SpeakerTrackingOptions
): Promise<SpeakerInfo | null> {
    // Look for explicit speaker attribution in surrounding fragments
    const attributedSpeaker = findExplicitSpeakerAttribution(
        fragment,
        allFragments,
        fragmentIndex,
        options.attributionWindow!
    );

    if (attributedSpeaker) {
        return attributedSpeaker;
    }

    // If heuristics are enabled, try to infer speaker from context
    if (options.enableHeuristics) {
        const inferredSpeaker = inferSpeakerFromHeuristics(
            fragment,
            allFragments,
            fragmentIndex,
            options
        );
        if (inferredSpeaker) {
            return inferredSpeaker;
        }
    }

    // No speaker detected
    return null;
}

/**
 * Find explicit speaker attribution in surrounding text
 */
function findExplicitSpeakerAttribution(
    fragment: TextFragment,
    allFragments: TextFragment[],
    fragmentIndex: number,
    windowSize: number
): SpeakerInfo | null {
    // Look backwards and forwards for attribution patterns
    const startIndex = Math.max(0, fragmentIndex - Math.floor(windowSize / 10));
    const endIndex = Math.min(
        allFragments.length - 1,
        fragmentIndex + Math.floor(windowSize / 10)
    );

    // Check surrounding fragments for speaker names
    for (let i = startIndex; i <= endIndex; i++) {
        if (i === fragmentIndex) continue; // Skip the dialogue fragment itself

        const surroundingFragment = allFragments[i];
        if (surroundingFragment.type !== 'narration' && surroundingFragment.type !== 'action_beat') {
            continue;
        }

        // Look for speaker patterns in the surrounding text
        const speakerMatch = extractSpeakerFromText(
            surroundingFragment.content,
            surroundingFragment.type === 'action_beat' ? surroundingFragment : null
        );

        if (speakerMatch) {
            // Check if this is likely attribution by looking for speech verbs nearby
            const hasNearbyVerb = checkForSpeechVerbNearby(
                surroundingFragment.content,
                speakerMatch.name
            );

            if (hasNearbyVerb) {
                return {
                    id: generateSpeakerId(speakerMatch.name),
                    name: speakerMatch.name,
                    firstSeen: i,
                    lastSeen: i,
                    dialogueCount: 0, // Will be updated when attached to dialogue
                    speechPatterns: [fragment.verb || 'said'],
                    confidence: 0.8, // High confidence for explicit attribution
                };
            }
        }
    }

    return null;
}

/**
 * Extract speaker name from text using patterns
 */
function extractSpeakerFromText(
    text: string,
    actionBeat: TextFragment | null
): { name: string; confidence: number } | null {
    // Clean the text for better pattern matching
    const cleanedText = text
        .replace(/^[,;:\-\s]+/, '')
        .replace(/[,;:\-\s]+$/, '')
        .trim();

    // Try each speaker pattern
    for (const pattern of SPEAKER_NAME_PATTERNS) {
        const matches = cleanedText.matchAll(pattern);
        for (const match of matches) {
            const potentialName = match[1] || match[2] || match[0];
            if (potentialName && potentialName.length >= 2) {
                // Additional validation: check if it looks like a proper name
                if (isLikelySpeakerName(potentialName)) {
                    return {
                        name: potentialName.trim(),
                        confidence: 0.7,
                    };
                }
            }
        }
    }

    // Special handling for action beats that might contain speaker info
    if (actionBeat && actionBeat.type === 'action_beat') {
        // Patterns like "John nodded" or "She smiled"
        const actionMatch = actionBeat.content.match(/^([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+/);
        if (actionMatch) {
            const potentialName = actionMatch[1];
            if (isLikelySpeakerName(potentialName) && PRONOUN_SPEAKERS.has(potentialName.toLowerCase())) {
                // Handle pronouns
                return {
                    name: potentialName.toLowerCase() === 'i' ? 'I' : potentialName,
                    confidence: 0.6,
                };
            } else if (isLikelySpeakerName(potentialName)) {
                return {
                    name: potentialName,
                    confidence: 0.65,
                };
            }
        }
    }

    return null;
}

/**
 * Check if a string looks like a speaker name
 */
function isLikelySpeakerName(text: string): boolean {
    if (!text || text.length < 2) return false;

    // Basic checks
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 3) return false; // Unlikely to be a name with >3 words

    // Check each word
    for (const word of words) {
        if (!/^[A-Z][a-z'-]+$/.test(word)) {
            // Allow for hyphenated names and apostrophes
            if (!/^[A-Z][a-z]+(-[A-Z][a-z]+)?’?[a-z]*$/.test(word)) {
                return false;
            }
        }
    }

    // Filter out common false positives
    const falsePositives = new Set([
        'The', 'And', 'But', 'For', 'Nor', 'Yet', 'So',
        'Chapter', 'Part', 'Section', 'Page',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ]);

    for (const word of words) {
        if (falsePositives.has(word)) {
            return false;
        }
    }

    return true;
}

/**
 * Check if there's a speech verb near a potential speaker name in text
 */
function checkForSpeechVerbNearby(text: string, speakerName: string): boolean {
    const lowerText = text.toLowerCase();
    const lowerName = speakerName.toLowerCase();

    // Find position of the speaker name
    const namePos = lowerText.indexOf(lowerName);
    if (namePos === -1) return false;

    // Look for speech verbs within 50 characters before and after
    const startSearch = Math.max(0, namePos - 50);
    const endSearch = Math.min(lowerText.length, namePos + speakerName.length + 50);
    const searchText = lowerText.slice(startSearch, endSearch);

    // Check for any speech verb in the vicinity
    for (const verb of SPEECH_VERBS) {
        if (searchText.includes(` ${verb} `) ||
            searchText.startsWith(`${verb} `) ||
            searchText.endsWith(` ${verb}`)) {
            return true;
        }
    }

    return false;
}

/**
 * Infer speaker from contextual heuristics when explicit attribution is missing
 */
function inferSpeakerFromHeuristics(
    fragment: TextFragment,
    allFragments: TextFragment[],
    fragmentIndex: number,
    options: SpeakerTrackingOptions
): SpeakerInfo | null {
    // Heuristic 1: Gender inference from pronouns in dialogue
    const pronounSpeaker = inferSpeakerFromPronouns(fragment.content);
    if (pronounSpeaker) {
        return {
            id: generateSpeakerId(pronounSpeaker),
            name: pronounSpeaker,
            firstSeen: fragmentIndex,
            lastSeen: fragmentIndex,
            dialogueCount: 0,
            speechPatterns: [fragment.verb || 'said'],
            confidence: 0.5, // Lower confidence for heuristic inference
        };
    }

    // Heuristic 2: Speaker continuity - if previous dialogue had a clear speaker,
    // and this dialogue is similar in style, assume same speaker
    const continuousSpeaker = inferSpeakerFromContinuity(
        fragment,
        allFragments,
        fragmentIndex
    );
    if (continuousSpeaker) {
        return continuousSpeaker;
    }

    // Heuristic 3: Narrative perspective inference
    const povSpeaker = inferSpeakerFromNarrativePOV(
        fragment,
        allFragments,
        fragmentIndex
    );
    if (povSpeaker) {
        return povSpeaker;
    }

    return null;
}

/**
 * Infer speaker from pronouns used in dialogue
 */
function inferSpeakerFromPronouns(dialogue: string): string | null {
    const lowerDialogue = dialogue.toLowerCase();
    const pronounCounts: Record<string, number> = {
        i: 0,
        me: 0,
        my: 0,
        mine: 0,
        we: 0,
        us: 0,
        our: 0,
        ours: 0,
        he: 0,
        him: 0,
        his: 0,
        she: 0,
        her: 0,
        hers: 0,
        they: 0,
        them: 0,
        their: 0,
        theirs: 0,
    };

    // Count pronoun occurrences
    for (const pronoun of Object.keys(pronounCounts)) {
        const matches = dialogue.matchAll(new RegExp(`\\b${pronoun}\\b`, 'gi'));
        pronounCounts[pronoun] = [...matches].length;
    }

    // Determine likely speaker based on pronoun dominance
    const firstPersonTotal = pronounCounts.i + pronounCounts.me + pronounCounts.my + pronounCounts.mine;
    const secondPersonTotal = pronounCounts.we + pronounCounts.us + pronounCounts.our + pronounCounts.ours;
    const maleThirdPersonTotal = pronounCounts.he + pronounCounts.him + pronounCounts.his;
    const femaleThirdPersonTotal = pronounCounts.she + pronounCounts.her + pronounCounts.hers;
    const neutralThirdPersonTotal = pronounCounts.they + pronounCounts.them + pronounCounts.their + pronounCounts.theirs;

    if (firstPersonTotal > 2 && firstPersonTotal > secondPersonTotal * 1.5) {
        return 'I';
    } else if (secondPersonTotal > 2 && secondPersonTotal > firstPersonTotal * 1.5) {
        return 'We';
    } else if (maleThirdPersonTotal > 2 && maleThirdPersonTotal > femaleThirdPersonTotal * 1.5 &&
               maleThirdPersonTotal > neutralThirdPersonTotal * 1.5) {
        return 'He';
    } else if (femaleThirdPersonTotal > 2 && femaleThirdPersonTotal > maleThirdPersonTotal * 1.5 &&
               femaleThirdPersonTotal > neutralThirdPersonTotal * 1.5) {
        return 'She';
    } else if (neutralThirdPersonTotal > 2 &&
               neutralThirdPersonTotal > maleThirdPersonTotal * 1.5 &&
               neutralThirdPersonTotal > femaleThirdPersonTotal * 1.5) {
        return 'They';
    }

    return null;
}

/**
 * Infer speaker from continuity with previous dialogue
 */
function inferSpeakerFromContinuity(
    fragment: TextFragment,
    allFragments: TextFragment[],
    fragmentIndex: number
): SpeakerInfo | null {
    // Look backwards for the most recent dialogue with a clear speaker
    for (let i = fragmentIndex - 1; i >= 0; i--) {
        const prevFragment = allFragments[i];
        if (prevFragment.type === 'dialogue' && prevFragment.speaker) {
            // Check if there's no intervening dialogue with different speakers
            let clearPath = true;
            for (let j = i + 1; j < fragmentIndex; j++) {
                const checkFragment = allFragments[j];
                if (checkFragment.type === 'dialogue' &&
                    checkFragment.speaker &&
                    checkFragment.speaker !== prevFragment.speaker) {
                    clearPath = false;
                    break;
                }
            }

            if (clearPath) {
                // Same speaker likely continues unless there's strong evidence otherwise
                return {
                    id: generateSpeakerId(prevFragment.speaker),
                    name: prevFragment.speaker,
                    firstSeen: i,
                    lastSeen: fragmentIndex,
                    dialogueCount: 0,
                    speechPatterns: [fragment.verb || prevFragment.verb || 'said'],
                    confidence: 0.4, // Low confidence for continuity heuristic
                };
            }
            break; // Stop at first dialogue with speaker
        }
    }

    return null;
}

/**
 * Infer speaker from narrative point of view clues
 */
function inferSpeakerFromNarrativePOV(
    fragment: TextFragment,
    allFragments: TextFragment[],
    fragmentIndex: number
): SpeakerInfo | null {
    // Look for narrative context that might indicate speaker
    const windowSize = 3; // Look at surrounding fragments
    const startIndex = Math.max(0, fragmentIndex - windowSize);
    const endIndex = Math.min(allFragments.length - 1, fragmentIndex + windowSize);

    // Check for narrative indicators
    let narrativeContext = '';
    for (let i = startIndex; i <= endIndex; i++) {
        if (allFragments[i].type === 'narration') {
            narrativeContext += ' ' + allFragments[i].content;
        }
    }

    const lowerContext = narrativeContext.toLowerCase();

    // Simple heuristic: if we see "I" or "we" in narration near dialogue,
    // the dialogue speaker might be the same
    if (lowerContext.includes(' i ') || lowerContext.includes(' we ')) {
        // Look for first person indicators in the dialogue itself
        const dialogueLower = fragment.content.toLowerCase();
        if (dialogueLower.includes(' i ') || dialogueLower.includes(' my ') ||
            dialogueLower.includes(' me ')) {
            return {
                id: generateSpeakerId('I'),
                name: 'I',
                firstSeen: fragmentIndex,
                lastSeen: fragmentIndex,
                dialogueCount: 0,
                speechPatterns: [fragment.verb || 'said'],
                confidence: 0.45,
            };
        }
    }

    return null;
}

/**
 * Generate a consistent speaker ID from a name
 */
function generateSpeakerId(name: string): string {
    // Create a simple hash-based ID for consistency
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        const char = name.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return `speaker_${Math.abs(hash)}`;
}

/**
 * Deduplicate speakers with similar names
 */
function deduplicateSpeakers(speakers: SpeakerInfo[]): SpeakerInfo[] {
    if (speakers.length <= 1) return speakers;

    const deduplicated: SpeakerInfo[] = [];
    const processed = new Set<string>();

    for (const speaker of speakers) {
        // Create a normalized key for comparison
        const normalizedName = speaker.name
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (processed.has(normalizedName)) {
            // Find existing speaker and merge
            const existingIndex = deduplicated.findIndex(
                s => s.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim() === normalizedName
            );
            if (existingIndex !== -1) {
                const existing = deduplicated[existingIndex];
                // Merge: keep the one with higher dialogue count or confidence
                if (speaker.dialogueCount > existing.dialogueCount ||
                    (speaker.dialogueCount === existing.dialogueCount && speaker.confidence > existing.confidence)) {
                    deduplicated[existingIndex] = speaker;
                } else {
                    // Merge speech patterns
                    existing.speechPatterns = [...new Set([
                        ...existing.speechPatterns,
                        ...speaker.speechPatterns
                    ])];
                    // Update counts
                    existing.dialogueCount += speaker.dialogueCount;
                    existing.lastSeen = Math.max(existing.lastSeen, speaker.lastSeen);
                    existing.firstSeen = Math.min(existing.firstSeen, speaker.firstSeen);
                    existing.confidence = Math.max(existing.confidence, speaker.confidence);
                }
            }
        } else {
            processed.add(normalizedName);
            deduplicated.push(speaker);
        }
    }

    return deduplicated;
}

/**
 * Calculate speaker statistics
 */
function calculateSpeakerStatistics(
    speakers: SpeakerInfo[],
    fragments: TextFragment[]
): {
    totalSpeakers: number;
    totalDialogueFragments: number;
    averageFragmentsPerSpeaker: number;
    dominantSpeaker?: string;
    speakerEntropy: number;
} {
    const dialogueFragments = fragments.filter(f => f.type === 'dialogue').length;
    const totalSpeakers = speakers.length;
    const averageFragmentsPerSpeaker = totalSpeakers > 0
        ? dialogueFragments / totalSpeakers
        : 0;

    // Find dominant speaker (most dialogue)
    let dominantSpeaker: string | undefined;
    let maxDialogue = 0;
    for (const speaker of speakers) {
        if (speaker.dialogueCount > maxDialogue) {
            maxDialogue = speaker.dialogueCount;
            dominantSpeaker = speaker.name;
        }
    }

    // Calculate entropy for speaker distribution diversity
    let entropy = 0;
    if (dialogueFragments > 0 && totalSpeakers > 0) {
        for (const speaker of speakers) {
            const proportion = speaker.dialogueCount / dialogueFragments;
            if (proportion > 0) {
                entropy -= proportion * Math.log2(proportion);
            }
        }
        // Normalize to 0-1 range (max entropy = log2(totalSpeakers))
        const maxEntropy = totalSpeakers > 1 ? Math.log2(totalSpeakers) : 1;
        entropy = entropy / maxEntropy;
    }

    return {
        totalSpeakers,
        totalDialogueFragments: dialogueFragments,
        averageFragmentsPerSpeaker,
        dominantSpeaker,
        speakerEntropy: Number.isNaN(entropy) ? 0 : entropy,
    };
}

/**
 * Convenience function to process paragraphs with speaker tracking
 */
export async function processParagraphsWithSpeakers(
    paragraphs: ProcessedParagraph[],
    options: SpeakerTrackingOptions = {}
): Promise<{
    paragraphs: ProcessedParagraph[];
    speakers: SpeakerInfo[];
    statistics: SpeakerTrackingResult['statistics'];
}> {
    // Extract all fragments from paragraphs
    const allFragments: TextFragment[] = paragraphs
        .flatMap(p => p.fragments);

    // Track speakers
    const speakerResult = await trackSpeakers(allFragments, options);

    // Reconstruct paragraphs with updated fragments
    const updatedParagraphs: ProcessedParagraph[] = [];
    let fragmentIndex = 0;

    for (const paragraph of paragraphs) {
        const fragmentCount = paragraph.fragments.length;
        updatedParagraphs.push({
            ...paragraph,
            fragments: speakerResult.fragments.slice(fragmentIndex, fragmentIndex + fragmentCount),
        });
        fragmentIndex += fragmentCount;
    }

    return {
        paragraphs: updatedParagraphs,
        speakers: speakerResult.speakers,
        statistics: speakerResult.statistics,
    };
}