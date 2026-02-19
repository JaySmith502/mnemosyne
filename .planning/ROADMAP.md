# Roadmap: Mnemosyne

## Overview

Mnemosyne bridges Systems of Record and Systems of Engagement through entity-resolved knowledge graph enrichment. Phase 1 builds the entity resolution core (3-tier matching with LLM feedback loops). Phase 2 proves the generic sync pattern with GoHighLevel connector. Phase 3 integrates SOR data into the existing knowledge graph. Phase 4 delivers proactive intelligence (tension detection, daily briefings). Phase 5 polishes UX with connector management and visual indicators.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Entity Resolution Core** - Build entity index and 3-tier resolver with alias persistence (completed 2026-02-19)
- [ ] **Phase 2: Sync Engine + GoHighLevel** - Generic sync engine with config-driven normalization, first SOR connector
- [ ] **Phase 3: Knowledge Graph Integration** - Enrich note creation with entity index, SOR references in frontmatter
- [ ] **Phase 4: Intelligence Layer** - Tension detection and daily brief agents
- [ ] **Phase 5: UI Enhancements** - Connector management, brief quick-access, graph tension badges

## Phase Details

### Phase 1: Entity Resolution Core
**Goal**: Entity index and 3-tier resolver operational with LLM feedback loops
**Depends on**: Nothing (first phase)
**Requirements**: ERES-01, ERES-02, ERES-03, ERES-04, ERES-05, ERES-06, ERES-07, ERES-08
**Success Criteria** (what must be TRUE):
  1. System matches entities deterministically by SOR ID and email address without LLM calls
  2. System escalates ambiguous matches to LLM and persists confirmations as aliases for future deterministic matching
  3. Each entity match has explainable confidence score showing which fields contributed
  4. Entity index stores canonical entities with SOR refs, aliases, and relationships
  5. Existing Gmail/Calendar entities get entity index entries anchored by email
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Types, entity index, Tier 1 deterministic matching, confidence scorer
- [x] 01-02-PLAN.md — Tier 2 fuzzy matching, Tier 3 LLM escalation, alias manager, matcher orchestrator
- [ ] 01-03-PLAN.md — Bootstrap migration from knowledge index, graph builder integration

### Phase 2: Sync Engine + GoHighLevel
**Goal**: Generic config-driven sync engine proven with first SOR connector
**Depends on**: Phase 1
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05, CONN-06, CONN-07, GHL-01, GHL-02, GHL-03, GHL-04
**Success Criteria** (what must be TRUE):
  1. GoHighLevel contacts, opportunities, and conversations sync to `~/.rowboat/composio_sync/gohighlevel/` on 5-minute schedule
  2. Sync engine resumes from checkpoint after interruption without duplicate processing
  3. All GHL entities flow through entity resolver and create/update entity index entries before entering knowledge graph
  4. Normalizer config at `~/.rowboat/config/connectors/gohighlevel.json` drives field mappings without code changes
  5. Rate limits respected with exponential backoff (no sync failures from API throttling)
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Sync engine foundation (Zod schemas, normalizer, checkpoint, retry)
- [ ] 02-02-PLAN.md — GoHighLevel connector (Composio actions, entity writer, manifest)
- [ ] 02-03-PLAN.md — Service integration (sync orchestrator, entity resolution flow, app lifecycle)

### Phase 3: Knowledge Graph Integration
**Goal**: SOR data enriches knowledge graph note creation
**Depends on**: Phase 2
**Requirements**: KGRA-01, KGRA-02, KGRA-03, KGRA-04
**Success Criteria** (what must be TRUE):
  1. Note creation agent prompts include entity index context (SOR refs, relationships) when generating notes
  2. Entity notes in `~/.rowboat/knowledge/` include YAML frontmatter with SOR references and entity type
  3. Entity notes include Sources section listing all contributing systems (Gmail, Calendar, GoHighLevel)
  4. Chokidar watcher processes both `composio_sync/` and manual edits to entity Markdown files
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Intelligence Layer
**Goal**: Proactive insights delivered via tension detection and daily brief
**Depends on**: Phase 3
**Requirements**: BREF-01, BREF-02, BREF-03, BREF-04, BREF-05, BREF-06, BREF-07, BREF-08, TENS-01, TENS-02, TENS-03, TENS-04, TENS-05, TENS-06
**Success Criteria** (what must be TRUE):
  1. Daily brief runs at 7am, writes maximum 5 items to `knowledge/Briefings/YYYY-MM-DD.md` with entity wiki links and SOR refs
  2. If no attention needed, brief says "No blockers. N tasks due this week" instead of empty file
  3. Tension detector runs after every sync, flags orphaned deals, stale entities, conflicting statuses in entity notes
  4. Deterministic tension rules execute first (code-level checks), ambiguous tensions escalate to LLM for judgment
  5. Brief items include tensions flagged by detector (cross-system mismatches surface proactively)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: UI Enhancements
**Goal**: Connector management and visual tension indicators polished
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. Connected Accounts panel shows each connector's sync status, last sync time, and manual "Sync Now" button
  2. "Today's Brief" quick-link at top of Knowledge sidebar auto-opens today's briefing on app launch if exists
  3. Graph view nodes with active tensions display visual badge indicating cross-system mismatch
  4. User can add/remove connectors through UI without editing JSON config files
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Entity Resolution Core | 2/3 | Complete    | 2026-02-19 |
| 2. Sync Engine + GoHighLevel | 0/3 | Not started | - |
| 3. Knowledge Graph Integration | 0/? | Not started | - |
| 4. Intelligence Layer | 0/? | Not started | - |
| 5. UI Enhancements | 0/? | Not started | - |
