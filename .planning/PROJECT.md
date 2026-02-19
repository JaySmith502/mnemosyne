# Mnemosyne: System of Context

## What This Is

Mnemosyne is a context layer for Rowboat that bridges Systems of Record (CRM, task management) and Systems of Engagement (email, calendar, notes). It reads from both sides, resolves entities across sources, and surfaces cross-system insights — without ever writing back to external systems. The knowledge graph becomes a living memory that captures what's actually happening between people and systems.

## Core Value

SOR data and SOE activity unified in a single entity-resolved knowledge graph, so nothing falls through the cracks between systems.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Typed entity index with SOR-anchored resolution replacing current knowledge index
- [ ] 3-tier entity resolution (deterministic ID match → fuzzy match → LLM confirmation)
- [ ] Generic Composio-based sync engine with config-driven normalizer framework
- [ ] GoHighLevel connector preset (contacts, opportunities, conversations)
- [ ] Asana connector preset (tasks, projects, comments)
- [ ] Google Drive connector preset (document metadata + exported content)
- [ ] Connector management UI in Connected Accounts panel
- [ ] Daily brief agent (<=5 items, entity-linked, SOR-referenced)
- [ ] Tension detector (code-level checks + LLM escalation for ambiguous cases)
- [ ] Tension badges in graph view
- [ ] "Today's Brief" quick-link in sidebar

### Out of Scope

- Writing back to any SOR — Mnemosyne is read-only forever
- Real-time sync — polling on intervals is sufficient for v1
- Custom normalizer UI — v1 uses built-in presets, custom configs via JSON editing
- Slack connector — future milestone (different auth pattern, high volume)
- Mobile app — desktop-first product

## Context

Rowboat's knowledge graph already ingests from Gmail, Calendar, Fireflies, and Granola. Each source syncs to a local folder, `build_graph.ts` processes changes every 30 seconds, and a note-creation agent extracts entities into Obsidian-compatible Markdown.

Composio is integrated for runtime tool execution (copilot can call Composio actions in conversations), but Composio-connected apps don't feed the knowledge graph yet. There's no periodic ingestion, no cross-source normalization, and no proactive briefing.

Known pain points in current system:
- Duplicate entities across sources ("Acme Corp" / "Acme" / "ACME Corporation")
- Entity resolution is purely LLM-driven with no structured anchors
- No SOR data in the graph (CRM contacts, task statuses)
- No proactive insights — user must ask the copilot

Design doc: `docs/plans/2026-02-19-mnemosyne-system-of-context-design.md`

## Constraints

- **Architecture**: Additive only — no existing Rowboat behavior modified or removed
- **Data principle**: SORs are read-only forever; graph writes only to `~/.rowboat/knowledge/`
- **Pattern**: Generic over specific — Composio + normalizer configs, not per-app sync code
- **Resolution**: Deterministic first, LLM second — code handles easy matches, LLM handles ambiguous ones
- **Resolution feedback**: LLM discoveries persisted as aliases/SOR refs for future deterministic matching
- **Local-first**: All data as Markdown in `~/.rowboat/`, inspectable and debuggable
- **IPC**: All new main↔renderer communication through Zod-validated IPC channels
- **Build order**: shared → core → preload → renderer/main (existing monorepo pattern)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Composio as universal data access layer | Already integrated, handles OAuth + API calls for any app | — Pending |
| GoHighLevel as first SOR connector | Primary CRM in use, proves the normalizer pattern | — Pending |
| Entity index wraps (not replaces) knowledge index | Additive — existing behavior preserved, index enriched with SOR refs | — Pending |
| Config-driven normalizers over per-app code | Next connector is config, not code — extensibility is the product | — Pending |
| Daily brief capped at 5 items | Brevity over completeness — signal, not noise | — Pending |

---
*Last updated: 2026-02-19 after initialization*
