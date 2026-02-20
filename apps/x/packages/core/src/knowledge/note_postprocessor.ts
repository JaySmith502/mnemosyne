import fs from 'fs';
import path from 'path';

/**
 * Note frontmatter structure for entity notes
 */
export interface NoteFrontmatter {
    entity_id?: string;
    sor_refs?: Array<{ system: string; id: string }>;
    entity_type?: string;
    [key: string]: unknown; // Allow other frontmatter fields
}

/**
 * System display names for Sources section
 */
const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
    'gohighlevel': 'GoHighLevel',
    'gmail': 'Gmail',
    'calendar': 'Google Calendar',
    'fireflies': 'Fireflies',
    'granola': 'Granola',
    'knowledge': 'Manual Notes',
};

/**
 * Parse YAML frontmatter from note content
 * Returns null if no valid frontmatter found
 */
export function parseNoteFrontmatter(content: string): NoteFrontmatter | null {
    // Check for frontmatter delimiters
    if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
        return null;
    }

    // Find the closing delimiter
    const lines = content.split('\n');
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---' || lines[i] === '---\r') {
            closingIndex = i;
            break;
        }
    }

    if (closingIndex === -1) {
        return null;
    }

    // Extract YAML content
    const yamlLines = lines.slice(1, closingIndex);
    const frontmatter: NoteFrontmatter = {};

    let currentKey: string | null = null;
    let parsingArray = false;
    const arrayItems: Array<{ system?: string; id?: string }> = [];
    let currentArrayItem: { system?: string; id?: string } = {};

    for (const line of yamlLines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) {
            continue; // Skip empty lines and comments
        }

        // Check for key-value pairs
        const keyValueMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);

        if (keyValueMatch && !trimmed.startsWith('-') && !trimmed.startsWith(' ')) {
            const [, key, value] = keyValueMatch;
            currentKey = key;

            if (key === 'sor_refs') {
                parsingArray = true;
                arrayItems.length = 0;
                currentArrayItem = {};
            } else {
                parsingArray = false;
                // Store simple string value
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                if (cleanValue) {
                    frontmatter[key] = cleanValue;
                }
            }
        } else if (parsingArray && trimmed.startsWith('-')) {
            // Array item start
            if (Object.keys(currentArrayItem).length > 0) {
                arrayItems.push({ ...currentArrayItem });
            }
            currentArrayItem = {};

            // Check if there's a key-value on the same line
            const inlineMatch = trimmed.match(/^-\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
            if (inlineMatch) {
                const [, key, value] = inlineMatch;
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                currentArrayItem[key as 'system' | 'id'] = cleanValue;
            }
        } else if (parsingArray && (trimmed.startsWith('system:') || trimmed.startsWith('id:'))) {
            // Nested array item property
            const nestedMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
            if (nestedMatch) {
                const [, key, value] = nestedMatch;
                const cleanValue = value.replace(/^["']|["']$/g, '').trim();
                currentArrayItem[key as 'system' | 'id'] = cleanValue;
            }
        }
    }

    // Save any remaining array item
    if (parsingArray && Object.keys(currentArrayItem).length > 0) {
        arrayItems.push({ ...currentArrayItem });
    }

    if (parsingArray && arrayItems.length > 0) {
        frontmatter.sor_refs = arrayItems.filter(item => item.system && item.id) as Array<{ system: string; id: string }>;
    }

    return frontmatter;
}

/**
 * Generate deterministic Sources section from frontmatter
 */
export function generateSourcesSection(frontmatter: NoteFrontmatter): string {
    if (!frontmatter.sor_refs || frontmatter.sor_refs.length === 0) {
        return '## Sources\n\nThis note is based on knowledge graph sources.';
    }

    // Count references per system
    const systemCounts: Record<string, number> = {};
    for (const ref of frontmatter.sor_refs) {
        systemCounts[ref.system] = (systemCounts[ref.system] || 0) + 1;
    }

    // Sort systems alphabetically
    const systems = Object.keys(systemCounts).sort();

    // Build the section
    let section = '## Sources\n\n';
    section += 'This note is enriched with data from:\n\n';

    for (const system of systems) {
        const displayName = SYSTEM_DISPLAY_NAMES[system] || system;
        const count = systemCounts[system];
        section += `- **${displayName}**: ${count} reference(s)\n`;
    }

    return section.trim();
}

/**
 * Ensure note has correct Sources section matching its frontmatter
 * Returns updated content if changes were made, otherwise returns original
 */
export function ensureSourcesSection(content: string): string {
    // Parse frontmatter
    const frontmatter = parseNoteFrontmatter(content);

    if (!frontmatter) {
        // No frontmatter, return unchanged
        return content;
    }

    // Generate the correct Sources section
    const correctSourcesSection = generateSourcesSection(frontmatter);

    // Check if content already has a Sources section
    const sourcesMatch = content.match(/^## Sources\s*$/m);

    if (sourcesMatch && sourcesMatch.index !== undefined) {
        // Find the start of the Sources section
        const sourcesStart = sourcesMatch.index;

        // Find the end of the Sources section (next ## heading or end of file)
        const afterSources = content.substring(sourcesStart + sourcesMatch[0].length);
        const nextHeadingMatch = afterSources.match(/^## /m);

        let sourcesEnd: number;
        if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
            // End at the start of the next section
            sourcesEnd = sourcesStart + sourcesMatch[0].length + nextHeadingMatch.index;
        } else {
            // Sources section goes to end of file
            sourcesEnd = content.length;
        }

        // Replace the Sources section
        const before = content.substring(0, sourcesStart);
        const after = content.substring(sourcesEnd);
        return before + correctSourcesSection + '\n' + after;
    } else {
        // No Sources section exists, append it
        const trimmed = content.trimEnd();
        return trimmed + '\n\n' + correctSourcesSection + '\n';
    }
}

/**
 * Post-process a batch of notes to ensure deterministic Sources sections
 *
 * @param notePaths - Workspace-relative paths like "knowledge/People/Name.md"
 * @param workDir - Absolute path to workspace (e.g., ~/.rowboat)
 * @returns Summary statistics
 */
export function postProcessBatchNotes(
    notePaths: string[],
    workDir: string
): { processed: number; errors: number } {
    let processed = 0;
    let errors = 0;

    for (const notePath of notePaths) {
        try {
            // Resolve full path
            const fullPath = path.join(workDir, notePath);

            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                console.error(`[postProcessor] File not found: ${fullPath}`);
                errors++;
                continue;
            }

            // Read content
            const originalContent = fs.readFileSync(fullPath, 'utf-8');

            // Process content
            const updatedContent = ensureSourcesSection(originalContent);

            // Only write if content changed
            if (updatedContent !== originalContent) {
                fs.writeFileSync(fullPath, updatedContent, 'utf-8');
                processed++;
            }
        } catch (error) {
            console.error(`[postProcessor] Error processing ${notePath}:`, error);
            errors++;
        }
    }

    return { processed, errors };
}
