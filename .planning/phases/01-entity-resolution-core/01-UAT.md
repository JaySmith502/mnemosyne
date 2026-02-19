---
status: complete
phase: 01-entity-resolution-core
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-02-19T20:15:00Z
updated: 2026-02-19T20:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. App compiles cleanly
expected: Run `cd apps/x && npm run deps` — should complete with no TypeScript errors. Run `cd apps/x && npm run lint` — entity-resolution files should have no lint errors.
result: pass

### 2. App launches in dev mode
expected: Run `cd apps/x && npm run dev` — app window opens, no crash on startup. Check the terminal output for any errors related to "entity-resolution" or "entity-index" (there should be none on startup since bootstrap only runs when graph builder triggers).
result: skipped
reason: Pre-existing vite PATH issue in renderer prevents app launch. Entity-resolution code compiled cleanly in deps step — no entity-resolution errors.

### 3. Entity index file created after graph build
expected: After the app is running and the knowledge graph builder completes a cycle (runs every 30 seconds), check for `~/.rowboat/entity_index.json`. The file should exist and contain valid JSON with `"version": 1` and an `"entities"` array.
result: skipped
reason: App cannot launch due to pre-existing vite PATH issue — graph builder never triggers.

### 4. Existing knowledge people get entity entries
expected: If you have existing people notes in `~/.rowboat/knowledge/` (from Gmail/Calendar sync), the `entity_index.json` should contain entries for those people. Open the file and verify entity entries have `name`, `email` (if the person had one), `sorRefs` with `system: "knowledge"`, and a `confidence` score.
result: skipped
reason: App cannot launch due to pre-existing vite PATH issue — graph builder never triggers.

### 5. Duplicate people merged by email
expected: If two knowledge notes reference the same person (same email), they should appear as a single entity in `entity_index.json` with multiple entries in `sources` array — not as two separate entities. Check by searching for a known duplicate.
result: skipped
reason: App cannot launch due to pre-existing vite PATH issue — graph builder never triggers.

### 6. Entity resolution module exports accessible
expected: In the running app's main process terminal, you can verify the module loaded by checking that no import errors appear. Alternatively, confirm the barrel export at `apps/x/packages/core/src/entity-resolution/index.ts` exports: EntityIndex, tier1Match, tier2Match, tier3LLMMatch, resolveEntity, resolveOrCreate, bootstrapEntityIndex, calculateConfidence.
result: pass

## Summary

total: 6
passed: 2
issues: 0
pending: 0
skipped: 4

## Gaps

[none yet]
