# Feature Landscape

**Domain:** System of Context / Entity Resolution / Cross-System Intelligence
**Researched:** 2026-02-19
**Confidence:** MEDIUM (based on training data — web search access denied)

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Deterministic ID matching** | Industry standard (email, phone, external IDs) | Low | Exact string matching with normalization (lowercase, trim, canonicalization) |
| **Fuzzy string matching** | Names have typos, variants, maiden names | Medium | Levenshtein distance, phonetic matching (Soundex/Metaphone) |
| **Deduplication detection** | Multiple records for same entity is core problem | Medium | Similarity scoring across multiple fields |
| **Manual merge/split UI** | Automated matching has false positives | Medium | User must be able to override system decisions |
| **Connector library** | Users expect pre-built integrations | High | At minimum: Google (Gmail/Calendar/Drive), common CRMs, task managers |
| **Bi-directional sync** | Changes must flow both ways | High | Conflict resolution, idempotency, change tracking |
| **Incremental sync** | Full resyncs don't scale | Medium | Timestamp-based or webhook-driven delta detection |
| **Field mapping configuration** | Every system has different schemas | Medium | UI or config to map source fields to entity schema |
| **Audit log** | Users need to know what changed when | Low | Timestamped log of entity changes and data flows |
| **Error handling & retry** | APIs fail, networks drop, rate limits hit | Medium | Exponential backoff, circuit breakers, user-visible error states |
| **Entity timeline/history** | "What did we know when?" | Medium | Append-only log of entity state changes with provenance |
| **Search across entities** | Users need to find entities quickly | Medium | Full-text search across names, emails, notes, metadata |
| **Access control** | Multi-user systems need permissions | High | Row-level security or field-level visibility rules |
| **Data lineage** | "Where did this data come from?" | Medium | Track source system + timestamp for each field value |
| **Scheduled jobs** | Syncs, enrichments, briefings run automatically | Low | Cron-like scheduler with job status visibility |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **LLM-assisted entity resolution** | Resolves ambiguous cases humans would catch | High | Structured output from LLM with confidence scoring |
| **Cross-system tension detection** | Proactively surfaces inconsistencies | High | Comparing SOR vs SOE state (e.g., CRM says closed, emails say active) |
| **Daily proactive briefing** | User doesn't hunt for info, it comes to them | Medium | Digest of changes, tensions, upcoming events |
| **Relationship graph enrichment** | Maps who knows/works with whom across systems | High | Extract relationships from emails, meetings, task assignments |
| **Smart normalization** | Field values auto-standardized (e.g., "CA" → "California") | Medium | LLM or rule-based transformation with user review |
| **Confidence scoring** | Every match has a confidence level | Medium | Multi-factor scoring (field agreement, source authority, recency) |
| **Entity clustering** | Group related entities (e.g., family members, team) | High | Graph algorithms or LLM-based semantic grouping |
| **Automatic enrichment** | Add public data (company info, social profiles) | Medium | Integration with Clearbit, FullContact, LinkedIn, etc. |
| **Change notifications** | Alert when high-value entities change | Low | Webhooks or in-app notifications based on rules |
| **System of Record designation** | Per-field authority (CRM wins for title, email wins for preferences) | Medium | Conflict resolution with explicit precedence rules |
| **Bulk operations** | Merge 100 duplicates at once | Medium | Queue-based processing with rollback capability |
| **API-first architecture** | Power users can script workflows | Medium | REST or GraphQL API exposing all entity operations |
| **Composite entities** | Organization + people + projects as first-class graph | High | Multi-entity type resolution with relationship tracking |
| **Temporal queries** | "What did we know about X on date Y?" | High | Point-in-time entity reconstruction from history |
| **Human-in-the-loop workflows** | Review queue for low-confidence matches | Medium | Dashboard with approve/reject/edit actions |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Visual ETL builder** | Scope creep — becomes a data integration platform | Use Composio connectors with config-driven normalization |
| **Custom workflow engine** | Complexity explosion, hard to debug | Agent-based automation with clear tool boundaries |
| **Real-time sync (<5s latency)** | Engineering overhead, most use cases don't need it | 30-second poll intervals with webhook support for critical events |
| **Multi-tenancy** | Single-user Electron app, adds unnecessary complexity | Rely on OS-level user separation |
| **Data warehouse features** | Not a BI tool, stay focused on entity resolution | Export to CSV/JSON for analysis elsewhere |
| **Built-in reporting/dashboards** | Maintenance burden, every user wants different views | Daily brief + tension detector is enough proactive intelligence |
| **Version control/branching** | Adds cognitive load, users want single source of truth | Audit log is sufficient for "what changed" questions |
| **Field-level encryption** | Complexity vs benefit (local desktop app, OS handles encryption) | Rely on OS disk encryption + OAuth token encryption |
| **Undo/rollback** | Complex state management, audit log is enough | Immutable append-only history instead |
| **Custom entity types** | Users would create chaos with arbitrary schemas | Fixed schema (Person, Organization, Project, Task, Event) |

## Feature Dependencies

```
Deterministic matching → Fuzzy matching → LLM-assisted matching (fallback chain)
Connector library → Field mapping → Bi-directional sync
Incremental sync → Change notifications
Entity timeline → Data lineage → Temporal queries
Deduplication detection → Manual merge/split UI → Confidence scoring
Cross-system tension detection → Daily proactive briefing (tensions feed into brief)
Relationship graph → Entity clustering
```

## MVP Recommendation

Prioritize (for initial System of Context layer):

1. **Deterministic ID matching** — Foundation for everything
2. **Connector library** (GoHighLevel, Asana, Google Drive) — Can't bridge without connectors
3. **Field mapping configuration** — Schema normalization is core
4. **Incremental sync** — Must work at scale from day 1
5. **Entity timeline/history** — Needed for debugging and trust
6. **Fuzzy string matching** — Handles real-world data quality issues
7. **Deduplication detection** — Core value prop
8. **Manual merge/split UI** — Safety valve for automation
9. **Audit log** — Transparency builds trust
10. **Daily proactive briefing** — Proves the bridge works (early wow moment)
11. **Cross-system tension detection** — Proves the bridge works (early wow moment)

Defer:

- **LLM-assisted entity resolution** — Nice-to-have, but fuzzy matching covers 80% of cases. Add in Phase 2.
- **Relationship graph enrichment** — High complexity, low initial value. Knowledge graph already exists.
- **Access control** — Single-user desktop app, not needed.
- **Bi-directional sync** — Start with one-way (SOR → index), add write-back later.
- **Search across entities** — Can query knowledge graph directly initially.
- **API-first architecture** — No external consumers yet, premature.

## Complexity vs Value Matrix

### High Value, Low Complexity (build first)
- Deterministic ID matching
- Audit log
- Scheduled jobs
- Change notifications

### High Value, High Complexity (phased approach)
- Connector library (start with 3 systems)
- Bi-directional sync (start read-only)
- Cross-system tension detection (simple rules first)
- Deduplication detection (start with high-confidence threshold)

### Low Value, Low Complexity (nice-to-haves)
- Bulk operations
- Export to CSV/JSON

### Low Value, High Complexity (avoid)
- Temporal queries
- Visual ETL builder
- Custom workflow engine

## Open Questions

1. **Merge strategy** — When SOR and SOE conflict on a field value, who wins? Time-based (newest)? Authority-based (SOR always wins)? User preference?
2. **Entity schema** — What fields are universal across Person/Org/Project? What's system-specific?
3. **Deduplication threshold** — What confidence score triggers auto-merge vs human review?
4. **Sync frequency** — 30 seconds for everything? Or tiered (CRM hourly, Gmail real-time)?
5. **Backfill strategy** — On first connector setup, how far back to sync? All history or last 90 days?

## Sources

**Confidence: MEDIUM** — Based on training data knowledge of:
- Customer Data Platforms (Segment, mParticle, Twilio Engage)
- Master Data Management systems (Informatica, Tamr, Reltio)
- CRM platforms (Salesforce, HubSpot, Pipedrive)
- Entity resolution libraries (Dedupe.io, splink, RecordLinkage)
- Data integration platforms (Fivetran, Airbyte, Zapier)

**Note:** Web search access was denied during research. Findings reflect industry patterns as of training cutoff (January 2025). Recommend verifying with current product documentation for:
- Segment Protocols: https://segment.com/docs/protocols/
- Reltio MDM: https://www.reltio.com/platform/
- Tamr: https://www.tamr.com/platform/
- Dedupe.io: https://docs.dedupe.io/

**Limitation:** Could not verify 2026 feature trends or recent competitive developments. Confidence downgraded to MEDIUM accordingly.
