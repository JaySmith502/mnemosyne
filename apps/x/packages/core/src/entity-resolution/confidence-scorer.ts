import { MatchSignal } from './types.js';

/**
 * Signal weights for confidence scoring (ERES-06)
 */
export const SIGNAL_WEIGHTS: Record<string, number> = {
    email: 1.0,
    sorId: 1.0,
    name_exact: 0.9,
    name_fuzzy: 0.7,
    name_phonetic: 0.6,
    org_domain: 0.6,
    llm: 0.9,
};

/**
 * Calculate weighted confidence score from match signals
 * Returns weighted average: sum(score * weight) / sum(weight)
 * Returns 0 if no signals
 */
export function calculateConfidence(signals: MatchSignal[]): number {
    if (signals.length === 0) {
        return 0;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
        weightedSum += signal.score * signal.weight;
        totalWeight += signal.weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Create a match signal with auto-filled weight from SIGNAL_WEIGHTS
 */
export function createSignal(
    field: MatchSignal['field'],
    score: number,
    detail?: string
): MatchSignal {
    return {
        field,
        score,
        weight: SIGNAL_WEIGHTS[field] ?? 0.5,
        detail,
    };
}
