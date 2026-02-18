# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Rowboat

Local-first AI coworker that builds a knowledge graph from email/meetings and acts on it. Electron desktop app with an Obsidian-compatible Markdown vault at `~/.rowboat/knowledge/`.

## Commands

```bash
# Electron App (apps/x) — primary development target
cd apps/x && pnpm install          # Install dependencies
cd apps/x && npm run deps          # Build workspace packages (shared → core → preload)
cd apps/x && npm run dev           # Development mode (builds deps, runs app)
cd apps/x && npm run lint          # Lint check
cd apps/x && npm run deps && npm run lint  # Verify compilation

# Packaging
cd apps/x/apps/main && npm run package   # Production build
cd apps/x/apps/main && npm run make      # Create distributable (DMG/Squirrel/Deb)
```

No test suite exists in this codebase.

## Monorepo Structure

```
rowboat/
├── apps/x/              # Electron desktop app (primary focus)
├── apps/rowboat/        # Next.js web dashboard
├── apps/rowboatx/       # Next.js frontend
├── apps/cli/            # CLI tool
├── apps/python-sdk/     # Python SDK
└── apps/docs/           # Documentation site
```

The Electron app (`apps/x`) is a **nested pnpm workspace** — it has its own `pnpm-workspace.yaml` and lockfile, separate from the monorepo root.

## Electron App Architecture (apps/x)

### Workspace Packages and Build Order

```
packages/shared  (@x/shared)  — Types, Zod schemas, validators
       ↓
packages/core    (@x/core)    — Business logic, AI, OAuth, MCP, knowledge graph
       ↓
apps/preload                  — Electron preload (contextBridge)
       ↓
apps/renderer                 — React UI (Vite)
apps/main                     — Electron main process (esbuild → single CJS bundle)
```

`npm run deps` builds: shared → core → preload. The renderer hot-reloads in dev; main process requires restart.

### Why esbuild for main?

pnpm symlinks break Electron Forge's dependency walker. esbuild bundles everything into a single CJS file, eliminating node_modules from the packaged app.

### IPC Architecture (Critical Pattern)

All main↔renderer communication goes through a **type-safe, Zod-validated IPC system**:

1. **Schema definition** — `packages/shared/src/ipc.ts` is the single source of truth. Every channel has Zod schemas for request and response payloads.
2. **Preload bridge** — `apps/preload/src/preload.ts` exposes `window.ipc.invoke()` and `window.ipc.send()` via `contextBridge`.
3. **Main handlers** — `apps/main/src/ipc.ts` registers handlers with exhaustive coverage enforced at compile time.
4. **Runtime validation** — Both request and response payloads are validated at runtime through Zod.

Channel types:
- **InvokeChannels**: Request/response (e.g., `workspace:readFile`, `runs:create`, `models:list`)
- **SendChannels**: Fire-and-forget, pushed from main (e.g., `workspace:didChange`, `runs:events`, `oauth:didConnect`)

To add a new IPC channel: define schema in `shared/src/ipc.ts` → add handler in `main/src/ipc.ts` → call from renderer via `window.ipc.invoke()`.

### Core Package Modules (packages/core/src/)

| Module | Purpose |
|--------|---------|
| `/agents` | AgentRuntime: LLM streaming + tool execution orchestration |
| `/agent-schedule` | Cron-like scheduler for background agents |
| `/application/assistant` | Copilot agent definition, system prompt, modular skills system |
| `/application/lib` | Builtin tools, event bus, message queue, command executor |
| `/auth` | OAuth 2.0 + PKCE via openid-client (token refresh, DCR, encryption) |
| `/composio` | Composio API integration for external toolkits |
| `/config` | WorkDir setup (`~/.rowboat`), config file initialization |
| `/di` | Awilix dependency injection container (singletons) |
| `/knowledge` | Knowledge graph builder, source syncing (Gmail/Calendar/Fireflies/Granola), entity extraction |
| `/mcp` | MCP client manager (stdio/HTTP/SSE transports) |
| `/models` | LLM provider factory (OpenAI, Anthropic, Google, Ollama, OpenRouter, etc.) |
| `/runs` | Run lifecycle: CRUD, JSONL event log persistence, abort registry, concurrency locks |
| `/workspace` | Filesystem abstraction with path boundary validation + chokidar watcher |

### Renderer Architecture (apps/renderer/src/)

**No router** — single-page app with conditional rendering based on active file path, run ID, or sidebar section.

**No Redux/Zustand** — state managed through React hooks + contexts. Data flows through IPC calls and event listeners.

Key contexts: `ThemeContext`, `SidebarSectionContext`, `FileCardContext`

Component organization:
- `/components/ai-elements/` — Conversation UI: messages, tool calls, permissions, reasoning display
- `/components/` — Core: markdown editor (Lexical), graph view (D3.js force-directed), settings, onboarding
- `/components/ui/` — Radix UI primitives with TailwindCSS

### Knowledge Graph System

Entity-based accumulating context (not event logs). Runs every 30 seconds via `build_graph.ts`:

1. **Sources sync** to `~/.rowboat/`: Gmail → `gmail_sync/`, Calendar → `gmail_sync/`, Fireflies → `fireflies_transcripts/`, Granola → `granola_notes/`
2. **Change detection** — hybrid mtime + SHA-256 hash (state in `knowledge_graph_state.json`)
3. **Note creation agent** processes batches of 25 files, extracts entities (people/projects/orgs/topics)
4. **Output** — Markdown notes in `~/.rowboat/knowledge/` with backlinks

Strictness levels (high/medium/low) control what sources generate notes. Auto-configured from email pattern analysis on first run. Config: `~/.rowboat/config/note_creation.json`.

### OAuth Flow

PKCE authorization code flow via `openid-client`. Local callback server on port 8080. Tokens encrypted at rest in `~/.rowboat/config/oauth_tokens.json`. Dynamic Client Registration supported. 2-minute timeout on auth flows.

### MCP Integration

Config: `~/.rowboat/config/mcp_servers.json`. Supports stdio (local processes) and HTTP/SSE transports. Clients are lazy-created and cached per server. Force-closed on run abort.

## Config Files (all under ~/.rowboat/config/)

| File | Purpose |
|------|---------|
| `models.json` | LLM provider config: `{ provider: { flavor, apiKey?, baseURL?, headers? }, model }` |
| `models.dev.json` | Cached models.dev catalog |
| `mcp_servers.json` | MCP server definitions |
| `oauth_tokens.json` | Encrypted OAuth tokens |
| `oauth_client_registrations.json` | DCR client registrations |
| `note_creation.json` | Knowledge graph strictness config |
| `deepgram.json` | Voice notes API key |
| `brave-search.json` / `exa-search.json` | Web search API keys |
| `granola.json` | Granola integration config |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 39.x |
| UI | React 19, Vite 7, TailwindCSS, Radix UI |
| AI | Vercel AI SDK, multiple provider SDKs |
| Build | TypeScript 5.9 (ES2022), esbuild, Electron Forge |
| Validation | Zod (schemas shared across all processes) |
| DI | Awilix (singleton container in core) |
| Auth | openid-client (PKCE + DCR) |
| MCP | @modelcontextprotocol/sdk |

## Key Architectural Patterns

- **Zod as source of truth**: Types are inferred from Zod schemas, never manually duplicated. This applies to IPC channels, run events, agent configs, and all shared types.
- **Event-driven**: Event buses for runs (`runs/bus.ts`), services (`services/`), and workspace changes (`workspace/watcher.ts`).
- **Security model**: Renderer is fully sandboxed (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`). All Node.js access goes through the IPC bridge. Workspace paths are boundary-validated.
- **Package manager**: Must use pnpm (required for `workspace:*` protocol). Add dependencies from inside the target package directory.
