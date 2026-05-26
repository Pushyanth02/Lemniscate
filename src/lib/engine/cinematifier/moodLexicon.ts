/**
 * moodLexicon.ts — Lexicon-Based Mood Engine
 *
 * Categorized keyword dictionaries and scoring logic to map text blocks
 * to the six mood categories: action, suspense, romantic, dark, peaceful, and neutral.
 */

export const MOOD_LEXICONS = {
    action: [
        'sudden', 'suddenly', 'slammed', 'shouted', 'blade', 'crash', 'sprint', 'sprinted',
        'explode', 'explosion', 'run', 'running', 'rushed', 'fight', 'strike', 'hit',
        'chase', 'dash', 'dashed', 'leap', 'leapt', 'jumped', 'shatter', 'smash', 'gunshot',
        'fires', 'fired', 'attack', 'kick', 'slap', 'throw', 'threw', 'scream', 'screamed',
        'barked', 'snapped', 'yelled', 'growled', 'alert', 'burst'
    ],
    suspense: [
        'quiet', 'quietly', 'shadow', 'shadows', 'creaked', 'whisper', 'whispered', 'lurked',
        'silence', 'silent', 'dread', 'tense', 'tension', 'anxious', 'uneasy', 'wary',
        'hush', 'murmur', 'murmured', 'mutter', 'muttered', 'crawl', 'creep', 'crept',
        'wait', 'waited', 'watch', 'watched', 'shake', 'shook', 'tremble', 'trembled',
        'freeze', 'froze', 'breathless', 'stare', 'stared', 'glance', 'glanced', 'cold',
        'darkness', 'shiver', 'shivered', 'warned', 'warning', 'secret'
    ],
    romantic: [
        'warmth', 'tender', 'tenderly', 'kiss', 'kissed', 'embrace', 'embraced', 'heart',
        'blush', 'blushed', 'longing', 'love', 'loved', 'loving', 'sweet', 'sweeter',
        'gentle', 'gently', 'soft', 'softly', 'affection', 'darling', 'dear', 'gaze',
        'gazed', 'smile', 'smiled', 'fond', 'fondly', 'touch', 'touched', 'passion',
        'passionate', 'whisper', 'whispered'
    ],
    dark: [
        'blood', 'bloody', 'death', 'dead', 'die', 'died', 'dying', 'kill', 'killed',
        'murder', 'murdered', 'void', 'despair', 'nightmare', 'nightmares', 'scream',
        'screamed', 'agony', 'pain', 'suffer', 'suffered', 'ghost', 'decay', 'grief',
        'mourn', 'mourned', 'sorrow', 'void', 'bleeding', 'gloom', 'gloomy', 'tragic',
        'agony', 'cruel', 'brutal', 'evil', 'corrupt', 'doom', 'doomed', 'ruin'
    ],
    peaceful: [
        'sunlight', 'meadow', 'gentle', 'gently', 'calm', 'calmly', 'breeze', 'serene',
        'golden', 'sunshine', 'peace', 'peaceful', 'rest', 'rested', 'relax', 'relaxed',
        'meadows', 'lake', 'stream', 'quiet', 'quietly', 'soothe', 'soothed', 'harmonic',
        'harmony', 'serenity', 'relief', 'relieved', 'safe', 'safety', 'bright', 'warm'
    ]
} as const;

export type MoodCategory = keyof typeof MOOD_LEXICONS | 'neutral';

export interface MoodAnalysis {
    dominantMood: MoodCategory;
    scores: Record<Exclude<MoodCategory, 'neutral'>, number>;
}

/**
 * Analyzes the mood of a given string using word match scoring.
 */
export function analyzeMood(text: string): MoodAnalysis {
    const scores: Record<Exclude<MoodCategory, 'neutral'>, number> = {
        action: 0,
        suspense: 0,
        romantic: 0,
        dark: 0,
        peaceful: 0
    };

    const words = text.toLowerCase().match(/\b\w+\b/g) || [];

    for (const word of words) {
        for (const [mood, list] of Object.entries(MOOD_LEXICONS)) {
            // Check if word matches directly or matches root (starts with) for plurals/tenses
            const matches = list.some((item: string) => {
                if (word === item) return true;
                if (item.length > 4 && word.startsWith(item)) return true;
                return false;
            });

            if (matches) {
                scores[mood as Exclude<MoodCategory, 'neutral'>]++;
            }
        }
    }

    // Determine the dominant mood if there are any matches
    let dominantMood: MoodCategory = 'neutral';
    let highestScore = 0;

    for (const [mood, score] of Object.entries(scores)) {
        if (score > highestScore) {
            highestScore = score;
            dominantMood = mood as MoodCategory;
        }
    }

    return { dominantMood, scores };
}
