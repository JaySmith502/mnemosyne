# Phase 2: Sync Engine + GoHighLevel - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Generic config-driven sync engine that pulls data from GoHighLevel (contacts, opportunities, conversations), normalizes it via JSON config, flows it through entity resolution, and writes to `~/.rowboat/composio_sync/gohighlevel/`. This phase proves the sync pipeline pattern — future connectors reuse the same engine with different configs.

</domain>

<decisions>
## Implementation Decisions

### GHL data priorities
- Pipeline architecture matters more than field completeness — start with core fields, make it trivial to expand via normalizer config later
- Contacts: core identity fields (name, email, phone, company, tags) are sufficient to start
- Opportunities: Claude's discretion on initial field set — enough to prove the pipeline
- Conversations: recent only (last 30 days) — keeps volume manageable, focuses on active conversations
- All entity types treated equally — no priority ordering, the graph surfaces what's relevant

### Sync behavior & visibility
- Silent retry on failure — retry with exponential backoff, only surface if 3+ consecutive failures
- Fixed 5-minute sync interval — not configurable, one less thing to think about
- Auto-start on app launch — if a connector is configured, sync begins immediately, zero friction
- Subtle status icon in sidebar or status bar showing sync is active during normal operation

### Entity conflict handling
- SOR wins — GHL data overwrites when structured data conflicts with existing entity data (GHL is the authority for CRM data)
- Use existing 3-tier resolver for all entity matching — no special handling, let Phase 1's fuzzy → LLM escalation handle ambiguity
- Keep deleted/archived entities as historical data — never delete from graph, mark as archived, preserve relationships

### Synced data output format
- Machine-optimized Markdown files — frontmatter-heavy, minimal formatting, these are pipeline artifacts not user-facing
- Write a manifest file alongside data (manifest.json) — tracks what was synced, when, counts, useful for debugging and status display

### Claude's Discretion
- File structure decision (one-file-per-entity vs collection files) — choose whatever integrates best with the existing graph builder pipeline
- Normalizer config complexity — start simple, extend if needed
- Duplicate tolerance thresholds — use whatever the resolver's confidence levels suggest
- Opportunity field selection — choose fields that prove the pipeline

</decisions>

<specifics>
## Specific Ideas

- User explicitly wants to nail the pipeline first — changing what fields are ingested should be a config change, not a code change
- Composio is already integrated and handles OAuth + API calls — leverage it as the data access layer (Phase 1 decision)
- Config-driven normalizers over per-app code (Phase 1 decision) — this phase proves that pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-sync-engine-gohighlevel*
*Context gathered: 2026-02-19*
