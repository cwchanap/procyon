# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Procyon is a monorepo multi-variant chess platform built with TypeScript, featuring:

- **Web app** (Astro SSR + React + Tailwind CSS) - Frontend interface for Chess, Xiangqi, Shogi, and Jungle
- **API server** (Hono) - Backend services with Supabase Auth and database
- **AI Integration** - Universal AI system supporting multiple providers (Gemini, OpenAI, Anthropic, OpenRouter, Chutes)
- **Turbo** - Monorepo build system and task orchestration
- **Bun** - Package manager and runtime (prefer over npm/node/yarn/pnpm)

## Architecture

### Monorepo Structure

```
apps/
├── web/          # Astro + React frontend (port 3500)
└── api/          # Hono API server (port 3501)
packages/         # Shared packages (currently empty)
```

### Web App (`apps/web`)

- **Framework**: Astro SSR with React integration and Tailwind CSS
- **Game Engines**: Each variant follows the same modular pattern in `src/lib/{chess,xiangqi,shogi,jungle}/`:
  - `types.ts` - Core types (pieces, moves, game state)
  - `board.ts` - Board representation and piece management
  - `moves.ts` - Move validation and legal move generation
  - `game.ts` - Game state and turn management
- **AI System**: `src/lib/ai/`
  - `service.ts` - Core AI orchestration (`UniversalAIService`)
  - `{chess,xiangqi,shogi,jungle}-adapter.ts` - Game-specific AI adapters
  - `factory.ts` - Creates AI instances per game variant
  - `rule-guardian.ts` - Validates AI moves against game rules
  - `storage.ts` - Persists AI configurations
- **Components**: React components in `src/components/`
  - Game components: `ChessGame.tsx`, `XiangqiGame.tsx`, `ShogiGame.tsx`, `JungleGame.tsx`
  - UI components in `src/components/ui/`

### API Server (`apps/api`)

- **Framework**: Hono with Node.js adapter
- **Database**: Drizzle ORM with dual setup:
  - **Development**: Local SQLite via better-sqlite3 (`dev.db`)
  - **Production**: Cloudflare D1 via bindings
- **Authentication**: Supabase Auth with JWT-based authentication
  - Middleware: `src/auth/middleware.ts` (`authMiddleware` for protected routes, validates Supabase JWT)
  - Routes: `src/routes/auth.ts` (registration/login via Supabase)
  - Supabase Client: `src/auth/supabase.ts` (service role + anon key clients)
  - Rate Limiting: `src/auth/rate-limit.ts` (in-memory rate limiting for login attempts)
- **Dual entry points**:
  - `src/index.ts` - Node.js server for local development (uses `@hono/node-server`)
  - `src/worker.ts` - Cloudflare Workers entry point for production (uses D1 binding)
- **Schema**: `src/db/schema.ts` defines application tables (user data lives in Supabase):
  - `ai_configurations`, `play_history` - AI provider settings and game records
  - `player_ratings`, `rating_history` - ELO-based per-variant ratings
  - `ai_opponent_ratings` - Configurable AI opponent rating presets
  - `puzzles`, `user_puzzle_progress` - Chess puzzle content and per-user progress
- **Routes**:
  - `/api/auth` - Registration, login, session management (Supabase Auth)
  - `/api/users` - User management
  - `/api/ai-config` - AI provider settings per user
  - `/api/play-history` - Game history tracking
  - `/api/ratings` - Player ratings and leaderboards
  - `/api/puzzles` - Chess puzzles and per-user progress
  - `/health` - Health check endpoint

## Development Commands

**Note**: This project uses Bun as the primary runtime and package manager.

### Root-level commands (using Turbo)

```bash
bun install              # Install dependencies
bun run dev             # Start all apps in development
bun run build           # Build all apps
bun run lint            # Run linting across all apps
bun run lint:fix        # Fix linting issues across all apps
bun run format          # Format code with Prettier
bun run clean           # Clean build artifacts and node_modules
```

### Testing

```bash
# E2E tests with Playwright
bun run test:e2e             # Run all E2E tests
bun run test:e2e:ui          # Run with UI mode
bun run test:e2e:headed      # Run in headed mode (see browser)
bun run test:e2e:debug       # Run with debugger

# Unit tests (web app)
cd apps/web
bun run test                 # Run all tests
bun run test:watch           # Watch mode
bun run test:chess           # Run specific test file
```

### Individual app commands

```bash
bun run web:dev         # Start only web app (port 3500)
bun run api:dev         # Start only API server (port 3501)
```

### Database commands (from apps/api)

```bash
cd apps/api
bun run db:generate     # Generate migration files from schema changes
bun run db:migrate      # Apply migrations to local SQLite database
bun run db:push         # Push schema changes (dev only, no migrations)
bun run db:studio       # Open Drizzle Studio for database inspection
bun run db:seed         # Seed puzzles data into local SQLite database
```

### Cloudflare deployment (from apps/api)

```bash
cd apps/api
bun run deploy                    # Deploy to Cloudflare Workers (production)
bun run cf:dev                    # Run with Wrangler for local D1 testing
bun run cf:d1:migrations:apply    # Apply migrations to Cloudflare D1
bun run db:seed:d1                # Seed puzzles into D1 (production)
```

## Code Standards

### Linting & Formatting

- **ESLint**: TypeScript-focused configuration with custom rules
- **Prettier**: Code formatting (runs on pre-commit via Husky)
- **Husky + lint-staged**: Pre-commit hooks for code quality

### TypeScript Configuration

- Strict TypeScript settings across the monorepo
- Shared tsconfig.json at root level
- App-specific configurations extend the root config

### Styling

- **Tailwind CSS** for styling with custom design tokens
- **class-variance-authority** and **clsx** for conditional styling
- **tailwind-merge** for class merging utilities

## Game Engine Architecture

### Multi-Game Pattern

Each game variant (Chess, Xiangqi, Shogi, Jungle) follows the same modular structure in `apps/web/src/lib/{game}/`:

**Shared core (`@procyon/game-core`):** the truly-duplicated structural primitives — `Position`, `BaseMove<TPiece>`, `BaseGameState<TPiece>`, `GridBoard<TPiece>` helpers, `slidingMoves`/`steppingMoves`/`moveLeavesKingInCheck`, and `findPiece`/`isSquareAttacked`/`isInCheck`/`forEachOwnPieceMove` — live in `packages/game-core/`, not in each variant. The scope rule: **share the scaffold, specialize the rules.** Generic piece-movement primitives (sliding/stepping offsets), board helpers parameterized by `Dims`, the `isSquareAttacked` enemy-scan scaffold, and the `moveLeavesKingInCheck` copy/apply/test shell belong in the shared package. Variant-specific rules (castling, cannon screens, shogi drops/nifu/uchifuzume, jungle terrain) AND variant-specific compositions (`hasLegalMove`/`hasAnyLegalMoves` — each variant owns its own because shogi enumerates promotion variants and drops) stay in `apps/web/src/lib/{variant}/`. When adding a new primitive, ask: is the logic identical across ≥3 variants modulo dimensions and piece types? If yes → `game-core`. If it references a variant-specific concept (palace, river, promotion zone, drops) → stays variant-local.

1. **Types** (`types.ts`) - Core interfaces and enums (pieces, moves, positions)
2. **Board** (`board.ts`) - Board representation and piece management
3. **Moves** (`moves.ts`) - Legal move generation and validation
4. **Game** (`game.ts`) - Game state, turn management, win conditions

Game state includes:

- Board position (2D array or object representation)
- Current player
- Move history
- UI state (selected squares, possible moves, captured pieces)
- Game status (playing, checkmate, stalemate, draw)

### AI Integration

Universal AI system with game-specific adapters:

- **Universal Service** (`service.ts`) - Handles API communication with multiple providers (via `UniversalAIService` class)
- **Adapters** (`{game}-adapter.ts`) - Convert game state to prompts and parse AI responses
- **Rule Guardian** (`rule-guardian.ts`) - Validates AI moves before applying
- **Factory** (`factory.ts`) - Creates AI instances: `createChessAI()`, `createXiangqiAI()`, `createShogiAI()`, `createJungleAI()`

AI responses must follow strict JSON format with move notation and reasoning. The system tracks interaction history for game export functionality.

## Key Dependencies

### Web App

- **Astro 4.x** - SSR framework with React integration
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework
- **class-variance-authority**, **clsx**, **tailwind-merge** - Styling utilities
- **@supabase/supabase-js**, **@supabase/ssr** - Supabase client for authentication

### API Server

- **Hono** - Fast web framework with Zod validation
- **Drizzle ORM** - TypeScript ORM for SQLite/D1
- **better-sqlite3** - Local SQLite driver (development)
- **@cloudflare/d1** - Cloudflare D1 bindings (production)
- **@supabase/supabase-js**, **@supabase/ssr** - Supabase authentication

### Development Tools

- **Turbo** - Monorepo build system
- **Bun** - Runtime and package manager
- **Playwright** - E2E testing framework
- **ESLint 9** with TypeScript support
- **Prettier** - Code formatting (with Astro plugin)
- **Husky + lint-staged** - Git hooks

## Database & Authentication

### Database Setup

Dual database configuration using Drizzle ORM:

- **Development**: Local SQLite database (`apps/api/dev.db`)
  - Use `drizzle.config.dev.ts` for local operations
  - Accessed via `better-sqlite3`
- **Production**: Cloudflare D1
  - Use `drizzle.config.ts` for production migrations
  - Accessed via Cloudflare bindings

Database initialization checks `NODE_ENV` (and whether a D1 binding is present) to determine which database to use. Schema defined in `apps/api/src/db/schema.ts`. User identity/auth data lives in Supabase; all application data (AI configs, play history, ratings, puzzles) lives in D1/SQLite. Game variant IDs, result statuses, and supported AI opponent IDs are defined as enums in `apps/api/src/constants/game.ts`.

### Authentication Flow (Dual Database Architecture)

**Supabase** handles all user authentication; **D1** stores application data.

Supabase Auth-based authentication with JWT tokens:

1. **Registration/Login**: Routes in `apps/api/src/routes/auth.ts`
   - `/register` endpoint uses Supabase `signUp` with username in user_metadata
   - `/login` endpoint uses Supabase `signInWithPassword` with rate limiting
   - JWT tokens issued on successful auth (access_token + refresh_token)
2. **Protected Routes**: Use `authMiddleware` from `apps/api/src/auth/middleware.ts`
   - Validates Supabase JWT via `supabaseAdmin.auth.getUser(token)`
   - Sets `user.userId` in Hono context for downstream routes
3. **Frontend Context**: `apps/web/src/lib/auth.ts` provides `useAuth()` hook
   - JWT-based authentication with Supabase client (`apps/web/src/lib/supabase.ts`)
   - `login`, `register`, `logout` methods
   - Session state managed by Supabase client with `onAuthStateChange`

API keys for AI providers are masked in responses (`***${key.slice(-4)}`) for security.

## Testing

### E2E Testing with Playwright

Tests located in `apps/web/e2e/` with configuration in `playwright.config.ts`:

- **Auto-start servers**: Playwright automatically starts both web (3500) and API (3501) servers on CI
- **Local development**: Assumes servers are already running (for faster test iteration)
- **Helper utilities**: `e2e/utils/auth-helpers.ts` provides `AuthHelper` class
  - `generateTestUser()` creates unique test users with timestamps
  - Reusable auth flows for login/registration
- **AI testing pattern**: Use route interception to mock external API calls

```typescript
// Mock AI API responses in tests
await page.route('**/generativelanguage.googleapis.com/**', async route => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify(mockResponse),
  });
});
```

### Unit Testing

Both apps use Bun's built-in test runner:

```bash
# Web app (game logic tests)
cd apps/web && bun test                    # Run all unit tests
cd apps/web && bun run test:chess          # Run chess game tests only

# API (route and service tests)
cd apps/api && bun test                    # Run all API unit tests
cd apps/api && bun test --watch           # Watch mode
```

Game logic tests: `apps/web/src/lib/{game}/*.test.ts`
API tests: `apps/api/src/routes/*.test.ts`, `apps/api/src/services/*.test.ts`

## Common Workflows

### Adding a New Game Variant

1. Create game modules in `apps/web/src/lib/{game}/`:
   - `types.ts` - Define piece types, move types, game state
   - `board.ts` - Implement board representation
   - `moves.ts` - Implement move validation and generation
   - `game.ts` - Implement game state management
2. Create AI adapter in `apps/web/src/lib/ai/{game}-adapter.ts`
3. Add factory function in `apps/web/src/lib/ai/factory.ts`
4. Create React component in `apps/web/src/components/{Game}Game.tsx`
5. Add route in `apps/web/src/pages/{game}.astro`
6. Write E2E tests with mocked AI responses

### Modifying Game Logic

1. Update types in `apps/web/src/lib/{game}/types.ts` if needed
2. Implement changes in respective modules (board, moves, game)
3. Update AI adapter in `apps/web/src/lib/ai/{game}-adapter.ts` if move format changes
4. Update or add unit tests
5. Add E2E tests if UI behavior changes

### Adding API Endpoints

1. Create or modify routes in `apps/api/src/routes/`
2. Add Zod validation schemas with `@hono/zod-validator`
3. Update database schema in `apps/api/src/db/schema.ts` if needed
4. Generate and apply migrations: `bun run db:generate && bun run db:migrate`
5. Register route in both `apps/api/src/index.ts` (Node.js) and `apps/api/src/worker.ts` (Cloudflare Workers)
6. Add E2E tests including auth flows if protected

## Cursor Cloud specific instructions

Runtime is **Bun 1.3.1** (installed at `~/.bun`, symlinked into `/usr/local/bin` so it is on PATH in non-login shells). The startup update script runs `bun install`. Standard lint/typecheck/test/dev/db commands are documented above — prefer those.

Non-obvious caveats:

- **Running the app (dev):** `bun run dev` starts both apps (web on `:3500`, API on `:3501`). They can be started separately with `bun run web:dev` / `bun run api:dev`. Both use watch/HMR; on first web load Vite optimizes deps and does one full page reload — let it settle before interacting.
- **Local DB (one-time):** the API uses a local SQLite `apps/api/dev.db` (gitignored). Run `bun run db:migrate` then `bun run db:seed` from `apps/api` before hitting DB-backed routes. `initializeDB()` uses SQLite whenever `NODE_ENV` is `development`/`e2e`/`test` or unset.
- **API without Supabase:** the API server starts fine with no Supabase env. Supabase is only needed for real Google-token verification and the Bearer `/session` fallback. For local/e2e auth, POST `/api/auth/google` with `id_token: "test-claim:{...json claims...}"` — this bypass only works when `NODE_ENV=e2e` or `test`, and requires `JWT_SECRET` (≥32 chars) set. It writes a user row to the local DB and sets an httpOnly cookie.
- **Playing games needs no login:** chess/xiangqi/shogi/jungle are fully client-side. Use **"Tutorial"** mode on each game page for free, interactive play (no auth, no API key). **"Play vs AI"** mode requires an AI-provider API key (set in Profile) or the board dims and stalls on the AI's turn.
- **Board contrast gotcha:** the "Nocturne" dark theme renders white pieces (`text-ivory`) low-contrast on dark squares — in screenshots they can look "missing". Pieces are actually present; verify board state via the DOM (each square is a button with `aria-label="Square {row}-{col}"` containing the piece glyph) rather than by eye.
- **Benign dev log:** Vite prints `bun:test ... could not be resolved` (from `src/test/reactSetup.ts`, imported only by unit tests). It does not affect the running app; pages still return 200.
- **E2E (Playwright):** not covered by the update script. Requires `bunx playwright install chromium` and a local Supabase (Supabase CLI + Docker, see `.github/workflows/e2e.yml`). Unit tests (`bun run test`) need no external services.
