# Composio Sync + Normalization + Daily Brief

**Date:** 2026-02-18
**Status:** Design approved, pending implementation planning

## Goal

Extend Rowboat's knowledge graph with data from any Composio-connected app (GoHighLevel, Asana, Google Drive, and any future toolkit) to create a cross-source memory layer that bridges Systems of Record and Systems of Engagement. Add a daily brief agent that surfaces mismatches and highlights across sources.

All existing Rowboat functionality (copilot chat, email drafting, voice memos, Gmail/Calendar/Fireflies/Granola sync, MCP tools, Composio action execution) is retained unchanged. This design is purely additive.

## Context

Rowboat's knowledge graph currently ingests from Gmail, Calendar, Fireflies, and Granola. Each source syncs to a local folder, the graph builder picks up new/changed files every 30 seconds, and a note-creation agent extracts entities (People, Organizations, Projects, Topics) into Obsidian-compatible Markdown notes with backlinks.

Composio is already integrated for runtime tool execution (the copilot can call Composio actions in conversation), but Composio-connected apps don't feed data into the knowledge graph. There's no periodic ingestion, no cross-source normalization, and no proactive briefing.

## Architecture Overview

```
COMPOSIO TOOLKITS (GHL, Asana, Drive, HubSpot, ...)
       |
       v
[1] SYNC FRAMEWORK          Periodic pull via executeAction
       |                     JSON -> Markdown renderer
       v                     ~/.rowboat/composio_sync/{toolkit}/
[2] NORMALIZATION            Entity hint extraction (deterministic)
       |                     Cross-source matching vs knowledge index
       v                     YAML frontmatter with match hints
[*] GRAPH BUILDER            30s polling cycle (EXISTING, unchanged)
       |                     Batches of 10 files
       v                     Entity extraction + backlinks
[4] SOURCE REFS              External IDs on entity notes
       |                     sourceRefs in knowledge index
       v                     LLM discoveries -> aliases + refs
[3] DAILY BRIEF              Scheduled agent (cron)
                             Phase 1: rule-based mismatches
                             Phase 2: LLM open-ended analysis
                             Output: note + conversation

Feedback loop: LLM-discovered relationships -> written as aliases
+ source refs -> normalization catches them deterministically
next cycle -> memory accumulates.
```

## Section 1: Composio Sync Framework

### Purpose

A new service that periodically calls Composio "list" actions for each connected toolkit and writes the results as Markdown files into source folders. The existing graph builder picks them up automatically.

### New files

```
packages/core/src/knowledge/
  composio_sync.ts          # Sync service (main loop + orchestration)
  composio_sync_config.ts   # Config schema + CRUD for sync sources
  composio_sync_renderer.ts # JSON -> Markdown renderer (generic)
```

### Config schema

```json
// ~/.rowboat/config/composio_sync.json
{
  "sources": [
    {
      "id": "asana-tasks",
      "toolkit": "asana",
      "action": "ASANA_GET_MULTIPLE_TASKS",
      "interval": 300,
      "params": { "workspace": "..." },
      "enabled": true
    }
  ],
  "globalInterval": 300
}
```

### Sync flow

1. Check toolkit is connected (`composioAccountsRepo.isConnected`)
2. Call `executeAction(action, connectedAccountId, params)`
3. Receive JSON response (array of items)
4. For each item, render to Markdown file
5. Write to `~/.rowboat/composio_sync/{toolkit}/{action}/{item_id}.md`
6. Track sync state (last sync timestamp, item hashes) in `composio_sync_state.json`

### Markdown rendering

Generic renderer that converts any JSON object to readable Markdown with metadata:

```markdown
# Acme Corp Website Redesign

**Source:** asana / ASANA_GET_MULTIPLE_TASKS
**Synced:** 2026-02-18T08:00:00Z
**External ID:** asana:task:123456

## Fields
**name:** Acme Corp Website Redesign
**assignee:** Sarah Chen (sarah@acme.com)
**project:** Acme Corp Retainer
**status:** In Progress
**due_on:** 2026-03-15

## Notes
Full task description text here...
```

### Integration with graph builder

Add `'composio_sync'` to the `SOURCE_FOLDERS` array in `build_graph.ts`. No other changes to the graph builder.

### Sync state tracking

Same pattern as graph builder (mtime + hash hybrid). Only writes new files when item content has actually changed, preventing the graph builder from reprocessing unchanged items.

### UI integration

Add "Sync Settings" to the connected-accounts UI where users can:
- See connected toolkits
- Pick which actions to sync (from `listToolkitTools`)
- Set interval and params
- Enable/disable per source

## Section 2: Normalization Layer

### Purpose

Pre-process synced files before the graph builder picks them up, adding entity hints and cross-source match annotations so the note-creation agent can avoid duplicate entities.

### New file

```
packages/core/src/knowledge/
  normalize.ts   # Entity hint extraction + cross-source matching
```

### Two layers

**Layer 1: Deterministic entity hint extraction**

Runs inside the sync framework after the Markdown renderer. Adds YAML frontmatter with structured entity hints extracted from known JSON field patterns:

```typescript
const ENTITY_PATTERNS = {
  people: ['assignee', 'owner', 'creator', 'contact', 'user', 'member'],
  organizations: ['company', 'organization', 'org', 'account', 'workspace'],
  projects: ['project', 'deal', 'opportunity', 'pipeline', 'campaign'],
};
```

Output frontmatter:

```yaml
---
source_type: composio
toolkit: asana
action: ASANA_GET_MULTIPLE_TASKS
external_id: asana:task:123456
entities_hint:
  people:
    - name: Sarah Chen
      email: sarah@acme.com
      role: assignee
  organizations:
    - name: Acme Corp
      signal: extracted from project name
---
```

**Layer 2: Cross-source matching against knowledge index**

Before graph builder processes a batch, checks entity hints against the existing knowledge index. Matching priority:

1. Email exact match (strongest)
2. Name + organization match
3. Alias match
4. Domain match (for organizations)

Annotates frontmatter with match results:

```yaml
entities_hint:
  people:
    - name: Sarah Chen
      email: sarah@acme.com
      matches: People/Sarah Chen.md
      matchSignal: email
```

### Feedback loop

When the LLM discovers a match the deterministic layer missed, it writes the entity name as an alias on the matched note. The next sync cycle's normalization pass catches it deterministically. The LLM teaches the deterministic layer over time.

## Section 3: Daily Brief Agent

### Purpose

A scheduled agent that runs each morning, traverses the knowledge graph, and produces a persistent Markdown note plus a triggered conversation in the Rowboat UI.

### New files

```
packages/core/src/knowledge/
  daily_brief.ts          # Brief agent orchestration
  mismatch_rules.ts       # Rule-based mismatch detection
  brief_renderer.ts       # Formats brief output as Markdown + run

agents/
  daily_brief/            # Agent definition (system prompt + tools)
```

### Schedule

Uses existing `agent-schedule` infrastructure. Default: 7am local time, user-configurable.

### Two-phase analysis

**Phase 1: Rule-based mismatch detection (deterministic)**

Built-in rules for MVP:

| Rule | Detects |
|------|---------|
| `orphaned-deal` | GHL contact/deal with no matching Asana project |
| `orphaned-project` | Asana project with no matching GHL contact |
| `stale-entity` | Entity with no activity across any source in N days |
| `conflicting-status` | Status mismatch across sources |
| `missing-owner` | Project/deal with no person linked |
| `unlinked-sources` | Entity in only one source when multiple expected |

Rules are extensible objects implementing a `MismatchRule` interface.

**Phase 2: LLM open-ended analysis**

The agent receives the knowledge index, rule-based findings, recent changes (last 24h), and recent sync activity. It reviews findings, identifies additional cross-source tensions, selects 5 highlights, and flags entities that need human attention.

### Output

**Persistent note** at `knowledge/Briefs/YYYY-MM-DD.md` containing:
- Mismatches and alerts (with severity, entities, suggested actions)
- 5 highlights from recent activity
- New relationships discovered (with entity links)

**Triggered conversation** posted as a new Rowboat run so it appears in the UI.

### Relationship persistence

LLM-discovered relationships from the brief are:
1. Added as aliases to entity notes
2. Added as backlinks between related entities
3. Logged in entity activity sections with timestamps

### Configuration

```json
{
  "dailyBrief": {
    "enabled": true,
    "schedule": "0 7 * * *",
    "timezone": "America/New_York",
    "highlightCount": 5,
    "lookbackHours": 24,
    "rules": ["orphaned-deal", "orphaned-project", "stale-entity",
              "conflicting-status", "missing-owner", "unlinked-sources"]
  }
}
```

## Section 4: Persistent Cross-Source Links

### Purpose

Track which external records (GHL contacts, Asana tasks, Drive files) map to which knowledge graph entities, enabling deterministic matching, mismatch detection, and provenance.

### Storage: `## Sources` section on entity notes

```markdown
# Acme Corp

## Info
...

## Sources
- **GHL:** contact:abc123 (synced 2026-02-18)
- **Asana:** project:789012 "Acme Corp Retainer" (synced 2026-02-18)
- **Google Drive:** folder:xyz789 "Clients/Acme Corp" (synced 2026-02-18)
- **Gmail:** threads from @acme.com domain
```

### Knowledge index extension

```typescript
interface SourceRef {
  toolkit: string;
  externalId: string;
  label?: string;
  lastSynced: string;
}
```

Added to PersonEntry, OrganizationEntry, ProjectEntry, TopicEntry. Extracted from `## Sources` section by `parseSourceRefs()` in `knowledge_index.ts`.

### How source refs get created

1. **Normalization layer** (deterministic): when a synced item matches an existing entity, includes external_id in frontmatter
2. **Note-creation agent** (LLM): reads frontmatter, writes source ref to entity note
3. **Daily brief agent** (LLM): discovers new relationships, writes refs
4. **User confirmation**: brief surfaces potential matches for review

### Enables mismatch rules

Source refs power the daily brief's rule-based checks (e.g., "has GHL record but no Asana project").

## Changes to Existing Files

```
Modified (minimal changes):
  packages/core/src/knowledge/build_graph.ts
    -> add 'composio_sync' to SOURCE_FOLDERS array

  packages/core/src/knowledge/knowledge_index.ts
    -> add sourceRefs to entity interfaces
    -> add parseSourceRefs extraction
    -> include sourceRefs in formatIndexForPrompt output

  packages/core/src/knowledge/note_creation_{high,medium,low}.ts
    -> add ~20 lines to system prompt about ## Sources section handling
    -> add instructions for reading frontmatter entity hints
```

No changes to: copilot agent, email drafting, voice memos, MCP system, Composio action execution, workspace tools, IPC system, renderer UI (except adding sync settings panel).

## Design Principles

- **Additive only**: No existing behavior is modified or removed
- **Generic over specific**: Sync framework works with any Composio toolkit, not hardcoded per app
- **Deterministic first, LLM second**: Normalization handles easy matches; LLM handles ambiguous ones
- **LLM feeds deterministic layer**: Discoveries are persisted as aliases and source refs for future cycles
- **Local-first**: All data stored as Markdown files in `~/.rowboat/`, inspectable and debuggable
- **Extensible rules**: Mismatch rules are objects implementing an interface, not hardcoded logic
