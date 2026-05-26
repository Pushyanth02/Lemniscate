import { describe, it, expect } from 'vitest';
import { extractEntities, highlightEntities } from '../engine/cinematifier/entityExtractor';

describe('entityExtractor', () => {
    describe('extractEntities', () => {
        it('extracts characters and locations from paragraphs', () => {
            const paragraphs = [
                'Mr. Darcy walked down the streets of London, thinking of Elizabeth.',
                'Elizabeth was reading a book in Paris.',
            ];

            const result = extractEntities(paragraphs);

            // Check characters
            const charNames = result.characters.map(c => c.name);
            expect(charNames.some(name => name.includes('Darcy'))).toBe(true);
            expect(charNames).toContain('Elizabeth');

            // Check locations
            const locNames = result.locations.map(l => l.name);
            expect(locNames).toContain('London');
            expect(locNames).toContain('Paris');
        });

        it('performs alias grouping and deduplication', () => {
            const paragraphs = [
                'Jane Bennet walked into the room.',
                'Jane smiled at the guests.',
                'Elizabeth Bennet was also there.',
            ];

            const result = extractEntities(paragraphs);

            const janeBennetEntity = result.characters.find(c => c.name === 'Jane Bennet');
            expect(janeBennetEntity).toBeDefined();
            expect(janeBennetEntity?.aliases).toContain('Jane');

            const elizabethEntity = result.characters.find(c => c.name === 'Elizabeth Bennet');
            expect(elizabethEntity).toBeDefined();
        });
    });

    describe('highlightEntities', () => {
        it('wraps entity names and locations in HTML spans', () => {
            const content = 'Elizabeth and Darcy met in London.';
            const characters = ['Elizabeth', 'Darcy'];
            const locations = ['London'];

            const highlighted = highlightEntities(content, characters, locations);

            expect(highlighted).toContain('<span class="entity-highlight entity-character" data-name="Elizabeth">Elizabeth</span>');
            expect(highlighted).toContain('<span class="entity-highlight entity-character" data-name="Darcy">Darcy</span>');
            expect(highlighted).toContain('<span class="entity-highlight entity-location" data-loc="London">London</span>');
        });

        it('escapes normal html tags before adding span highlights', () => {
            const content = '<div>Jane and London</div>';
            const characters = ['Jane'];
            const locations = ['London'];

            const highlighted = highlightEntities(content, characters, locations);

            expect(highlighted).toContain('&lt;div&gt;');
            expect(highlighted).toContain('&lt;/div&gt;');
            expect(highlighted).toContain('<span class="entity-highlight entity-character" data-name="Jane">Jane</span>');
            expect(highlighted).toContain('<span class="entity-highlight entity-location" data-loc="London">London</span>');
        });

        it('sorts names by length to avoid partial replacements', () => {
            const content = 'John Smith met John.';
            const characters = ['John Smith', 'John'];

            const highlighted = highlightEntities(content, characters, []);

            expect(highlighted).toContain('<span class="entity-highlight entity-character" data-name="John Smith">John Smith</span>');
            expect(highlighted).toContain('<span class="entity-highlight entity-character" data-name="John">John</span>');
        });
    });
});
