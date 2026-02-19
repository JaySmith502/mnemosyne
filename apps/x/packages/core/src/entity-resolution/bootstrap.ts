import { buildKnowledgeIndex } from '../knowledge/knowledge_index.js';
import { EntityIndex } from './entity-index.js';
import { resolveOrCreate } from './matcher.js';

/**
 * Bootstrap the entity index from existing knowledge index entries
 *
 * Incrementally indexes people and organizations from knowledge notes.
 * Runs deterministic + fuzzy matching only (skipLLM=true by default).
 * Processes in batches with incremental saves to prevent data loss.
 */
export async function bootstrapEntityIndex(
    entityIndex: EntityIndex,
    options?: { skipLLM?: boolean; batchSize?: number }
): Promise<{ indexed: number; merged: number; skipped: number; newEntities: number }> {
    const skipLLM = options?.skipLLM ?? true; // Default: skip LLM during bootstrap
    const batchSize = options?.batchSize ?? 100; // Default: save every 100 entities

    // Build the knowledge index to get existing people and organizations
    const knowledgeIndex = buildKnowledgeIndex();

    // Initialize counters
    const stats = {
        indexed: 0,
        merged: 0,
        skipped: 0,
        newEntities: 0,
    };

    // Process people in batches
    console.log(`[Bootstrap] Processing ${knowledgeIndex.people.length} people from knowledge index...`);

    for (let i = 0; i < knowledgeIndex.people.length; i++) {
        const person = knowledgeIndex.people[i];

        // Skip if person has no name
        if (!person.name || person.name.trim() === '') {
            stats.skipped++;
            continue;
        }

        // Build candidate from person entry
        const candidate = {
            name: person.name,
            email: person.email,
            organization: person.organization,
            role: person.role,
        };

        try {
            // Try to resolve or create entity
            const result = await resolveOrCreate(candidate, entityIndex, { skipLLM });

            if (result.isNew) {
                // New entity created - add knowledge-specific metadata
                const entity = result.entity;

                // Add knowledge file as SOR reference
                const knowledgeSorRef = { system: 'knowledge', id: person.file };
                if (!entity.sorRefs.some(ref => ref.system === 'knowledge' && ref.id === person.file)) {
                    entity.sorRefs.push(knowledgeSorRef);
                }

                // Add knowledge file to sources
                if (!entity.sources.includes(person.file)) {
                    entity.sources.push(person.file);
                }

                // Add aliases from knowledge entry
                const now = new Date().toISOString();
                for (const alias of person.aliases) {
                    // Check if alias already exists
                    const aliasExists = entity.aliases.some(
                        a => a.type === 'name_variant' && a.value === alias
                    );
                    if (!aliasExists) {
                        entity.aliases.push({
                            type: 'name_variant',
                            value: alias,
                            confirmedBy: 'system',
                            confirmedAt: now,
                            confidence: 0.9,
                        });
                    }
                }

                // Update the entity with new metadata
                entityIndex.updateEntity(entity.entityId, {
                    sorRefs: entity.sorRefs,
                    sources: entity.sources,
                    aliases: entity.aliases,
                });

                stats.newEntities++;
            } else {
                // Merged with existing entity - update metadata
                const entity = result.entity;

                // Add knowledge file as SOR reference if not present
                const knowledgeSorRef = { system: 'knowledge', id: person.file };
                const sorRefExists = entity.sorRefs.some(
                    ref => ref.system === 'knowledge' && ref.id === person.file
                );
                if (!sorRefExists) {
                    entity.sorRefs.push(knowledgeSorRef);
                }

                // Add knowledge file to sources if not present
                if (!entity.sources.includes(person.file)) {
                    entity.sources.push(person.file);
                }

                // Add new aliases from knowledge entry
                const now = new Date().toISOString();
                for (const alias of person.aliases) {
                    const aliasExists = entity.aliases.some(
                        a => a.type === 'name_variant' && a.value === alias
                    );
                    if (!aliasExists) {
                        entity.aliases.push({
                            type: 'name_variant',
                            value: alias,
                            confirmedBy: 'system',
                            confirmedAt: now,
                            confidence: 0.9,
                        });
                    }
                }

                // Update the entity
                entityIndex.updateEntity(entity.entityId, {
                    sorRefs: entity.sorRefs,
                    sources: entity.sources,
                    aliases: entity.aliases,
                });

                stats.merged++;
            }

            stats.indexed++;

            // Save after each batch to prevent data loss
            if (stats.indexed % batchSize === 0) {
                entityIndex.save();
                console.log(`[Bootstrap] Progress: ${stats.indexed}/${knowledgeIndex.people.length} people processed`);
            }
        } catch (error) {
            console.error(`[Bootstrap] Error processing person ${person.name}:`, error);
            stats.skipped++;
        }
    }

    // Save after people processing
    entityIndex.save();
    console.log(`[Bootstrap] People complete: ${stats.indexed} indexed, ${stats.newEntities} new, ${stats.merged} merged, ${stats.skipped} skipped`);

    // Process organizations in batches
    console.log(`[Bootstrap] Processing ${knowledgeIndex.organizations.length} organizations from knowledge index...`);

    const orgStartIndex = stats.indexed;
    for (let i = 0; i < knowledgeIndex.organizations.length; i++) {
        const org = knowledgeIndex.organizations[i];

        // Skip if no name
        if (!org.name || org.name.trim() === '') {
            stats.skipped++;
            continue;
        }

        // Build candidate from organization entry
        // Note: Organizations typically don't have email, but may have domain
        const candidate = {
            name: org.name,
            organization: org.name, // Self-reference for organizations
        };

        try {
            // Try to resolve or create entity
            const result = await resolveOrCreate(candidate, entityIndex, { skipLLM });

            if (result.isNew) {
                // New entity created - add knowledge-specific metadata
                const entity = result.entity;

                // Add knowledge file as SOR reference
                const knowledgeSorRef = { system: 'knowledge', id: org.file };
                if (!entity.sorRefs.some(ref => ref.system === 'knowledge' && ref.id === org.file)) {
                    entity.sorRefs.push(knowledgeSorRef);
                }

                // Add knowledge file to sources
                if (!entity.sources.includes(org.file)) {
                    entity.sources.push(org.file);
                }

                // Add aliases from knowledge entry
                const now = new Date().toISOString();
                for (const alias of org.aliases) {
                    const aliasExists = entity.aliases.some(
                        a => a.type === 'name_variant' && a.value === alias
                    );
                    if (!aliasExists) {
                        entity.aliases.push({
                            type: 'name_variant',
                            value: alias,
                            confirmedBy: 'system',
                            confirmedAt: now,
                            confidence: 0.9,
                        });
                    }
                }

                // Update the entity
                entityIndex.updateEntity(entity.entityId, {
                    sorRefs: entity.sorRefs,
                    sources: entity.sources,
                    aliases: entity.aliases,
                });

                stats.newEntities++;
            } else {
                // Merged with existing entity - update metadata
                const entity = result.entity;

                // Add knowledge file as SOR reference if not present
                const knowledgeSorRef = { system: 'knowledge', id: org.file };
                const sorRefExists = entity.sorRefs.some(
                    ref => ref.system === 'knowledge' && ref.id === org.file
                );
                if (!sorRefExists) {
                    entity.sorRefs.push(knowledgeSorRef);
                }

                // Add knowledge file to sources if not present
                if (!entity.sources.includes(org.file)) {
                    entity.sources.push(org.file);
                }

                // Add new aliases
                const now = new Date().toISOString();
                for (const alias of org.aliases) {
                    const aliasExists = entity.aliases.some(
                        a => a.type === 'name_variant' && a.value === alias
                    );
                    if (!aliasExists) {
                        entity.aliases.push({
                            type: 'name_variant',
                            value: alias,
                            confirmedBy: 'system',
                            confirmedAt: now,
                            confidence: 0.9,
                        });
                    }
                }

                // Update the entity
                entityIndex.updateEntity(entity.entityId, {
                    sorRefs: entity.sorRefs,
                    sources: entity.sources,
                    aliases: entity.aliases,
                });

                stats.merged++;
            }

            stats.indexed++;

            // Save after each batch
            if ((stats.indexed - orgStartIndex) % batchSize === 0) {
                entityIndex.save();
                console.log(`[Bootstrap] Progress: ${stats.indexed - orgStartIndex}/${knowledgeIndex.organizations.length} organizations processed`);
            }
        } catch (error) {
            console.error(`[Bootstrap] Error processing organization ${org.name}:`, error);
            stats.skipped++;
        }
    }

    // Final save
    entityIndex.save();
    console.log(`[Bootstrap] Organizations complete: ${stats.indexed - orgStartIndex} indexed`);
    console.log(`[Bootstrap] Total: ${stats.indexed} indexed, ${stats.newEntities} new, ${stats.merged} merged, ${stats.skipped} skipped`);

    return stats;
}
