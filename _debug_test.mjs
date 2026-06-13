const SPEAKER_NAME_RE = /[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2}/;
const SPEECH_VERBS = new Set(['said', 'asked', 'replied', 'whispered', 'shouted']);

const LEADING_ATTR_RE = new RegExp(
    `^[,;:\\s-]*(${SPEAKER_NAME_RE.source}|he|she|they|i|we)\\s+(${[...SPEECH_VERBS].join('|')})\\b`,
    'i',
);

const afterWindow = ' Jon replied.';
const match = afterWindow.match(LEADING_ATTR_RE);
console.log('match:', match ? [match[0], match[1], match[2]] : null);

// Test the full text scenario
const text2 = '"Stay back!" Jon replied.';
const DIALOGUE_RE = /(?:"([^"\n]+)"|"([^"\n]+)"|'([^'\n]{4,})')/g;
for (const m of text2.matchAll(DIALOGUE_RE)) {
    const matchIndex = m.index ?? 0;
    const fullMatch = m[0];
    const before = text2.slice(0, matchIndex);
    const after = text2.slice(matchIndex + fullMatch.length);
    console.log('dialogue:', m[1] ?? m[2] ?? m[3]);
    console.log('before:', JSON.stringify(before));
    console.log('after:', JSON.stringify(after));
    const m2 = after.match(LEADING_ATTR_RE);
    console.log('leading match:', m2 ? [m2[0], m2[1], m2[2]] : null);
}

// Simulate extractFragments
function extractFragments(paragraph) {
    const fragments = [];
    let cursor = 0;
    for (const match of paragraph.matchAll(DIALOGUE_RE)) {
        const matchIndex = match.index ?? 0;
        const fullMatch = match[0];
        if (matchIndex > cursor) {
            const narration = paragraph.slice(cursor, matchIndex).trim();
            if (narration) fragments.push({ type: 'narration', content: narration });
        }
        const before = paragraph.slice(0, matchIndex);
        const after = paragraph.slice(matchIndex + fullMatch.length);
        // Simple extractSpeaker simulation
        const afterMatch = after.match(LEADING_ATTR_RE);
        const dialogueContent = match[1] ?? match[2] ?? match[3] ?? '';
        fragments.push({
            type: 'dialogue',
            content: dialogueContent,
            speaker: afterMatch ? afterMatch[1] : undefined,
            verb: afterMatch ? afterMatch[2] : undefined,
        });
        cursor = matchIndex + fullMatch.length;
    }
    if (cursor < paragraph.length) {
        const trailing = paragraph.slice(cursor).trim();
        if (trailing) fragments.push({ type: 'narration', content: trailing });
    }
    return fragments;
}

console.log('\nFragments for para2:', JSON.stringify(extractFragments('"Stay back!" Jon replied.'), null, 2));
