import { generateObject } from 'ai';
import { z } from 'zod';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import type { EntityIndexEntry, MatchSignal, MatchResult } from './types.js';
import type { FuzzyMatchCandidate } from './tier2-fuzzy.js';
import { createSignal, calculateConfidence } from './confidence-scorer.js';

/**
 * LLM decision schema (internal to this module)
 */
const MatchDecisionSchema = z.object({
    decision: z.enum(['same_entity', 'different_entity', 'uncertain']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    keyFactors: z.array(z.string()),
});

/**
 * Build comparison prompt for LLM
 */
function buildComparisonPrompt(
    candidate: {
        name: string;
        email?: string;
        organization?: string;
        role?: string;
    },
    existingEntity: EntityIndexEntry,
    fuzzyConfidence: number,
    signals: MatchSignal[]
): string {
    const signalsSummary = signals
        .map((s) => `- ${s.field}: ${s.score.toFixed(2)} (weight: ${s.weight})${s.detail ? ` - ${s.detail}` : ''}`)
        .join('\n');

    return `You are an expert entity resolution system. Your task is to determine if two records represent the same person.

**Candidate Record:**
- Name: ${candidate.name}
- Email: ${candidate.email || 'N/A'}
- Organization: ${candidate.organization || 'N/A'}
- Role: ${candidate.role || 'N/A'}

**Existing Entity:**
- Name: ${existingEntity.name}
- Email: ${existingEntity.email || 'N/A'}
- Organization: ${existingEntity.organization || 'N/A'}
- Role: ${existingEntity.role || 'N/A'}

**Fuzzy Matching Signals (Confidence: ${fuzzyConfidence.toFixed(2)}):**
${signalsSummary}

**Instructions:**
1. Compare the records carefully. Consider:
   - Are the names referring to the same person? (Consider nicknames, middle names, maiden names, typos)
   - Do emails align? (Different emails can belong to the same person)
   - Do organizations align? (People change jobs)
   - Do roles align? (People get promoted or change roles)

2. Be **conservative**. If you're uncertain, say 'uncertain'. Do not guess.

3. Return your decision as 'same_entity', 'different_entity', or 'uncertain'.

4. Provide confidence score (0-1) and clear reasoning.

5. List key factors that influenced your decision.`;
}

/**
 * Tier 3 LLM matching (ERES-04)
 * Uses structured LLM output to resolve ambiguous fuzzy matches
 * Returns match result if LLM confirms, null if different/uncertain
 */
export async function tier3LLMMatch(
    candidate: {
        name: string;
        email?: string;
        organization?: string;
        role?: string;
    },
    topCandidates: FuzzyMatchCandidate[],
    getModel: () => LanguageModelV2
): Promise<MatchResult | null> {
    // No candidates to compare
    if (topCandidates.length === 0) {
        return null;
    }

    // Take the top candidate (highest fuzzy confidence)
    const topCandidate = topCandidates[0];

    try {
        // Build comparison prompt
        const prompt = buildComparisonPrompt(
            candidate,
            topCandidate.entity,
            topCandidate.confidence,
            topCandidate.signals
        );

        // Call LLM with structured output
        const { object: decision } = await generateObject({
            model: getModel(),
            schema: MatchDecisionSchema,
            prompt,
        });

        // Process LLM decision
        if (decision.decision === 'same_entity') {
            // LLM confirms it's the same entity
            // Build match result with LLM signal
            const llmSignal = createSignal(
                'llm',
                decision.confidence,
                decision.reasoning
            );

            const allSignals = [...topCandidate.signals, llmSignal];
            const finalConfidence = calculateConfidence(allSignals);

            return {
                entity: topCandidate.entity,
                confidence: finalConfidence,
                tier: '3',
                signals: allSignals,
                reasoning: `LLM confirmed match: ${decision.reasoning}. Key factors: ${decision.keyFactors.join(', ')}`,
            };
        } else if (decision.decision === 'different_entity') {
            // LLM says different entity
            return null;
        } else {
            // LLM is uncertain - conservative approach, don't merge
            return null;
        }
    } catch (error) {
        // LLM failure (network, malformed output, etc.)
        // Return null rather than crashing - graceful degradation
        console.error('LLM matching error:', error);
        return null;
    }
}
