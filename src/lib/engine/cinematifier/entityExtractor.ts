/**
 * entityExtractor.ts — Named Entity Recognition using Compromise.js
 *
 * Scans book chapters paragraph-by-paragraph to detect characters (people)
 * and locations (places), building an entity registry and providing inline text highlighting.
 */

import nlp from 'compromise';
import type { CharacterEntity, LocationEntity } from '../../../types/book';

export interface ExtractedEntities {
    characters: CharacterEntity[];
    locations: LocationEntity[];
}

/**
 * Scan full text paragraphs to extract and build the entity registry.
 */
export function extractEntities(paragraphs: string[]): ExtractedEntities {
    const characterMap = new Map<string, { appearances: number; aliases: Set<string> }>();
    const locationMap = new Map<string, { appearances: number; firstMentionParagraphIndex: number }>();

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const para = paragraphs[pIdx];
        if (!para.trim()) continue;

        const doc = nlp(para);

        // 1. Characters Extraction
        const people = doc.people().json();
        const names: string[] = people.map((p: any) => p.text.trim());

        for (let name of names) {
            // Clean up punctuation, whitespace
            name = name.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').replace(/\s+/g, ' ').trim();
            if (name.length < 2 || !/^[A-Z]/.test(name)) continue;

            // Simple common noise filter
            if (['I', 'He', 'She', 'They', 'It', 'We', 'You'].includes(name)) continue;

            let canonical = name;
            let found = false;

            // Check if name aligns with an existing canonical name or aliases
            for (const [existingCanonical, data] of characterMap.entries()) {
                if (existingCanonical.toLowerCase() === name.toLowerCase()) {
                    canonical = existingCanonical;
                    found = true;
                    break;
                }

                // If name is a single word and is contained in an existing multi-word canonical name
                if (!name.includes(' ') && existingCanonical.toLowerCase().split(/\s+/).includes(name.toLowerCase())) {
                    canonical = existingCanonical;
                    found = true;
                    data.aliases.add(name);
                    break;
                }

                // If existing canonical name is a single word and is contained in the new multi-word name
                if (!existingCanonical.includes(' ') && name.toLowerCase().split(/\s+/).includes(existingCanonical.toLowerCase())) {
                    // Update canonical key to the longer multi-word name
                    characterMap.delete(existingCanonical);
                    const newAliases = data.aliases;
                    newAliases.add(existingCanonical);
                    characterMap.set(name, { appearances: data.appearances, aliases: newAliases });
                    canonical = name;
                    found = true;
                    break;
                }
            }

            if (!found) {
                characterMap.set(canonical, { appearances: 0, aliases: new Set<string>() });
            }

            const data = characterMap.get(canonical)!;
            data.appearances++;
            if (name !== canonical) {
                data.aliases.add(name);
            }
        }

        // 2. Locations Extraction
        const places = doc.places().json();
        const locNames: string[] = places.map((p: any) => p.text.trim());

        for (let loc of locNames) {
            loc = loc.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').replace(/\s+/g, ' ').trim();
            if (loc.length < 2 || !/^[A-Z]/.test(loc)) continue;

            const canonicalLoc = loc
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');

            if (!locationMap.has(canonicalLoc)) {
                locationMap.set(canonicalLoc, { appearances: 0, firstMentionParagraphIndex: pIdx });
            }
            locationMap.get(canonicalLoc)!.appearances++;
        }
    }

    const characters: CharacterEntity[] = Array.from(characterMap.entries())
        .map(([name, data]) => ({
            name,
            appearances: data.appearances,
            aliases: Array.from(data.aliases),
        }))
        .sort((a, b) => b.appearances - a.appearances);

    const locations: LocationEntity[] = Array.from(locationMap.entries())
        .map(([name, data]) => ({
            name,
            appearances: data.appearances,
            firstMentionParagraphIndex: data.firstMentionParagraphIndex,
        }))
        .sort((a, b) => b.appearances - a.appearances);

    return { characters, locations };
}

/**
 * Escapes special HTML characters.
 */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wraps characters and locations in HTML span tags for visual highlighting in the reader.
 */
export function highlightEntities(
    content: string,
    characters: string[],
    locations: string[],
): string {
    if (!content) return content;
    let escaped = escapeHtml(content);

    // Escape regex special characters
    const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Sort names by length descending to match longer names first (e.g. "John Smith" before "John")
    const sortedChars = [...characters].sort((a, b) => b.length - a.length);
    const sortedLocs = [...locations].sort((a, b) => b.length - a.length);

    // Track replacements to prevent matching inside already replaced HTML tags
    const placeholders: { placeholder: string; replacement: string }[] = [];
    let placeholderCounter = 0;

    // Replace character names with placeholders
    for (const char of sortedChars) {
        if (char.length < 2) continue;
        const escapedChar = escapeHtml(char);
        const regex = new RegExp(`\\b(${escapeRegex(escapedChar)})\\b`, 'g');

        escaped = escaped.replace(regex, (match) => {
            const placeholder = `__ENTITY_CHAR_${placeholderCounter++}__`;
            placeholders.push({
                placeholder,
                replacement: `<span class="entity-highlight entity-character" data-name="${escapedChar}">${match}</span>`,
            });
            return placeholder;
        });
    }

    // Replace location names with placeholders
    for (const loc of sortedLocs) {
        if (loc.length < 2) continue;
        const escapedLoc = escapeHtml(loc);
        const regex = new RegExp(`\\b(${escapeRegex(escapedLoc)})\\b`, 'g');

        escaped = escaped.replace(regex, (match) => {
            const placeholder = `__ENTITY_LOC_${placeholderCounter++}__`;
            placeholders.push({
                placeholder,
                replacement: `<span class="entity-highlight entity-location" data-loc="${escapedLoc}">${match}</span>`,
            });
            return placeholder;
        });
    }

    // Restore placeholders back to HTML tags
    for (const p of placeholders) {
        escaped = escaped.replace(p.placeholder, p.replacement);
    }

    return escaped;
}
