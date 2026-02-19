import { distance } from 'fastest-levenshtein';
import { metaphone } from 'metaphone';
import { normalizeEmail, normalizeName } from './types.js';
import { EntityIndex } from './entity-index.js';
import type { EntityIndexEntry, MatchSignal } from './types.js';
import { createSignal, calculateConfidence } from './confidence-scorer.js';

/**
 * Fuzzy matching threshold constants
 */
export const FUZZY_MIN_NAME_SIMILARITY = 0.5; // Below this, don't even consider
export const FUZZY_HIGH_CONFIDENCE = 0.85; // Above this, matcher auto-accepts without LLM
export const FUZZY_LOW_CONFIDENCE = 0.70; // Below this, not a candidate at all
export const FUZZY_MAX_CANDIDATES = 5; // Max candidates to return

/**
 * Fuzzy match candidate result
 */
export interface FuzzyMatchCandidate {
    entity: EntityIndexEntry;
    confidence: number;
    signals: MatchSignal[];
}

/**
 * Calculate name similarity using Levenshtein distance
 * Returns normalized score between 0 and 1
 */
function calculateNameSimilarity(name1: string, name2: string): number {
    const normalized1 = normalizeName(name1);
    const normalized2 = normalizeName(name2);

    // Exact match after normalization
    if (normalized1 === normalized2) {
        return 1.0;
    }

    // Calculate Levenshtein distance
    const maxLen = Math.max(normalized1.length, normalized2.length);
    if (maxLen === 0) {
        return 0;
    }

    const dist = distance(normalized1, normalized2);
    return 1 - dist / maxLen;
}

/**
 * Calculate phonetic similarity using metaphone encoding
 * Returns 1.0 if phonetic codes match, 0.0 otherwise
 */
function calculatePhoneticSimilarity(name1: string, name2: string): number {
    try {
        // Metaphone encoding
        const code1 = metaphone(name1);
        const code2 = metaphone(name2);

        // Exact match on phonetic codes
        return code1 === code2 ? 1.0 : 0.0;
    } catch (error) {
        // If metaphone fails, return 0
        console.error('Metaphone encoding error:', error);
        return 0.0;
    }
}

/**
 * Check if entity's organization matches candidate
 * Returns true if match found
 */
function organizationMatches(
    entity: EntityIndexEntry,
    candidateOrg: string
): boolean {
    const normalizedCandidateOrg = candidateOrg.toLowerCase().trim();

    // Check entity's organization field
    if (entity.organization) {
        const normalizedEntityOrg = entity.organization.toLowerCase().trim();
        if (normalizedEntityOrg === normalizedCandidateOrg) {
            return true;
        }
    }

    // Check if any sorRef system contains the candidate organization
    for (const sorRef of entity.sorRefs) {
        const systemLower = sorRef.system.toLowerCase();
        if (
            systemLower === normalizedCandidateOrg ||
            systemLower.includes(normalizedCandidateOrg)
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Tier 2 fuzzy matching (ERES-03)
 * Matches by name similarity (Levenshtein + phonetic) and organization
 * Returns sorted array of candidates with confidence >= FUZZY_LOW_CONFIDENCE
 */
export function tier2Match(
    candidate: {
        name: string;
        email?: string;
        organization?: string;
    },
    entityIndex: EntityIndex
): FuzzyMatchCandidate[] {
    const candidates: FuzzyMatchCandidate[] = [];

    // Iterate through all entities in the index
    for (const entity of entityIndex.getAll()) {
        const signals: MatchSignal[] = [];

        // Calculate name similarity
        const nameSimilarity = calculateNameSimilarity(
            candidate.name,
            entity.name
        );

        // Skip entity if name similarity is too low
        if (nameSimilarity < FUZZY_MIN_NAME_SIMILARITY) {
            continue;
        }

        // Add name signal (exact or fuzzy)
        if (nameSimilarity === 1.0) {
            signals.push(createSignal('name_exact', nameSimilarity));
        } else {
            signals.push(createSignal('name_fuzzy', nameSimilarity));
        }

        // Add phonetic signal if names sound similar
        const phoneticSimilarity = calculatePhoneticSimilarity(
            candidate.name,
            entity.name
        );
        if (phoneticSimilarity === 1.0) {
            signals.push(
                createSignal('name_phonetic', phoneticSimilarity, 'metaphone')
            );
        }

        // Add organization signal if available
        if (candidate.organization && organizationMatches(entity, candidate.organization)) {
            signals.push(
                createSignal('org_domain', 1.0, candidate.organization)
            );
        }

        // Calculate weighted confidence
        const confidence = calculateConfidence(signals);

        // Only include candidates above low confidence threshold
        if (confidence >= FUZZY_LOW_CONFIDENCE) {
            candidates.push({
                entity,
                confidence,
                signals,
            });
        }
    }

    // Sort by descending confidence and limit to max candidates
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, FUZZY_MAX_CANDIDATES);
}
