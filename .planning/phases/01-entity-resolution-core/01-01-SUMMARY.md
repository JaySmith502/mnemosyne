---
phase: 01-entity-resolution-core
plan: 01
subsystem: entity-resolution
tags: [foundation, zod-schemas, json-persistence, deterministic-matching, confidence-scoring]
dependency-graph:
  requires: []
  provides:
    - entity-resolution-types
    - entity-index-persistence
    - tier1-deterministic-matching
    - confidence-scoring-engine
  affects:
    - apps/x/packages/core
tech-stack:
  added:
    - Zod schemas for entity resolution types
  patterns:
    - Zod-first type definitions
    - JSON persistence with in-memory caching
    - O(1) lookup maps for performance
key-files:
  created:
    - apps/x/packages/core/src/entity-resolution/types.ts
    - apps/x/packages/core/src/entity-resolution/entity-index.ts
    - apps/x/packages/core/src/entity-resolution/tier1-deterministic.ts
    - apps/x/packages/core/src/entity-resolution/confidence-scorer.ts
    - apps/x/packages/core/src/entity-resolution/index.ts
  modified:
    - apps/x/packages/shared/package.json
    - apps/x/packages/core/package.json
    - apps/x/apps/preload/package.json
    - apps/x/pnpm-lock.yaml
decisions:
  - title: Use Zod schemas as single source of truth
    rationale: Follows project CLAUDE.md pattern, ensures runtime validation matches compile-time types
    alternatives: Manual TypeScript interfaces (rejected - duplication risk)
  - title: Email normalization includes Gmail dot-stripping
    rationale: Gmail treats dots in local part as equivalent (john.smith@gmail == johnsmith@gmail)
    alternatives: Minimal normalization (rejected - would miss Gmail duplicates)
  - title: SOR ID takes priority over email in tier1Match
    rationale: SOR IDs are authoritative, emails can be shared/forwarded
    alternatives: Email priority (rejected - less reliable)
metrics:
  duration: 8
  tasks-completed: 2
  commits: 3
  files-created: 5
  files-modified: 4
  completed: 2026-02-19T19:37:22Z
---

# Phase 01 Plan 01: Entity Resolution Foundation Summary

**One-liner:** Zod-based type system with JSON-persisted entity index, O(1) deterministic matching by email/SOR ID, and weighted confidence scoring with signal tracking.

## What Was Built

Created the foundational infrastructure for entity resolution:

1. **Type System (types.ts)** - Zod schemas defining the entity resolution data model:
   - `SorRef`: System of Record references (e.g., `gohighlevel:contact:abc123`)
   - `EntityAlias`: Name/email/SOR ID variants with confirmation tracking
   - `MatchSignal`: Explainable match signals with field, score, weight, detail
   - `EntityIndexEntry`: Canonical entity with name, email, org, role, SOR refs, aliases, confidence
   - `MatchResult`: Tier-tagged match with entity, confidence, signals, reasoning
   - `EntityIndex`: Versioned index schema for migration support

2. **Email & Name Normalization** - Pure utility functions:
   - Gmail dot-stripping (john.smith@gmail.com → johnsmith@gmail.com)
   - Plus-addressing removal (user+tag@example.com → user@example.com)
   - Case folding
   - Token-sorted name matching (John Smith == Smith John)

3. **Entity Index (entity-index.ts)** - Canonical entity store:
   - JSON persistence to `~/.rowboat/entity_index.json`
   - In-memory lookup maps rebuilt on load/mutation:
     - `emailMap`: Normalized email → entity (includes primary + email_variant aliases)
     - `sorIdMap`: `system:id` → entity (includes sorRefs + sor_id aliases)
     - `idMap`: entityId (UUID) → entity
   - CRUD operations: `addEntity`, `updateEntity`, `findByEmail`, `findBySorId`, `findById`
   - Zod validation on all mutations

4. **Tier 1 Deterministic Matching (tier1-deterministic.ts)** - No LLM matching:
   - Lookup by SOR ID (highest priority - ERES-01)
   - Lookup by normalized email (ERES-02)
   - Handles both primary fields and aliases (ERES-07)
   - Returns `MatchResult` with confidence 1.0, tier 1, signals
   - SOR ID wins if both match different entities (email can be shared)

5. **Confidence Scoring Engine (confidence-scorer.ts)** - Explainability infrastructure:
   - `SIGNAL_WEIGHTS`: email/sorId=1.0, name_exact=0.9, name_fuzzy=0.7, name_phonetic=0.6, org_domain=0.6, llm=0.9
   - `calculateConfidence`: Weighted average = sum(score × weight) / sum(weight)
   - `createSignal`: Helper that auto-fills weight from `SIGNAL_WEIGHTS`
   - Supports per-signal detail for debugging (ERES-06)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Missing rimraf dependency prevented builds**
- **Found during:** Task 1 verification (`npm run deps`)
- **Issue:** Build scripts use `rimraf dist && tsc` but rimraf wasn't installed in shared, core, or preload packages
- **Fix:** Added rimraf as devDependency to all three packages via pnpm
- **Files modified:** `apps/x/packages/shared/package.json`, `apps/x/packages/core/package.json`, `apps/x/apps/preload/package.json`, `apps/x/pnpm-lock.yaml`
- **Commit:** 974f506
- **Justification:** Build was completely blocked - couldn't verify Task 1 completion without this fix. Pre-existing issue, not introduced by plan changes.

No other deviations. Plan executed exactly as written.

## Verification Results

All success criteria met:

- ✅ Entity index loads/saves JSON at `~/.rowboat/entity_index.json`
- ✅ tier1Match resolves by SOR ID (ERES-01) and email (ERES-02) without LLM calls
- ✅ Email aliases on entities matched in Tier 1 (via `emailMap` rebuild)
- ✅ SOR ID aliases on entities matched in Tier 1 (via `sorIdMap` rebuild)
- ✅ Confidence scorer returns weighted scores with per-signal breakdown (ERES-06)
- ✅ All types defined via Zod schemas with inferred TypeScript types
- ✅ Code compiles with `npm run deps` (no TypeScript errors)
- ✅ Lint check passes for new files (13 lint errors are all in pre-existing files)

Build output:
```
> x@0.1.0 deps
> npm run shared && npm run core && npm run preload
⚡ Done in 185ms
```

## Requirements Satisfied

- **ERES-01**: Entity lookup by SOR ID (system:id) - `tier1Match` + `findBySorId`
- **ERES-02**: Entity lookup by normalized email - `tier1Match` + `findByEmail` with Gmail normalization
- **ERES-06**: Explainable confidence scores - `MatchSignal` with field/score/weight/detail + `calculateConfidence`
- **ERES-07**: Structured entity storage - `EntityIndexEntry` with name, email, org, role, sorRefs, aliases, sources

## Architecture Notes

**Key Design Decisions:**

1. **Zod schemas as single source of truth** - All TypeScript types inferred from Zod schemas (follows project CLAUDE.md pattern). Runtime validation matches compile-time types.

2. **In-memory lookup maps** - `rebuildMaps()` constructs three Maps after every mutation:
   - Eliminates O(n) array scans
   - Handles aliases transparently (both primary fields and alias arrays indexed)
   - Trade-off: Memory overhead vs. lookup performance (acceptable for expected scale)

3. **SOR ID priority in conflicts** - When candidate has both email and SOR ID matching different entities, SOR ID wins. Rationale: SOR IDs are authoritative identifiers, emails can be shared (support@company.com) or forwarded.

4. **Gmail normalization** - Strip dots from local part, remove plus-addressing, normalize googlemail.com → gmail.com. This prevents duplicate entities for the same Gmail user.

5. **Token-sorted name matching** - `normalizeName` sorts tokens alphabetically so "John Smith" matches "Smith, John" and "Smith John". Supports fuzzy matching in future tiers.

**Integration Points:**

- `WorkDir` imported from `../config/config.js` (provides `~/.rowboat` base path)
- JSON persistence follows pattern from `knowledge/graph_state.ts`
- Zod-first types follow pattern from `packages/shared/src/`

**Performance Characteristics:**

- Load: O(n) read + parse + map rebuild
- Save: O(n) stringify + write
- Lookup: O(1) for email, SOR ID, entity ID
- Add/Update: O(n) for map rebuild (could optimize to O(1) incremental if needed)

## Self-Check

Verifying claimed outputs exist:

```bash
# Check created files
[✓] apps/x/packages/core/src/entity-resolution/types.ts
[✓] apps/x/packages/core/src/entity-resolution/entity-index.ts
[✓] apps/x/packages/core/src/entity-resolution/tier1-deterministic.ts
[✓] apps/x/packages/core/src/entity-resolution/confidence-scorer.ts
[✓] apps/x/packages/core/src/entity-resolution/index.ts

# Check commits
[✓] c5ba0a4 - feat(01-01): create Zod schemas and types for entity resolution
[✓] 974f506 - chore(01-01): add rimraf to workspace packages
[✓] 170cc3b - feat(01-01): implement entity index, tier1 matching, and confidence scoring
```

**Self-Check: PASSED**

All claimed files exist, all commits present in git history.

## Next Steps

This plan provides the foundation for:

- **Plan 02**: Tier 2 fuzzy matching (name similarity, org domain, phonetic)
- **Plan 03**: Tier 3 LLM-assisted matching with reasoning
- **Future**: Entity merging, conflict resolution, entity enrichment from SORs

The entity index is now ready to accept entities from knowledge graph processing. Tier 1 matching will handle the majority of resolution cases (email/SOR ID) without LLM overhead.
