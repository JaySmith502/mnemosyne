# Mnemosyne: System of Context Layer

**Date:** 2026-02-19
**Status:** Design approved, pending implementation planning
**Supersedes:** 2026-02-18-composio-sync-daily-brief-design.md (incorporated and expanded)

## Vision

Mnemosyne is a **System of Context** — a third layer that sits between Systems of Record (CRM, ERP, HRIS) and Systems of Engagement/Execution (email, chat, docs). It doesn't replace either. It remembers how they fit together.

```
Systems of Record          Systems of Engagement
(GoHighLevel, Asana)       (Gmail, Calendar, Drive)
      READ-ONLY ↓               READ-ONLY ↓
         ┌──────────────────────────────┐
         │     MNEMOSYNE               │
         │     System of Context        │
         │                              │
         │  Typed Entity Index          │
         │  Cross-Source Resolution     │
         │  Tension Detection           │
         │  Daily Brief                 │
         │                              │
         │  Writes ONLY to own graph    │
         └──────────────────────────────┘
                      ↓
         ~/.rowboat/knowledge/ (Markdown vault)
```

**Core principle:** SORs are read-only forever. Mnemosyne never writes back to any external system. The graph IS the bridge — a living memory that consolidates, resolves, and surfaces insights. Actions happen in the engagement layer (draft emails, surface context), never in the record layer.

## What Exists Today

Rowboat's knowledge graph ingests from Gmail, Calendar, Fireflies, and Granola. Each source syncs to a local folder, the graph builder processes new/changed files every 30 seconds, and a note-creation agent extracts entities (People, Organizations, Projects, Topics) into Obsidian-compatible Markdown notes with backlinks.

**Composio** is already integrated for runtime tool execution — the copilot can call Composio actions during conversations. But Composio-connected apps don't feed the knowledge graph. There's no periodic ingestion, no cross-source normalization, and no proactive briefing.

**Known pain points:**
- Duplicate entities across sources ("Acme Corp" / "Acme" / "ACME Corporation")
- Entity resolution is purely LLM-driven — no structured anchors
- No SOR data in the graph (CRM contacts, task statuses)
- No proactive insights — user must ask the copilot

## Target Stack

- **GoHighLevel** — CRM (contacts, opportunities, conversations). The primary SOR anchor.
- **Asana** — Task management (tasks, projects, comments)
- **Google Drive** — Documents (exported content, metadata). Extends existing Google OAuth.
- **Gmail + Calendar** — Already integrated. Entity resolution improves with the new index.

Architecture is generic — any Composio-supported app can be added via config, not code.

---

## Section 1: Typed Entity Index & Resolution

### The Entity Index

A structured JSON file alongside the Markdown vault that provides reliable, SOR-anchored entity resolution.

**`~/.rowboat/knowledge_entity_index.json`**

```typescript
interface EntityIndex {
  entities: Record<string, CanonicalEntity>;  // entityId → entity
  sorMappings: Record<string, string>;        // "gohighlevel:contact:abc123" → entityId
  lastUpdated: string;
}

interface CanonicalEntity {
  id: string;                    // stable UUID
  type: "person" | "organization" | "project" | "deal" | "topic";
  canonicalName: string;         // "Acme Corporation"
  aliases: string[];             // ["Acme", "Acme Corp", "ACME"]
  notePath: string;              // "knowledge/Organizations/Acme Corporation.md"
  sorRefs: SorRef[];             // external system anchors
  relationships: Relationship[]; // cross-entity links
  fields: Record<string, unknown>; // structured fields from SORs
}

interface SorRef {
  source: string;     // "gohighlevel" | "asana" | "gmail" | etc.
  externalId: string; // the ID in that system
  lastSynced: string;
}

interface Relationship {
  targetEntityId: string;
  type: string;       // "works_at" | "assigned_to" | "related_to"
  source: string;     // which system established this
}
```

### 3-Tier Entity Resolution

When new data arrives from any connector, resolution runs in priority order:

**Tier 1 — Deterministic match (instant, 100% reliable)**
- Match on SOR ID: `gohighlevel:contact:abc123` → already in `sorMappings` → done
- Match on email address: `john@acme.com` → existing person entity → done

**Tier 2 — Fuzzy match (fast, high confidence)**
- Name + organization: "John Smith" + "Acme" → matches existing entity
- Domain matching: email from `@acme.com` → links to Acme organization entity
- Alias matching: "J&H Outdoors" matches alias on existing entity

**Tier 3 — LLM confirmation (slow, judgment calls only)**
- Ambiguous cases: "Is 'J. Smith' from Asana the same as 'John Smith' in GoHighLevel?"
- Agent gets entity index + context from both sources, confirms or creates new
- User can override by editing the Markdown note (merge aliases)

**Feedback loop:** LLM-discovered matches in Tier 3 get persisted as aliases and SOR refs, so Tier 1/2 catch them deterministically on the next cycle. Memory accumulates.

### Integration With Existing Pipeline

```
Composio sync → Normalizer → manifest with SOR IDs
                                    ↓
                          Entity Resolver (new module)
                            ├── Tier 1: ID match (code)
                            ├── Tier 2: Fuzzy match (code)
                            └── Tier 3: LLM confirm (agent)
                                    ↓
                          Entity Index updated
                                    ↓
                          build_graph.ts (enriched)
                                    ↓
                          note_creation agent
                            (gets entity index instead of knowledge index)
```

The existing `knowledge_index.ts` gets wrapped by the entity index — everything the knowledge index had, plus SOR refs, relationships, and structured fields.

### New Files

```
packages/core/src/knowledge/
  entity_index.ts       # EntityIndex schema, CRUD, persistence
  entity_resolver.ts    # 3-tier resolution logic
```

### Modified Files

```
packages/core/src/knowledge/build_graph.ts
  → Use entity index instead of knowledge index for agent prompts

packages/core/src/knowledge/knowledge_index.ts
  → Becomes a reader that feeds into entity_index.ts (not replaced, wrapped)

packages/core/src/knowledge/note_creation_{high,medium,low}.ts
  → Updated prompt to use entity index, handle SOR refs, write ## Sources sections
```

---

## Section 2: Connector Architecture via Composio

### Pattern

Composio is the universal data access layer. A Source Normalizer framework transforms raw API data into a standard shape. No per-app sync code needed.

```
Composio (auth + API calls for any app)
         ↓ raw data
Source Normalizer (config-driven field mapping)
         ↓ normalized Markdown + manifest.json
~/.rowboat/composio_sync/{toolkit}/{action}/
         ↓
build_graph.ts → entity resolver → knowledge/
```

### Three Layers

**1. Composio (already exists)** — OAuth, API calls, pagination, rate limiting. Connect a new app via `composio:initiate-connection`.

**2. Source Normalizer (new, config-driven)** — Maps Composio's raw output into Mnemosyne's entity shape. Each source type gets a normalizer config:

```json
{
  "id": "ghl-contacts",
  "toolkit": "gohighlevel",
  "action": "GOHIGHLEVEL_LIST_CONTACTS",
  "interval": 300,
  "entityMappings": [
    {
      "entityType": "person",
      "fieldMap": {
        "name": "{{firstName}} {{lastName}}",
        "email": "email",
        "phone": "phone",
        "organization": "companyName",
        "sorId": "id",
        "sorSource": "gohighlevel"
      }
    }
  ]
}
```

**3. Generic Sync Engine (new)** — Single `sync_composio.ts` module that reads normalizer configs, runs Composio actions on schedule, applies field mappings, writes Markdown + manifest.

### Adding a New Source

1. Connect via Composio (existing Connected Accounts UI)
2. Select or create a normalizer config (built-in presets or custom)
3. Done — sync engine picks it up automatically

### Built-in Presets for v1

- **GoHighLevel**: contacts, opportunities, conversations
- **Asana**: tasks, projects, comments
- **Google Drive**: document metadata + exported content

### Config Location

```
~/.rowboat/config/composio_sync.json     # global sync settings
~/.rowboat/config/connectors/            # normalizer configs (one per source)
```

### New Files

```
packages/core/src/knowledge/
  composio_sync.ts           # Generic sync engine (main loop)
  composio_sync_config.ts    # Config schema + loader
  composio_sync_renderer.ts  # JSON → Markdown with frontmatter
  normalize.ts               # Entity hint extraction + cross-source matching
```

### UI Integration

New section in existing Connected Accounts panel (bottom-left of sidebar):
- "Business Tools" section below existing "Team Communication"
- Shows connected Composio toolkits with sync status
- Per-connector config: sync interval, which entity types to pull
- Normalizer preset selector

### New IPC Channels

```typescript
'connectors:list':    { req: z.null(), res: z.object({ connectors: z.array(ConnectorConfig) }) }
'connectors:add':     { req: ConnectorConfig, res: z.object({ success: z.boolean() }) }
'connectors:remove':  { req: z.object({ toolkit: z.string() }), res: z.object({ success: z.boolean() }) }
'connectors:sync':    { req: z.object({ toolkit: z.string() }), res: z.object({ success: z.boolean() }) }
'entity-index:get':   { req: z.null(), res: EntityIndex }
```

---

## Section 3: Mnemosyne Agents

Two new agents join the existing `note_creation` agent.

### Agent 1: Daily Brief (`mnemosyne_brief`)

**Purpose:** Surface what matters today in ≤5 items.

**Schedule:** Once daily via existing `agent-schedule` (default 7am, configurable).

**Hard constraints (enforced in agent prompt):**
- Maximum 5 items, ranked by urgency
- Maximum ~250 words total
- Each item: 1-2 sentences max
- If nothing needs attention: "No blockers. N tasks due this week."
- Never pad with low-signal activity summaries
- Every item includes `[[wiki links]]` to entity notes
- Parenthetical SOR refs for traceability: _(GHL #abc123, Gmail thread #def456)_

**Output:**

```markdown
# Brief — Feb 19, 2026

- **[[Acme Corp]]**: Deal stalled — proposal sent 5 days ago, no reply.
  Last: your email Feb 13. _(GHL #abc123, Gmail #def456)_
- **[[Project Falcon]]**: 3 tasks overdue since Feb 14.
  _(Asana #xyz789)_
- You told [[Sarah Chen]] "deck by Thursday" — no task or doc found.
  _(Gmail Feb 16)_
```

Written to `knowledge/Briefings/YYYY-MM-DD.md`. Also triggers a conversation in the Rowboat UI.

**Brief becomes part of the graph:** Backlinks from entity notes show every brief that mentioned them — a temporal trail of when things were flagged.

### Agent 2: Tension Detector (`mnemosyne_tensions`)

**Purpose:** Spot cross-system contradictions and gaps.

**Trigger:** Runs after every sync cycle (piggybacks on `build_graph.ts`).

**Tension types:**

| Type | Example |
|------|---------|
| Status mismatch | GHL deal "active" but Asana project has no open tasks |
| Commitment gap | Promise detected in email but no matching Asana task |
| Staleness | Entity has SOR activity but no SoE activity beyond threshold |
| Data conflict | Different roles/details for same person across systems |

**Two-phase detection:**
1. **Code-level checks** against entity index (deterministic, fast) — status mismatches, date gaps, orphaned records
2. **LLM escalation** for ambiguous cases — "is this actually a problem?"

**Output:** Tension flags written as a section in the entity's Markdown note:

```markdown
## Tensions
- **Status mismatch** (Feb 18): GHL shows "proposal sent" but Asana
  "Acme Onboarding" has no open tasks.
  _Source: GHL #abc123, Asana #xyz789_
```

**Tensions feed the daily brief** — the brief agent reads tension flags and surfaces the most urgent ones.

### Mismatch Rules (extensible)

```typescript
interface MismatchRule {
  id: string;
  name: string;
  check(entityIndex: EntityIndex): Tension[];
}
```

Built-in rules for v1:

| Rule | Detects |
|------|---------|
| `orphaned-deal` | GHL deal with no matching Asana project |
| `orphaned-project` | Asana project with no matching GHL contact |
| `stale-entity` | No activity across any source in N days |
| `conflicting-status` | Status mismatch across sources |
| `missing-owner` | Project/deal with no person linked |
| `unlinked-sources` | Entity in only one source when multiple expected |

### New Files

```
packages/core/src/knowledge/
  daily_brief.ts       # Brief agent orchestration + scheduling
  mismatch_rules.ts    # Rule interface + built-in rules
  mnemosyne_brief.ts   # Agent prompt definition
  mnemosyne_tensions.ts # Tension detector agent prompt
```

---

## Section 4: UI Changes

Minimal — the vault and existing editor do most of the heavy lifting.

### New UI Surfaces

**1. Connector Settings** — New section in existing Connected Accounts panel (bottom-left). Shows Composio toolkit connections, sync status, normalizer config per source.

**2. "Today's Brief" quick-link** — At top of Knowledge sidebar section. Opens `knowledge/Briefings/YYYY-MM-DD.md` in the existing Markdown editor. Auto-opens on app launch if one exists for today.

**3. Entity notes with YAML frontmatter** — Structured SOR refs and type info. TipTap editor handles this as-is.

**4. Tension badges in graph view** — Entities with active tensions get a visual indicator on their graph node. `hasTensions` flag added to `GraphNode` type.

### What Doesn't Change

- Graph view layout and physics
- Chat/conversation UI
- Markdown editor
- Sidebar structure (just one new quick-link)
- Onboarding flow (connector setup is post-onboarding)

---

## Build Phasing

### Phase 1 — Entity Foundation
- Typed entity index (`knowledge_entity_index.json`)
- 3-tier entity resolver module
- Migrate note_creation agent to use entity index
- Existing Gmail/Calendar data gets entity entries (email as anchor)
- **Value:** Fixes duplicate entity problem in current usage

### Phase 2 — Composio Connector Framework
- Generic sync engine (`sync_composio.ts`)
- Normalizer config schema + loader
- GoHighLevel normalizer preset (first SOR anchor)
- Connectors UI section in Connected Accounts panel
- New IPC channels
- **Value:** CRM data flows into the graph

### Phase 3 — Asana + Google Drive Presets
- Asana normalizer preset
- Google Drive normalizer preset (extends existing Google OAuth scope)
- Cross-system entity resolution now has real merges happening
- **Value:** Full stack coverage (SOR + SoE)

### Phase 4 — Mnemosyne Agents
- Daily brief agent + scheduler config
- Tension detector (code checks + LLM fallback)
- "Today's Brief" quick-link in sidebar
- Tension badges in graph view
- **Value:** The "wow" — proactive insights across all systems

### Why This Order

Phase 1 improves what already exists (fixes duplicates today). Phase 2 gets SOR data flowing. Phase 3 rounds out coverage. Phase 4 needs Phases 1-3 to have data worth briefing on.

---

## Design Principles

- **SOR is read-only forever** — Mnemosyne never writes to external systems
- **Additive only** — No existing Rowboat behavior modified or removed
- **Generic over specific** — Composio + normalizer configs, not per-app code
- **Deterministic first, LLM second** — Code handles easy matches; LLM handles ambiguous ones
- **LLM feeds deterministic layer** — Discoveries persisted as aliases/SOR refs for future cycles
- **Local-first** — All data as Markdown in `~/.rowboat/`, inspectable and debuggable
- **Brevity over completeness** — Daily brief is ≤5 items, not a report

---

## Appendix: Existing Files Reference

### Knowledge Graph (unchanged except noted above)
- `packages/core/src/knowledge/build_graph.ts` — Main pipeline (add composio_sync to SOURCE_FOLDERS)
- `packages/core/src/knowledge/graph_state.ts` — Change detection
- `packages/core/src/knowledge/knowledge_index.ts` — Index builder (wrapped by entity_index)
- `packages/core/src/knowledge/note_creation_{high,medium,low}.ts` — Agent prompts (updated for entity index)

### Composio (unchanged)
- `packages/core/src/composio/client.ts` — REST API client
- `packages/core/src/composio/types.ts` — Zod schemas
- `packages/core/src/composio/repo.ts` — Connected account state
- `apps/main/src/composio-handler.ts` — OAuth flow

### IPC (add new channels)
- `packages/shared/src/ipc.ts` — Channel definitions

### Renderer (minimal additions)
- `apps/renderer/src/components/connectors-popover.tsx` — Connected Accounts UI
- `apps/renderer/src/components/sidebar-content.tsx` — Add brief quick-link
- `apps/renderer/src/components/graph-view.tsx` — Add tension badge to GraphNode
