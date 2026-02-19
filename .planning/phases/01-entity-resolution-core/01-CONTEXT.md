# Phase 1: Entity Resolution Core - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the entity index and 3-tier resolver (deterministic → fuzzy → LLM) that matches records from different systems to the same real-world entity. Tier 1 matches by SOR ID and email without LLM calls. Tier 2 escalates ambiguous matches to LLM. Tier 3 persists LLM confirmations as aliases for future deterministic matching. Each match produces an explainable confidence score. Existing Gmail/Calendar entities get entity index entries anchored by email.

Sync engine, connectors, knowledge graph enrichment, and UI are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all implementation decisions to Claude's judgment. The following areas are open for Claude to determine the best approach during research and planning:

**Match aggressiveness**
- How eagerly to merge entities (conservative vs aggressive thresholds)
- Which signals feed into fuzzy matching beyond email and SOR ID (name similarity, company, role)
- How to handle incorrect merges (split workflow)

**LLM escalation experience**
- When ambiguity triggers LLM escalation (confidence threshold)
- How LLM decisions are surfaced (logging, review queue, or silent)
- How users can correct LLM decisions after the fact

**Entity canonical form**
- Source priority when the same person appears across Gmail, Calendar, and later SOR systems
- How cross-source conflicts for name/email/metadata are resolved
- What metadata is stored on the canonical entity (SOR refs, aliases, relationships, confidence)

**Bootstrap scope**
- How existing Gmail/Calendar entities are indexed (one-time migration vs incremental)
- Whether to index all historical contacts or apply a recency/frequency threshold
- How to handle entities with minimal data (single email mention)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User asked to follow existing project scope and use best judgment.

Key constraints already established (from STATE.md decisions):
- Composio as universal data access layer (already integrated, handles OAuth + API calls)
- Entity index wraps knowledge index (additive — existing behavior preserved)
- Config-driven normalizers over per-app code (next connector is config, not code)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-entity-resolution-core*
*Context gathered: 2026-02-19*
