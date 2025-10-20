---
trigger: manual
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Procyon is a monorepo multi-variant chess platform built with TypeScript, featuring:

- **Web app** (Astro SSR + React + Tailwind CSS) - Frontend interface for Chess, Xiangqi, and Shogi
- **API server** (Hono) - Backend services with JWT auth and database
- **AI Integration** - Universal AI system supporting multiple providers (Gemini, OpenAI, Anthropic, OpenRouter)
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
- **Game Engines**: Each variant follows the same modular pattern in `src/lib/{chess,xiangqi,shogi}/`:
  - `types.ts` - Core types (pieces, moves, game state)
  - `board.ts` - Board representation and piece management
  - `moves.ts` - Move validation and legal move generation
  - `game.ts` - Game state and turn management
- **AI System**: `src/lib/ai/`
  - `universal-service.ts` - Core AI orchestration
  - `{chess,xiangqi,shogi}-adapter.ts` - Game-specific AI adapters
  - `factory.ts` - Creates AI instances per game variant
  - `rule-guardian.ts` - Validates AI moves against game rules
  - `storage.ts` - Persists AI configurations
- **Components**: React components in `src/components/`
  - Game components: `ChessGame.tsx`, `XiangqiGame.tsx`, `ShogiGame.tsx`
  - UI components in `src/components/ui/`

### API Server (`apps/api`)

- **Framework**: Hono with Node.js adapter
- **Database**: Drizzle ORM with dual setup:
  - **Development**: Local SQLite via better-sqlite3 (`dev.db`)
  - **Production**: Cloudflare D1 via bindings
- **Authentication**: JWT-based with bcrypt password hashing
  - Middleware: `src/auth/middleware.ts` (authMiddleware for protected routes)
  - Routes: `src/routes/auth.ts` (registration/login)
- **Schema**: `src/db/schema.ts` defines users and ai_configurations tables
- **Routes**:
  - `/api/auth` - Registration and login
  - `/api/users` - User management
  - `/api/ai-config` - AI provider settings per user

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

Each game variant (Chess, Xiangqi, Shogi) follows the same modular structure in `apps/web/src/lib/{game}/`:

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

- **Universal Service** (`universal-service.ts`) - Handles API communication with multiple providers
- **Adapters** (`{game}-adapter.ts`) - Convert game state to prompts and parse AI responses
- **Rule Guardian** (`rule-guardian.ts`) - Validates AI moves before applying
- **Factory** (`factory.ts`) - Creates AI instances: `createChessAI()`, `createXiangqiAI()`, `createShogiAI()`

AI responses must follow strict JSON format with move notation and reasoning. The system tracks interaction history for game export functionality.

## Key Dependencies

### Web App

- **Astro 4.x** - SSR framework with React integration
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework
- **class-variance-authority**, **clsx**, **tailwind-merge** - Styling utilities

### API Server

- **Hono** - Fast web framework with Zod validation
- **Drizzle ORM** - TypeScript ORM for SQLite/D1
- **better-sqlite3** - Local SQLite driver (development)
- **@cloudflare/d1** - Cloudflare D1 bindings (production)
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication

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

Database initialization checks `NODE_ENV` to determine which database to use. Schema defined in `apps/api/src/db/schema.ts` with tables for users and ai_configurations.

### Authentication Flow

JWT-based authentication with secure password handling:

1. **Registration/Login**: Routes in `apps/api/src/routes/auth.ts`
   - Passwords hashed with bcrypt
   - JWT tokens issued on successful auth
2. **Protected Routes**: Use `authMiddleware` from `apps/api/src/auth/middleware.ts`
3. **Frontend Context**: `apps/web/src/lib/auth.ts` manages auth state with localStorage persistence

API keys for AI providers are masked in responses (`***${key.slice(-4)}`) for security.

## Testing

### E2E Testing with Playwright

Tests located in `tests/e2e/` with configuration in `playwright.config.ts`:

- **Auto-start servers**: Playwright automatically starts both web (3500) and API (3501) servers
- **Helper utilities**: `tests/e2e/utils/auth-helpers.ts` provides `AuthHelper` class
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

Web app uses Bun's built-in test runner:

- Game logic tests in `apps/web/src/lib/{game}/*.test.ts`
- Run with `bun test` or `bun run test:chess` for specific files

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
5. Register route in `apps/api/src/index.ts`
6. Add E2E tests including auth flows if protected
