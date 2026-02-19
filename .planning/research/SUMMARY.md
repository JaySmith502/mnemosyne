# Project Research Summary

**Project:** Mnemosyne (System of Context Layer)
**Domain:** Entity resolution, cross-system data integration, knowledge graph enrichment
**Researched:** 2026-02-19
**Confidence:** MEDIUM

## Executive Summary

Mnemosyne is a context layer that bridges Systems of Record (SORs like GoHighLevel CRM) with Systems of Engagement (SOEs like Asana) by normalizing cross-system data into a unified entity index, then enriching Rowboat's existing knowledge graph with structured relationships. This enables proactive intelligence (daily briefings, tension detection) that surfaces inconsistencies between systems without the user hunting for them.

The recommended approach is **config-driven, read-only, local-first**: Use Composio for all SOR/SOE API access, implement a single generic sync engine that reads per-connector normalization configs (not per-connector code modules), and employ a 3-tier entity resolution strategy (deterministic → fuzzy → LLM) where LLM discoveries persist as aliases to improve deterministic matching over time. All new logic lives within Rowboat's existing `packages/core/src/knowledge/` module to avoid architectural fragmentation.

The primary risk is **treating entity resolution as static** (LLM decisions not feeding back into deterministic layers), which causes costs to spiral and user frustration from repeated manual merges. Secondary risks include normalizer explosion (every connector becomes custom code), fuzzy matching degradation (thresholds tuned for initial data break when patterns shift), and local-first sync naivety (desktop app freezes during large offline catch-up syncs). All are preventable through careful Phase 1 architecture: build feedback loops, config-driven normalization, and incremental processing from day one.

## Key Findings

### Recommended Stack

**Entity Resolution & Matching:**
The research recommends a tiered approach starting with deterministic matching (exact IDs, emails, phone numbers), progressing to fuzzy matching with specialized libraries, and falling back to LLM resolution only for ambiguous cases. This avoids the cost and latency of embeddings while still handling edge cases intelligently.

**Core technologies:**
- **fastest-levenshtein**: Pure-JS fuzzy string matching — 10x faster than alternatives, no native dependencies, Electron-safe
- **natural**: Phonetic matching (Metaphone/Soundex) — handles name variations like Jon/John
- **Composio SDK** (existing): OAuth + API client generation — already integrated, use for all SOR/SOE calls
- **p-limit & p-retry**: Concurrency control and backoff — prevents rate limit failures with aggressive SOR APIs
- **node-cron**: Job scheduling — extend existing `agent-schedule` module for daily brief
- **better-sqlite3**: Entity index queryability — SQLite as materialized view, Markdown as source of truth
- **gray-matter & remark**: Frontmatter parsing and Markdown AST manipulation — maintain Obsidian compatibility

**Key architectural decision:** SQLite entity index with Markdown as source of truth (not Neo4j/ArangoDB). Embeddable, no separate process, recursive CTEs handle graph traversal. Rebuild from Markdown on startup for self-healing. This fits Rowboat's local-first, Obsidian-compatible design.

**Anti-recommendations:** No Lodash (modern JS sufficient), no Moment.js (deprecated), no Prisma/TypeORM (incompatible with Markdown-first pattern), no graph databases (separate process unsuitable for Electron), no BullMQ/Agenda (Redis/MongoDB overkill for single-process desktop app).

### Expected Features

**Must have (table stakes):**
- **Deterministic ID matching**: Exact string matching with normalization (email, phone, external IDs) — foundation for everything
- **Fuzzy string matching**: Levenshtein distance, phonetic matching for name variations — handles real-world data quality
- **Incremental sync**: Timestamp-based or webhook-driven delta detection — must work at scale from day 1
- **Field mapping configuration**: Config-driven schema normalization per connector — every SOR has different schemas
- **Entity timeline/history**: Append-only log of state changes with provenance — needed for debugging and trust
- **Deduplication detection**: Similarity scoring across multiple fields — core value proposition
- **Manual merge/split UI**: User override for automated decisions — safety valve for false positives
- **Audit log**: Timestamped log of entity changes and data flows — transparency builds trust
- **Scheduled jobs**: Cron-like scheduler with job status visibility — syncs and briefings run automatically

**Should have (competitive differentiators):**
- **LLM-assisted entity resolution**: Resolves ambiguous cases with structured output and confidence scoring — handles edge cases humans catch
- **Cross-system tension detection**: Proactively surfaces SOR vs SOE inconsistencies (e.g., CRM says closed, emails say active) — key wow moment
- **Daily proactive briefing**: Digest of changes, tensions, upcoming events capped at 5 items — user doesn't hunt, info comes to them
- **Confidence scoring**: Every match has multi-factor confidence level — transparency in automation decisions
- **System of Record designation**: Per-field authority for conflict resolution — explicit precedence rules

**Defer (v2+):**
- **Bi-directional sync**: Start read-only (SOR → index), add write-back later — 10x complexity increase
- **Relationship graph enrichment**: Extract who-knows-whom from emails/meetings — high complexity, low initial value (knowledge graph already exists)
- **API-first architecture**: No external consumers yet — premature optimization
- **Search across entities**: Can query knowledge graph directly initially — defer specialized search

**Anti-features (explicitly NOT build):**
- **Visual ETL builder**: Scope creep — becomes data integration platform
- **Real-time sync (<5s latency)**: Engineering overhead, 30-second polls sufficient
- **Built-in reporting/dashboards**: Maintenance burden — daily brief is enough proactive intelligence
- **Custom entity types**: Users would create schema chaos — fixed schema (Person, Organization, Project, Task, Event)

### Architecture Approach

The architecture layers Mnemosyne components within Rowboat's existing `knowledge/` module: Composio handles all external API calls, a generic sync engine applies config-driven field normalization, a 3-tier entity resolver matches entities (deterministic → fuzzy → LLM), and the entity index stores canonical entities with SOR references and learned aliases. Intelligence agents (daily brief, tension detector) read the enriched index and write back to the Markdown vault. All new IPC channels follow existing Zod-validated patterns.

**Major components:**
1. **Sync Engine** (`composio_sync.ts`) — Scheduled polling, config-driven normalization, checkpoint/resume for offline gaps
2. **Entity Resolver** (`entity_resolver.ts`) — 3-tier matching with alias learning feedback loop (LLM discoveries persist as aliases)
3. **Entity Index** (`entity_index.ts`) — SQLite materialized view with Markdown source of truth, canonical entities + SOR refs + aliases
4. **Daily Brief Agent** (`daily_brief.ts`) — Scheduled 9am, reads tensions + recent activity, writes <=5-item briefing to `knowledge/Briefings/YYYY-MM-DD.md`
5. **Tension Detector** (`mismatch_rules.ts`) — Post-sync rule evaluation + LLM escalation for ambiguous mismatches, writes flags to entity notes
6. **Connector UI** — Extended Connected Accounts panel, "Today's Brief" quick-link in sidebar, graph node tension badges

**Build order rationale:** Entity Index + Resolver can be built and tested in isolation before any connector exists. This de-risks the hardest part (resolution logic with feedback loops) before adding sync complexity. Then Sync Engine + first connector (GoHighLevel), then build_graph integration, then second/third connectors, then intelligence layer (tensions, brief), finally UI enhancements.

### Critical Pitfalls

1. **Treating Entity Resolution as Static** — Building resolution logic that doesn't learn from LLM discoveries. User manually merges entities but system keeps suggesting them as duplicates because learning only lives in context, not persisted aliases. **Avoid:** Persist every LLM resolution decision as aliases in entity index. Tier 1 deterministic matching catches them next time. Build feedback loop in Phase 1 architecture.

2. **Normalizer Explosion (The "Just One More Connector" Trap)** — Each new SOR connector requires custom normalization code. Started with 200 LOC for GoHighLevel, then 300 for Asana, by connector #5 you have 2000 lines of unmaintainable mapping logic with subtle inconsistencies. **Avoid:** Single generic `composio_sync.ts` engine that reads per-connector JSON configs. Connector-specific logic lives in `~/.rowboat/config/connectors/{sor}.json` configs only, not code.

3. **Fuzzy Matching Without Canaries** — Fuzzy matching thresholds tuned for initial dataset (100 GoHighLevel contacts) break when new data patterns arrive (B2C contacts with family members). "John Smith III" and "John Smith Jr." merge because Levenshtein distance is 85%. Entire family tree collapses. **Avoid:** Stratified thresholds by field type, require 2+ field signals for match, synthetic canary test suite that validates match quality after every batch.

4. **Local-First Sync Naivety** — Desktop app offline for 2 days, comes back online, syncs 500 new contacts. Entity resolution pegs CPU at 100% for 10 minutes while UI freezes. User force-quits. **Avoid:** Incremental processing with backpressure (batch into 25-entity chunks, yield to UI thread between batches), resumable sync with checkpoints, battery-aware throttling.

5. **The Bidirectional Temptation** — "Since we have normalized contact data, let's sync back to GoHighLevel." Suddenly responsible for conflict resolution, write permissions, data loss bugs. Development velocity craters. **Avoid:** Architectural invariant enforced at type level (SORConnector interface has NO write methods). Document read-only rationale clearly. If write-back truly needed, fork architecture.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Entity Resolution Core
**Rationale:** Entity index and 3-tier resolver can be built and tested in isolation before any connector exists. This de-risks the hardest part (resolution logic, feedback loops, fuzzy matching with canaries) before adding sync complexity.

**Delivers:**
- Entity index schema (SQLite + Markdown sync)
- 3-tier resolver (deterministic → fuzzy → LLM) with alias persistence
- Canary test suite for match quality validation
- IPC channels: `entity-index:get`, `entity-index:resolve`

**Addresses:**
- Deterministic ID matching (table stakes)
- Fuzzy string matching (table stakes)
- LLM-assisted resolution (differentiator)
- Confidence scoring (differentiator)

**Avoids:**
- Pitfall #1 (static resolution) — builds feedback loop from day 1
- Pitfall #3 (fuzzy matching without canaries) — canary suite prevents threshold drift

### Phase 2: Sync Engine + GoHighLevel Connector
**Rationale:** Single generic sync engine with config-driven normalization proves the pattern. GoHighLevel chosen first because it's the primary SOR (contacts, relationships). If config handles GHL's quirks, later connectors will be easier.

**Delivers:**
- Generic `composio_sync.ts` with checkpoint/resume
- GoHighLevel normalizer config at `~/.rowboat/config/connectors/gohighlevel.json`
- Incremental sync with backpressure (25-entity batches, yield to UI thread)
- Rate limit handling (p-limit + p-retry)
- IPC channels: `connectors:list`, `connectors:add`, `connectors:sync`

**Uses:**
- Composio SDK (existing), p-limit, p-retry, node-cron
- fastest-levenshtein, natural for entity matching

**Implements:**
- Sync Engine, Normalizer, Scheduler components

**Avoids:**
- Pitfall #2 (normalizer explosion) — config-driven from first connector
- Pitfall #4 (local-first naivety) — batching + backpressure upfront
- Pitfall #9 (rate limit failures) — p-limit handles GHL's 100 req/min

### Phase 3: Knowledge Graph Integration
**Rationale:** Entity index now populated with GoHighLevel data. Extend existing `build_graph.ts` to use entity index for enriched context in note creation agent prompts. Proves the bridge works (SOR data enriches knowledge graph).

**Delivers:**
- `build_graph.ts` reads entity index for note creation context
- `note_creation` agent prompts updated with entity index lookups
- Entity notes in `~/.rowboat/knowledge/` with SOR references in frontmatter
- Chokidar watcher extended to watch `~/.rowboat/entities/` for manual edits

**Addresses:**
- Entity timeline/history (table stakes)
- Data lineage (table stakes)
- Audit log (table stakes)

**Avoids:**
- Pitfall #7 (entity lifecycle) — tracks active/archived/deleted states from SOR

### Phase 4: Second & Third Connectors (Asana, Google Drive)
**Rationale:** Sync engine proven with GoHighLevel. Adding Asana (tasks) and Google Drive (documents) validates config-driven approach works for different entity types. Cross-SOR deduplication becomes necessary.

**Delivers:**
- Asana normalizer config (tasks → Project entities)
- Google Drive normalizer config (docs → Document entities)
- Cross-SOR entity resolution (same person in GHL and Asana)
- Polymorphic entity schema (Person, Organization, Project, Task, Document)

**Addresses:**
- Connector library (table stakes) — minimum 3 systems
- Cross-SOR deduplication (implicit table stake)

**Avoids:**
- Pitfall #8 (no cross-SOR dedup strategy) — generalizes resolution to cross-SOR
- Pitfall #10 (normalized schema rigidity) — uses discriminated unions for entity types

### Phase 5: Intelligence Layer
**Rationale:** Entity index now has cross-system data from multiple SORs. Build intelligence agents that read enriched index to deliver proactive value (tensions, daily brief).

**Delivers:**
- Tension detector (code-level rules + LLM escalation)
- Daily brief agent (scheduled 9am, reads tensions + recent activity)
- Briefing notes at `~/.rowboat/knowledge/Briefings/YYYY-MM-DD.md`
- Tension flags in entity Markdown frontmatter

**Addresses:**
- Cross-system tension detection (differentiator) — key wow moment
- Daily proactive briefing (differentiator) — key wow moment
- Change notifications (table stakes)

**Avoids:**
- Pitfall #13 (over-reliance on LLM) — deterministic rules first, LLM only for ambiguous

### Phase 6: UI Enhancements
**Rationale:** Core functionality complete (sync, resolution, intelligence). Polish UX with connector management, brief quick-access, visual tension indicators.

**Delivers:**
- Extended Connected Accounts panel (add/remove connectors, manual sync trigger)
- "Today's Brief" quick-link in sidebar
- Graph view tension badges (nodes with cross-system mismatches)
- Manual merge/split UI for entity resolution

**Addresses:**
- Manual merge/split UI (table stakes) — safety valve for automation
- Search across entities (deferred from earlier) — can add now if needed

**Avoids:**
- Pitfall #6 (LLM resolution without escape hatches) — merge UI shows reasoning, requires confirmation

### Phase Ordering Rationale

- **Core before connectors:** Entity resolution logic is hardest and most foundational. Building it in isolation (Phase 1) de-risks before adding sync complexity (Phase 2).
- **One connector proves pattern:** If GoHighLevel config-driven normalizer works (Phase 2), adding Asana/Drive (Phase 4) is config, not code. If GHL normalizer becomes custom code, redesign before Phase 4.
- **Intelligence after cross-system data:** Tension detection and daily brief need data from multiple SORs to be valuable (Phase 5 after Phase 4).
- **UI last:** Core value (enriched knowledge graph, proactive intelligence) delivered before polish (Phase 6).

This ordering avoids **Pitfall #2 (normalizer explosion)** by validating config-driven approach early, **Pitfall #1 (static resolution)** by building feedback loops in Phase 1, and **Pitfall #4 (local-first naivity)** by designing for offline gaps in Phase 2.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (GoHighLevel Connector):** GoHighLevel API specifics (rate limits, pagination cursors, webhook support, field schema). Composio action catalog coverage. Normalizer config JSONPath expressiveness for nested GHL data structures.

- **Phase 4 (Asana & Google Drive):** Asana task schema mapping to Project entities (task assignees → relationships?). Google Drive export-as-text API for doc content extraction. Cross-SOR entity resolution edge cases (same email in GHL and Asana but different names — LLM confirmation strategy).

- **Phase 5 (Tension Detection):** What constitutes a "tension" (CRM stage vs email sentiment mismatch, calendar invite vs task due date mismatch). Which tensions are deterministic rules vs LLM escalation. Daily brief selection algorithm (which 5 items from 20 updates).

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Entity Resolution Core):** Well-documented patterns from MDM literature, Dedupe.io, RecordLinkage libraries. Levenshtein + Metaphone are standard algorithms.

- **Phase 3 (Knowledge Graph Integration):** Extends Rowboat's existing `build_graph.ts` and `note_creation` patterns. Frontmatter + Markdown already Obsidian-compatible. Chokidar watcher pattern already used.

- **Phase 6 (UI Enhancements):** Rowboat already has settings panels, sidebar sections, graph view. Extending existing components, not new UI frameworks.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Versions need npm verification (research without web access). Patterns are sound (SQLite for Electron, Composio for OAuth, Zod for validation). better-sqlite3 Electron 39 compatibility needs check. |
| Features | MEDIUM | Based on MDM/CDP/ETL domain knowledge as of Jan 2025. Feature categorization (table stakes vs differentiators) reflects industry patterns but not verified against 2026 competitive landscape. |
| Architecture | MEDIUM | Rowboat's existing patterns well-understood from CLAUDE.md. Component boundaries (sync engine, entity resolver, entity index) follow standard ETL/MDM separation. Build order dependencies validated through design doc. |
| Pitfalls | LOW | Based on training data patterns, not real-world 2026 case studies. All pitfalls should be verified against current entity resolution literature and local-first Electron best practices. |

**Overall confidence:** MEDIUM

Research conducted without web search access (2026-02-19). Recommendations based on:
- Rowboat's existing architecture (CLAUDE.md, design doc)
- Entity resolution patterns from MDM systems (Informatica, Reltio, Tamr)
- Data integration platform patterns (Fivetran, Airbyte, Segment)
- Entity resolution libraries (Dedupe.io, splink, RecordLinkage)
- Local-first desktop app patterns (Electron best practices)
- Training data cutoff: January 2025

### Gaps to Address

**Version verification:** All package versions in STACK.md need `npm view <package> version` checks. Specifically:
- better-sqlite3 prebuilt binaries for Electron 39 support
- p-limit/p-retry ESM-only in 5.x/6.x — verify compatibility with esbuild bundling in `apps/main`
- unified/remark ecosystem version alignment (15.x mentioned)

**GoHighLevel API specifics:** Design assumes Composio has comprehensive GHL action catalog. Need to verify:
- Contact/company list pagination (cursor-based?)
- Rate limits (research assumes ~100 req/min)
- Webhook support for real-time updates (or polling-only?)
- Custom field handling (GHL allows custom fields per account)

**Entity schema evolution:** Design uses discriminated unions for polymorphic entities (Person, Organization, Project, Task, Document). Need validation during Phase 1:
- What fields are truly universal across types?
- How to handle SOR-specific fields that don't fit normalized schema?
- Extension mechanism for custom fields?

**Daily brief selection algorithm:** Design caps brief at 5 items. Need to define during Phase 5:
- Selection criteria (recency, importance, tension severity)
- User configurability (let user adjust cap or criteria?)
- Fallback if <5 items (show fewer or pad with "no updates"?)

**Cross-SOR conflict resolution:** Design mentions "System of Record designation" (per-field authority) but defers details. Need to define during Phase 4:
- When GHL and Asana have different email for same person, who wins?
- Time-based (newest) or authority-based (SOR always wins)?
- User preference override?

## Sources

### Primary (HIGH confidence)
- Rowboat codebase: `CLAUDE.md`, `docs/plans/2026-02-19-mnemosyne-system-of-context-design.md`
- Existing Rowboat patterns: IPC system, knowledge graph builder, Zod validation, Awilix DI, Composio integration

### Secondary (MEDIUM confidence)
- Entity resolution patterns: Master Data Management (MDM) systems (Informatica, Reltio, Tamr)
- Entity resolution libraries: Dedupe.io, splink, RecordLinkage
- Data integration platforms: Fivetran, Airbyte, Segment, Zapier
- Customer Data Platforms: Segment Protocols, mParticle, Twilio Engage
- Local-first application patterns: Electron best practices for background processing

### Tertiary (LOW confidence)
- Package versions (needs npm verification)
- GoHighLevel API specifics (needs Composio action catalog + GHL docs verification)
- 2026 competitive feature landscape (training data from Jan 2025)

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
