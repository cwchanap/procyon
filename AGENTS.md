# Repository Guidelines

## Project Structure & Module Organization

- Turbo + Bun workspaces orchestrate the repo. The Astro-powered web app lives in `apps/web` with React components under `src/components`, domain logic in `src/lib`, and assets colocated by feature.
- The Hono API sits in `apps/api`; routes are in `src/routes`, authentication helpers in `src/auth`, and Drizzle ORM setup in `src/db` alongside the local `dev.db` SQLite file.
- Shared utilities belong in `packages/`. End-to-end Playwright specs reside in `tests/e2e`, with reusable helpers in `tests/e2e/utils`. Use the root `index.ts` for quick scripts or smoke checks.

## Build, Test, and Development Commands

- `bun install` — install workspace dependencies once.
- `bun run dev` — launch web (port 3500) and API (port 3501) together for local development.
- `bun run web:dev` / `bun run api:dev` — start individual services when iterating on one surface.
- `bun run build` — generate production bundles.
- `bun run test` — execute unit and integration suites via Bun’s runner.
- `bun run test:e2e` or `bun run test:e2e:ui` — run Playwright specs headless or with the UI inspector.
- API database chores: `bun run --filter api db:generate`, `db:migrate`, and `db:studio`.

## Coding Style & Naming Conventions

- Prettier governs formatting (`bun run format:check`) with four-space TypeScript blocks, LF endings, and single quotes. `.editorconfig` enforces two-space indentation elsewhere.
- ESLint (`bun run lint`) flags unused symbols (except `_ignored`) and warns on non-API `console` usage.
- Use PascalCase for components, camelCase for helpers, and kebab-case for route files and URLs.

## Testing Guidelines

- Keep test files adjacent to the code they cover, naming them `*.test.ts`.
- Prefer Bun’s assertions for unit work; use Playwright for flow coverage in `tests/e2e`.
- When debugging Playwright failures, open `playwright-report/index.html`. Confirm web/API servers are available on ports 3500/3501 before running e2e tests.

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat(web): add pricing card`). Scope commits narrowly and include context-rich bodies when behavior changes.
- Before raising a PR, run `bun run lint`, `bun run test`, and relevant database scripts; note any skipped checks.
- PR descriptions should summarize changes, link issues, and include screenshots or recordings for UI updates plus Playwright reports when applicable. Call out schema or migration impacts explicitly.

## Security & Configuration Tips

- Keep secrets in `.env` files excluded from version control.
- For API changes, ensure `dev.db` exists and run `bun run --filter api db:migrate`.
- When targeting Cloudflare Workers, configure `JWT_SECRET` and D1 bindings in `wrangler.toml`.
