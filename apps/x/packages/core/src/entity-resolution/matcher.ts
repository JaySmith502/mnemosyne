import type { LanguageModelV2 } from '@ai-sdk/provider';
import { EntityIndex } from './entity-index.js';
import type { EntityIndexEntry, MatchResult } from './types.js';
import { tier1Match } from './tier1-deterministic.js';
import { tier2Match, FUZZY_HIGH_CONFIDENCE } from './tier2-fuzzy.js';
import { tier3LLMMatch } from './tier3-llm.js';
import { persistMatchAsAlias } from './alias-manager.js';

/**
 * 3-tier entity resolution orchestrator
 * Cascades through Tier 1 (deterministic) -> Tier 2 (fuzzy) -> Tier 3 (LLM)
 * Stops at first confident match
 */
export async function resolveEntity(
    candidate: {
        name: string;
        email?: string;
        organization?: string;
        role?: string;
        sorId?: { system: string; id: string };
    },
    entityIndex: EntityIndex,
    options?: {
        getModel?: () => LanguageModelV2;
        skipLLM?: boolean;
    }
): Promise<MatchResult | null> {
    // Tier 1: Deterministic matching (SOR ID, email)
    const tier1Result = tier1Match(candidate, entityIndex);
    if (tier1Result) {
        return tier1Result;
    }

    // Tier 2: Fuzzy matching (name similarity, phonetic, org)
    const tier2Results = tier2Match(candidate, entityIndex);

    // No fuzzy candidates found
    if (tier2Results.length === 0) {
        return null; // New entity
    }

    // Top fuzzy candidate has high confidence - accept without LLM
    const topCandidate = tier2Results[0];
    if (topCandidate.confidence >= FUZZY_HIGH_CONFIDENCE) {
        return {
            entity: topCandidate.entity,
            confidence: topCandidate.confidence,
            tier: '2',
            signals: topCandidate.signals,
        };
    }

    // Tier 3: LLM escalation for ambiguous cases
    // Graceful degradation if LLM unavailable
    if (options?.skipLLM || !options?.getModel) {
        return null; // Caller can decide to create new entity
    }

    const tier3Result = await tier3LLMMatch(
        candidate,
        tier2Results,
        options.getModel
    );

    // LLM confirmed match - persist as alias for future Tier 1 resolution
    if (tier3Result) {
        persistMatchAsAlias(
            entityIndex,
            tier3Result.entity.entityId,
            candidate,
            tier3Result.confidence
        );
    }

    return tier3Result;
}

/**
 * Resolve entity or create new one
 * Convenience wrapper that always returns an entity
 */
export async function resolveOrCreate(
    candidate: {
        name: string;
        email?: string;
        organization?: string;
        role?: string;
        sorId?: { system: string; id: string };
    },
    entityIndex: EntityIndex,
    options?: {
        getModel?: () => LanguageModelV2;
        skipLLM?: boolean;
    }
): Promise<{
    entity: EntityIndexEntry;
    isNew: boolean;
    matchResult: MatchResult | null;
}> {
    // Try to resolve existing entity
    const matchResult = await resolveEntity(candidate, entityIndex, options);

    if (matchResult) {
        return {
            entity: matchResult.entity,
            isNew: false,
            matchResult,
        };
    }

    // No match - create new entity
    const newEntity = entityIndex.addEntity({
        name: candidate.name,
        email: candidate.email,
        organization: candidate.organization,
        role: candidate.role,
        sorRefs: candidate.sorId ? [candidate.sorId] : [],
        aliases: [],
        confidence: 1.0, // New entity from SOR, high confidence
        sources: [],
    });

    entityIndex.save();

    return {
        entity: newEntity,
        isNew: true,
        matchResult: null,
    };
}
