# Procyon Constitution

<!--
Sync Impact Report:
- Version: 1.0.0 → 1.1.0
- Ratification: 2025-12-05
- Last Amended: 2025-12-06
- Modified Principles: V. Session-Based Authentication → V. Supabase Authentication
- Added Sections: None
- Removed Sections: None
- Templates Status:
  ✅ plan-template.md - Constitution Check section aligned
  ✅ spec-template.md - Requirements and user story structure aligned
  ✅ tasks-template.md - Task organization reflects principles
  ⚠ checklist-template.md - Needs review for principle alignment
  ⚠ agent-file-template.md - Needs review for principle alignment
- Follow-up TODOs:
  - Update plan-template.md Constitution Check to reference "Supabase Authentication" instead of "Session-Based Authentication"
  - Update AGENTS.md and .github/copilot-instructions.md after 002-supabase-auth implementation
-->

## Core Principles

### I. Modular Game Architecture

**Principle**: Each game variant (Chess, Xiangqi, Shogi, Jungle) MUST follow the identical four-module pattern:

- `types.ts` - Core interfaces and enums (pieces, moves, positions)
- `board.ts` - Board representation and piece management
- `moves.ts` - Legal move generation and validation
- `game.ts` - Game state, turn management, win conditions

**Rationale**: Consistency across game variants enables maintainability, knowledge transfer between games, and ensures quality standards apply uniformly. New developers can immediately understand any game variant by following the established pattern.

**Non-Negotiable Rules**:

- Every new game variant MUST implement all four modules
- Module responsibilities MUST NOT overlap or merge
- Game logic MUST be framework-agnostic (no React/Astro dependencies in game modules)
- Each module MUST have corresponding unit tests

### II. Universal AI Adapter Pattern

**Principle**: AI integration MUST use the universal service pattern with game-specific adapters:

- Core orchestration via `UniversalAIService` for provider communication
- Game-specific adapters convert state to prompts and parse responses
- `RuleGuardian` validates ALL AI moves before application
- Factory pattern creates AI instances per game variant

**Rationale**: Supporting multiple AI providers (Gemini, OpenAI, Anthropic, OpenRouter, Chutes) without duplicating provider logic requires separation of concerns. Game-specific logic stays in adapters while provider communication remains centralized.

**Non-Negotiable Rules**:

- AI responses MUST follow strict JSON format with move notation and reasoning
- All AI moves MUST pass `RuleGuardian` validation
- Provider API keys MUST be masked in responses (`***${key.slice(-4)}`)
- Interaction history MUST be tracked for game export functionality

### III. Bun-First Development

**Principle**: Bun is the canonical runtime and package manager. All commands, scripts, and tooling MUST use Bun over npm/node/yarn/pnpm.

**Rationale**: Bun provides unified runtime, package management, test runner, and bundler. Using multiple tools increases complexity, slows CI/CD, and creates inconsistencies in local vs production environments.

**Non-Negotiable Rules**:

- All `package.json` scripts MUST use `bun` commands
- Tests MUST use Bun's built-in test runner
- Documentation MUST reference `bun` commands exclusively
- Dependencies MUST be installed with `bun install`

### IV. Dual Database Strategy

**Principle**: Database configuration MUST support both local development (SQLite via better-sqlite3) and production (Cloudflare D1) using Drizzle ORM.

**Rationale**: Local SQLite enables fast iteration without network dependencies or cloud costs. D1 provides production scalability and edge deployment. Drizzle ORM abstracts the differences.

**Non-Negotiable Rules**:

- Database initialization MUST check `NODE_ENV` to select driver
- Schema MUST be defined in `apps/api/src/db/schema.ts`
- Migrations for local dev MUST use `drizzle.config.dev.ts`
- Production migrations MUST use `drizzle.config.ts`
- Code MUST NOT assume specific database implementation details

### V. Supabase Authentication

**Principle**: Authentication MUST use Supabase Auth with JWT-based authentication. User identity is managed by Supabase while application data remains in D1/SQLite.

**Rationale**: Supabase provides a managed authentication service with built-in user management dashboard, email verification, password reset, OAuth provider support, and secure token handling. JWTs are validated server-side on every protected request.

**Non-Negotiable Rules**:

- Protected routes MUST use `authMiddleware` from `apps/api/src/auth/middleware.ts` to validate Supabase JWTs
- Frontend MUST use Supabase client from `apps/web/src/lib/auth.ts`
- Passwords MUST be handled by Supabase Auth (never manual hashing)
- User metadata (username, display name) MUST be stored in Supabase user metadata
- Application data (ai_configurations, play_history) MUST remain in D1 with TEXT userId referencing Supabase UUIDs
- Supabase service role key MUST be stored in Wrangler secrets for production, never committed to version control

### VI. Monorepo Organization

**Principle**: Code MUST be organized in Turbo monorepo structure with clear workspace separation:

- `apps/web` - Astro SSR + React frontend (port 3500)
- `apps/api` - Hono API server (port 3501)
- `packages/*` - Shared packages (future)

**Rationale**: Monorepo enables code sharing, coordinated versioning, and single-command operations while maintaining clear boundaries between frontend and backend concerns.

**Non-Negotiable Rules**:

- Apps MUST NOT import from each other's source code
- Shared code MUST move to `packages/` when needed by multiple apps
- Each app MUST have its own `package.json` and dependencies
- Root-level commands MUST use Turbo for orchestration

### VII. TypeScript Strictness

**Principle**: All TypeScript code MUST use strict mode with no `any` types except in explicitly justified cases.

**Rationale**: Strict TypeScript catches bugs at compile time, enables better IDE support, and serves as living documentation. `any` types defeat type safety and should be rare exceptions.

**Non-Negotiable Rules**:

- `strict: true` MUST be enabled in all tsconfig files
- `any` types MUST have inline comments justifying their use
- Type definitions MUST be colocated with modules (prefer local types)
- Shared types between apps MUST move to `packages/` when extracted

## Testing Standards

### Unit Testing

**Principle**: Game logic MUST have unit tests using Bun's test runner. UI components testing is optional.

**Rationale**: Game rules are complex and critical - bugs break user experience. Unit tests ensure move validation, board state, and game logic correctness without requiring browser testing.

**Requirements**:

- All game modules (`types.ts`, `board.ts`, `moves.ts`, `game.ts`) MUST have `.test.ts` files
- Tests MUST be runnable via `bun test`
- Tests MUST NOT depend on external services or databases
- Test files MUST be colocated with source files

### E2E Testing

**Principle**: User-facing features MUST have E2E tests using Playwright with mocked external APIs.

**Rationale**: E2E tests validate complete user journeys including authentication, game play, and AI integration. Mocking external APIs ensures tests are fast, reliable, and don't incur API costs.

**Requirements**:

- Tests MUST be in `apps/web/e2e/` directory
- AI provider APIs MUST be mocked using `page.route()`
- Auth flows MUST use `AuthHelper` utilities from `e2e/utils/auth-helpers.ts`
- Tests MUST assume servers are running locally (started by Playwright on CI)
- Unique test users MUST be generated with timestamps

## Code Quality Standards

### Linting and Formatting

**Principle**: All code MUST pass ESLint and Prettier checks before commit.

**Rationale**: Consistent formatting reduces diff noise, prevents bikeshedding, and enforces code quality standards. Pre-commit hooks catch issues before they reach CI.

**Requirements**:

- Husky + lint-staged MUST enforce pre-commit checks
- ESLint 9 with TypeScript support MUST be configured
- Prettier with Astro plugin MUST format all files
- Commits failing lint checks MUST be rejected

### Component Styling

**Principle**: UI styling MUST use Tailwind CSS with utility classes and composition utilities (clsx, tailwind-merge, class-variance-authority).

**Rationale**: Tailwind provides consistent design tokens, reduces CSS bundle size, and enables rapid iteration. Composition utilities prevent class conflicts and enable variant-based styling.

**Requirements**:

- Custom CSS MUST be justified (when Tailwind utilities insufficient)
- Class composition MUST use `cn()` helper from `tailwind-merge`
- Component variants MUST use `cva()` from `class-variance-authority`
- Design tokens MUST be defined in Tailwind config

## Workflow Standards

### Development Workflow

**Principle**: Features MUST follow the specification workflow: spec → plan → tasks → implementation.

**Rationale**: Planning before coding ensures requirements are understood, edge cases are considered, and implementation is scoped correctly. Templates provide consistency.

**Requirements**:

- Feature specs MUST live in `specs/[###-feature-name]/spec.md`
- User stories MUST be prioritized and independently testable
- Implementation plans MUST include constitution compliance check
- Tasks MUST be organized by user story with clear dependencies

### Git Workflow

**Principle**: Feature branches MUST follow naming convention `[###-feature-name]` and require review before merge.

**Rationale**: Consistent naming enables automation, links code to specs, and provides context in git history. Reviews catch bugs and share knowledge.

**Requirements**:

- Branch names MUST match feature spec directory names
- Commits MUST be atomic and have descriptive messages
- PRs MUST reference related spec/task documentation
- Main branch MUST remain deployable at all times

## Governance

### Amendment Process

This constitution supersedes all other development practices and standards. Amendments require:

1. **Proposal**: Document proposed changes with rationale
2. **Review**: Team discussion of impact and alternatives
3. **Version Bump**: Semantic versioning (MAJOR.MINOR.PATCH)
   - MAJOR: Backward incompatible principle changes or removals
   - MINOR: New principles or materially expanded guidance
   - PATCH: Clarifications, wording, typo fixes
4. **Migration Plan**: Document changes needed in existing code
5. **Template Sync**: Update all affected templates and documentation

### Compliance Review

All pull requests and code reviews MUST verify constitutional compliance:

- Architecture patterns match Core Principles (I-VII)
- Testing requirements met per Testing Standards
- Code quality checks pass per Code Quality Standards
- Workflow followed per Workflow Standards

### Complexity Justification

Deviations from constitution principles MUST be justified in writing:

- Document why simpler alternative insufficient
- Explain specific problem being solved
- Provide migration path back to compliance when possible
- Obtain team consensus before proceeding

### Version History

**Version**: 1.1.0 | **Ratified**: 2025-12-05 | **Last Amended**: 2025-12-06

**Changelog**:

- 1.1.0 (2025-12-06): Amended § V to replace Better Auth with Supabase Auth (feature 002-supabase-auth)
- 1.0.0 (2025-12-05): Initial constitution ratified
