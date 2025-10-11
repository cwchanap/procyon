# Repository Guidelines

## Project Structure & Module Organization

Turbo + Bun workspaces drive the repo. Front-end code lives in `apps/web` (Astro shell, React components in `src/components`, domain logic in `src/lib`). The API resides in `apps/api` with Hono routes (`src/routes`), auth utilities (`src/auth`), and Drizzle models (`src/db`, local SQLite in `dev.db`). Shared tooling and future libraries belong under `packages/`. End-to-end Playwright specs sit in `tests/e2e` with helpers in `tests/e2e/utils`. The root `index.ts` is available for quick scripts or smoke checks.

## Build, Test, and Development Commands

Install dependencies once via `bun install`. Start both apps with `bun run dev`; target individual services with `bun run web:dev` or `bun run api:dev`. Produce a production bundle through `bun run build`. Execute unit suites with `bun run test`. End-to-end coverage runs through `bun run test:e2e` (headless) or `bun run test:e2e:ui` when debugging. Database chores for the API are exposed as `bun run --filter api db:generate`, `db:migrate`, and `db:studio`.

## Coding Style & Naming Conventions

Prettier enforces formatting (`bun run format:check`) with four-space TypeScript blocks, LF endings, and single quotes. `.editorconfig` keeps non-TypeScript files on two-space indentation. ESLint powers linting (`bun run lint`), flagging unused symbols (except `_ignored`) and warning on stray `console` usage outside API logging. Use PascalCase for React/Astro components, camelCase for helpers, and kebab-case for route files and URLs.

## Testing Guidelines

Unit and integration tests rely on Bun’s native runner; files end with `.test.ts` and live beside the code they verify. Playwright drives end-to-end flows; each UI scenario needs a `*.spec.ts` under `tests/e2e`. Local runs assume web on port 3500 and API on port 3501—Playwright bootstraps both, but you can start them manually for iterative work. Inspect failures by opening `playwright-report/index.html`.

## Commit & Pull Request Guidelines

Follow Conventional Commits (`feat:`, `fix:`, `chore:`) with descriptive scopes (`fix(api): tighten auth`) to aid changelog generation. Before opening a pull request, run `bun run lint`, `bun run test`, and any relevant `db:` scripts; document skipped checks. PRs should summarize the change, link issues, and include screenshots or recordings for UI work plus Playwright report links when available. Call out schema updates or required migrations so reviewers can reproduce them quickly.

## Environment & Security Notes

Store secrets in `.env` files excluded from version control. The API uses Bun’s `bun:sqlite` driver; migrations expect the `dev.db` file to exist—run `bun run --filter api db:migrate` after pulling schema changes. When deploying to Cloudflare Workers, ensure `JWT_SECRET` and D1 bindings are configured in `wrangler.toml`.
