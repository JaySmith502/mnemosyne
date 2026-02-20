import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';
import { normalizeEmail } from '../entity-resolution/types.js';
import {
    NormalizerConfig,
    NormalizerConfigSchema,
    EntityConfig,
    FieldMapping,
    NormalizedEntity,
} from './types.js';

/**
 * Load and validate normalizer configuration for a toolkit
 */
export function loadNormalizerConfig(toolkit: string): NormalizerConfig {
    const configPath = path.join(WorkDir, 'config', 'connectors', `${toolkit}.json`);

    if (!fs.existsSync(configPath)) {
        throw new Error(`Normalizer config not found for toolkit: ${toolkit} at ${configPath}`);
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    try {
        return NormalizerConfigSchema.parse(configData);
    } catch (error) {
        throw new Error(`Invalid normalizer config for toolkit ${toolkit}: ${error}`);
    }
}

/**
 * Resolve nested object values using dot notation (e.g., "user.email")
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const segments = path.split('.');
    let value: unknown = obj;

    for (const segment of segments) {
        if (value === null || value === undefined) {
            return undefined;
        }
        value = (value as Record<string, unknown>)[segment];
    }

    return value;
}

/**
 * Apply field mapping transformation to source data
 */
export function applyFieldMapping(sourceData: Record<string, unknown>, mapping: FieldMapping): unknown {
    // Extract value(s) from source
    let value: unknown;

    if (Array.isArray(mapping.source)) {
        // Concat multiple source fields
        const values = mapping.source.map(src => getNestedValue(sourceData, src));

        if (mapping.transform === 'concat') {
            const separator = mapping.separator || ' ';
            value = values.filter(v => v !== undefined && v !== null).join(separator);
        } else {
            // For array sources without concat, return array of values
            value = values.filter(v => v !== undefined && v !== null);
        }
    } else {
        value = getNestedValue(sourceData, mapping.source);
    }

    // Handle missing required fields
    if ((value === undefined || value === null || value === '') && mapping.required) {
        return null;
    }

    if (value === undefined || value === null) {
        return undefined;
    }

    // Apply transformations (only for string values)
    if (typeof value === 'string' && mapping.transform) {
        switch (mapping.transform) {
            case 'lowercase':
                value = value.toLowerCase();
                break;
            case 'uppercase':
                value = value.toUpperCase();
                break;
            case 'trim':
                value = value.trim();
                break;
            case 'concat':
                // Already handled above
                break;
        }
    }

    // Apply normalization
    if (mapping.normalize) {
        if (typeof value === 'string') {
            switch (mapping.normalize) {
                case 'lowercase':
                    value = value.toLowerCase();
                    break;
                case 'uppercase':
                    value = value.toUpperCase();
                    break;
                case 'email':
                    value = normalizeEmail(value);
                    break;
            }
        }
    }

    // Apply type coercion
    if (mapping.type) {
        switch (mapping.type) {
            case 'string':
                value = String(value);
                break;
            case 'number': {
                const num = Number(value);
                value = isNaN(num) ? value : num;
                break;
            }
            case 'boolean':
                if (typeof value === 'string') {
                    value = value.toLowerCase() === 'true' || value === '1';
                } else {
                    value = Boolean(value);
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    value = [value];
                }
                break;
        }
    }

    return value;
}

/**
 * Normalize entity data using entity configuration
 */
export function normalizeEntity(sourceData: Record<string, unknown>, entityConfig: EntityConfig): NormalizedEntity {
    const fields: Record<string, unknown> = {};

    // Apply field mappings
    for (const [targetField, mapping] of Object.entries(entityConfig.fields)) {
        const value = applyFieldMapping(sourceData, mapping);

        // Skip undefined values
        if (value !== undefined) {
            fields[targetField] = value;
        }
    }

    // Extract metadata fields if configured
    let metadata: Record<string, string> | undefined;
    if (entityConfig.metadata) {
        metadata = {};
        for (const [metaKey, metaSourcePath] of Object.entries(entityConfig.metadata)) {
            const value = getNestedValue(sourceData, metaSourcePath);
            if (value !== undefined && value !== null) {
                metadata[metaKey] = String(value);
            }
        }
    }

    // Extract SOR ID
    const sorId = String(getNestedValue(sourceData, entityConfig.sorIdField));

    return {
        entityType: entityConfig.sourceType,
        sorSystem: entityConfig.sorSystem,
        sorId,
        fields,
        metadata,
    };
}
