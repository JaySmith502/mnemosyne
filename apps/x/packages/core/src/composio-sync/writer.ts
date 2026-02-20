import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';
import { NormalizedEntity, SyncManifest, SyncManifestSchema } from './types.js';

/**
 * Sanitize filename for filesystem safety
 */
function sanitizeFilename(name: string): string {
    // Replace unsafe characters with underscore
    const sanitized = name.replace(/[/\\:*?"<>|]/g, '_');

    // Truncate to 100 characters
    return sanitized.substring(0, 100);
}

/**
 * Format value for YAML frontmatter
 */
function formatYamlValue(value: unknown, indent: number = 0): string {
    const spaces = '  '.repeat(indent);

    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'string') {
        // Check if string needs quoting (contains special YAML chars or starts with special chars)
        const needsQuoting = /[:#{}[\],&*?|<>=!%@`'"\n]/.test(value) ||
                           /^[-0-9]/.test(value);

        if (needsQuoting) {
            // Escape double quotes and wrap in quotes
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        // Format as YAML list
        return '\n' + value.map(item =>
            `${spaces}  - ${formatYamlValue(item, 0)}`
        ).join('\n');
    }

    if (typeof value === 'object') {
        // Inline JSON for objects
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Write entity as individual Markdown file with frontmatter
 */
export function writeEntityFile(toolkit: string, entity: NormalizedEntity): string {
    const outputDir = path.join(WorkDir, 'composio_sync', toolkit);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create filename
    const sanitizedSorId = sanitizeFilename(entity.sorId);
    const filename = `${entity.entityType}_${sanitizedSorId}.md`;
    const filepath = path.join(outputDir, filename);

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
        sorSystem: entity.sorSystem,
        sorId: entity.sorId,
        entityType: entity.entityType,
        syncedAt: new Date().toISOString(),
        ...entity.fields,
    };

    // Format frontmatter as YAML
    const frontmatterLines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined) {
            continue;
        }
        const formattedValue = formatYamlValue(value);
        if (formattedValue.startsWith('\n')) {
            // Multi-line value (array)
            frontmatterLines.push(`${key}:${formattedValue}`);
        } else {
            frontmatterLines.push(`${key}: ${formattedValue}`);
        }
    }
    frontmatterLines.push('---');
    frontmatterLines.push('');

    // Build minimal body
    const name = (entity.fields.name as string) || entity.sorId;
    const syncedAt = frontmatter.syncedAt as string;
    const body = [
        `# ${name}`,
        '',
        `*Synced from ${entity.sorSystem} at ${syncedAt}*`,
    ];

    // Write file
    const content = [...frontmatterLines, ...body].join('\n') + '\n';
    fs.writeFileSync(filepath, content, 'utf-8');

    return filepath;
}

/**
 * Write sync manifest JSON
 */
export function writeManifest(toolkit: string, manifest: SyncManifest): void {
    const outputDir = path.join(WorkDir, 'composio_sync', toolkit);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Read sync manifest JSON
 */
export function readManifest(toolkit: string): SyncManifest | null {
    const manifestPath = path.join(WorkDir, 'composio_sync', toolkit, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const result = SyncManifestSchema.safeParse(data);

        if (result.success) {
            return result.data;
        } else {
            console.warn(`[Writer] Invalid manifest for ${toolkit}:`, result.error);
            return null;
        }
    } catch (error) {
        console.warn(`[Writer] Failed to read manifest for ${toolkit}:`, error);
        return null;
    }
}
