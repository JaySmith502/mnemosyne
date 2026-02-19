# Requirements: Mnemosyne

**Defined:** 2026-02-19
**Core Value:** SOR data and SOE activity unified in a single entity-resolved knowledge graph, so nothing falls through the cracks between systems.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Entity Resolution

- [x] **ERES-01**: System matches entities deterministically by SOR ID (e.g., `gohighlevel:contact:abc123`)
- [x] **ERES-02**: System matches entities deterministically by email address
- [x] **ERES-03**: System matches entities by fuzzy name + organization (Levenshtein + phonetic)
- [x] **ERES-04**: System escalates ambiguous matches to LLM for confirmation with structured reasoning
- [x] **ERES-05**: LLM-confirmed matches are persisted as aliases for future deterministic matching
- [x] **ERES-06**: Each match has a confidence score and explainable signals (which fields matched, at what score)
- [x] **ERES-07**: Entity index stores canonical entities with SOR refs, aliases, relationships, and structured fields
- [x] **ERES-08**: Existing Gmail/Calendar entities get entity index entries (email as anchor)

### Connector Framework

- [ ] **CONN-01**: Single generic sync engine reads normalizer configs and produces normalized entities
- [ ] **CONN-02**: Normalizer configs are JSON files defining field mappings per SOR entity type
- [ ] **CONN-03**: Sync engine supports incremental sync via timestamp-based delta detection
- [ ] **CONN-04**: Sync engine resumes from checkpoint if interrupted mid-sync
- [ ] **CONN-05**: Sync engine respects per-connector rate limits with exponential backoff + jitter
- [ ] **CONN-06**: Sync runs on configurable schedule (default: every 5 minutes)
- [ ] **CONN-07**: Each sync cycle writes Markdown + manifest to `~/.rowboat/composio_sync/{toolkit}/`

### GoHighLevel Integration

- [ ] **GHL-01**: Contacts sync (name, email, phone, company, tags)
- [ ] **GHL-02**: Opportunities sync (deal name, stage, value, linked contact)
- [ ] **GHL-03**: Conversations sync (recent messages linked to contact)
- [ ] **GHL-04**: All GHL data flows through entity resolver before entering knowledge graph

### Knowledge Graph Integration

- [ ] **KGRA-01**: `build_graph.ts` processes `composio_sync/` as an additional source folder
- [ ] **KGRA-02**: Note creation agent prompts enriched with entity index context (SOR refs, relationships)
- [ ] **KGRA-03**: Entity notes include YAML frontmatter with SOR refs and entity type
- [ ] **KGRA-04**: Entity notes include `## Sources` section listing all contributing systems

### Daily Brief

- [ ] **BREF-01**: Daily brief agent runs once per day on configurable schedule (default 7am)
- [ ] **BREF-02**: Brief contains maximum 5 items ranked by urgency
- [ ] **BREF-03**: Brief is maximum ~250 words total, each item 1-2 sentences
- [ ] **BREF-04**: Each brief item includes `[[wiki links]]` to entity notes
- [ ] **BREF-05**: Each brief item includes parenthetical SOR refs for traceability
- [ ] **BREF-06**: If nothing needs attention, brief says "No blockers. N tasks due this week."
- [ ] **BREF-07**: Brief written to `knowledge/Briefings/YYYY-MM-DD.md`
- [ ] **BREF-08**: Brief becomes part of the graph (backlinks from entity notes show every brief that mentioned them)

### Tension Detection

- [ ] **TENS-01**: Tension detector runs after every sync cycle
- [ ] **TENS-02**: Code-level rules detect: orphaned deals, stale entities, conflicting statuses, missing owners
- [ ] **TENS-03**: Ambiguous tensions escalated to LLM for judgment
- [ ] **TENS-04**: Tension flags written as `## Tensions` section in entity Markdown notes
- [ ] **TENS-05**: Tensions feed the daily brief (brief agent reads tension flags)
- [ ] **TENS-06**: Mismatch rules are extensible via `MismatchRule` interface

### UI

- [ ] **UI-01**: Connector management section in Connected Accounts panel (bottom-left sidebar)
- [ ] **UI-02**: Per-connector display: toolkit name, sync status, last sync time, error state
- [ ] **UI-03**: Manual "Sync Now" button per connector
- [ ] **UI-04**: "Today's Brief" quick-link at top of Knowledge sidebar section
- [ ] **UI-05**: Brief quick-link auto-opens today's briefing on app launch (if exists)
- [ ] **UI-06**: Tension badges on graph nodes (entities with active tensions get visual indicator)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Additional Connectors

- **CONN-V2-01**: Asana normalizer preset (tasks, projects, comments)
- **CONN-V2-02**: Google Drive normalizer preset (document metadata + exported content)
- **CONN-V2-03**: Slack connector (different auth pattern, high volume)

### Entity Resolution Enhancements

- **ERES-V2-01**: Manual merge/split UI for entity deduplication
- **ERES-V2-02**: Dry-run mode for resolution threshold changes
- **ERES-V2-03**: Canary test suite for match quality monitoring
- **ERES-V2-04**: Entity lifecycle tracking (active, archived, deleted)

### Intelligence Enhancements

- **BREF-V2-01**: Brief triggers a conversation in Rowboat UI (not just a file)
- **TENS-V2-01**: User-configurable tension importance criteria
- **TENS-V2-02**: Change notifications for high-value entity updates

## Out of Scope

| Feature | Reason |
|---------|--------|
| Write-back to any SOR | Core design principle — Mnemosyne is read-only forever |
| Real-time sync (<5s latency) | Polling on intervals sufficient for v1; engineering overhead disproportionate |
| Bi-directional sync | 10x complexity of read-only; data loss risk destroys trust |
| Custom normalizer UI | v1 uses built-in presets; custom configs via JSON editing |
| Visual ETL builder | Scope creep — becomes a data integration platform |
| Custom entity types | Fixed schema (person, organization, project, deal, topic) prevents chaos |
| Multi-tenancy | Single-user desktop app; OS-level separation sufficient |
| Embeddings for resolution | Overkill; 3-tier deterministic→fuzzy→LLM covers 95%+ of cases |
| Mobile app | Desktop-first product |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERES-01 | Phase 1 | Complete |
| ERES-02 | Phase 1 | Complete |
| ERES-03 | Phase 1 | Complete |
| ERES-04 | Phase 1 | Complete |
| ERES-05 | Phase 1 | Complete |
| ERES-06 | Phase 1 | Complete |
| ERES-07 | Phase 1 | Complete |
| ERES-08 | Phase 1 | Complete |
| CONN-01 | Phase 2 | Pending |
| CONN-02 | Phase 2 | Pending |
| CONN-03 | Phase 2 | Pending |
| CONN-04 | Phase 2 | Pending |
| CONN-05 | Phase 2 | Pending |
| CONN-06 | Phase 2 | Pending |
| CONN-07 | Phase 2 | Pending |
| GHL-01 | Phase 2 | Pending |
| GHL-02 | Phase 2 | Pending |
| GHL-03 | Phase 2 | Pending |
| GHL-04 | Phase 2 | Pending |
| KGRA-01 | Phase 3 | Pending |
| KGRA-02 | Phase 3 | Pending |
| KGRA-03 | Phase 3 | Pending |
| KGRA-04 | Phase 3 | Pending |
| BREF-01 | Phase 4 | Pending |
| BREF-02 | Phase 4 | Pending |
| BREF-03 | Phase 4 | Pending |
| BREF-04 | Phase 4 | Pending |
| BREF-05 | Phase 4 | Pending |
| BREF-06 | Phase 4 | Pending |
| BREF-07 | Phase 4 | Pending |
| BREF-08 | Phase 4 | Pending |
| TENS-01 | Phase 4 | Pending |
| TENS-02 | Phase 4 | Pending |
| TENS-03 | Phase 4 | Pending |
| TENS-04 | Phase 4 | Pending |
| TENS-05 | Phase 4 | Pending |
| TENS-06 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap revision (dropped Asana/Drive phase)*
