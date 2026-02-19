# Domain Pitfalls: Entity Resolution & Cross-System Context Layer

**Domain:** System of Context layer with entity resolution and cross-system data integration
**Researched:** 2026-02-19
**Confidence:** LOW (based on training data only - web search and documentation tools unavailable)

**Note:** This research was conducted without access to current documentation or web search. All findings are based on training data (January 2025 cutoff) and should be verified against current best practices and real-world case studies before implementation.

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Treating Entity Resolution as Static

**What goes wrong:** Building resolution logic that doesn't learn from corrections. User manually merges "John Smith" and "J. Smith" but system keeps suggesting them as duplicates because the learning only lives in LLM context, not in persisted rules.

**Why it happens:** Entity resolution is treated as a one-way pipeline (data → matching → result) instead of a feedback loop. LLM discoveries during interactive resolution aren't persisted back to deterministic layers.

**Consequences:**
- User frustration from repeated manual merges
- LLM costs spiral as same decisions are re-evaluated
- System never improves accuracy over time
- Can't explain why entities were merged (no audit trail)

**Prevention:**
```typescript
// BAD: LLM decision lives only in run context
const llmMatch = await askLLM("Are these the same person?", a, b);
if (llmMatch) mergeEntities(a, b);

// GOOD: LLM decision creates persisted alias rule
const llmMatch = await askLLM("Are these the same person?", a, b);
if (llmMatch) {
  await aliasRepo.create({
    canonical: a.id,
    alias: b.id,
    source: 'llm-confirmation',
    confidence: llmMatch.confidence,
    reason: llmMatch.reasoning
  });
  mergeEntities(a, b);
}
```

**Detection:**
- Users report "I've told it this before"
- LLM API costs grow linearly with data volume
- No audit log of why entities were merged
- Same entity pairs appear in manual review queue repeatedly

**Phase impact:** Must be addressed in Phase 1 (core resolution architecture). Retrofitting learning loops later requires schema migrations and reprocessing all historical merges.

---

### Pitfall 2: Normalizer Explosion (The "Just One More Connector" Trap)

**What goes wrong:** Each new SOR connector requires custom normalization code. Started with GoHighLevel normalizer (200 LOC), then Asana (300 LOC), then Google Drive (400 LOC). By connector #5, you have 2000 lines of unmaintainable mapping logic with subtle inconsistencies.

**Why it happens:** Normalizers start simple ("just map these 5 fields") but SOR APIs have:
- Inconsistent date formats (ISO8601 vs Unix timestamps vs "2 days ago")
- Nested references (contact.company.id vs contact.companyId vs contact.relationships.company)
- Missing fields (some SORs have "tags", others have "labels", others have neither)
- Rate limits requiring different retry strategies

**Consequences:**
- Each connector takes longer to add (diminishing velocity)
- Bug fixes in one normalizer don't propagate to others
- Can't answer "what fields does entity type X always have?" (varies by SOR)
- Testing becomes intractable (n² complexity for cross-SOR entity matching)

**Prevention:**

**1. Schema-driven normalization config:**
```json
// config/normalizers/gohighlevel.json
{
  "entities": {
    "contact": {
      "idPath": "$.id",
      "namePaths": ["$.firstName", "$.lastName"],
      "emailPaths": ["$.email", "$.emails[*]"],
      "dateFields": {
        "createdAt": { "path": "$.dateAdded", "format": "unix_ms" },
        "updatedAt": { "path": "$.dateUpdated", "format": "unix_ms" }
      },
      "relations": {
        "company": { "path": "$.companyId", "type": "organization" }
      }
    }
  }
}
```

**2. Generic normalizer engine:**
```typescript
// Single normalizer that reads config
class ConfigDrivenNormalizer {
  normalize(rawData: unknown, config: NormalizerConfig): NormalizedEntity {
    // JSONPath extraction + type coercion based on config
    // Handles date parsing, nested references, array flattening
  }
}
```

**3. Field presence matrix:**
```typescript
// Track which fields each SOR provides
const FIELD_SUPPORT: Record<SOR, Record<EntityField, boolean>> = {
  gohighlevel: { email: true, phone: true, tags: true, avatar: false },
  asana: { email: true, phone: false, tags: false, avatar: true },
  // ...
};
```

**Detection:**
- PR reviews reveal copy-pasted normalizer code with minor tweaks
- Bug fix requires changes in multiple normalizer files
- New connector estimate keeps growing (used to be 2 days, now 2 weeks)
- Flaky tests for entity matching across different SOR pairs

**Phase impact:** Must be addressed in Phase 1 (GoHighLevel connector). If normalizers are hand-coded for first connector, switching to config-driven approach later requires refactoring all existing normalizers.

---

### Pitfall 3: Fuzzy Matching Without Canaries

**What goes wrong:** Fuzzy matching thresholds tuned for initial dataset break when new data patterns arrive. "John Smith III" and "John Smith Jr." merge because Levenshtein distance is 85% (threshold: 80%). Entire family tree collapses into one entity.

**Why it happens:**
- Thresholds picked based on small sample (100 contacts from GoHighLevel)
- No ongoing validation that matches are correct
- Fuzzy logic opaque ("why did these match?")
- Data distribution shifts (first SOR was B2B, second SOR is B2C with many duplicates)

**Consequences:**
- False positives erode trust ("system merged my wife with my coworker")
- Can't tune thresholds without full reprocess (expensive)
- Users can't understand why bad merges happened
- No early warning system for degraded match quality

**Prevention:**

**1. Stratified thresholds:**
```typescript
const MATCH_THRESHOLDS = {
  email: { exact: 1.0, fuzzy: 0.95 },  // Email typos rare
  name: { exact: 1.0, fuzzy: 0.85 },   // Names vary more
  phone: { exact: 1.0, fuzzy: 0.90 },  // Formatting variations
};

// Never fuzzy-match on single field; require multiple signals
function fuzzyMatch(a: Entity, b: Entity): Match | null {
  const signals = [
    compareEmail(a.email, b.email),
    compareName(a.name, b.name),
    comparePhone(a.phone, b.phone)
  ].filter(s => s.score > MATCH_THRESHOLDS[s.field].fuzzy);

  if (signals.length < 2) return null;  // Require 2+ fields
  return { score: avg(signals.map(s => s.score)), signals };
}
```

**2. Canary matches:**
```typescript
// Synthetic entity pairs with known match status
const CANARIES = [
  { a: "John Smith", b: "Jon Smith", shouldMatch: true },
  { a: "John Smith Jr.", b: "John Smith III", shouldMatch: false },
  // ...
];

// Run canaries after every batch; alert if accuracy drops
async function validateMatchQuality() {
  const results = CANARIES.map(c => ({
    expected: c.shouldMatch,
    actual: fuzzyMatch(c.a, c.b) !== null
  }));

  const accuracy = results.filter(r => r.expected === r.actual).length / results.length;
  if (accuracy < 0.95) {
    throw new Error(`Match quality degraded: ${accuracy}`);
  }
}
```

**3. Explainable matches:**
```typescript
interface Match {
  score: number;
  signals: Array<{
    field: string;
    aValue: string;
    bValue: string;
    score: number;
    method: 'exact' | 'levenshtein' | 'phonetic';
  }>;
}

// User can see: "Matched on email (95%) + name (87%)"
```

**Detection:**
- Users report "obviously different" entities merged
- No clear explanation for why entities matched
- Match quality varies wildly between SORs
- Can't A/B test threshold changes (no ground truth)

**Phase impact:** Must be addressed in Phase 1 (entity resolution core). Retrofitting explainability and canaries requires reprocessing to regenerate match metadata.

---

### Pitfall 4: Local-First Sync Naivety

**What goes wrong:** Desktop app goes offline for 2 days. Comes back online, syncs 500 new contacts from GoHighLevel. Entity resolution kicks off, pegs CPU at 100% for 10 minutes while UI freezes. User force-quits.

**Why it happens:** Entity resolution designed for server environment (blocking, CPU-intensive). Didn't account for:
- Offline gaps creating large sync batches
- UI thread blocking (Electron main process)
- Battery/thermal constraints (laptop on battery)
- Network interruptions during multi-step sync

**Consequences:**
- App feels "broken" after being offline
- Users disable auto-sync to avoid freezes
- Battery drain complaints
- Data inconsistency if sync aborts mid-process

**Prevention:**

**1. Incremental processing with backpressure:**
```typescript
class EntityResolutionQueue {
  private queue: EntityBatch[] = [];
  private processing = false;

  async enqueue(entities: Entity[]) {
    // Batch into chunks of 25
    const batches = chunk(entities, 25);
    this.queue.push(...batches);

    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.shift()!;

      // Yield to UI thread between batches
      await new Promise(resolve => setImmediate(resolve));

      // Check battery status
      if (powerMonitor.onBatteryPower && this.queue.length > 10) {
        // Slow down on battery
        await sleep(1000);
      }

      await this.processBatch(batch);

      // Emit progress for UI
      this.emit('progress', {
        processed: this.totalProcessed,
        remaining: this.queue.length * 25
      });
    }

    this.processing = false;
  }
}
```

**2. Resumable sync with checkpoints:**
```typescript
interface SyncCheckpoint {
  sorId: string;
  lastSyncToken: string;  // From SOR API
  lastProcessedId: string;  // Our entity ID
  timestamp: number;
}

// If sync aborts, resume from last checkpoint
async function resumeSync(checkpoint: SyncCheckpoint) {
  const newEntities = await sor.fetchSince(checkpoint.lastSyncToken);
  const unprocessed = newEntities.filter(e => e.id > checkpoint.lastProcessedId);
  // ...
}
```

**3. Background worker for heavy computation:**
```typescript
// In main process
const worker = new Worker('./entity-resolution-worker.js');

worker.postMessage({ type: 'resolve', entities: batch });

worker.on('message', (msg) => {
  if (msg.type === 'progress') {
    mainWindow.webContents.send('sync:progress', msg.data);
  } else if (msg.type === 'result') {
    persistMatches(msg.matches);
  }
});
```

**Detection:**
- App unresponsive during sync (Activity Monitor shows high CPU)
- Sync progress bar freezes or jumps erratically
- "Application Not Responding" dialogs
- Partial sync state after crashes (some entities resolved, others not)

**Phase impact:** Must be addressed in Phase 2 (first SOR integration). If sync is blocking in Phase 2, migrating to async workers in Phase 4 requires rearchitecting sync pipeline.

---

### Pitfall 5: The Bidirectional Temptation

**What goes wrong:** "Since we have all this normalized contact data, let's add a 'sync back to GoHighLevel' feature." Suddenly responsible for:
- Conflict resolution (local edit vs remote edit)
- Write permissions / OAuth scopes
- Data loss bugs (overwrote customer's CRM!)
- Multi-master sync (what if two SORs have same contact?)

**Why it happens:** Feature creep. Seems like small addition ("just POST instead of GET") but bidirectional sync is 10x harder than read-only.

**Consequences:**
- Development velocity craters (every change needs bidirectional testing)
- Data loss incidents destroy trust
- Complex permission model (read vs write per SOR)
- Can't confidently make schema changes (affects write contracts)

**Prevention:**

**1. Architectural invariant:**
```typescript
// In SOR connector interface
interface SORConnector {
  fetch(): Promise<Entity[]>;
  // NO write methods - enforced at type level
}

// Prevent future temptation with explicit marker
const READ_ONLY_INVARIANT = `
  Mnemosyne is a read-only context layer.
  SORs are systems of record; we never write back.
  If you're adding a write method, you're breaking the core design.
  See: docs/architecture/read-only-rationale.md
`;
```

**2. User education:**
```typescript
// In UI, make it clear we don't sync back
<StatusBadge>
  Read-only sync from {sorName}
  <Tooltip>
    Mnemosyne never writes back to {sorName}.
    Changes you make here stay local.
  </Tooltip>
</StatusBadge>
```

**3. Fork over feature:**
If write-back is truly needed, fork the architecture:
- Mnemosyne Core: Read-only context layer
- Mnemosyne Sync (hypothetical): Separate tool for bidirectional sync

**Detection:**
- PM/users request "sync edits back to [SOR]"
- Developer adds write methods to SOR connectors
- OAuth scope creep (requesting write permissions)

**Phase impact:** Not a phase concern (this is an architectural invariant). But must be documented clearly in Phase 0 (design) to prevent scope creep in Phase 3+.

---

## Moderate Pitfalls

### Pitfall 6: LLM-Assisted Resolution Without Escape Hatches

**What goes wrong:** LLM confidently merges wrong entities. User has no way to correct it. Entity graph corrupted, no undo.

**Prevention:**
- Always show LLM reasoning to user before merge
- Require user confirmation for ambiguous matches (confidence < 0.9)
- Persist merge decisions with full audit trail
- Provide "unmerge" action that restores original entities

**Detection:**
- Users report incorrect merges with no way to fix
- Support requests: "How do I undo this?"

**Phase impact:** Phase 2 (entity resolution UI). If merge actions are one-way in Phase 2, adding undo in Phase 4 requires complex state reconstruction.

---

### Pitfall 7: Ignoring Entity Lifecycle

**What goes wrong:** Contact deleted in GoHighLevel but still appears in Mnemosyne. Or worse: contact soft-deleted in SOR (archived), Mnemosyne treats as active.

**Prevention:**
- Track entity lifecycle: active, archived, deleted
- Respect SOR deletion signals
- Periodic reconciliation (full sync to catch missed deletions)
- UI filters to hide deleted/archived entities

**Detection:**
- Users see "ghost" entities that don't exist in source systems
- Entity counts drift from SOR counts

**Phase impact:** Phase 2 (sync implementation). Harder to retrofit deletion handling after entities have accumulated.

---

### Pitfall 8: No Cross-SOR Deduplication Strategy

**What goes wrong:** Same person exists in GoHighLevel and Asana. Mnemosyne shows them as two separate entities. Daily brief mentions same person twice under different names.

**Prevention:**
- Entity resolution must work across SOR boundaries
- Use deterministic IDs that can match cross-SOR (email, phone, domain)
- LLM confirmation for ambiguous cross-SOR matches
- UI to manually link cross-SOR entities

**Detection:**
- Users notice "why is John listed twice?"
- Daily brief redundancy

**Phase impact:** Phase 3 (second SOR). If entity resolution is SOR-scoped in Phase 2, generalizing to cross-SOR in Phase 3 requires index restructuring.

---

### Pitfall 9: Overlooking Rate Limits in Batch Scenarios

**What goes wrong:** Initial sync for GoHighLevel with 10K contacts hits API rate limit (100 req/min). Sync fails, retry logic causes exponential backoff, full sync takes 8 hours.

**Prevention:**
- Respect SOR rate limits (config-driven: `maxRequestsPerMinute`)
- Batch fetches where SOR API supports (pagination)
- Exponential backoff with jitter
- Surface sync progress to user ("30% complete, 2 hours remaining")

**Detection:**
- Initial sync for large accounts fails or takes very long
- SOR API returns 429 errors

**Phase impact:** Phase 2 (first SOR). Rate limit handling is easier to add upfront than retrofit.

---

### Pitfall 10: Normalized Schema Rigidity

**What goes wrong:** Normalized schema designed for contacts (name, email, phone). Add Asana integration, need to normalize tasks. Realize schema doesn't fit (tasks have assignees, not contacts; have due dates, not phone numbers). Force-fit tasks into contact schema, losing fidelity.

**Prevention:**
- Design normalized schema with entity polymorphism
- Use discriminated unions for entity types
- Allow SOR-specific extensions to normalized schema
- Don't over-normalize (some fields can be SOR-specific)

```typescript
type NormalizedEntity =
  | { type: 'person', name: string, email?: string, ... }
  | { type: 'organization', name: string, domain?: string, ... }
  | { type: 'task', title: string, assignee: string, dueDate?: string, ... }
  | { type: 'document', title: string, url: string, ... };
```

**Detection:**
- Second SOR integration requires major schema changes
- Normalized entities have many nullable fields (poor fit)

**Phase impact:** Phase 1 (schema design). Schema changes after data accumulates require migrations.

---

## Minor Pitfalls

### Pitfall 11: No SOR Connector Health Monitoring

**What goes wrong:** GoHighLevel API changes response format. Normalizer fails silently. Daily brief stops updating. User doesn't notice for a week.

**Prevention:**
- Health checks for each SOR connector
- Emit metrics: last successful sync, error rate, entity count delta
- Alert user if sync fails for 24+ hours
- Validate normalized entity schema (Zod runtime checks)

**Phase impact:** Phase 2 (monitoring/alerting).

---

### Pitfall 12: Hardcoded Entity Types

**What goes wrong:** Entity types hardcoded as enum: `type Entity = 'person' | 'organization'`. Add Google Drive, need 'document' type. Change requires code changes in resolution logic, UI filters, etc.

**Prevention:**
- Config-driven entity types
- Generic resolution logic (works for any entity type)
- UI dynamically renders based on available entity types

**Phase impact:** Phase 1 (schema design).

---

### Pitfall 13: Over-Reliance on LLM for Deterministic Cases

**What goes wrong:** Every entity pair goes through LLM confirmation, even obvious matches (same email address). LLM costs spiral, resolution slow.

**Prevention:**
- 3-tier resolution (deterministic → fuzzy → LLM)
- Only escalate to LLM for ambiguous cases
- Track LLM usage per resolution tier (should be <10% of matches)

**Phase impact:** Phase 1 (resolution architecture).

---

### Pitfall 14: No Dry-Run Mode

**What goes wrong:** Deploy new fuzzy matching threshold. Realize it merged 500 entity pairs incorrectly. No way to preview impact before applying.

**Prevention:**
- Dry-run mode for resolution changes
- Show user: "This change would merge 47 entity pairs. Review?"
- Staged rollout (apply to 10% of data first)

**Phase impact:** Phase 2 (resolution tooling).

---

### Pitfall 15: Ignoring Temporal Context

**What goes wrong:** Contact's email changed in GoHighLevel (old: john@acme.com, new: john@newco.com). Mnemosyne treats as two separate people because deterministic ID (email) differs.

**Prevention:**
- Track entity field history (email, phone, name changes)
- Deterministic ID matching considers historical values
- LLM confirmation for "is this the same person?" with temporal evidence

**Phase impact:** Phase 2 (entity versioning). Harder to retrofit after entities accumulated.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Core Resolution | Static resolution (Pitfall #1) | Build feedback loop from day 1 |
| Phase 1: Normalizer Design | Normalizer explosion (Pitfall #2) | Config-driven from first connector |
| Phase 1: Fuzzy Matching | No canaries (Pitfall #3) | Add canary test suite in Phase 1 |
| Phase 2: First SOR Sync | Local-first naivety (Pitfall #4) | Design for offline gaps upfront |
| Phase 2: Sync Implementation | Rate limit failures (Pitfall #9) | Add backoff/batching in Phase 2 |
| Phase 3: Second SOR | No cross-SOR dedup (Pitfall #8) | Generalize resolution to cross-SOR |
| Phase 3: Schema Evolution | Normalized schema rigidity (Pitfall #10) | Use polymorphic entity types |
| All Phases | Bidirectional temptation (Pitfall #5) | Document read-only invariant clearly |

---

## Mnemosyne-Specific Risks

### Risk 1: LLM Feedback Loop Doesn't Close

Mnemosyne design specifies "LLM discoveries feed back into deterministic layer (aliases persisted)." High risk this doesn't actually happen because:
- Requires careful schema design (how to represent LLM-learned aliases?)
- Feedback loop crosses module boundaries (LLM resolution → alias repo → deterministic matcher)
- Testing is hard (need to verify alias persistence, then verify next resolution uses it)

**Mitigation:** Make "alias learning" a first-class feature with explicit tests in Phase 1. Don't defer to "we'll add learning later."

---

### Risk 2: Config-Driven Normalizers Too Generic

Design goal is "next connector should be config, not code." Risk:
- JSONPath + type coercion isn't expressive enough for complex SOR APIs
- Edge cases force escape hatches ("custom normalizer" option)
- Ends up with hybrid: config for simple cases, code for complex → maintenance burden

**Mitigation:** Start with GoHighLevel (likely has quirks). If config handles it, Asana will be easier. If config doesn't handle it, redesign before adding second connector.

---

### Risk 3: Daily Brief Capping Creates Visibility Gaps

"Daily brief capped at 5 items" is good for UX but risky:
- What if 20 important things happened? User misses 15.
- Selection algorithm becomes critical (which 5?)
- No recourse if wrong items selected

**Mitigation:**
- Make selection algorithm transparent ("Showing 5 most recent. View all →")
- Provide "all updates" view
- Let user configure importance criteria

---

## Sources

**IMPORTANT NOTE:** This research was conducted without access to web search, current documentation, or external tools. All findings are based on training data (knowledge cutoff: January 2025) and represent common patterns in entity resolution and cross-system integration as of that date.

**Confidence Level: LOW** - All pitfalls should be verified against:
- Current entity resolution literature (2026)
- Real-world case studies from similar systems
- Vendor documentation for Composio, GoHighLevel, Asana APIs
- Local-first application best practices (Electron, offline-first architectures)

**Recommended verification sources:**
- Entity resolution frameworks: Dedupe, RecordLinkage, Splink documentation
- Master data management case studies
- Composio API documentation for rate limits and normalization patterns
- Electron performance best practices for background processing
- LLM-assisted data integration research (RAG, semantic matching papers)
