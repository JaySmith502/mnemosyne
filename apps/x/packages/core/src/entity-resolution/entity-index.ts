import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WorkDir } from '../config/config.js';
import {
    EntityIndexSchema,
    EntityIndexEntry,
    EntityIndexEntrySchema,
    normalizeEmail,
    type EntityIndex as EntityIndexType,
} from './types.js';

/**
 * Entity index with JSON persistence and O(1) in-memory lookups
 * Canonical store for entity resolution
 */
export class EntityIndex {
    private indexPath: string;
    private entities: EntityIndexEntry[] = [];
    private emailMap: Map<string, EntityIndexEntry> = new Map();
    private sorIdMap: Map<string, EntityIndexEntry> = new Map();
    private idMap: Map<string, EntityIndexEntry> = new Map();

    constructor(indexPath?: string) {
        this.indexPath = indexPath ?? path.join(WorkDir, 'entity_index.json');
    }

    /**
     * Load index from disk, validate, and build lookup maps
     * Initializes empty index if file doesn't exist
     */
    load(): void {
        if (fs.existsSync(this.indexPath)) {
            try {
                const content = fs.readFileSync(this.indexPath, 'utf-8');
                const data = JSON.parse(content);
                const validated = EntityIndexSchema.parse(data);
                this.entities = validated.entities;
                this.rebuildMaps();
            } catch (error) {
                console.error('Error loading entity index:', error);
                // Initialize empty index on error
                this.entities = [];
                this.rebuildMaps();
            }
        } else {
            // File doesn't exist - initialize empty
            this.entities = [];
            this.rebuildMaps();
        }
    }

    /**
     * Save current state to disk as pretty JSON
     */
    save(): void {
        try {
            const data: EntityIndexType = {
                version: 1,
                entities: this.entities,
                buildTime: new Date().toISOString(),
            };
            fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving entity index:', error);
            throw error;
        }
    }

    /**
     * Get all entities
     */
    getAll(): EntityIndexEntry[] {
        return [...this.entities];
    }

    /**
     * Find entity by email (O(1) lookup)
     * Normalizes email and checks both primary email and email_variant aliases
     */
    findByEmail(email: string): EntityIndexEntry | undefined {
        const normalized = normalizeEmail(email);
        return this.emailMap.get(normalized);
    }

    /**
     * Find entity by SOR ID (O(1) lookup)
     * Checks both sorRefs and sor_id aliases
     */
    findBySorId(system: string, id: string): EntityIndexEntry | undefined {
        const key = `${system}:${id}`;
        return this.sorIdMap.get(key);
    }

    /**
     * Find entity by UUID (O(1) lookup)
     */
    findById(entityId: string): EntityIndexEntry | undefined {
        return this.idMap.get(entityId);
    }

    /**
     * Add new entity to index
     * Generates UUID, sets lastUpdated, rebuilds maps
     */
    addEntity(
        entry: Omit<EntityIndexEntry, 'entityId' | 'lastUpdated'>
    ): EntityIndexEntry {
        const newEntity: EntityIndexEntry = {
            ...entry,
            entityId: crypto.randomUUID(),
            lastUpdated: new Date().toISOString(),
        };

        // Validate before adding
        EntityIndexEntrySchema.parse(newEntity);

        this.entities.push(newEntity);
        this.rebuildMaps();

        return newEntity;
    }

    /**
     * Update existing entity
     * Merges updates, sets lastUpdated, rebuilds maps
     */
    updateEntity(
        entityId: string,
        updates: Partial<Omit<EntityIndexEntry, 'entityId'>>
    ): EntityIndexEntry {
        const index = this.entities.findIndex(e => e.entityId === entityId);
        if (index === -1) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const updated: EntityIndexEntry = {
            ...this.entities[index],
            ...updates,
            entityId, // Preserve entityId
            lastUpdated: new Date().toISOString(),
        };

        // Validate before updating
        EntityIndexEntrySchema.parse(updated);

        this.entities[index] = updated;
        this.rebuildMaps();

        return updated;
    }

    /**
     * Rebuild in-memory lookup maps
     * Called after load, addEntity, updateEntity
     */
    private rebuildMaps(): void {
        this.emailMap.clear();
        this.sorIdMap.clear();
        this.idMap.clear();

        for (const entity of this.entities) {
            // Index by entity ID
            this.idMap.set(entity.entityId, entity);

            // Index by primary email
            if (entity.email) {
                const normalized = normalizeEmail(entity.email);
                this.emailMap.set(normalized, entity);
            }

            // Index by email_variant aliases
            for (const alias of entity.aliases) {
                if (alias.type === 'email_variant') {
                    const normalized = normalizeEmail(alias.value);
                    this.emailMap.set(normalized, entity);
                }
            }

            // Index by sorRefs
            for (const sorRef of entity.sorRefs) {
                const key = `${sorRef.system}:${sorRef.id}`;
                this.sorIdMap.set(key, entity);
            }

            // Index by sor_id aliases
            for (const alias of entity.aliases) {
                if (alias.type === 'sor_id') {
                    // Alias value format: "system:id"
                    this.sorIdMap.set(alias.value, entity);
                }
            }
        }
    }
}
