# Phase 3: Knowledge Graph Integration - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich the existing note creation pipeline so that SOR data (synced by Phase 2's engine to `composio_sync/`) flows into knowledge graph entity notes. Entity index context injected into note creation prompts, SOR references in frontmatter, source attribution in note body. Chokidar watcher processes `composio_sync/` alongside existing source folders.

</domain>

<decisions>
## Implementation Decisions

### Entity context in prompts
- Claude's Discretion: depth of SOR context in note creation prompts (direct refs only vs. entity + relationships) — pick the right balance based on prompt size constraints
- Claude's Discretion: when to inject entity context (only for resolved entities vs. always) — pick based on performance/quality tradeoff
- Update existing notes with new SOR data rather than overwriting — preserves manual edits, accumulates context over time
- Claude's Discretion: whether to add explicit SOR instructions to system prompt or treat SOR data as transparent source material — pick based on note quality

### Note output format
- Claude's Discretion: SOR reference format in frontmatter — pick format that fits existing frontmatter patterns
- Claude's Discretion: entity type visibility (frontmatter only vs. visible in note body) — pick based on Obsidian readability
- Claude's Discretion: note naming/folder convention for SOR-sourced notes — pick the most efficient/effective route
- Unified narrative in note body when multiple systems contribute — agent weaves all sources into one coherent note rather than separate sections per source

### Source attribution
- Sources section auto-generated from frontmatter SOR refs — deterministic, always accurate, no LLM needed
- Always show Sources section, even for single-source entities — consistent format, makes provenance obvious
- Claude's Discretion: detail level per source entry (system name, counts, timestamps) — pick a useful level
- Claude's Discretion: Sources section position in the note — pick based on Obsidian reading flow

### Change processing
- Use existing 30-second graph builder cycle to pick up sync output — no special triggering needed
- Claude's Discretion: batch size for processing sync files — pick based on LLM token budget and existing patterns
- Claude's Discretion: manual edit handling — pick based on data safety (user content should be preserved)
- Claude's Discretion: dedup behavior for unchanged sync files — pick based on cost/freshness tradeoff

### Claude's Discretion
- Entity context depth and injection timing in note creation prompts
- SOR reference format in frontmatter
- Entity type display (frontmatter vs. visible)
- Note naming/folder convention
- Source detail level and position
- Batch size for sync file processing
- Manual edit re-processing behavior
- Unchanged file dedup strategy

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User wants the pipeline to feel natural and accumulative: existing notes get enriched with SOR data over time, manual edits are preserved, and every note clearly shows where its data came from.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-knowledge-graph-integration*
*Context gathered: 2026-02-20*
