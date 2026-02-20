import { z } from 'zod';

/**
 * Field mapping configuration for normalizing source data to target fields
 */
export const FieldMappingSchema = z.object({
    source: z.union([z.string(), z.array(z.string())]),
    required: z.boolean().optional(),
    transform: z.enum(['concat', 'lowercase', 'uppercase', 'trim']).optional(),
    separator: z.string().optional(),
    type: z.enum(['string', 'number', 'boolean', 'array']).optional(),
    normalize: z.enum(['lowercase', 'uppercase', 'email']).optional(),
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

/**
 * Entity configuration - defines how one entity type maps from SOR to normalized form
 */
export const EntityConfigSchema = z.object({
    sourceType: z.string(),
    sorSystem: z.string(),
    sorIdField: z.string(),
    fields: z.record(z.string(), FieldMappingSchema),
    metadata: z.record(z.string(), z.string()).optional(),
    dateFilter: z.object({
        field: z.string(),
        lookbackDays: z.number(),
    }).optional(),
});
export type EntityConfig = z.infer<typeof EntityConfigSchema>;

/**
 * Top-level normalizer configuration
 */
export const NormalizerConfigSchema = z.object({
    toolkit: z.string(),
    version: z.literal(1),
    entities: z.record(z.string(), EntityConfigSchema),
    connectionParams: z.record(z.string(), z.string()).optional(),
});
export type NormalizerConfig = z.infer<typeof NormalizerConfigSchema>;

/**
 * Per-entity-type checkpoint state
 */
export const SyncCheckpointSchema = z.object({
    toolkit: z.string(),
    entityType: z.string(),
    lastSyncTime: z.string(),
    cursor: z.string().optional(),
    lastSuccessfulBatch: z.number().optional(),
    consecutiveFailures: z.number(),
    lastError: z.string().optional(),
});
export type SyncCheckpoint = z.infer<typeof SyncCheckpointSchema>;

/**
 * Per-sync-cycle metadata manifest
 */
export const SyncManifestSchema = z.object({
    toolkit: z.string(),
    syncStartedAt: z.string(),
    syncCompletedAt: z.string(),
    entities: z.record(z.string(), z.object({
        fetched: z.number(),
        written: z.number(),
        errors: z.number(),
    })),
    totalFiles: z.number(),
    consecutiveFailures: z.number(),
});
export type SyncManifest = z.infer<typeof SyncManifestSchema>;

/**
 * Normalized entity output
 */
export const NormalizedEntitySchema = z.object({
    entityType: z.string(),
    sorSystem: z.string(),
    sorId: z.string(),
    fields: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.string()).optional(),
});
export type NormalizedEntity = z.infer<typeof NormalizedEntitySchema>;
