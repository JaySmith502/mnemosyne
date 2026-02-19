# Technology Stack

**Project:** Mnemosyne (System of Context Layer)
**Researched:** 2026-02-19
**Overall Confidence:** MEDIUM (training data only, web search unavailable)

## Recommended Stack

### Entity Resolution & Matching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **fastest-levenshtein** | ^1.0.16 | Fuzzy string matching | Fastest pure-JS Levenshtein implementation (10x faster than alternatives), no native deps, Electron-safe |
| **natural** | ^7.0.7 | Phonetic matching (Metaphone/Soundex) | Industry standard for phonetic algorithms, handles name variations (Jon/John), pure JS |
| **compromise** | ^14.14.0 | Name entity extraction | Lightweight NLP for extracting person/org names from unstructured text, no ML model required |
| **Vercel AI SDK** | (existing) | LLM-based resolution | Already integrated - use for tier-3 resolution when fuzzy fails |

**Rationale:**
- **Deterministic first**: Exact key matching (email, phone, domain)
- **Fuzzy second**: Levenshtein distance <3 for typos, Metaphone for phonetic matches
- **LLM last**: Only when previous tiers fail, prevents hallucination risk
- **No embeddings**: Overkill for entity resolution, adds latency + model management overhead

**Confidence:** MEDIUM (versions need verification, pattern is sound)

### Data Normalization & ETL

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | (existing) | Schema validation | Already core to Rowboat's IPC - extend for connector output schemas |
| **date-fns** | ^3.3.1 | Date normalization | Tree-shakeable, immutable, handles timezone-aware parsing from CRM/calendar sources |
| **libphonenumber-js** | ^1.11.0 | Phone number normalization | Handles international formats, validates, extracts country code - critical for CRM data |
| **email-addresses** | ^5.0.0 | Email parsing/validation | RFC-compliant, extracts display name + address, handles edge cases |
| **nanoid** | ^5.0.4 | Entity ID generation | Collision-resistant, URL-safe, 21-char default - use for entity.id |

**Rationale:**
- **Zod-first**: Define normalizer output schemas in `@x/shared`, validate at runtime
- **Specialized parsers**: Don't regex phone/email/dates - use battle-tested libraries
- **No ORMs**: Local-first Markdown + JSON index doesn't need Prisma/TypeORM overhead
- **No Lodash**: Modern JS + date-fns + built-ins cover 95% of needs

**Confidence:** HIGH (Zod existing, others are ecosystem standards)

### Config-Driven Connector Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | (existing) | Connector config schemas | Define `ConnectorConfig<T>` with Zod, type-safe at compile + runtime |
| **Composio SDK** | (existing) | OAuth + API client generation | Already integrated - use for SOR/SOE API calls |
| **p-limit** | ^5.0.0 | Concurrency control | Rate limiting for API calls (e.g., 5 concurrent GHL requests), backpressure handling |
| **p-retry** | ^6.2.0 | Retry with exponential backoff | Handles transient API failures, configurable strategies per connector |
| **ky** | ^1.2.0 | HTTP client (if needed beyond Composio) | Modern fetch wrapper, retry/timeout/hooks built-in, better DX than axios |

**Rationale:**
- **Config as code**: `~/.rowboat/config/connectors.json` defines which sources active, mapping rules
- **Composio-first**: Use existing integration for OAuth flows, don't reinvent
- **Resilience**: SORs rate-limit aggressively - p-limit + p-retry prevent failures
- **No Bull/BullMQ**: Electron single-process, in-memory queue sufficient for daily sync jobs

**Confidence:** HIGH (Composio existing, p-* libraries are standard)

### Job Scheduling & Orchestration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **node-cron** | ^3.0.3 | Cron-style job scheduling | Simple, reliable, human-readable syntax (`0 9 * * *`), no Redis dependency |
| **async-mutex** | ^0.5.0 | Job exclusivity locks | Prevent concurrent daily brief runs, lightweight alternative to distributed locks |
| **pino** | ^9.0.0 | Structured logging | High-performance JSON logging, child loggers for jobs, search/filter in ~/.rowboat/logs |

**Rationale:**
- **Extend existing**: Rowboat has `agent-schedule` module - use node-cron as foundation
- **Local-first locking**: async-mutex for job exclusivity, no external coordinator needed
- **Debuggability**: Pino structured logs make job failures traceable
- **No Agenda/BullMQ**: Require MongoDB/Redis, overkill for Electron desktop app

**Confidence:** HIGH (node-cron is de facto standard for Node cron)

### Knowledge Graph Persistence

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **gray-matter** | ^4.0.3 | YAML frontmatter parsing | Already Obsidian-compatible pattern, use for entity metadata |
| **remark/unified** | ^15.0.0 | Markdown AST manipulation | Update entity notes programmatically (add backlinks, merge properties) |
| **chokidar** | (existing) | Filesystem watching | Already used in workspace watcher - extend for entity index updates |
| **SQLite (better-sqlite3)** | ^11.0.0 | Entity index queryability | Fast lookup by type/property, joins for graph traversal, embeddable |

**Rationale:**
- **Markdown = source of truth**: Entities stored as `~/.rowboat/entities/{type}/{id}.md` with YAML frontmatter
- **SQLite = materialized view**: Rebuild index from Markdown on startup, chokidar keeps in sync
- **No graph DBs**: Neo4j/ArangoDB overkill, SQLite handles graph queries with recursive CTEs
- **Obsidian-compatible**: Users can browse/edit entities directly, backlinks work natively

**Confidence:** HIGH (better-sqlite3 is standard for Electron apps)

### Testing & Quality (if tests added later)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | ^1.3.0 | Unit testing | Native ESM, fast, compatible with Vite (already used in renderer) |
| **@faker-js/faker** | ^8.4.1 | Test data generation | Generate realistic CRM/calendar entities for normalizer tests |

**Confidence:** HIGH (Vitest is Vite's official test framework)

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Entity resolution | fastest-levenshtein + natural | string-similarity | 3x slower, less battle-tested |
| Fuzzy matching | Levenshtein distance | Jaro-Winkler | Levenshtein more widely understood, sufficient for name matching |
| Vector embeddings | None (LLM tier-3 only) | OpenAI embeddings + vector DB | Adds latency, cost, complexity - overkill for deterministic-first approach |
| Job scheduler | node-cron | Agenda | Requires MongoDB, designed for distributed systems |
| Job scheduler | node-cron | BullMQ | Requires Redis, designed for distributed systems |
| HTTP client | Composio SDK | axios | Composio already handles OAuth + API, axios only if custom API needed |
| ORM | None (JSON + SQLite) | Prisma | Local-first Markdown pattern doesn't need migrations, schema drift OK |
| Graph DB | SQLite (recursive CTEs) | Neo4j | Requires separate process, query language learning curve, desktop app unsuitable |
| Validation | Zod (existing) | Yup / Joi | Zod already core to Rowboat, type inference superior |

## Installation

```bash
# Navigate to core package (where business logic lives)
cd apps/x/packages/core

# Entity resolution & matching
pnpm add fastest-levenshtein@^1.0.16 natural@^7.0.7 compromise@^14.14.0

# Data normalization
pnpm add date-fns@^3.3.1 libphonenumber-js@^1.11.0 email-addresses@^5.0.0 nanoid@^5.0.4

# Connector framework
pnpm add p-limit@^5.0.0 p-retry@^6.2.0

# Job scheduling
pnpm add node-cron@^3.0.3 async-mutex@^0.5.0 pino@^9.0.0

# Knowledge graph
pnpm add gray-matter@^4.0.3 unified@^11.0.4 remark@^15.0.1 remark-parse@^11.0.0 remark-stringify@^11.0.0 better-sqlite3@^11.0.0

# Dev dependencies (if testing added)
pnpm add -D vitest@^1.3.0 @faker-js/faker@^8.4.1
```

**Note:** Verify versions are current before installation (research conducted without web access on 2026-02-19).

## Integration with Existing Stack

### Leverage Existing Infrastructure

| Existing | How Mnemosyne Uses It |
|----------|----------------------|
| **Zod** | Extend for `EntitySchema`, `ConnectorConfigSchema`, normalizer output validation |
| **Awilix DI** | Register singletons: `EntityIndex`, `ConnectorRegistry`, `DailyBriefAgent` |
| **Vercel AI SDK** | LLM tier-3 resolution, tension detection agent, daily brief generation |
| **Composio** | All SOR/SOE API calls (GHL, Asana, Gmail, Calendar) |
| **IPC system** | New channels: `entities:resolve`, `connectors:sync`, `insights:getDailyBrief` |
| **Workspace watcher (chokidar)** | Extend to watch `~/.rowboat/entities/` for manual edits |
| **Event bus** | Emit `entity:resolved`, `connector:synced`, `insight:detected` |

### New Modules to Create

```
packages/core/src/
├── entity-resolution/
│   ├── index.ts              # EntityIndex class (SQLite + Markdown sync)
│   ├── resolvers.ts          # 3-tier resolution: deterministic → fuzzy → LLM
│   ├── matchers.ts           # Levenshtein, Metaphone, custom similarity functions
│   └── schema.ts             # EntitySchema definitions (Person, Organization, Project)
│
├── connectors/
│   ├── registry.ts           # ConnectorRegistry (config-driven, Composio-backed)
│   ├── normalizers/
│   │   ├── gohighlevel.ts    # GHL contact → Person normalizer
│   │   ├── asana.ts          # Asana task → Project normalizer
│   │   └── base.ts           # Abstract Normalizer<TSource, TEntity>
│   └── scheduler.ts          # node-cron job definitions
│
└── insights/
    ├── daily-brief.ts        # Daily brief agent (scheduled 9am)
    ├── tension-detector.ts   # Proactive insight generator
    └── templates/            # Prompt templates for insight agents
```

## Architecture Decisions

### Why SQLite for Entity Index?

**Pros:**
- Embeddable, no separate process (critical for Electron)
- Fast lookups by indexed properties (email, domain, phone)
- Recursive CTEs handle graph traversal (find all entities linked to Person X)
- better-sqlite3 is synchronous (simpler than async ORMs)
- Rebuild from Markdown on startup = self-healing

**Cons:**
- Not a "native" graph DB (no Cypher-like query language)
- Manual index management (acceptable with migrations)

**Decision:** SQLite materialized view with Markdown as source of truth. Graph DBs (Neo4j, ArangoDB) require separate processes unsuitable for desktop apps.

### Why Not Embeddings for Entity Resolution?

**Pros of embeddings:**
- Semantic similarity ("John Smith" ≈ "J. Smith, Esq.")

**Cons:**
- Latency: Embedding generation + vector search adds 100-500ms per resolution
- Cost: OpenAI embeddings cost per token
- Model management: Requires local embedding model (Transformers.js) or API dependency
- Explainability: Distance threshold tuning is black-box

**Decision:** 3-tier deterministic → fuzzy → LLM covers 95% of cases. LLM tier-3 provides semantic understanding when needed, with reasoning trace for debugging.

### Why node-cron vs BullMQ?

**BullMQ requirements:**
- Redis (external dependency)
- Designed for distributed systems (multiple workers)
- Overkill for daily brief (1 job, 1 schedule)

**node-cron advantages:**
- Zero dependencies beyond Node
- Human-readable cron syntax
- Sufficient for desktop app (single process)
- Combine with async-mutex for exclusivity

**Decision:** node-cron for scheduling, async-mutex for locks, pino for observability. Revisit if multi-machine orchestration needed (unlikely for local-first app).

## Version Verification Needed

**IMPORTANT:** Research conducted without web search access. Verify versions before installation:

| Package | Stated Version | Confidence | Verification Needed |
|---------|---------------|------------|---------------------|
| fastest-levenshtein | ^1.0.16 | LOW | Check npm for latest 1.x release |
| natural | ^7.0.7 | LOW | Check npm for latest 7.x release |
| compromise | ^14.14.0 | LOW | Check npm for latest 14.x release |
| date-fns | ^3.3.1 | MEDIUM | Training data from late 2024, likely current |
| libphonenumber-js | ^1.11.0 | LOW | Check npm for latest 1.x release |
| email-addresses | ^5.0.0 | LOW | Check npm for latest 5.x release |
| nanoid | ^5.0.4 | MEDIUM | 5.x released in 2024, likely current |
| p-limit | ^5.0.0 | MEDIUM | Sindre Sorhus package, 5.x is ESM-only |
| p-retry | ^6.2.0 | MEDIUM | Sindre Sorhus package, 6.x is ESM-only |
| ky | ^1.2.0 | LOW | Check npm for latest 1.x release |
| node-cron | ^3.0.3 | MEDIUM | Stable package, 3.x released in 2022 |
| async-mutex | ^0.5.0 | LOW | Check npm for latest release |
| pino | ^9.0.0 | MEDIUM | 9.x released in 2024 |
| gray-matter | ^4.0.3 | HIGH | Stable package, 4.x long-term |
| unified | ^11.0.4 | MEDIUM | Check remark ecosystem versions (15.x mentioned) |
| better-sqlite3 | ^11.0.0 | LOW | Check npm for latest release, verify Electron 39 compatibility |
| vitest | ^1.3.0 | LOW | Check npm for latest 1.x release |

## Anti-Recommendations

### Do NOT Use

| Technology | Why Not |
|------------|---------|
| **Lodash** | Modern JS (flatMap, groupBy proposal, Object methods) + date-fns covers needs, tree-shaking inconsistent |
| **Moment.js** | Deprecated, use date-fns instead |
| **axios** | Composio SDK handles OAuth + API, only add if custom API needed (use ky instead) |
| **Prisma** | ORM for SQL DBs with migrations, incompatible with "Markdown = source of truth" pattern |
| **TypeORM** | Same as Prisma, adds complexity to simple SQLite index |
| **Neo4j / ArangoDB** | Graph DBs requiring separate process, unsuitable for Electron desktop app |
| **Agenda** | Job scheduler requiring MongoDB, overkill for local-first app |
| **BullMQ** | Job queue requiring Redis, designed for distributed systems |
| **Embeddings (local)** | Transformers.js adds 50+ MB models, slow cold start, unnecessary for deterministic-first resolution |
| **Luxon** | date-fns has better tree-shaking and smaller bundle size |
| **validator.js** | Zod already handles validation, redundant |

## Sources

**Research Limitation:** WebSearch and Brave Search were unavailable during research (2026-02-19). Recommendations based on:
- Training data (January 2025 cutoff)
- Existing Rowboat stack analysis (CLAUDE.md, milestone context)
- Standard TypeScript/Electron ecosystem patterns

**Required Verification:**
- [ ] npm version checks for all packages
- [ ] Electron 39 compatibility for better-sqlite3 (native module)
- [ ] ESM vs CJS compatibility (p-limit/p-retry are ESM-only in 5.x/6.x)
- [ ] Unified/remark ecosystem version alignment

**Next Steps:**
1. Run `npm view <package> version` for each to get current releases
2. Check better-sqlite3 prebuilt binaries for Electron 39 support
3. Verify ESM compatibility with esbuild bundling in apps/main
