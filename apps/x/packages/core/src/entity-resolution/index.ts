// Barrel export for entity resolution module

// Types
export * from './types.js';

// Entity index
export { EntityIndex } from './entity-index.js';

// Tier 1 matching
export { tier1Match } from './tier1-deterministic.js';

// Confidence scoring
export { calculateConfidence, SIGNAL_WEIGHTS, createSignal } from './confidence-scorer.js';
