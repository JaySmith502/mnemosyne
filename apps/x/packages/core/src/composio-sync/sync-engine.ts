import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';
import { loadNormalizerConfig, normalizeEntity } from './normalizer.js';
import { CheckpointManager } from './checkpoint.js';
import { RetryableOperation } from './retry.js';
import { writeEntityFile, writeManifest } from './writer.js';
import type { NormalizerConfig, SyncManifest, NormalizedEntity } from './types.js';
import { EntityIndex, resolveOrCreate } from '../entity-resolution/index.js';
import { serviceLogger } from '../services/service_logger.js';
import { GHLConnector } from './connectors/gohighlevel.js';

/**
 * Sync engine orchestrator
 * Wires together: fetch -> normalize -> resolve -> write -> checkpoint
 */

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Fixed 5-minute interval
const CONNECTOR_CONFIG_DIR = path.join(WorkDir, 'config', 'connectors');

// Wake signal for immediate sync trigger
let wakeResolve: (() => void) | null = null;

export function triggerSync(): void {
    if (wakeResolve) {
        console.log('[ComposioSync] Triggered - waking up immediately');
        wakeResolve();
        wakeResolve = null;
    }
}

function interruptibleSleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            wakeResolve = null;
            resolve();
        }, ms);
        wakeResolve = () => {
            clearTimeout(timeout);
            resolve();
        };
    });
}

export class SyncEngine {
    /**
     * Get list of configured connectors
     * Scans ~/.rowboat/config/connectors/ for *.json files
     */
    getConfiguredConnectors(): string[] {
        if (!fs.existsSync(CONNECTOR_CONFIG_DIR)) {
            return [];
        }

        const files = fs.readdirSync(CONNECTOR_CONFIG_DIR);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }

    /**
     * Sync a single toolkit
     * Orchestrates: fetch -> normalize -> resolve -> write -> checkpoint
     */
    async syncToolkit(toolkit: string): Promise<void> {
        console.log(`[ComposioSync] Starting sync for toolkit: ${toolkit}`);

        // Load normalizer config
        const config = loadNormalizerConfig(toolkit);

        // Create checkpoint manager
        const checkpoint = new CheckpointManager(toolkit);

        // Create retry utility
        const retry = new RetryableOperation({ maxAttempts: 3, jitter: 'full' });

        // Create entity index
        const entityIndex = new EntityIndex();
        entityIndex.load();

        // Initialize connector based on toolkit
        let connector: GHLConnector | null = null;
        if (toolkit === 'gohighlevel') {
            const connectedAccountId = config.connectionParams?.connectedAccountId;
            const locationId = config.connectionParams?.locationId;

            if (!connectedAccountId || !locationId) {
                throw new Error(
                    `Missing connection params for GoHighLevel: connectedAccountId=${connectedAccountId}, locationId=${locationId}`
                );
            }

            connector = new GHLConnector(connectedAccountId, locationId);
        } else {
            throw new Error(`Unknown toolkit: ${toolkit}`);
        }

        // Start service logger run
        const runCtx = await serviceLogger.startRun({
            service: 'composio_sync',
            message: `Syncing ${toolkit}`,
            trigger: 'timer',
        });
        const runId = runCtx.runId;

        // Initialize manifest
        const manifest: SyncManifest = {
            toolkit,
            syncStartedAt: new Date().toISOString(),
            syncCompletedAt: '',
            entities: {},
            totalFiles: 0,
            consecutiveFailures: 0,
        };

        // Sync each entity type
        for (const [entityType, entityConfig] of Object.entries(config.entities)) {
            console.log(`[ComposioSync] Syncing entity type: ${entityType}`);

            // Get fetcher for this entity type
            const fetcher = connector.getEntityFetcher(entityType);
            if (!fetcher) {
                console.log(`[ComposioSync] No fetcher found for entity type: ${entityType}`);
                continue;
            }

            // Get last sync time from checkpoint
            const entityCheckpoint = checkpoint.get(entityType);
            const since = entityCheckpoint?.lastSyncTime
                ? new Date(entityCheckpoint.lastSyncTime)
                : undefined;

            // Initialize entity counts
            const counts = { fetched: 0, written: 0, errors: 0 };
            manifest.entities[entityType] = counts;

            try {
                // Fetch and process batches
                for await (const batch of fetcher(since)) {
                    console.log(
                        `[ComposioSync] Processing batch of ${batch.length} ${entityType} records`
                    );
                    counts.fetched += batch.length;

                    // Process each record in the batch
                    for (const rawRecord of batch) {
                        try {
                            await retry.execute(async () => {
                                // Normalize entity
                                const normalized = normalizeEntity(rawRecord, entityConfig);

                                // Resolve or create entity via entity resolver
                                const candidate = {
                                    name: String(normalized.fields.name || normalized.sorId),
                                    email: normalized.fields.email
                                        ? String(normalized.fields.email)
                                        : undefined,
                                    organization: normalized.fields.organization
                                        ? String(normalized.fields.organization)
                                        : undefined,
                                    role: normalized.fields.role
                                        ? String(normalized.fields.role)
                                        : undefined,
                                    sorId: {
                                        system: entityConfig.sorSystem,
                                        id: normalized.sorId,
                                    },
                                };

                                const { entity, isNew } = await resolveOrCreate(
                                    candidate,
                                    entityIndex,
                                    { skipLLM: true } // Background processing skips LLM
                                );

                                // SOR wins - update entity with GHL data if it's an existing entity
                                if (!isNew) {
                                    const updates: Record<string, unknown> = {};
                                    let hasUpdates = false;

                                    // Update structured fields if they exist in normalized data
                                    if (normalized.fields.name) {
                                        updates.name = String(normalized.fields.name);
                                        hasUpdates = true;
                                    }
                                    if (normalized.fields.email) {
                                        updates.email = String(normalized.fields.email);
                                        hasUpdates = true;
                                    }
                                    if (normalized.fields.organization) {
                                        updates.organization = String(normalized.fields.organization);
                                        hasUpdates = true;
                                    }
                                    if (normalized.fields.role) {
                                        updates.role = String(normalized.fields.role);
                                        hasUpdates = true;
                                    }

                                    // Ensure SOR ref is present in sorRefs array
                                    const sorRef = {
                                        system: entityConfig.sorSystem,
                                        id: normalized.sorId,
                                    };
                                    const hasSorRef = entity.sorRefs.some(
                                        ref => ref.system === sorRef.system && ref.id === sorRef.id
                                    );
                                    if (!hasSorRef) {
                                        updates.sorRefs = [...entity.sorRefs, sorRef];
                                        hasUpdates = true;
                                    }

                                    // Apply updates if any
                                    if (hasUpdates) {
                                        entityIndex.updateEntity(entity.entityId, updates);
                                    }
                                }

                                // Write entity file
                                writeEntityFile(toolkit, normalized);
                                counts.written++;
                            });
                        } catch (error) {
                            console.error(
                                `[ComposioSync] Error processing ${entityType} record:`,
                                error
                            );
                            counts.errors++;
                            // Continue processing other records (don't abort entire sync)
                        }
                    }

                    // Checkpoint after each batch
                    checkpoint.recordSuccess(entityType);
                    console.log(
                        `[ComposioSync] Checkpointed ${entityType} - fetched: ${counts.fetched}, written: ${counts.written}, errors: ${counts.errors}`
                    );
                }

                console.log(
                    `[ComposioSync] Completed ${entityType} - fetched: ${counts.fetched}, written: ${counts.written}, errors: ${counts.errors}`
                );
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[ComposioSync] Error syncing ${entityType}:`, errorMessage);
                checkpoint.recordFailure(entityType, errorMessage);
                counts.errors++;

                // Check if we should surface this error (3+ consecutive failures)
                if (checkpoint.shouldSurface(entityType)) {
                    await serviceLogger.log({
                        type: 'error',
                        runId,
                        service: 'composio_sync',
                        level: 'error',
                        message: `Failed to sync ${entityType}`,
                        error: errorMessage,
                        context: {
                            toolkit,
                            entityType,
                            consecutiveFailures: checkpoint.get(entityType)?.consecutiveFailures || 0,
                        },
                    });
                }
            }
        }

        // Save entity index after all entity types processed
        entityIndex.save();

        // Finalize manifest
        manifest.syncCompletedAt = new Date().toISOString();
        manifest.totalFiles = Object.values(manifest.entities).reduce(
            (sum, counts) => sum + counts.written,
            0
        );
        writeManifest(toolkit, manifest);

        // Complete service logger run
        const durationMs = Date.now() - new Date(manifest.syncStartedAt).getTime();
        await serviceLogger.log({
            type: 'run_complete',
            runId,
            service: 'composio_sync',
            level: 'info',
            message: `Completed sync for ${toolkit}`,
            durationMs,
            outcome: 'ok',
            summary: {
                toolkit,
                totalFiles: manifest.totalFiles,
                entities: Object.keys(manifest.entities).length,
            },
        });

        console.log(`[ComposioSync] Completed sync for toolkit: ${toolkit}`);
    }

    /**
     * Run sync once for all configured connectors
     */
    async runOnce(): Promise<void> {
        const connectors = this.getConfiguredConnectors();

        if (connectors.length === 0) {
            console.log('[ComposioSync] No connectors configured');
            return;
        }

        console.log(`[ComposioSync] Found ${connectors.length} configured connectors: ${connectors.join(', ')}`);

        // Sync each connector (one failure doesn't block others)
        for (const toolkit of connectors) {
            try {
                await this.syncToolkit(toolkit);
            } catch (error) {
                console.error(`[ComposioSync] Failed to sync toolkit ${toolkit}:`, error);
                // Continue to next toolkit
            }
        }
    }
}

/**
 * Initialize sync service
 * Auto-starts on app launch if connectors are configured
 * Runs on 5-minute interval with interruptible sleep
 */
export async function init(): Promise<void> {
    console.log('[ComposioSync] Starting sync service...');

    const engine = new SyncEngine();

    // Main loop
    while (true) {
        try {
            await engine.runOnce();
        } catch (error) {
            console.error('[ComposioSync] Error in sync cycle:', error);
        }

        // Interruptible sleep
        await interruptibleSleep(SYNC_INTERVAL_MS);
    }
}
