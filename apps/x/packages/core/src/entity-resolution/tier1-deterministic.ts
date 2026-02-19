import { EntityIndex } from './entity-index.js';
import { MatchResult } from './types.js';
import { createSignal, calculateConfidence } from './confidence-scorer.js';

/**
 * Tier 1 deterministic matching (ERES-01, ERES-02)
 * Matches by SOR ID and email without LLM calls
 * Returns match with confidence 1.0 and tier 1
 */
export function tier1Match(
    candidate: {
        email?: string;
        sorId?: { system: string; id: string };
    },
    entityIndex: EntityIndex
): MatchResult | null {
    const signals = [];
    let entity = null;

    // Priority 1: SOR ID (most authoritative)
    if (candidate.sorId) {
        const sorEntity = entityIndex.findBySorId(
            candidate.sorId.system,
            candidate.sorId.id
        );
        if (sorEntity) {
            entity = sorEntity;
            signals.push(
                createSignal(
                    'sorId',
                    1.0,
                    `${candidate.sorId.system}:${candidate.sorId.id}`
                )
            );
        }
    }

    // Priority 2: Email
    if (candidate.email) {
        const emailEntity = entityIndex.findByEmail(candidate.email);
        if (emailEntity) {
            // If we already matched by SOR ID
            if (entity) {
                // Check if it's the same entity
                if (entity.entityId === emailEntity.entityId) {
                    // Same entity - add email signal
                    signals.push(createSignal('email', 1.0, candidate.email));
                } else {
                    // Different entities - SOR ID wins (email can be shared/forwarded)
                    // Keep the SOR ID match
                }
            } else {
                // No SOR ID match - use email match
                entity = emailEntity;
                signals.push(createSignal('email', 1.0, candidate.email));
            }
        }
    }

    // No match found
    if (!entity || signals.length === 0) {
        return null;
    }

    // Return match result
    return {
        entity,
        confidence: calculateConfidence(signals),
        tier: '1',
        signals,
    };
}
