<!--
Sync Impact Report - Constitution v1.0.0
========================================
Version Change: Initial → 1.0.0 (MINOR: New constitution created)
Ratification Date: 2025-10-27
Last Amendment: 2025-10-27

Modified Principles:
- Created: I. Monorepo Architecture (Turbo + Bun workspaces)
- Created: II. TypeScript-First Development
- Created: III. E2E Test Coverage (Playwright)
- Created: IV. Module Independence
- Created: V. Environment-Aware Configuration
- Created: VI. Code Quality & Conventions

Added Sections:
- Core Principles (6 principles)
- Technology Stack Requirements
- Development Workflow & Quality Gates
- Governance

Templates Status:
✅ plan-template.md - Verified compatible (references constitution check)
✅ spec-template.md - Verified compatible (user stories align with test-first)
✅ tasks-template.md - Verified compatible (phase structure supports modular approach)
⚠️  No commands directory found - skipped command verification

Follow-up TODOs:
- None - all placeholders filled with project-specific values
-->

# Procyon Chess Platform Constitution

## Core Principles

### I. Monorepo Architecture

All code MUST be organized within the Turbo + Bun monorepo structure with clear workspace boundaries:

- `apps/web/` - Astro SSR frontend with React islands (port 3500)
- `apps/api/` - Hono API server with Node.js adapter (port 3501)
- `packages/*` - Shared utilities and cross-cutting concerns
- Tests colocated with implementation or in dedicated `tests/e2e/` directory

**Rationale**: Turbo orchestration enables efficient caching, parallel builds, and atomic changes across web/API boundaries. Bun provides fast package management and runtime consistency.

### II. TypeScript-First Development

All production code MUST be written in TypeScript with strict type checking enabled:

- Strict TypeScript across monorepo with shared `tsconfig.json`
- Interface-driven design for game logic: `GameState`, `Move`, `Position` types per variant
- Discriminated unions for game status, piece types, and variant-specific enums
- Zod validation at API boundaries (`@hono/zod-validator`)

**Rationale**: Type safety prevents runtime errors in complex game logic (chess, xiangqi, shogi variants) and ensures contract compliance between frontend/backend.

### III. E2E Test Coverage (Playwright)

Critical user flows MUST have Playwright E2E test coverage:

- Authentication flows (registration, login, JWT persistence)
- Game variant initialization and AI opponent interaction
- AI configuration management (multi-provider setup, API key masking)
- Tests MUST use route interception for external AI API calls
- Helper utilities (e.g., `AuthHelper`) MUST provide reusable test patterns

**Rationale**: Game logic complexity and multi-provider AI integration require end-to-end validation. Mocked AI responses ensure deterministic testing without API costs.

### IV. Module Independence

Game variants and domain modules MUST be independently implementable and testable:

- Each game variant (`chess/`, `xiangqi/`, `shogi/`) follows consistent structure: `types.ts`, `board.ts`, `moves.ts`, `game.ts`
- AI adapters (`{game}-adapter.ts`) isolate game-specific AI prompts from universal AI orchestration
- Database layer abstracts SQLite (dev) vs D1 (production) via environment-aware initialization
- React components colocated by feature in `apps/web/src/components/`

**Rationale**: Independent modules enable parallel development, variant-specific testing, and incremental feature rollout without cross-contamination.

### V. Environment-Aware Configuration

Configuration MUST adapt to development vs production environments:

- Database: Local SQLite (`apps/api/dev.db`) for development, Cloudflare D1 for production
- Drizzle configs: `drizzle.config.dev.ts` for local, `drizzle.config.ts` for production
- API keys masked in responses (`***${key.slice(-4)}`)
- Secrets in `.env` files excluded from version control
- CORS configured for localhost origins in development

**Rationale**: Environment-specific configs prevent production secrets leakage and enable local-first development without cloud dependencies.

### VI. Code Quality & Conventions

Code style and quality gates MUST be enforced via tooling:

- Prettier formatting (`bun run format:check`) with four-space TypeScript blocks, LF endings, single quotes
- ESLint rules flag unused symbols (except `_ignored`) and warn on non-API `console` usage
- Naming: PascalCase (components), camelCase (helpers), kebab-case (routes/URLs)
- Conventional Commits (e.g., `feat(web): add pricing card`)
- Pre-commit hooks via Husky + lint-staged

**Rationale**: Automated quality gates reduce review friction and maintain consistent codebase readability across team members.

## Technology Stack Requirements

### Mandatory Technologies

- **Package Manager & Runtime**: Bun (NOT npm/yarn/pnpm) - MUST use `bun` commands
- **Monorepo Orchestration**: Turbo (caching, parallel execution, filtered runs)
- **Frontend**: Astro (SSR mode) + React (islands architecture) + Tailwind CSS
- **Backend**: Hono (API framework) + @hono/node-server adapter
- **Database**: Drizzle ORM with SQLite (dev) / Cloudflare D1 (production)
- **Auth**: JWT-based with bcryptjs hashing and middleware pattern
- **Testing**: Bun test runner (unit/integration) + Playwright (E2E)
- **Validation**: Zod schemas at API boundaries

### AI Provider Integrations

Multiple AI providers MUST be supported with per-user configuration:

- Supported: Gemini, OpenAI, Anthropic, OpenRouter
- Game-specific prompts with position analysis and move validation
- Strict JSON format validation for AI responses
- Universal AI service with game-specific adapters

## Development Workflow & Quality Gates

### Pre-Development Checklist

Before starting feature work:

1. Ensure `bun install` has run at root
2. Verify `apps/api/dev.db` exists (run `bun run --filter api db:migrate` if missing)
3. Confirm ports 3500 (web) and 3501 (API) are available
4. Review relevant game variant structure in `apps/web/src/lib/{game}/`

### Implementation Flow

1. **Type Definitions**: Update `types.ts` for affected game variant
2. **Core Logic**: Implement in respective modules (`board.ts`, `moves.ts`, `game.ts`)
3. **API Layer**: Create route in `apps/api/src/routes/`, add Zod validation, register in `index.ts`
4. **Frontend**: Create/update React components in `apps/web/src/components/`
5. **E2E Tests**: Add Playwright specs with mocked AI responses
6. **Documentation**: Update relevant docs (AGENTS.md, copilot-instructions.md)

### Quality Gates (Pre-PR)

All PRs MUST pass:

- `bun run lint` - No ESLint errors
- `bun run test` - All unit/integration tests pass
- `bun run test:e2e` - E2E tests pass (or note skipped with justification)
- Database migrations applied if schema changed
- No unmasked secrets or API keys in code/logs

### PR Requirements

- Follow Conventional Commits format
- Scope commits narrowly with context-rich bodies
- Include screenshots/recordings for UI changes
- Attach Playwright report for E2E test changes
- Explicitly call out schema/migration impacts
- Link related issues

## Governance

### Amendment Process

1. Propose change with rationale (why current constitution insufficient)
2. Document impact on existing features/templates
3. Update affected templates in `.specify/templates/`
4. Increment version per semantic versioning rules
5. Update Sync Impact Report at top of constitution

### Versioning Policy

- **MAJOR**: Backward incompatible governance/principle removals or redefinitions
- **MINOR**: New principle/section added or materially expanded guidance
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements

### Compliance Review

- All specification/plan documents MUST reference constitution principles in "Constitution Check" sections
- Task breakdowns MUST align with module independence principle
- Code reviews MUST verify adherence to TypeScript-first and code quality principles
- E2E test coverage MUST be justified if absent for critical flows

### Runtime Development Guidance

For agent-specific development instructions, consult:

- `.github/copilot-instructions.md` - GitHub Copilot guidance
- `AGENTS.md` - Repository guidelines and structure
- `.specify/templates/*.md` - Specification and planning templates

**Version**: 1.0.0 | **Ratified**: 2025-10-27 | **Last Amended**: 2025-10-27
