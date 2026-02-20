import fs from 'fs';
import path from 'path';
import { WorkDir } from '../config/config.js';
import { SyncCheckpoint, SyncCheckpointSchema } from './types.js';

/**
 * Manages checkpoint state for sync operations with atomic file persistence
 */
export class CheckpointManager {
    private checkpoints: Map<string, SyncCheckpoint> = new Map();
    private filePath: string;

    constructor(private toolkit: string) {
        this.filePath = path.join(WorkDir, 'config', 'sync_checkpoints', `${toolkit}.json`);
        this.load();
    }

    /**
     * Load checkpoint state from disk
     */
    private load(): void {
        if (!fs.existsSync(this.filePath)) {
            return;
        }

        try {
            const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));

            // Validate and populate checkpoints
            if (Array.isArray(data)) {
                for (const entry of data) {
                    const checkpoint = SyncCheckpointSchema.parse(entry);
                    this.checkpoints.set(checkpoint.entityType, checkpoint);
                }
            } else if (typeof data === 'object' && data !== null) {
                // Also support object format with entity types as keys
                for (const [entityType, entry] of Object.entries(data)) {
                    const checkpoint = SyncCheckpointSchema.parse(entry);
                    this.checkpoints.set(entityType, checkpoint);
                }
            }
        } catch (error) {
            console.warn(`[CheckpointManager] Failed to load checkpoints for ${this.toolkit}:`, error);
        }
    }

    /**
     * Save checkpoint state to disk atomically
     */
    private save(): void {
        const dirPath = path.dirname(this.filePath);

        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Convert Map to array for storage
        const checkpointsArray = Array.from(this.checkpoints.values());

        // Write to temp file then rename (atomic)
        const tempPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(checkpointsArray, null, 2), 'utf-8');
        fs.renameSync(tempPath, this.filePath);
    }

    /**
     * Get checkpoint for an entity type
     */
    get(entityType: string): SyncCheckpoint | null {
        return this.checkpoints.get(entityType) || null;
    }

    /**
     * Update checkpoint with partial data
     */
    update(entityType: string, updates: Partial<SyncCheckpoint>): void {
        const existing = this.checkpoints.get(entityType);

        if (existing) {
            // Merge updates
            this.checkpoints.set(entityType, { ...existing, ...updates });
        } else {
            // Create new checkpoint with defaults
            const newCheckpoint: SyncCheckpoint = {
                toolkit: this.toolkit,
                entityType,
                lastSyncTime: new Date(0).toISOString(), // Epoch
                consecutiveFailures: 0,
                ...updates,
            };
            this.checkpoints.set(entityType, newCheckpoint);
        }

        this.save();
    }

    /**
     * Record successful sync
     */
    recordSuccess(entityType: string, cursor?: string): void {
        this.update(entityType, {
            lastSyncTime: new Date().toISOString(),
            consecutiveFailures: 0,
            lastError: undefined,
            cursor,
        });
    }

    /**
     * Record failed sync
     */
    recordFailure(entityType: string, error: string): void {
        const existing = this.checkpoints.get(entityType);
        const consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;

        this.update(entityType, {
            consecutiveFailures,
            lastError: error,
        });
    }

    /**
     * Check if failures should be surfaced to user (3+ consecutive failures)
     */
    shouldSurface(entityType: string): boolean {
        const checkpoint = this.checkpoints.get(entityType);
        return checkpoint ? checkpoint.consecutiveFailures >= 3 : false;
    }
}
