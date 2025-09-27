# Repository Guidelines

## Project Structure & Module Organization

The workspace is managed by Turbo + Bun workspaces. `apps/web` holds the Astro + React front end (components in `src/components`, domain logic in `src/lib`). `apps/api` houses the Hono API with Drizzle ORM (`src/routes`, `src/auth`, and `src/db`, backed by the SQLite file `dev.db`). End-to-end specs live in `tests/e2e`, alongside helpers in `tests/e2e/utils`. The `packages/` directory is reserved for shared libraries as they emerge, and the root `index.ts` is retained for quick scripts and smoke checks.

## Build, Test, and Development Commands

Run `bun install` once to sync workspace dependencies. Use `bun run dev` to launch both apps through Turbo, or `bun run web:dev` / `bun run api:dev` when you need separate terminals. `bun run build` performs a coordinated production build, while `bun run test` wires through each workspace test target. For Playwright coverage, prefer `bun run test:e2e` (headless) and `bun run test:e2e:ui` when debugging. The API exposes database utilities via `bun run --filter api db:migrate`, with `db:generate` and `db:studio` available for schema work.

## Coding Style & Naming Conventions

Formatting is enforced by Prettier (`bun run format:check`) with 4-space TypeScript blocks, single quotes, and 80-character width; `.editorconfig` keeps other files on 2-space indents and LF endings. Linting is powered by the shared ESLint config (`bun run lint`), which disallows unused variables (except `_ignored`) and warns on `console` usage outside the API. Follow existing patterns: PascalCase for React/Astro components, camelCase for utilities, and kebab-case for route or file-level resources.

## Testing Guidelines

Playwright drives the E2E suite; every new UI flow should ship with a corresponding `*.spec.ts` under `tests/e2e`. Tests expect the local dev servers on ports 3500 (web) and 3501 (api); the Playwright config bootstraps them automatically, but you can start them manually for iterative work. Keep shared helpers in `tests/e2e/utils` up to date, and favour descriptive test titles that match the feature surface. Capture failures with the built-in HTML report (`playwright-report/`).

## Commit & Pull Request Guidelines

Commit messages follow Conventional Commits (`feat:`, `fix:`, etc.), as reflected in recent history; keep scopes meaningful (`feat: add shogi engine`). Before opening a PR, run linting and the relevant test targets, and note any skipped suites. PRs should include a concise summary, linked issues, and—when UI changes are involved—screenshots or recordings plus links to generated Playwright reports. Highlight schema changes or required migrations so reviewers can reproduce them quickly.
