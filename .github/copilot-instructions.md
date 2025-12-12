# Copilot Instructions for Procyon Chess Platform

## Project Overview

Procyon is a multi-variant chess platform supporting Chess, Xiangqi (Chinese Chess), and Shogi (Japanese Chess) with integrated AI opponents. Built as a Turbo monorepo with TypeScript throughout.

## Architecture

### Monorepo Structure

- `apps/web/` - Astro SSR frontend with React components (port 3500)
- `apps/api/` - Hono API server with Node.js adapter (port 3501)
- Turbo orchestrates builds and dev workflow

### Development Runtime

**CRITICAL**: This project uses **Bun** as the package manager and runtime. Always use `bun` commands instead of `npm`/`yarn`/`pnpm`.

```bash
bun install          # Install dependencies
bun run dev          # Start both apps via Turbo
bun run web:dev      # Web app only
bun run api:dev      # API server only
bun run test:e2e     # Run Playwright tests
```

## Game Engine Architecture

### Multi-Game System

Each game variant follows this pattern:

- `apps/web/src/lib/{chess,xiangqi,shogi}/` - Game logic modules
- `types.ts` - Core interfaces and enums
- `board.ts` - Board representation and piece management
- `moves.ts` - Move validation and generation
- `game.ts` - Game state and turn management

### AI Integration

Universal AI system with game-specific adapters:

- `apps/web/src/lib/ai/universal-service.ts` - Core AI orchestration
- `{chess,xiangqi,shogi}-adapter.ts` - Game-specific AI adapters
- `factory.ts` - Creates AI instances: `createChessAI()`, `createXiangqiAI()`, `createShogiAI()`

AI responses follow strict JSON format validation and include move reasoning.

## Database & Authentication

### Dual Database Architecture

**Supabase** handles user authentication; **D1/SQLite** stores application data.

- **Development**: Local SQLite via better-sqlite3 (`apps/api/dev.db`) for app data
- **Production**: Cloudflare D1 via bindings for app data
- **User Data**: Stored in Supabase (not D1) - user tables removed from D1 schema
- Use `drizzle.config.dev.ts` for local, `drizzle.config.ts` for production

### Auth Flow

JWT-based authentication with Supabase Auth:

- Registration/login via `apps/api/src/routes/auth.ts` using Supabase client
- `/register` uses Supabase `signUp` with username in user_metadata
- `/login` uses Supabase `signInWithPassword` with rate limiting (5 attempts per 15 min)
- Protected routes use `authMiddleware` from `apps/api/src/auth/middleware.ts` (JWT validation)
- Supabase clients in `apps/api/src/auth/supabase.ts` (service role + anon key)
- Frontend auth context in `apps/web/src/lib/auth.ts` with `useAuth()` hook
- Auth endpoints: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/session`

### Database Commands

```bash
cd apps/api
bun run db:migrate    # Apply migrations to local DB
bun run db:generate   # Create new migration files
bun run db:studio     # Open Drizzle Studio
bun run db:push       # Development schema push (no migrations)
```

## Testing Strategy

### E2E Testing with Playwright

- Tests in `tests/e2e/` with helper utilities in `tests/e2e/utils/`
- `AuthHelper` class provides reusable auth flows with timestamp-based test users
- AI tests use route interception to mock external API calls
- Configuration: `playwright.config.ts` auto-starts both web and API servers

### Testing Patterns

```typescript
// Generate unique test user
const testUser = AuthHelper.generateTestUser();

// Session-based authentication in tests
await AuthHelper.register(
  page,
  testUser.email,
  testUser.username,
  testUser.password
);
// Session cookie automatically set in page context

// Mock AI API responses
await page.route('**/generativelanguage.googleapis.com/**', async route => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify(mockResponse),
  });
});
```

## Configuration Patterns

### Environment-Aware Setup

- Astro config: SSR mode, React integration, port 3500
- API server: Hono with CORS for localhost origins
- Database initialization checks `NODE_ENV` for SQLite vs D1

### AI Provider Integration

AI configurations stored per-user with secure API key handling:

- Keys masked in responses (`***${key.slice(-4)}`)
- Multiple providers supported: Gemini, OpenAI, Anthropic, OpenRouter
- Game-specific prompts with position analysis and move validation

## Code Conventions

### TypeScript Patterns

- Strict TypeScript across monorepo with shared `tsconfig.json`
- Interface-driven design: `GameState`, `Move`, `Position` types per game
- Discriminated unions for game status and piece types

### Component Architecture

- React components in `apps/web/src/components/`
- Game components: `ChessGame.tsx`, `XiangqiGame.tsx`, `ShogiGame.tsx`
- Reusable UI in `components/ui/` (Button, Input with variants)
- Astro pages as layout containers with React islands

### API Design

- Hono routes with Zod validation via `@hono/zod-validator`
- RESTful endpoints: `/api/auth`, `/api/users`, `/api/ai-config`
- Consistent error handling with HTTPException

## Common Workflows

When modifying game logic:

1. Update types in `apps/web/src/lib/{game}/types.ts`
2. Implement logic in respective modules (board, moves, game)
3. Update AI adapter in `apps/web/src/lib/ai/{game}-adapter.ts`
4. Add E2E tests with mocked AI responses

When adding API endpoints:

1. Create route in `apps/api/src/routes/`
2. Add validation schemas with Zod
3. Register route in `apps/api/src/index.ts`
4. Test with E2E scenarios including auth flows

### bun not found

Restart the shell : `zsh -il -c 'bun --version'`. Then you can run bun directly

## Active Technologies

- TypeScript 5.x (strict mode enabled) + @supabase/supabase-js, @supabase/ssr, drizzle-orm, Hono 4.x
- SQLite (development via better-sqlite3) / Cloudflare D1 (production) for app data
- Supabase Auth for user authentication (JWT-based)

## Recent Changes

- 002-supabase-auth: Migrated from better-auth to Supabase Auth with dual-database architecture
