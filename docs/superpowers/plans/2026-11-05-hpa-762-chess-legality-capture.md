# HPA-762 — Standard Chess Legality and Capture Fix Plan

> **Planning-only draft.** This checklist describes the implementation to add to this **same PR** after design review. No bug fix or test execution is claimed by the documentation commit.

**Issue:** [HPA-762](https://linear.app/cwchanap/issue/HPA-762/standard-chess-on-device-ai-plays-an-illegal-pawn-move-and-human)
**Design:** [HPA-762 design](../specs/2026-11-05-hpa-762-chess-legality-capture-design.md)
**Date:** 2026-11-05
**Branch:** `docs/hpa-762-chess-legality-capture-plan`
**Goal:** Prove and fix only the actual failing boundary for legal human captures and impossible on-device AI pawn moves, keeping the existing `chess.js` rules authority and session lifecycle.
**Tech:** Bun 1.3, React, Astro, `chess.js` 1.4.0, Stockfish 18 Worker, Testing Library, Playwright.

## Ground rules / scope

- One Linear ticket → **one PR**. Do not open a separate implementation PR; add code and tests to the existing draft branch.
- Source of truth for playable legality is `apps/web/src/lib/chess/rules.ts` (`attemptMove`). Do not add an alternate movement validator or mutate board arrays directly.
- The Linear repro `f3→e4` for a knight is *not* a legal capture. Retain it as a **negative test**; use `1.Nf3 e5 2.Nxe5` for a valid knight capture.
- Preserve the existing invalid-engine-move behavior: board unchanged, failure surfaced, New Game instead of automated retries.
- Prefer a few focused regression tests and a localized fix to new helpers/abstractions. No migrations, new endpoints, provider hierarchy, new UI state store or unrelated cleanup.
- The ticket is a live-site observation; the local-main root cause remains unknown. Prove the failure before selecting the patch location.

## Step 1 — Reproduce at the rules boundary (tests first)

**Likely files:** `apps/web/src/lib/chess/rules.test.ts` and/or `apps/web/src/lib/chess/game.test.ts`.

- [ ] Add a **legal ordinary pawn capture** test using the initial game and 1.e4 d5 2.exd5. Assert `getLegalDestinations` includes d5, `attemptMove`/`makeMove` applies, move-history `capturedPiece` is the black pawn, board has a White pawn on d5 with the Black pawn removed, FEN agrees, and it is Black to move.
- [ ] Add a **legal knight capture** test using 1.Nf3 e5 2.Nxe5, with the same board, move history, FEN and turn assertions.
- [ ] Add an **invalid knight click** test for a White knight f3→e4 in a position with a Black pawn on e4. Assert it is not a legal destination, `attemptMove` returns rejected, and `makeMove` returns null without changing history/FEN.
- [ ] Add a **black pawn retreat** test after 1.e4 e5 2.Nf3. Calling `attemptMove` with e5→e6 must return rejected; `makeAIMove` must return null. Deep-compare the unchanged state snapshot and do not permit the Black pawn to appear on e6.
- [ ] Include assertions for the consistent coordinate mapping (e2 = row 6,col 4; e4 = row 4,col 4; d5 = row 3,col 3; f3 = row 5,col 5; e5 = row 3,col 4), especially if a test demonstrates board/notation mismatch.
- [ ] Run the focused test files **before** changing production code; record which assertion fails. Existing pass is diagnostic evidence, not permission to rewrite rules.

Example test-building pattern, adapting existing fixtures and result handling:

~~~ts
let state = createInitialGameState();
for (const request of [
  { from: 'e2', to: 'e4' },
  { from: 'd7', to: 'd5' },
] as const) {
  const result = attemptMove(state, request);
  if (result.kind !== 'applied') throw new Error('setup move rejected');
  state = result.state;
}
const captured = attemptMove(state, { from: 'e4', to: 'd5' });
expect(captured.kind).toBe('applied');
~~~

Note: the pure rules façade can already reject impossible moves; such a passing test should shift investigation toward React/browser/live build rather than prompting a rewrite.

## Step 2 — Test the click-to-move boundary

**Likely file:** `apps/web/src/components/ChessGame.test.tsx` (uses injected fake rival providers).

- [ ] Start a human-White/on-device-Black session with a deterministic fake provider that returns `d7d5` after White plays e2→e4.
- [ ] Click the square buttons corresponding to e4 then occupied d5. Assert the capture indicator is shown, the click reaches the handler, d5 now contains White's pawn, e4 is empty, and the turn changes. The initial board square buttons use `aria-label="Square <row>-<col>"`.
- [ ] Repeat with a fake `e7e5` response after g1→f3, then f3→e5; assert a White knight replaces the captured Black pawn.
- [ ] Verify clicking f3→e4 is **rejected** (no position/history change) when not a valid knight move. Do not treat that non-move as a UI failure.
- [ ] If these tests fail but rules tests pass, inspect `ChessGame.tsx` `handleSquareClick` → `makeMove`, `boardDisabled` and `ChessBoard.tsx` occupied-target/button behavior. Apply the minimal fix to the demonstrated problem only.

## Step 3 — Browser integration with a deterministic Worker

**File:** `apps/web/e2e/chess-rival.spec.ts` — reuse `installFakeStockfish` and square locators.

- [ ] Add one browser test for `1.e4 d5 2.exd5` on a human-White/engine-Black session. The fake Worker returns `bestmove d7d5`. Wait for the Black pawn on d5 **before** the human capture; after clicking the occupied d5 button, verify White pawn there, e4 empty, and Black to move.
- [ ] Add one small browser test for `1.Nf3 e5 2.Nxe5` (fake `bestmove e7e5`), if the component test alone does not sufficiently cover click/rendering behavior.
- [ ] Add a fake-Worker invalid-move test for `1.e4 e5 2.Nf3` with scripted `bestmoves: ['e7e5', 'e5e6']`. The syntax parser may return a valid-shaped request, but the game must **reject** the illegal retreat, preserve e5/board/FEN/turn, and expose the current engine error/New Game affordance. Make assertions against the rendered board rather than an unobserved internal implementation detail.
- [ ] When relevant, test that flip-to-Black orientation does not remap logical squares; do not expand scope to UI redesign.

## Step 4 — Verify real Stockfish and deployed behavior

**Existing test:** `apps/web/e2e/stockfish-assets.spec.ts` runs a real packaged Worker smoke. Keep tests deterministic when using a fake Worker.

- [ ] Check the real Worker can handle a known midgame FEN (e.g., after 1.e4 e5 2.Nf3), return a parsable move, and that `makeAIMove` accepts it as legal. Do **not** assert a particular bestmove or engine score; Casual strength can choose many legal moves.
- [ ] If current-main browser tests pass, reproduce the live-site report and compare the tested build revision, FEN, move list, emitted UCI request/result, and rendered squares; investigate deployment mismatch before code changes. Do not claim the exact live-site failure is fixed by tests alone.
- [ ] If the live failure cannot be reproduced with evidence, update HPA-762 with the corrected knight case, tests performed, tested revision, and any remaining uncertainty. Stop short of a speculative source patch.

## Step 5 — Minimal implementation, conditioned on the red test

- [ ] **Rules mapping/replay failure:** patch only `rules.ts` or `game.ts` as demonstrated (square conversion, request validation, or serializable state consistency); retain `chess.js`.
- [ ] **UI click failure:** patch `ChessGame.tsx` `handleSquareClick` / `boardDisabled` or `ChessBoard.tsx` event behavior as demonstrated. Capturing a piece must not be treated as merely selecting the clicked opponent square.
- [ ] **Worker/session failure:** patch only `stockfish-protocol.ts`, `stockfish-provider.ts` or the existing `useChessRivalSession` ownership gate as demonstrated. Keep current FEN, generation and session checks; never accept illegal UCI moves simply because they parse.
- [ ] **Deployed-version-only failure:** correct deployment/configuration and document the verification path; avoid unrelated app changes.
- [ ] Re-run the failing test after each minimal change. Preserve all pre-existing chess rules (promotion, en passant, castling and draws), LLM, and other variants.

Do not pre-emptively edit all listed files. Only the actual failing owner and a bounded set of tests belong in the implementation diff.

## Step 6 — Verification and completion

- [ ] Run focused unit/component tests:
  ~~~bash
  cd apps/web
  bun test src/lib/chess/rules.test.ts src/lib/chess/game.test.ts src/components/ChessGame.test.tsx src/lib/chess/rival/stockfish-provider.test.ts
  ~~~
- [ ] Run project quality checks:
  ~~~bash
  bun run typecheck
  bun run lint
  # at repository root:
  bun run format:check
  ~~~
- [ ] Run the real-browser smoke:
  ~~~bash
  cd apps/web
  bun run test:e2e e2e/chess-rival.spec.ts
  bun run test:e2e:stockfish-assets
  ~~~
- [ ] Manually verify legal `exd5` and `Nxe5` with White vs on-device Black; check the invalid f3→e4 click and black e5→e6 suggestion remain rejected; verify no board/turn/FEN corruption.
- [ ] Record a short before/after evidence section in **this PR** (repro, root cause, edited files, test commands/results and any live-site mismatch); link the PR from HPA-762 and ask for review. Mark ready only after a proven fix and passing verification.

## Exit / stop conditions

**Successful fix:** at least one regression starts red against the relevant faulty code and becomes green; legal captures work through button clicks, no illegal pawn retreat applies, and state consistency holds. This same PR contains both planning docs and implementation.

**No reproducible defect on current main:** retain the regression coverage and verified findings, report the tested revision and discrepancy to Linear, and do **not** claim a speculative code change fixed production. Resolve the deployment/reproduction question before closing HPA-762.

**Not part of this PR:** HPA-761 Aeroplane turn/capture events; HPA-763 Aeroplane reload/mute/login and UI text issues.
