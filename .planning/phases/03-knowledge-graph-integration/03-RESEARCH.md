# Phase 3: Knowledge Graph Integration - Research

**Researched:** 2026-02-19
**Domain:** Knowledge graph enrichment, entity index integration, note creation pipeline
**Confidence:** HIGH

## Summary

Phase 3 integrates SOR data from Phase 2's sync engine (`composio_sync/`) into the existing knowledge graph note creation pipeline. The core challenge is enriching note creation agent prompts with entity index context, formatting entity notes with SOR references in frontmatter, and generating deterministic Sources sections showing data provenance. The existing architecture is well-positioned: `build_graph.ts` already processes multiple source folders on a 30-second cycle, the entity index provides O(1) lookups by email/SOR ID, and the note creation agent uses a pre-built knowledge index for entity resolution.

**Primary recommendation:** Add `composio_sync/gohighlevel` to SOURCE_FOLDERS in `build_graph.ts`, enrich note creation prompts with entity index data when entities are resolved, extend note templates with YAML frontmatter for SOR refs, and generate Sources sections deterministically from frontmatter.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Update existing notes with new SOR data rather than overwriting — preserves manual edits, accumulates context over time
- Unified narrative in note body when multiple systems contribute — agent weaves all sources into one coherent note rather than separate sections per system
- Sources section auto-generated from frontmatter SOR refs — deterministic, always accurate, no LLM needed
- Always show Sources section, even for single-source entities — consistent format, makes provenance obvious
- Use existing 30-second graph builder cycle to pick up sync output — no special triggering needed

### Claude's Discretion
- Entity context depth and injection timing in note creation prompts
- SOR reference format in frontmatter
- Entity type display (frontmatter vs. visible)
- Note naming/folder convention
- Source detail level and position
- Batch size for sync file processing
- Manual edit re-processing behavior
- Unchanged file dedup strategy
- Whether to add explicit SOR instructions to system prompt or treat SOR data as transparent source material

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KGRA-01 | `build_graph.ts` processes `composio_sync/` as an additional source folder | `build_graph.ts` already has SOURCE_FOLDERS array on line 30-35, adding `composio_sync/gohighlevel` is straightforward |
| KGRA-02 | Note creation agent prompts enriched with entity index context (SOR refs, relationships) | Entity index provides O(1) lookup by email/SOR ID (entity-index.ts:81-100), can inject entity data alongside knowledge index |
| KGRA-03 | Entity notes include YAML frontmatter with SOR refs and entity type | Markdown supports YAML frontmatter at file top, existing notes have Info sections that can be extended |
| KGRA-04 | Entity notes include `## Sources` section listing all contributing systems | Can be generated deterministically from frontmatter SOR refs, no LLM needed |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing codebase | - | All required patterns already implemented | Phase builds on existing graph builder, entity resolver, and note creation agent |
| TypeScript | 5.9 | Type safety | Project standard |
| Zod | - | Schema validation | Used throughout for IPC, events, entity types |
| Node.js fs/path | - | File system operations | Standard library, already used extensively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| YAML frontmatter | - | Structured metadata in Markdown | Obsidian-compatible standard for note metadata |
| chokidar | - | File watching | Already watches gmail_sync, fireflies_transcripts, granola_notes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| YAML frontmatter | Custom metadata section | YAML frontmatter is Obsidian standard, better compatibility |
| Deterministic Sources section | LLM-generated attribution | Deterministic is more reliable, cheaper, no hallucination risk |
| Entity index lookup | Re-parsing knowledge notes | O(1) lookup vs file I/O, entity index is canonical |

**Installation:**
No new dependencies required — all functionality uses existing codebase patterns.

## Architecture Patterns

### Recommended Integration Points

1. **SOURCE_FOLDERS extension** (`build_graph.ts` line 30-35)
   - Add `composio_sync/gohighlevel` to existing array
   - Sync engine already writes to this location
   - Chokidar watcher picks up changes automatically

2. **Entity index enrichment** (new helper function)
   - When note creation agent processes a file, check if entities in that file have entity index entries
   - If yes, inject entity index context into the prompt alongside knowledge index
   - Format: entity ID, SOR refs, confidence, relationships

3. **Note template extension** (note creation agent prompts)
   - Add YAML frontmatter block at top of note template
   - Include: entity_id, sor_refs (array of {system, id}), entity_type (optional)
   - Keep existing Info section structure, add frontmatter above it

4. **Sources section generation** (deterministic, post-creation)
   - Parse YAML frontmatter from completed note
   - Extract sor_refs array
   - Generate `## Sources` section with system names and counts
   - Always include, even for single source

### Pattern 1: Entity Context Injection

**What:** Enrich note creation prompts with entity index data when entities are matched
**When to use:** Processing any file where entities can be resolved (emails, meetings, SOR data)
**Example:**

```typescript
// In createNotesFromBatch (build_graph.ts ~165)
// After building knowledge index, before calling note creation agent

const entityIndex = new EntityIndex();
entityIndex.load();

// For each file being processed, check for entity matches
const entityContext = buildEntityContext(files, entityIndex);

// Add to prompt alongside knowledge index
message += `\n---\n\n`;
message += `# Entity Index Context\n\n`;
message += entityContext;
message += `\n---\n\n`;
message += knowledgeIndex;
```

**Key insight:** Entity index provides richer context than knowledge index alone — includes SOR IDs, confidence scores, all aliases, multiple source systems.

### Pattern 2: YAML Frontmatter Format

**What:** Structured metadata at top of Markdown file
**When to use:** Any entity note that has SOR references
**Example:**

```yaml
---
entity_id: "550e8400-e29b-41d4-a716-446655440000"
sor_refs:
  - system: "gohighlevel"
    id: "contact_abc123"
  - system: "gmail"
    id: "thread_xyz789"
entity_type: "person"
---
```

**Key insight:** YAML frontmatter is Obsidian-native, hidden in reading view, machine-parseable, won't interfere with existing note structure.

### Pattern 3: Deterministic Sources Section

**What:** Auto-generated section listing all contributing systems
**When to use:** Every entity note (even single-source)
**Example:**

```typescript
function generateSourcesSection(frontmatter: { sor_refs: Array<{system: string, id: string}> }): string {
  const systemCounts: Record<string, number> = {};

  for (const ref of frontmatter.sor_refs) {
    systemCounts[ref.system] = (systemCounts[ref.system] || 0) + 1;
  }

  let section = `## Sources\n\n`;
  section += `This note is enriched with data from:\n\n`;

  for (const [system, count] of Object.entries(systemCounts)) {
    const systemName = formatSystemName(system); // "gohighlevel" -> "GoHighLevel"
    section += `- **${systemName}**: ${count} ${count === 1 ? 'reference' : 'references'}\n`;
  }

  return section;
}

function formatSystemName(system: string): string {
  const names: Record<string, string> = {
    'gohighlevel': 'GoHighLevel',
    'gmail': 'Gmail',
    'knowledge': 'Manual Notes',
    // etc.
  };
  return names[system] || system;
}
```

**Position:** At the end of the note, after Open Items, before any manual additions. This follows Obsidian reading flow — metadata at the top (frontmatter), content in the middle, provenance at the end.

### Anti-Patterns to Avoid

- **Separate sections per system in note body:** Creates fragmented notes, user specified unified narrative
- **LLM-generated Sources section:** Can hallucinate, deterministic generation from frontmatter is more reliable
- **Overwriting existing notes:** User specified accumulative updates, preserve manual edits
- **Processing unchanged files:** State tracking already implemented in graph_state.ts, use existing mtime + SHA-256 dedup

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File change detection | Custom mtime checking | Existing graph_state.ts (mtime + SHA-256) | Already handles dedup, tested, accounts for timestamp edge cases |
| Entity matching | String comparison loops | EntityIndex O(1) lookups | Email/SOR ID maps already built and maintained |
| YAML parsing | Regex extraction | `yaml` npm package or simple split on `---` | Edge cases handled, standard format |
| Markdown frontmatter | Custom format | YAML frontmatter (Obsidian standard) | Tool compatibility, hidden in reading view |

**Key insight:** The existing codebase has battle-tested patterns for file watching, entity resolution, and note generation. This phase extends those patterns rather than replacing them.

## Common Pitfalls

### Pitfall 1: Overwriting Manual Edits
**What goes wrong:** User manually edits a note, next sync overwrites their changes
**Why it happens:** Not distinguishing between LLM-generated content and user additions
**How to avoid:** Use workspace-edit instead of workspace-writeFile for existing notes, only update specific sections (Activity, Key Facts, Open Items), preserve everything else
**Warning signs:** User complaints about lost edits, notes reverting to previous state

### Pitfall 2: Prompt Size Explosion
**What goes wrong:** Including full entity index for every entity in every prompt hits token limits
**Why it happens:** Entity index can be large, injecting all data is expensive
**How to avoid:** Only inject entity context for entities mentioned in the files being processed, use summary format (entity ID, name, SOR count) rather than full details
**Warning signs:** LLM API errors about context length, slow batch processing

### Pitfall 3: Frontmatter Breaking Markdown Parsers
**What goes wrong:** YAML frontmatter not properly delimited, note becomes unparseable
**Why it happens:** Missing or malformed `---` delimiters
**How to avoid:** Always use triple-dash delimiters, validate YAML syntax before writing, test with Obsidian
**Warning signs:** Notes show raw YAML in Obsidian, parsing errors in workspace tools

### Pitfall 4: Sources Section Drift from Frontmatter
**What goes wrong:** Sources section doesn't match actual sor_refs in frontmatter
**Why it happens:** Manual edits to Sources section, or incomplete updates
**How to avoid:** Always regenerate Sources section deterministically from frontmatter, never let LLM write it
**Warning signs:** Discrepancies between frontmatter and Sources section, missing systems

### Pitfall 5: Batch Size Too Large for composio_sync Files
**What goes wrong:** Processing 100+ SOR entities in one batch overwhelms LLM
**Why it happens:** SOR sync can produce many files, existing batch size (10 files) tuned for Gmail/meetings
**How to avoid:** Start with same batch size (10), monitor performance, adjust if needed
**Warning signs:** Timeout errors, incomplete note generation, high LLM costs

## Code Examples

Verified patterns from existing codebase:

### Adding Source Folder to Graph Builder
```typescript
// In build_graph.ts line 30-35
const SOURCE_FOLDERS = [
    'gmail_sync',
    'fireflies_transcripts',
    'granola_notes',
    'composio_sync/gohighlevel', // NEW: Phase 3 addition
];
```

### Entity Index Lookup by Email
```typescript
// From entity-index.ts line 81-84
const entityIndex = new EntityIndex();
entityIndex.load();

const entity = entityIndex.findByEmail('sarah@acme.com');
if (entity) {
  console.log(`Matched entity: ${entity.name} (${entity.entityId})`);
  console.log(`SOR refs: ${entity.sorRefs.map(r => `${r.system}:${r.id}`).join(', ')}`);
}
```

### Entity Index Lookup by SOR ID
```typescript
// From entity-index.ts line 89-93
const entity = entityIndex.findBySorId('gohighlevel', 'contact_abc123');
if (entity) {
  console.log(`Found via SOR ID: ${entity.name}`);
}
```

### Building Entity Context for Prompts
```typescript
// New helper function for build_graph.ts
function buildEntityContext(files: {path: string, content: string}[], entityIndex: EntityIndex): string {
  const matchedEntities = new Map<string, EntityIndexEntry>();

  // Extract emails from all files
  for (const file of files) {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = file.content.match(emailPattern) || [];

    for (const email of emails) {
      const entity = entityIndex.findByEmail(email);
      if (entity) {
        matchedEntities.set(entity.entityId, entity);
      }
    }
  }

  if (matchedEntities.size === 0) {
    return 'No entity index matches for this batch.\n';
  }

  let context = '## Matched Entities\n\n';
  context += 'These entities have additional context from other systems:\n\n';

  for (const entity of matchedEntities.values()) {
    const sorSystems = entity.sorRefs.map(r => r.system).join(', ');
    context += `- **${entity.name}** (${entity.email || 'no email'})\n`;
    context += `  - Entity ID: ${entity.entityId}\n`;
    context += `  - Sources: ${sorSystems}\n`;
    if (entity.organization) {
      context += `  - Organization: ${entity.organization}\n`;
    }
    context += `\n`;
  }

  return context;
}
```

### Note Template with YAML Frontmatter
```typescript
// In note creation agent prompt (note_creation_high.ts, note_creation_medium.ts, note_creation_low.ts)
// Extend existing People template:

const peopleTemplate = `
---
entity_id: {entity_id if resolved, omit if not}
sor_refs:
  - system: {system}
    id: {id}
entity_type: person
---

# {Full Name}

## Info
**Role:** {role}
**Organization:** [[Organizations/{organization}]]
**Email:** {email}
**Aliases:** {aliases}
**First met:** {YYYY-MM-DD}
**Last seen:** {YYYY-MM-DD}

## Summary
{2-3 sentences}

## Connected to
- [[Organizations/{Organization}]] — works at
- [[People/{Person}]] — {relationship}

## Activity
- **{YYYY-MM-DD}** ({meeting|email|sor}): {Summary with [[links]]}

## Key facts
{Substantive facts only}

## Open items
{Commitments and next steps only}

## Sources

This note is enriched with data from:

- **System Name**: N references
`;
```

### Parsing and Generating Sources Section
```typescript
// New utility for note processing
import yaml from 'yaml'; // or use simple split on '---'

interface NoteFrontmatter {
  entity_id?: string;
  sor_refs?: Array<{ system: string; id: string }>;
  entity_type?: string;
}

function parseNoteFrontmatter(content: string): NoteFrontmatter | null {
  if (!content.startsWith('---\n')) {
    return null;
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return null;
  }

  const frontmatterText = content.substring(4, endIndex);
  try {
    return yaml.parse(frontmatterText) as NoteFrontmatter;
  } catch (error) {
    console.error('Error parsing frontmatter:', error);
    return null;
  }
}

function generateSourcesSection(frontmatter: NoteFrontmatter): string {
  if (!frontmatter.sor_refs || frontmatter.sor_refs.length === 0) {
    return `## Sources\n\nThis note is based on manual knowledge graph entries.\n`;
  }

  const systemCounts: Record<string, number> = {};
  for (const ref of frontmatter.sor_refs) {
    systemCounts[ref.system] = (systemCounts[ref.system] || 0) + 1;
  }

  const systemNames: Record<string, string> = {
    'gohighlevel': 'GoHighLevel',
    'gmail': 'Gmail',
    'knowledge': 'Manual Notes',
    'calendar': 'Google Calendar',
    'fireflies': 'Fireflies',
    'granola': 'Granola',
  };

  let section = `## Sources\n\n`;
  section += `This note is enriched with data from:\n\n`;

  for (const [system, count] of Object.entries(systemCounts).sort()) {
    const displayName = systemNames[system] || system;
    section += `- **${displayName}**: ${count} ${count === 1 ? 'reference' : 'references'}\n`;
  }

  return section;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Knowledge index only | Entity index + knowledge index | Phase 1 (2026-02-19) | Entity matching now O(1), multi-system refs possible |
| Manual note attribution | Frontmatter SOR refs | Phase 3 | Deterministic provenance, no LLM hallucination |
| Single-system notes | Multi-system unified notes | Phase 3 | Richer entity context, cross-system insights |
| Batch size 25 | Batch size 10 | build_graph.ts line 266 | Faster processing, reduced token usage |

**Deprecated/outdated:**
- Large batch sizes (25 files): Reduced to 10 for better performance and cost control
- LLM-generated Sources sections: Should be deterministic from frontmatter to avoid hallucination

## Open Questions

1. **Should entity_id be in frontmatter for all notes or only SOR-enriched ones?**
   - What we know: Entity index assigns UUIDs to all resolved entities
   - What's unclear: Whether knowledge-only entities (no SOR refs) should get entity_id frontmatter
   - Recommendation: Include entity_id for all resolved entities, makes future lookups easier, consistent format

2. **How to handle frontmatter updates without clobbering the file?**
   - What we know: User specified preserve manual edits, accumulative updates
   - What's unclear: Best approach for updating frontmatter (sor_refs array) without rewriting entire note
   - Recommendation: Parse frontmatter, merge sor_refs arrays, rewrite only frontmatter block, preserve rest of note

3. **Should Sources section include timestamps or just counts?**
   - What we know: User wants provenance clarity
   - What's unclear: Whether "last synced" timestamp per source adds value or clutter
   - Recommendation: Start with counts only (simpler), add timestamps in Phase 4 if needed for daily brief

4. **How to handle entity type (person vs organization) in frontmatter?**
   - What we know: Knowledge graph has People/, Organizations/, Projects/, Topics/ folders
   - What's unclear: Whether entity_type frontmatter adds value or just duplicates folder structure
   - Recommendation: Include entity_type for clarity (person/organization), makes parsing easier

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis:**
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/knowledge/build_graph.ts` — Graph builder architecture, SOURCE_FOLDERS pattern, batch processing
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/knowledge/knowledge_index.ts` — Knowledge index structure, entity parsing patterns
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/entity-resolution/entity-index.ts` — Entity index O(1) lookups, SOR ref structure
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/entity-resolution/types.ts` — Entity schema, SOR ref format
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/entity-resolution/bootstrap.ts` — Entity bootstrapping pattern, incremental processing
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/composio-sync/sync-engine.ts` — SOR sync output location, entity resolution integration

- **Phase documentation:**
  - `.planning/phases/03-knowledge-graph-integration/03-CONTEXT.md` — User decisions and constraints
  - `.planning/REQUIREMENTS.md` — KGRA-01 through KGRA-04 requirements
  - `.planning/ROADMAP.md` — Phase 3 success criteria
  - `.planning/phases/02-sync-engine-gohighlevel/02-CONTEXT.md` — Phase 2 decisions affecting Phase 3

- **Note creation agent prompts:**
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/knowledge/note_creation_high.ts` — High strictness template
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/knowledge/note_creation_medium.ts` — Medium strictness template
  - `c:/Users/smith/Documents/1 Projects/rowboat/apps/x/packages/core/src/knowledge/note_creation_low.ts` — Low strictness template

### Secondary (MEDIUM confidence)
- **Obsidian YAML frontmatter:** Standard format, widely documented, hiding behavior in reading view
- **Entity resolution patterns:** 3-tier matching (deterministic → fuzzy → LLM) from Phase 1

### Tertiary (LOW confidence)
None — all research based on codebase inspection and existing documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All required functionality exists in codebase
- Architecture: HIGH - Integration points are clear and well-tested
- Pitfalls: MEDIUM - Some edge cases need testing (frontmatter parsing, manual edit preservation)

**Research date:** 2026-02-19
**Valid until:** 30 days (stable codebase, established patterns)

---

## RESEARCH COMPLETE

**Phase:** 03 - Knowledge Graph Integration
**Confidence:** HIGH

### Key Findings

1. **Minimal code changes required** — Add `composio_sync/gohighlevel` to SOURCE_FOLDERS, extend note templates with frontmatter, build entity context helper function
2. **Entity index provides O(1) lookups** — No need to parse files or do fuzzy matching, email and SOR ID maps are already built
3. **Deterministic Sources section** — Parse frontmatter, count systems, generate section, no LLM needed
4. **Existing batch processing works** — Graph builder already processes files in batches, handles state tracking, no special logic needed
5. **YAML frontmatter is Obsidian-native** — Hidden in reading view, machine-parseable, won't break existing tools

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All functionality exists in codebase, no new dependencies |
| Architecture | HIGH | Integration points are clear, patterns are proven |
| Pitfalls | MEDIUM | Frontmatter parsing and manual edit preservation need careful testing |

### Open Questions

1. Should entity_id be in frontmatter for all notes or only SOR-enriched ones? (Recommend: all resolved entities)
2. How to update frontmatter without clobbering manual edits? (Recommend: parse, merge, rewrite frontmatter block only)
3. Should Sources section include timestamps? (Recommend: counts only for now)
4. Include entity_type in frontmatter? (Recommend: yes, for clarity)

### Ready for Planning

Research complete. Planner can now create PLAN.md files with specific implementation tasks.
