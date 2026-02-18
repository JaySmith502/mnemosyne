# Brainstorming Transcript: Composio Sync + Daily Brief

**Date:** 2026-02-18
**Participants:** Jay Smith, Claude Opus 4.6
**Context:** Extending Rowboat with Composio-based ingestion, cross-source normalization, and daily brief agent

---

## Background: The Mnemosyne Concept (from initial_idea.txt)

The conversation built on a prior session exploring the "system of record" (SOR) vs "system of engagement" (SoE) gap in AI adoption. The core idea: a local-first knowledge graph that sits between SORs (CRM, ERP) and SoEs (email, chat, docs) as a "living memory layer" — branded as **Mnemosyne**, the Greek goddess of memory.

Key concepts from the prior session:
- **Not static RAG** — a dynamic sherpa that continuously ingests, links entities, and proactively surfaces actionable insights
- **Three memory types:** Long-term (stable entities), Episodic (event sequences), Semantic (patterns and abstractions)
- **Controlled write-back:** AI proposes SOR updates, humans approve, narrow audited workflows sync changes
- **Multi-user consolidation:** Shared graph per org, private events scoped by sharing rules, entity resolution across users

---

## Session Goal

Extend Rowboat with Composio to add apps like GoHighLevel, Asana, and Google Drive as knowledge graph sources, with a normalization layer and daily brief agent. The extension should be generic enough to work with any Composio-connected app.

---

## Research Phase

### Current Composio Integration

Composio is already integrated in Rowboat for **runtime tool execution** — the copilot agent can call Composio actions (search Asana tasks, send Slack messages, etc.) during conversations. Key files:

- `packages/core/src/composio/client.ts` — REST API client for Composio backend (v3 API)
- `packages/core/src/composio/types.ts` — Zod schemas for all Composio types
- `packages/core/src/composio/repo.ts` — Local filesystem repository for connected account state
- `apps/main/src/composio-handler.ts` — OAuth flow handler

**Gap:** Composio-connected apps don't feed data into the knowledge graph. They're only available as agent tools for actions, not as source connectors for entity extraction.

### Current Knowledge Graph

One-way pipeline:
1. Source syncs (Gmail, Calendar, Fireflies, Granola) dump Markdown files into `~/.rowboat/<source>/`
2. Graph builder picks them up every 30 seconds
3. Note-creation agent extracts entities (People, Organizations, Projects, Topics) into `~/.rowboat/knowledge/`
4. Entity resolution via knowledge index built fresh before each batch
5. Obsidian-compatible Markdown with backlinks

Key files:
- `packages/core/src/knowledge/build_graph.ts` — Main pipeline
- `packages/core/src/knowledge/graph_state.ts` — Change detection (mtime + SHA-256 hash)
- `packages/core/src/knowledge/knowledge_index.ts` — Index builder for entity resolution
- `packages/core/src/knowledge/note_creation_{high,medium,low}.ts` — Agent prompts at three strictness levels

### Composio Toolkit Availability

Researched what Composio exposes for the target apps:

- **GoHighLevel (HighLevel):** OAuth2, CRM + marketing — contacts, campaigns, appointments, messaging
- **Asana:** OAuth2, 84 tools + 1 trigger — full CRUD on projects, tasks, subtasks, comments, sections, teams, portfolios, custom fields
- **Google Drive:** OAuth2, 59 tools + 7 triggers — file/folder CRUD, metadata, search, comments, permissions, change tracking, content extraction via PARSE_FILE

---

## Clarifying Questions & Answers

### Q: Primary use case?

**A:** MVP should ingest from Google Drive, GHL, and Asana, automatically create a daily brief each morning with potential issues (mismatches in data sources — e.g., contract in GHL but no matching project in Asana) and 5 highlights from previous day's data. Also discussed creating an ingestion layer that normalizes entities since they come in looking different from each app source.

### Q: Data scope per source?

- **GHL:** Not sure yet — let's see what Composio exposes and pick highest-value objects
- **Asana:** Not sure yet — same approach
- **Google Drive:** Specific folders only (not full drive scan)

### Q: Daily brief output?

**A:** Both — write a persistent Markdown note AND trigger a conversation summary in the app.

### Q: Mismatch detection approach?

**A:** Both layered — run deterministic rules first for known patterns, then let the LLM flag anything else it notices. Any entity matched by the LLM should be persistent/remembered.

### Q: Sync configuration model?

**A:** Generic sync framework — not per-app adapters. The system should work with any Composio toolkit, not just GHL/Asana/Drive. Those are just the initial test stack.

### Q: Is this engineering past what MCP already provides?

**A:** No. MCP provides runtime tool access (agent can query Asana when asked in conversation). What's missing is:
- No periodic sync (MCP tools only fire during active conversations)
- No normalization pipeline (MCP returns raw API responses)
- No cross-source entity linking
- No daily brief
- No persistent memory from API calls

This design builds the layer MCP can't provide — continuous ingestion, normalization, and cross-source memory.

### Q: Existing functionality retention?

**A:** All existing Rowboat capabilities (copilot chat, email drafting, voice memos, all existing syncs, MCP tools, Composio action execution) must be retained unchanged. This design is purely additive.

---

## Approaches Considered

### Approach A: "Composio as Sync Source" (SELECTED)

Add a sync layer using Composio's `executeAction` to periodically pull data. Write normalized Markdown files into source folders. Existing graph builder picks them up.

**Pros:** Follows existing patterns, connectors are independent, normalization is testable, graph builder needs no changes.
**Cons:** Polling-based (matches existing model), Composio API credits per cycle.

### Approach B: "Composio Trigger-Driven"

Use Composio's webhook/trigger system for real-time push.

**Rejected:** Limited trigger availability (Asana has 1, GHL unclear), requires webhook infrastructure, breaks the "folder of files" pattern, minimal gain over polling.

### Approach C: "Agent-Driven Pull"

Extend the note-creation agent to call Composio tools directly during processing.

**Rejected:** Makes graph builds dependent on external API availability, much slower, mixes concerns, no persistent local copy of source data.

---

## Approved Design

### Section 1: Composio Sync Framework

New service in `packages/core/src/knowledge/` that periodically calls Composio "list" actions for connected toolkits and writes results as Markdown into `~/.rowboat/composio_sync/{toolkit}/{action}/`.

- Generic JSON-to-Markdown renderer (no per-app code needed)
- Config-driven: users pick which actions to poll, interval, and params
- Hash-based change detection to avoid reprocessing unchanged items
- Integration: just add `'composio_sync'` to `SOURCE_FOLDERS` in `build_graph.ts`
- UI: sync settings panel in connected-accounts view

### Section 2: Normalization Layer

Preprocessing step that enriches synced files before the graph builder processes them.

**Layer 1 (deterministic):** Extract entity hints from known JSON field patterns (assignee, company, project, etc.) into YAML frontmatter.

**Layer 2 (cross-source matching):** Check entity hints against existing knowledge index. Match by email (strongest), name+org, alias, or domain. Annotate frontmatter with match results.

**Feedback loop:** LLM-discovered matches get written as aliases on entity notes, so the deterministic layer catches them on the next cycle. Memory accumulates over time.

### Section 3: Daily Brief Agent

Scheduled agent (cron, default 7am) that traverses the knowledge graph and produces:
1. Persistent Markdown note at `knowledge/Briefs/YYYY-MM-DD.md`
2. Triggered conversation in Rowboat UI

**Phase 1:** Rule-based mismatch detection (orphaned deals, conflicting statuses, stale entities, missing owners, unlinked sources).

**Phase 2:** LLM open-ended analysis — reviews rule findings, identifies additional tensions, selects 5 highlights, flags entities needing attention.

LLM-discovered relationships get persisted as aliases and source refs.

### Section 4: Persistent Cross-Source Links

New `## Sources` section on entity notes tracking external IDs:

```markdown
## Sources
- **GHL:** contact:abc123 (synced 2026-02-18)
- **Asana:** project:789012 "Acme Corp Retainer" (synced 2026-02-18)
```

Knowledge index extended with `sourceRefs` field per entity. Enables mismatch rules and provenance tracking.

Created by: normalization layer (deterministic), note-creation agent (LLM), daily brief agent (LLM), or user confirmation.

---

## Files Changed

### New files
```
packages/core/src/knowledge/
  composio_sync.ts           # Sync service
  composio_sync_config.ts    # Config schema + CRUD
  composio_sync_renderer.ts  # JSON -> Markdown
  normalize.ts               # Entity hints + cross-source matching
  daily_brief.ts             # Brief agent orchestration
  mismatch_rules.ts          # Rule-based mismatch detection
  brief_renderer.ts          # Brief output formatting

agents/
  daily_brief/               # Agent definition
```

### Modified files (minimal changes)
```
packages/core/src/knowledge/build_graph.ts
  -> add 'composio_sync' to SOURCE_FOLDERS

packages/core/src/knowledge/knowledge_index.ts
  -> add sourceRefs to entity interfaces
  -> add parseSourceRefs extraction

packages/core/src/knowledge/note_creation_{high,medium,low}.ts
  -> ~20 lines added to system prompt for ## Sources handling
```

### No changes to
Copilot agent, email drafting, voice memos, MCP system, Composio action execution, workspace tools, IPC system, renderer UI (except adding sync settings panel).

---

## Design Principles

- **Additive only:** No existing behavior modified or removed
- **Generic over specific:** Works with any Composio toolkit, not hardcoded per app
- **Deterministic first, LLM second:** Normalization handles easy matches; LLM handles ambiguous ones
- **LLM feeds deterministic layer:** Discoveries persisted as aliases/source refs for future cycles
- **Local-first:** All data as Markdown in `~/.rowboat/`, inspectable and debuggable
- **Extensible rules:** Mismatch rules are objects implementing an interface

---

## Design Doc Location

`docs/plans/2026-02-18-composio-sync-daily-brief-design.md`

Committed to `main` branch, ready for `/gsd` implementation planning.
