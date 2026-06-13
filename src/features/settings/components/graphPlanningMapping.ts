/**
 * graphPlanningMapping.ts
 *
 * Static mapping between Graphify Community labels and Planning Doc paths,
 * and parser functions for GRAPH_REPORT.md (Freshness check & Suggested Questions).
 */

export const communityPlanningMapping: Record<string, string[]> = {
    'Community 0': ['.planning/PROJECT.md', '.planning/codebase/STRUCTURE.md'],
    'Community 1': ['.planning/codebase/STRUCTURE.md', '.planning/codebase/ARCHITECTURE.md'],
    'Community 2': ['.planning/codebase/STRUCTURE.md'],
    'Community 3': ['.planning/codebase/STRUCTURE.md', '.planning/codebase/ARCHITECTURE.md'],
    'Community 4': ['.planning/codebase/STRUCTURE.md'],
    'Community 5': ['.planning/codebase/ARCHITECTURE.md', '.planning/codebase/CONCERNS.md'],
    'Community 6': ['.planning/codebase/STRUCTURE.md'],
    'Community 7': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 8': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 9': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 10': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 11': ['.planning/codebase/INTEGRATIONS.md'],
    'Community 12': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 13': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 15': ['.planning/codebase/STRUCTURE.md', '.planning/codebase/ARCHITECTURE.md'],
    'Community 22': ['.planning/ROADMAP.md', '.planning/RULES.md'],
    'Community 23': ['.planning/codebase/INTEGRATIONS.md'],
    'Community 25': ['.planning/codebase/INTEGRATIONS.md'],
    'Community 27': ['.planning/codebase/STRUCTURE.md'],
    'Community 40': ['.planning/PROJECT.md'],
    'Community 61': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 73': ['.planning/codebase/CONVENTIONS.md'],
    'Community 75': ['.planning/codebase/STACK.md'],
    'Community 76': ['.planning/codebase/STRUCTURE.md'],
    'Community 81': ['.planning/codebase/STRUCTURE.md'],
    'Community 90': ['.planning/codebase/TESTING.md'],
    'Community 95': ['.planning/PROJECT.md', '.planning/codebase/STRUCTURE.md'],
    'Community 101': ['.planning/ROADMAP.md'],
    'Community 102': ['.planning/codebase/STACK.md'],
    'Community 111': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 112': ['.planning/codebase/ARCHITECTURE.md'],
    'Community 116': ['.planning/codebase/ARCHITECTURE.md'],
};

export interface SuggestedQuestion {
    question: string;
    context: string;
}

export interface CommunityInfo {
    id: string;      // e.g. "Community 1"
    name: string;    // e.g. "Community 1"
    cohesion: number;
    nodeCount: number;
    nodes: string[];
}

/**
 * Parses suggested questions from GRAPH_REPORT.md
 */
export function parseSuggestedQuestions(markdown: string): SuggestedQuestion[] {
    const questions: SuggestedQuestion[] = [];
    const lines = markdown.split('\n');
    let inSuggestedQuestionsSection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect section start
        if (line.startsWith('## Suggested Questions')) {
            inSuggestedQuestionsSection = true;
            continue;
        }

        // If we hit another section heading, stop parsing
        if (inSuggestedQuestionsSection && line.startsWith('##') && !line.startsWith('## Suggested Questions')) {
            break;
        }

        if (inSuggestedQuestionsSection) {
            // Find bullet points that look like: - **Question** or * **Question**
            if (line.startsWith('- **') || line.startsWith('* **')) {
                const qMatch = line.match(/^[-*]\s*\*\*(.*?)\*\*/);
                if (qMatch) {
                    const question = qMatch[1];
                    let context = '';
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        // Extract context wrapped in underscores
                        const match = nextLine.match(/_([^]*?)_/);
                        if (match) {
                            context = match[1];
                            i++; // skip next line since we consumed it
                        }
                    }
                    questions.push({ question, context });
                }
            }
        }
    }

    return questions;
}

/**
 * Parses communities from GRAPH_REPORT.md
 */
export function parseCommunities(markdown: string): CommunityInfo[] {
    const communities: CommunityInfo[] = [];
    const sections = markdown.split('### Community ');

    for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const lines = section.split('\n');
        const headerLine = lines[0].trim();

        const idMatch = headerLine.match(/^(\d+)/);
        if (!idMatch) continue;
        const id = `Community ${idMatch[1]}`;

        let name = id;
        const nameMatch = headerLine.match(/-\s*"(.*?)"/);
        if (nameMatch) {
            name = nameMatch[1];
        }

        let cohesion = 0;
        let nodeCount = 0;
        let nodes: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('Cohesion:')) {
                cohesion = parseFloat(trimmed.replace('Cohesion:', '').trim());
            } else if (trimmed.startsWith('Nodes (')) {
                const countMatch = trimmed.match(/Nodes\s*\((\d+)\):/);
                if (countMatch) {
                    nodeCount = parseInt(countMatch[1], 10);
                }
                const nodesList = trimmed.replace(/Nodes\s*\(\d+\):\s*/, '');
                nodes = nodesList.split(',').map(n => n.trim());
            }
        }

        communities.push({ id, name, cohesion, nodeCount, nodes });
    }

    return communities;
}

/**
 * Parses the commit hash that the graph report was built from
 */
export function parseBuiltFromCommit(markdown: string): string {
    const match = markdown.match(/Built from commit:\s*`([0-9a-fA-F]+)`/);
    return match ? match[1] : '';
}
