# Task 14 Report — Integrate atomic Start, rival moves, and reset

## Status

**Complete.** `useChessRivalSession` is wired into `ChessGame` with atomic Start,
frozen session ownership for moves, and disposal on reset / Tutorial / unmount.
The eager `createChessAI(defaultAIConfig)` ownership is gone. All four Step 6
test files pass; typecheck is clean.

## Commits

- `5d5e9a5` — `feat(chess): start immutable rival sessions`
  - Files: `ChessGame.tsx`, `ChessGame.test.tsx`, `CrossVariantInvalidation.test.tsx`,
    `game/GameDebugAndModeGuard.test.tsx`, new `test/fakeRival.ts`.
  - Note: `git push` is denied for the `cursor[bot]` account (403); the commit is
    on branch `cursor/hpa-161-opponent-session-4f8c` and relies on the environment's
    branch sync.

## Implementation notes

- `ChessGame` now derives all turn ownership from `activeSession?.rivalSide`;
  Start commits fresh `human-vs-ai` state only after the provider is ready.
- Fixed a latent bug: the Start control wired `engineStartLabel` while the
  intended `startControlLabel` was dead code, so a blocked/disabled Start button
  rendered "⏳ Loading AI config…" instead of a findable "▶️ Start". Now uses
  `startControlLabel` (pre-game "▶️ Start", engine loading "⏳ Loading on-device
  computer…", "🆕 New Game" once started).
- `GameExporter` is created only for LLM sessions; engine failures offer New Game
  only via `EngineRivalDetails`, LLM keeps pause/retry.

## Testing (Step 6 — all PASS, 86 tests)

- `ChessGame.test.tsx` — 23 pass. Replaced the obsolete "AI move bridge
  (pre-session)" block with an "atomic Start & rival session" suite (loading
  label, selector lock, failed Start clean preview + dispose, Try again, frozen
  opponent/side, engine-moves-after-commit, LLM blocked when signed-out, engine
  ignores LLM hydration failure, New Game / Tutorial disposal, LLM-only exporter).
- `AiMovePaths.test.tsx` — unchanged (no chess cases), still green.
- `CrossVariantInvalidation.test.tsx` — 22 pass. Pulled ChessGame out of the
  `AI plays` `describe.each`; added an injected-engine late-callback stale-gen test
  and a real-LLM (authed + hydrated + deferred generation) debug stale-requestId test.
- `game/GameDebugAndModeGuard.test.tsx` — 16 pass. Chess same-mode guard, debug
  outcome buttons, and forced-win rewritten to use `rivalSessionOptions` + the
  rival-setup selectors; other variants untouched.

Injectable fakes live in `apps/web/src/test/fakeRival.ts` (`FakeRivalProvider`,
`engineOptions`, `deferred`) so tests never build a real Worker or hit the network.

## Concerns

- The LLM debug stale test drives the real provider through a mocked, deferred
  network call; it depends on the authenticated-hydration mock shape staying in
  sync with `useAIConfigHydration`.
- `git push` could not run (bot 403) — branch delivery depends on the environment.

## Report path

`/workspace/procyon/.superpowers/sdd/task-14-report.md`

## Important Task 14 review finding fix — engine same-position retry

- Fix: `ChessGame` turn scheduling now also gates on `!rivalSession.rivalError`.
  Engine typed failures and legality-gate failures set `rivalError`, so the
  same board position is not rescheduled. `reset()` / New Game clears the
  session error; LLM retry still clears both the pause flag and `rivalError`
  before the existing retry path re-enters the scheduler.
- Regression: added `a mid-game engine move failure does not retry the same
position` in `apps/web/src/components/ChessGame.test.tsx`.
- Red check before production fix:
  `bun test apps/web/src/components/ChessGame.test.tsx` failed as expected:
  `Expected: 1`, `Received: 2` for `makeMoveCount`.
- Green checks after fix:
  `bun test apps/web/src/components/ChessGame.test.tsx` — 24 pass, 0 fail.
- Required suite:
  `bun test apps/web/src/components/ChessGame.test.tsx apps/web/src/components/CrossVariantInvalidation.test.tsx apps/web/src/components/game/GameDebugAndModeGuard.test.tsx`
  — 62 pass, 0 fail.
- Typecheck: `bun run typecheck` — 3 successful tasks (`api`, `web`,
  `@procyon/game-core`).

## Important Task 14 re-review fix — legality-gate `ok:true` retry halt

- Fix: added `reportMoveFailure()` to `useChessRivalSession` and call it when
  `ChessGame` receives `ok: true` from the provider but `makeAIMove(...)`
  returns `null`. That surfaces `rivalError`, so engine sessions hit the
  existing `!rivalSession.rivalError` turn-effect stop gate; LLM retry remains
  intact because Retry still clears both `isAiPaused` and `rivalError`.
- Regression: added `an illegal successful engine move halts instead of retrying
the same position`; the fake engine returns `ok: true` with illegal `e2→e4`
  after the human already moved `e2→e4`. It verifies `makeMoveCount` stays `1`
  after the retry window, the board keeps the human move, and New Game resets
  the board/provider.
- Red check before production fix:
  `bun test apps/web/src/components/ChessGame.test.tsx -t "illegal successful engine move"`
  failed because no engine failure panel appeared (`Unable to find ... /Start a
New Game to reset/i`), confirming `rivalError` was not set.
- Green checks after fix:
  `bun test apps/web/src/components/ChessGame.test.tsx -t "mid-game engine move failure|illegal successful engine move"`
  — 2 pass, 0 fail.
- Required focused suite:
  `bun test apps/web/src/components/ChessGame.test.tsx apps/web/src/components/AiMovePaths.test.tsx apps/web/src/components/CrossVariantInvalidation.test.tsx apps/web/src/components/game/GameDebugAndModeGuard.test.tsx`
  — 88 pass, 0 fail.
- Typecheck: `bun run typecheck` — 3 successful tasks (`api`, `web`,
  `@procyon/game-core`).
