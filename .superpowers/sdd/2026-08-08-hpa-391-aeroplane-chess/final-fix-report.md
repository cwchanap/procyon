# HPA-391 final-fix report

Date: 2026-08-09

## RED evidence

- Before the lifecycle change, the new terminal remount regression failed with
  `expected attempts 1, received 2`: a network-ambiguous first POST remained
  restorable and was submitted again after restore.
- Before completion metadata was added, the clock-controlled transition test
  failed because the terminal snapshot had no persisted `completedAt` value.
  The corresponding restored payload therefore had no frozen completion point.
- The first E2E acceptance pass with the new assertions was `7 passed, 2
failed`: the friendly-stack scenario had not yet selected a plane, and the
  signed-in near-win scenario still expected the pre-fix terminal snapshot to
  remain in local storage after save.

## GREEN evidence

- `rtk bun test src/hooks/useAeroplaneMatch.test.ts src/hooks/useTerminalHistorySave.test.ts src/lib/aeroplane/persistence.test.ts`
  — 53 passed, 0 failed.
- `rtk bun test src/lib/aeroplane src/hooks/useAeroplaneMatch.test.ts src/hooks/useTerminalHistorySave.test.ts src/components/aeroplane/AeroplaneGame.test.tsx src/components/PlayHistoryPage.test.tsx`
  — 145 passed, 0 failed.
- `rtk bun test src` — 1683 passed, 0 failed (100 files).
- `rtk bun run typecheck` — Turbo reported all 3 packages successful.
- `rtk bun run lint` (web) — exit 0; existing warnings only.
- `rtk bunx prettier --check` on all changed source/spec files — all matched.
- `rtk bunx playwright test e2e/aeroplane.spec.ts` — 9 passed.
- `rtk bunx playwright test e2e/aeroplane.spec.ts e2e/critical-user-journeys.spec.ts`
  — 15 passed (9 Aeroplane + 6 critical, 20.1s).
- `rtk git diff --check` — clean.

## Decisions

- `useTerminalHistorySave` owns the first-attempt lifecycle boundary through a
  narrow `onBeforeFirstAttempt` callback. Aeroplane clears its restorable
  terminal snapshot synchronously before transport, guarded by the active
  match identity. The shared hook still keeps 401 retries in memory and
  delayed; rejected non-401 and network outcomes remain final.
- Winning transitions freeze `completedAt` using the injected wall clock and
  persist it in the v1 envelope. Restored terminal snapshots without that
  field use their persisted `savedAt`; fresh terminal fixtures use their
  deterministic start time. History duration is computed only from the frozen
  completion point, never from idle time after reload.
- The signed-in E2E now performs a real near-win move and asserts exactly one
  history POST. The blockade journey also persists and renders a legal
  friendly stack (two red planes at the same progress), while retaining the
  blockade crossing/landing assertions. All nine Aeroplane journeys use
  condition-driven polling and init-script fixtures.

## Notes

The web dev server logs the existing Vite warning that `bun:test` is imported
by the React test setup; it does not affect the passing E2E gates. A bare
`bun test` command also discovers Playwright files outside Bun's test runner;
the scoped `bun test src` gate above is the authoritative web unit result.
