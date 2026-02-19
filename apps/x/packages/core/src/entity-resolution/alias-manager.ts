import { EntityIndex } from './entity-index.js';
import type { EntityAlias, SorRef } from './types.js';
import { normalizeEmail, normalizeName } from './types.js';

/**
 * Alias persistence threshold (ERES-05)
 * Only persist aliases if confidence >= this threshold
 * Conservative to prevent hallucination persistence
 */
export const ALIAS_PERSIST_THRESHOLD = 0.85;

/**
 * Persist LLM-confirmed match as aliases on the canonical entity (ERES-05)
 * Adds name variants, email variants, and SOR IDs as aliases
 * Only persists if confidence >= ALIAS_PERSIST_THRESHOLD
 */
export function persistMatchAsAlias(
    entityIndex: EntityIndex,
    matchedEntityId: string,
    candidate: {
        name?: string;
        email?: string;
        sorId?: { system: string; id: string };
    },
    confidence: number
): void {
    // Only persist if confidence is high enough (prevent hallucination)
    if (confidence < ALIAS_PERSIST_THRESHOLD) {
        return;
    }

    // Find the matched entity
    const entity = entityIndex.findById(matchedEntityId);
    if (!entity) {
        throw new Error(`Entity ${matchedEntityId} not found`);
    }

    const updates: {
        aliases?: EntityAlias[];
        sorRefs?: SorRef[];
    } = {};

    // Prepare updated aliases array
    const newAliases = [...entity.aliases];
    let aliasesChanged = false;

    // Add name variant if different from entity's name
    if (candidate.name) {
        const normalizedCandidate = normalizeName(candidate.name);
        const normalizedEntity = normalizeName(entity.name);

        if (normalizedCandidate !== normalizedEntity) {
            // Check if this alias already exists
            const aliasExists = newAliases.some(
                (alias) =>
                    alias.type === 'name_variant' &&
                    normalizeName(alias.value) === normalizedCandidate
            );

            if (!aliasExists) {
                newAliases.push({
                    type: 'name_variant',
                    value: candidate.name,
                    confirmedBy: 'llm',
                    confirmedAt: new Date().toISOString(),
                    confidence,
                });
                aliasesChanged = true;
            }
        }
    }

    // Add email variant if different from entity's primary email
    if (candidate.email) {
        const normalizedCandidate = normalizeEmail(candidate.email);
        const normalizedEntity = entity.email
            ? normalizeEmail(entity.email)
            : null;

        if (normalizedCandidate !== normalizedEntity) {
            // Check if this alias already exists
            const aliasExists = newAliases.some(
                (alias) =>
                    alias.type === 'email_variant' &&
                    normalizeEmail(alias.value) === normalizedCandidate
            );

            if (!aliasExists) {
                newAliases.push({
                    type: 'email_variant',
                    value: candidate.email,
                    confirmedBy: 'llm',
                    confirmedAt: new Date().toISOString(),
                    confidence,
                });
                aliasesChanged = true;
            }
        }
    }

    if (aliasesChanged) {
        updates.aliases = newAliases;
    }

    // Add SOR ID if not already in entity's sorRefs
    if (candidate.sorId) {
        const sorRefExists = entity.sorRefs.some(
            (ref) =>
                ref.system === candidate.sorId!.system &&
                ref.id === candidate.sorId!.id
        );

        if (!sorRefExists) {
            const newSorRefs = [
                ...entity.sorRefs,
                {
                    system: candidate.sorId.system,
                    id: candidate.sorId.id,
                },
            ];
            updates.sorRefs = newSorRefs;
        }
    }

    // Apply updates if any changes were made
    if (Object.keys(updates).length > 0) {
        entityIndex.updateEntity(matchedEntityId, updates);
        entityIndex.save();
    }
}
