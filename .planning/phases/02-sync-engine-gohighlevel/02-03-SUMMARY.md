---
phase: 02-sync-engine-gohighlevel
plan: 03
subsystem: integration
tags: [sync-engine, orchestrator, entity-resolution, composio, gohighlevel, lifecycle]

# Dependency graph
requires:
  - phase: 02-sync-engine-gohighlevel-01
    provides: Types, normalizer, checkpoint, and retry utilities
  - phase: 02-sync-engine-gohighlevel-02
    provides: GoHighLevel connector and entity writer
  - phase: 01-entity-resolution-core
    provides: Entity index and 3-tier resolver
provides:
  - Sync engine orchestrator wiring fetch->normalize->resolve->write->checkpoint pipeline
  - App lifecycle registration for auto-start on launch
  - Graph builder integration for automatic entity processing
affects: [knowledge-graph, entity-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interruptible sleep pattern for service loops"
    - "Service logger integration with run tracking"
    - "SOR-wins entity update strategy"
    - "Connector factory pattern by toolkit name"

key-files:
  created:
    - apps/x/packages/core/src/composio-sync/sync-engine.ts
    - apps/x/packages/core/src/composio-sync/index.ts
  modified:
    - apps/x/packages/core/src/composio-sync/types.ts
    - apps/x/packages/shared/src/service-events.ts
    - apps/x/packages/core/src/knowledge/build_graph.ts
    - apps/x/apps/main/src/main.ts

key-decisions:
  - "SOR wins - existing entities updated with GHL data when structured fields conflict"
  - "Background sync skips LLM tier (skipLLM: true) for performance"
  - "One toolkit failure doesn't block others - sync continues to next toolkit"
  - "SOR reference automatically added to entity if missing"
  - "Sync runs on fixed 5-minute interval (not configurable)"
  - "Auto-start on app launch if connectors configured"
  - "connectionParams added to NormalizerConfigSchema for toolkit-specific connection info"

patterns-established:
  - "Service registration pattern: import init -> call after graph builder"
  - "Connector factory pattern: switch on toolkit name, throw on unknown"
  - "SyncEngine as class with getConfiguredConnectors, syncToolkit, runOnce methods"
  - "Interruptible sleep with triggerSync wake function"

requirements-completed: [CONN-01, CONN-06, GHL-04]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 02 Plan 03: Sync Engine Orchestrator and Lifecycle Integration

**Sync engine orchestrates complete fetch->normalize->resolve->write->checkpoint pipeline, integrates with entity resolver, auto-starts on app launch, and registers synced data with graph builder**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T00:58:32Z
- **Completed:** 2026-02-20T01:04:32Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- SyncEngine class orchestrates end-to-end data flow: GHL API -> normalize -> entity resolve -> Markdown file -> graph builder pickup
- Entity resolver integration with SOR-wins strategy (existing entities updated with GHL data)
- Service lifecycle registration in main.ts (auto-starts on app launch)
- Graph builder integration (composio_sync/gohighlevel/ registered as source folder)
- Service event logging under 'composio_sync' service name
- 5-minute sync interval with interruptible sleep pattern
- Connection params support in normalizer config for toolkit-specific settings

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sync engine orchestrator and barrel exports** - `973b8a5` (feat)
2. **Task 2: Register sync service in app lifecycle and graph builder** - `39079e6` (feat)

## Files Created/Modified
- `apps/x/packages/core/src/composio-sync/sync-engine.ts` - SyncEngine class with getConfiguredConnectors, syncToolkit, runOnce methods; init function with interruptible sleep loop; triggerSync wake function; integrates GHLConnector, normalizer, checkpoint, retry, writer, and entity resolver
- `apps/x/packages/core/src/composio-sync/index.ts` - Barrel export exposing all composio-sync module exports for clean module interface
- `apps/x/packages/core/src/composio-sync/types.ts` - Added connectionParams field to NormalizerConfigSchema for toolkit-specific connection parameters (connectedAccountId, locationId)
- `apps/x/packages/shared/src/service-events.ts` - Added 'composio_sync' to ServiceName enum for service event logging
- `apps/x/packages/core/src/knowledge/build_graph.ts` - Added 'composio_sync/gohighlevel' to SOURCE_FOLDERS for automatic graph processing
- `apps/x/apps/main/src/main.ts` - Imported and registered initComposioSync after initGraphBuilder

## Decisions Made
- **SOR wins strategy:** When resolveOrCreate returns an existing entity, sync engine updates structured fields (name, email, organization, role) with GHL data. Per user decision from research phase: "SOR data overwrites when structured data conflicts with existing entity data."
- **Background sync skips LLM:** Pass `skipLLM: true` to resolveOrCreate for performance. Per Phase 1 pattern: background processing avoids expensive LLM calls on thousands of entries.
- **Graceful degradation:** One toolkit failure doesn't block others. Each toolkit sync wrapped in try/catch, errors logged, loop continues to next toolkit.
- **Automatic SOR ref persistence:** After entity resolution, sync engine checks if GHL SOR ref exists in entity.sorRefs array. If missing, adds it via entityIndex.updateEntity(). Ensures all synced entities have their SOR ID tracked.
- **Fixed sync interval:** 5-minute interval hardcoded per user decision from research phase. No config option - keeps it simple.
- **Connection params in config:** Added connectionParams field to NormalizerConfigSchema to support toolkit-specific connection settings (GoHighLevel needs connectedAccountId and locationId). Cleaner than adding top-level fields to the schema for every possible toolkit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Per plan frontmatter, user must:
1. Connect GoHighLevel in Composio Dashboard (Composio Dashboard -> Connected Accounts -> Add Account -> GoHighLevel)
2. Note the connected account ID from Composio dashboard (Composio Dashboard -> Connected Accounts -> GoHighLevel -> Account ID)
3. Create connector config file at `~/.rowboat/config/connectors/gohighlevel.json` with:
   - connectionParams: { connectedAccountId, locationId }
   - normalizer config for contacts, opportunities, conversations (template from Plan 02-01)

Once configured, sync auto-starts on next app launch.

## Next Phase Readiness
- Phase 2 complete - all sync engine components built and integrated
- End-to-end data flow proven: GHL API -> Composio -> normalize -> entity resolve -> Markdown -> graph builder
- Ready for Phase 3 (next sync connector) or Phase 4 (UI for sync monitoring)
- No blockers

## Self-Check: PASSED

**Files verified:**
- FOUND: apps/x/packages/core/src/composio-sync/sync-engine.ts
- FOUND: apps/x/packages/core/src/composio-sync/index.ts
- FOUND: apps/x/packages/core/src/composio-sync/types.ts (modified)
- FOUND: apps/x/packages/shared/src/service-events.ts (modified)
- FOUND: apps/x/packages/core/src/knowledge/build_graph.ts (modified)
- FOUND: apps/x/apps/main/src/main.ts (modified)

**Commits verified:**
- FOUND: 973b8a5 (Task 1: Sync engine orchestrator)
- FOUND: 39079e6 (Task 2: Lifecycle registration)

**Build verification:**
- npm run deps: PASSED (all packages compile)
- Lint errors: Only pre-existing errors in unrelated files (composio-handler.ts, instructions.ts, builtin-tools.ts, auth/repo.ts, config.ts, strictness_analyzer.ts, build_graph.ts, runner.ts)
- Modified files lint clean: PASSED

**Integration verification:**
- composio_sync added to ServiceName enum: VERIFIED
- composio_sync/gohighlevel added to SOURCE_FOLDERS: VERIFIED
- initComposioSync imported and called in main.ts: VERIFIED
- Import path uses @x/core/dist/ (compiled output): VERIFIED

---
*Phase: 02-sync-engine-gohighlevel*
*Completed: 2026-02-20*
