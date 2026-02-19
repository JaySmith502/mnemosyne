// Barrel export for entity resolution module

// Types
export * from './types.js';

// Entity index
export { EntityIndex } from './entity-index.js';

// Tier 1 matching
export { tier1Match } from './tier1-deterministic.js';

// Tier 2 fuzzy matching
export {
    tier2Match,
    FUZZY_HIGH_CONFIDENCE,
    FUZZY_LOW_CONFIDENCE,
    FUZZY_MIN_NAME_SIMILARITY,
    FUZZY_MAX_CANDIDATES,
} from './tier2-fuzzy.js';
export type { FuzzyMatchCandidate } from './tier2-fuzzy.js';

// Tier 3 LLM matching
export { tier3LLMMatch } from './tier3-llm.js';

// Alias management
export { persistMatchAsAlias, ALIAS_PERSIST_THRESHOLD } from './alias-manager.js';

// Matcher orchestrator (main public API)
export { resolveEntity, resolveOrCreate } from './matcher.js';

// Confidence scoring
export { calculateConfidence, SIGNAL_WEIGHTS, createSignal } from './confidence-scorer.js';
