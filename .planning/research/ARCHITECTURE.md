# Architecture Research

**Domain:** System of Context layer — entity resolution, SOR/SOE bridging, knowledge graph enrichment
**Researched:** 2026-02-19
**Confidence:** MEDIUM (based on design doc + existing Rowboat architecture analysis)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     External Systems (Read-Only)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │GoHighLvl │  │  Asana   │  │  Gmail   │  │ Calendar │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
├───────┴──────────────┴──────────────┴──────────────┴─────────┤
│                     Composio (Auth + API)                     │
├──────────────────────────────────────────────────────────────┤
│                     Sync Engine Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Scheduler   │  │  Normalizer  │  │  Checkpoint  │       │
│  │  (node-cron) │  │  (config)    │  │  (resume)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
├─────────┴─────────────────┴──────────────────┴───────────────┤
│                     Entity Resolution Layer                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Tier 1:     │  │  Tier 2:     │  │  Tier 3:     │       │
│  │  Deterministic│ │  Fuzzy       │  │  LLM Confirm │       │
│  │  (ID/email)  │  │  (name/org)  │  │  (ambiguous) │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
│                  ┌────────┴────────┐                         │
│                  │  Entity Index   │                         │
│                  │  (JSON + aliases)│                        │
│                  └────────┬────────┘                         │
│                           │                                  │
├───────────────────────────┴──────────────────────────────────┤
│                     Knowledge Graph Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ build_graph  │  │ note_creation│  │   Markdown   │       │
│  │ (existing)   │  │ (existing)   │  │    vault     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├──────────────────────────────────────────────────────────────┤
│                     Intelligence Layer                        │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Daily Brief  │  │  Tension     │                         │
│  │ (scheduled)  │  │  Detector    │                         │
│  └──────────────┘  └──────────────┘                         │
├──────────────────────────────────────────────────────────────┤
│                     Presentation Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Connector UI │  │ Brief Link   │  │ Graph Badges │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Integration Point |
|-----------|----------------|-------------------|
| **Composio** | OAuth, API calls, pagination, rate limiting | Existing — no changes needed |
| **Sync Engine** | Scheduled polling, config-driven normalization, checkpoint/resume | New — `packages/core/src/knowledge/composio_sync.ts` |
| **Normalizer** | Config-driven field mapping (JSON → normalized entity) | New — `packages/core/src/knowledge/normalize.ts` |
| **Entity Resolver** | 3-tier matching: deterministic → fuzzy → LLM | New — `packages/core/src/knowledge/entity_resolver.ts` |
| **Entity Index** | Canonical entities, SOR refs, aliases, relationships | New — `packages/core/src/knowledge/entity_index.ts` |
| **build_graph** | Change detection, pipeline orchestration | Existing — modified to use entity index |
| **note_creation** | LLM-driven entity extraction → Markdown notes | Existing — updated prompts for entity index |
| **Daily Brief** | Scheduled agent producing <=5-item briefing | New — `packages/core/src/knowledge/daily_brief.ts` |
| **Tension Detector** | Post-sync mismatch rule evaluation + LLM escalation | New — `packages/core/src/knowledge/mismatch_rules.ts` |
| **Connector UI** | Connected Accounts panel extension | New — renderer component |

## Recommended Project Structure

New files within existing `packages/core/src/knowledge/` module:

```
packages/core/src/knowledge/
├── entity_index.ts            # EntityIndex schema, CRUD, persistence
├── entity_resolver.ts         # 3-tier resolution logic
├── composio_sync.ts           # Generic sync engine (main loop)
├── composio_sync_config.ts    # Normalizer config schema + loader
├── composio_sync_renderer.ts  # JSON → Markdown with frontmatter
├── normalize.ts               # Entity hint extraction + cross-source matching
├── daily_brief.ts             # Brief agent orchestration + scheduling
├── mismatch_rules.ts          # Rule interface + built-in tension rules
├── mnemosyne_brief.ts         # Agent prompt definition for daily brief
└── mnemosyne_tensions.ts      # Tension detector agent prompt

packages/shared/src/
└── ipc.ts                     # Add new IPC channels (connectors:*, entity-index:*)

apps/renderer/src/components/
├── connectors-popover.tsx     # Extended with connector management UI
├── sidebar-content.tsx        # Add "Today's Brief" quick-link
└── graph-view.tsx             # Add tension badges to graph nodes

Config files (~/.rowboat/config/):
├── composio_sync.json         # Global sync settings
└── connectors/                # Per-connector normalizer configs
    ├── gohighlevel.json
    ├── asana.json
    └── googledrive.json
```

### Structure Rationale

- **All new core logic in `knowledge/`**: Mnemosyne extends the existing knowledge graph — same module boundary, same patterns
- **No new top-level modules**: Avoids restructuring; entity resolution is knowledge graph enrichment
- **Config files separate from code**: Normalizer configs live in `~/.rowboat/config/connectors/` — user-editable, not bundled
- **IPC changes in shared**: Follows existing pattern — all channels defined in one place

## Architectural Patterns

### Pattern 1: Composio as Universal Data Access

**What:** All SOR/SOE API calls go through Composio. No direct HTTP calls to GoHighLevel, Asana, etc.
**When to use:** Every connector. Composio handles OAuth refresh, pagination, rate limiting.
**Trade-offs:**
- Pro: One auth system, one API surface, new connectors are config
- Con: Dependent on Composio's action catalog; may need workarounds for unsupported endpoints

### Pattern 2: Config-Driven Normalization

**What:** Each connector has a JSON config that maps SOR fields to canonical entity shape. A single generic normalizer engine reads configs and produces normalized entities.
**When to use:** Every new SOR/SOE integration.
**Trade-offs:**
- Pro: Next connector is config, not code. Consistent behavior across connectors.
- Con: Complex field mappings (nested arrays, conditional fields) may need escape hatches

```typescript
// Config defines the mapping
{
  "entityType": "person",
  "fieldMap": {
    "name": "{{firstName}} {{lastName}}",
    "email": "email",
    "sorId": "id",
    "sorSource": "gohighlevel"
  }
}

// Single engine applies any config
function normalize(rawData: unknown, config: NormalizerConfig): NormalizedEntity
```

### Pattern 3: Tiered Resolution with Learning

**What:** Entity resolution proceeds through 3 tiers (fast/deterministic → fuzzy → slow/LLM). LLM discoveries feed back as persisted aliases for future deterministic matching.
**When to use:** Every entity match attempt.
**Trade-offs:**
- Pro: Fast for common cases, intelligent for edge cases, improves over time
- Con: Requires careful alias persistence schema; feedback loop crosses module boundaries

## Data Flow

### Sync Flow (SOR → Graph)

```
Composio API call (scheduled)
    ↓ raw JSON
Normalizer (config-driven field mapping)
    ↓ NormalizedEntity[]
Entity Resolver
    ├── Tier 1: Check sorMappings by SOR ID → match
    ├── Tier 2: Fuzzy name + org + email → match
    └── Tier 3: LLM confirmation → match + persist alias
    ↓
Entity Index updated (new entities or enriched existing)
    ↓
build_graph.ts (picks up composio_sync/ folder as source)
    ↓
note_creation agent (enriched prompts with entity index context)
    ↓
~/.rowboat/knowledge/ (Markdown notes with SOR refs)
```

### Post-Sync Intelligence Flow

```
Entity Index (updated after sync)
    ↓
Tension Detector
    ├── Code-level mismatch rules (deterministic checks)
    └── LLM escalation (ambiguous cases)
    ↓
Tension flags written to entity Markdown notes
    ↓
Daily Brief agent (scheduled, reads tensions + recent activity)
    ↓
knowledge/Briefings/YYYY-MM-DD.md
    ↓
"Today's Brief" quick-link in sidebar
```

### IPC Flow (Renderer ↔ Main)

```
Renderer                    Main Process
   │                            │
   ├──connectors:list──────────→├── Read config/connectors/*.json
   ├──connectors:add───────────→├── Write config, start sync
   ├──connectors:sync──────────→├── Trigger manual sync via Composio
   ├──entity-index:get─────────→├── Return entity index JSON
   │                            │
   │←─workspace:didChange──────├── Chokidar detects vault changes
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-500 entities | JSON entity index is fine. In-memory resolution. |
| 500-5000 entities | JSON may slow on startup. Consider lazy loading or SQLite materialized view. |
| 5000+ entities | SQLite entity index with indexed lookups. Batch resolution with progress UI. |

### Scaling Priorities

1. **First bottleneck:** Entity resolution after offline gap (500+ new entities). Fix with batched processing + yield to UI thread.
2. **Second bottleneck:** Entity index JSON parse on startup with 5000+ entities. Fix with SQLite materialized view (rebuild from Markdown on startup).
3. **Third bottleneck:** LLM API calls for Tier 3 resolution. Fix with aggressive alias learning (fewer ambiguous cases over time).

## Anti-Patterns

### Anti-Pattern 1: Per-Connector Code Modules

**What people do:** Write `gohighlevel_sync.ts`, `asana_sync.ts`, `googledrive_sync.ts` with copy-pasted sync logic.
**Why it's wrong:** Bug fixes don't propagate. Each connector takes longer to build. Inconsistent behavior.
**Do this instead:** Single `composio_sync.ts` engine that reads config. Connector-specific logic lives in JSON configs only.

### Anti-Pattern 2: Resolution in the Graph Builder

**What people do:** Put entity matching logic inside `build_graph.ts` since that's where entities are processed.
**Why it's wrong:** Tangles resolution with graph building. Can't resolve entities independently of graph pipeline. Can't test resolution in isolation.
**Do this instead:** Entity resolver is a standalone module. Graph builder calls it but doesn't own it.

### Anti-Pattern 3: Storing Resolution State in LLM Context

**What people do:** Rely on LLM "memory" for past resolution decisions.
**Why it's wrong:** Context resets between runs. Same decisions re-evaluated. Costs spiral.
**Do this instead:** Persist every LLM resolution decision as aliases in entity index. Tier 1 catches them next time.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GoHighLevel | Composio `GOHIGHLEVEL_LIST_CONTACTS` etc. | Rate limits ~100 req/min. Pagination via cursor. |
| Asana | Composio `ASANA_GET_TASKS` etc. | Rate limits ~150 req/min. Webhook-capable but polling for v1. |
| Google Drive | Composio + existing Google OAuth | Extend scope to include Drive. Export docs as text. |
| Gmail/Calendar | Existing native sync | Already in graph pipeline. Entity index enriches with SOR refs. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Sync Engine ↔ Entity Resolver | Direct function call | Same process, same module. Sync produces entities, resolver matches them. |
| Entity Resolver ↔ Entity Index | Direct read/write | Resolver reads index for matching, writes back new entities + aliases. |
| Entity Index ↔ build_graph | Entity index provides enriched context | build_graph reads index for note_creation agent prompts. |
| Tension Detector ↔ Entity Index | Read-only | Detector queries index for mismatch patterns. Writes flags to Markdown. |
| Daily Brief ↔ Markdown vault | Read tensions + recent notes | Brief agent reads vault, writes briefing note. |
| All new modules ↔ Renderer | IPC channels (Zod-validated) | Follows existing pattern exactly. |

## Build Order (Dependencies)

```
1. Entity Index + Resolver (no external deps — can be built and tested standalone)
      ↓
2. Composio Sync Engine + Normalizer (depends on entity resolver for matching)
      ↓
3. GoHighLevel Normalizer Config (depends on sync engine)
      ↓
4. build_graph integration (depends on entity index + sync engine producing data)
      ↓
5. Asana + Drive Normalizer Configs (depends on sync engine proven with GHL)
      ↓
6. Tension Detector (depends on entity index having cross-system data)
      ↓
7. Daily Brief (depends on tension detector + sufficient graph data)
      ↓
8. UI: Connector settings, Brief quick-link, Graph tension badges
```

**Key insight:** Entity index + resolver can be built and tested in isolation before any connector exists. This de-risks the hardest part (resolution logic) before adding sync complexity.

## Sources

- Rowboat existing architecture: `CLAUDE.md`, `docs/plans/2026-02-19-mnemosyne-system-of-context-design.md`
- Entity resolution patterns: Master Data Management (MDM) literature, Dedupe.io patterns
- Connector architecture: ETL pipeline patterns (Fivetran, Airbyte)
- Local-first desktop patterns: Electron best practices for background processing

---
*Architecture research for: System of Context layer*
*Researched: 2026-02-19*
