# HPA-762 — Focused implementation plan

> **Planning-only draft.** No application code or tests have been changed by this document. Add any validated fix and tests to **this PR**, not a second PR.

**Linear:** [HPA-762](https://linear.app/cwchanap/issue/HPA-762/standard-chess-on-device-ai-plays-an-illegal-pawn-move-and-human)
**Design:** [HPA-762 regression design](../specs/2026-11-05-hpa-762-chess-legality-capture-design.md)
**Review:** [PR #60 feedback](https://github.com/cwchanap/procyon/pull/60#issuecomment-6676225300)

## Evidence already available

The reviewer used a scratch script against main `5d4e2b1` and reported: `exd5` and `Nxe5` succeed, f3→e4 is correctly illegal, and Black e5→e6 is rejected. We have not reproduced the live-site report. The code already routes human and engine moves through `chess.js`, and the existing tests exercise invalid engine suggestions, FEN delivery, board coordinates, orientation and bundled-Worker loading.

**Keep:** `chess.js` authoritative; preserve board on illegal engine suggestions; no automatic engine retry; one PR.

**Cut:** duplicate illegal-engine component/e2e tests, knight geometry test, stand-alone square-coordinate/orientation tests, extra real-Worker midgame smoke, and broad speculative implementation branches.

## Step 0 — Identify the deployed revision first

- [ ] Open **Cloudflare Dashboard → Workers & Pages → procyon → Deployments / Builds**. Inspect the build/commit serving `procyon.cwchanap.dev` at the November 4 incident (if deployment history is available), **and** the current production build.
- [ ] Compare with the chess-authoritative foundation `32a4fcb` (2026-07-28) and main `5d4e2b1` (2026-11-04). Verify the public site's build actually includes the chess/rival implementation under investigation.
- [ ] Cross-check the relevant domain/environment and possible cached old assets. The PR #60 Cloudflare bot's `afc21fb7` deployment notification is from **November 6**, after the reported incident; it cannot identify the November 4 build.
- [ ] Record exact SHA/build/date and outcomes in HPA-762. If an out-of-date deployment is confirmed, redeploy the current build via the existing deployment workflow and retest `exd5`, `Nxe5` and `1.e4 e5 2.Nf3` on the actual site before designing code changes. If dashboard history is unavailable, mark provenance **unknown** and continue focused verification.

## Step 1 — One focused rules regression (likely green)

**File:** `apps/web/src/lib/chess/game.test.ts` (or `rules.test.ts` if that avoids repeated setup).

- [ ] Using a compact table-driven helper for moves from `createInitialGameState`, assert: `1.e4 d5 2.exd5` records a captured Black pawn, places White pawn on d5, advances to Black with consistent FEN; `1.Nf3 e5 2.Nxe5` captures a Black pawn on e5 with consistent history/FEN/turn.
- [ ] After `1.e4 e5 2.Nf3`, assert `attemptMove(state, {from:'e5', to:'e6'})` equals **`{kind:'rejected', reason:'illegal-move'}`** and the original state is unchanged. **Do not** use `makeAIMove(...) === null` as the *sole* assertion: a corrupted FEN, wrong side or terminal state can produce the same null.
- [ ] Record pass/fail. The reviewer's scratch results suggest these cases already pass on main. They are a compact regression baseline, not proof that a deployed UI issue is fixed.

## Step 2 — One click-to-capture React test (real gap)

**File:** `apps/web/src/components/ChessGame.test.tsx`. Reuse existing `engineOptions` fake provider and `waitForSetupResolved` helper.

- [ ] Human **White**, local engine **Black**. Start, click `Square 6-4` (e2) → `Square 4-4` (e4). Script the first Black engine reply as `{from:'d7',to:'d5'}`.
- [ ] Wait for Black pawn `♟` on occupied `Square 3-3` (d5), then select `Square 4-4` and click `Square 3-3`.
- [ ] Assert `Square 3-3` contains White pawn `♙`, `Square 4-4` is empty, the move finished, and the status advances to Black's turn. Where useful, assert the capture ring is visible on the occupied legal target before the click.
- [ ] If this fails despite green rules tests, inspect `ChessGame.tsx:605-633` `handleSquareClick` and `ChessBoard.tsx:77-91` button event delivery first. Patch **only the owner demonstrated by the failure**.

## Step 3 — Extend one existing browser journey

**File:** `apps/web/e2e/chess-rival.spec.ts`, signed-out on-device journey (near line 368). Keep its existing fake Stockfish scripted White moves `['e2e4','g1f3']` and the human **Black** orientation.

- [ ] After White engine's e2→e4, change human reply from e7→e5 to **d7→d5** (Black pawn `Square 1-3` → `Square 3-3`).
- [ ] Wait until the scripted White knight g1→f3 (`Square 5-5`), leaving White pawn on e4. Then click Black pawn d5→e4 (`Square 3-3` → `Square 4-4`) to capture.
- [ ] Assert `Square 4-4` has Black pawn `♟`, d5 is empty, and the White pawn was removed. Keep the existing journey's Start, lazy Worker, orientation, and cleanup assertions.
- [ ] Do **not** add separate fake-Worker invalid-retreat, Black-orientation, or raw Stockfish-FEN tests: the existing tests already cover those boundaries.

## Step 4 — Smallest warranted fix or evidence-only closeout

- [ ] **Click test red:** patch `handleSquareClick` or square button behavior, with the new test demonstrating failure before the change and success after it. Keep `attemptMove` as legality authority.
- [ ] **Deployment stale:** roll forward via normal deployment and verify the live URL; a client code fix may not be necessary.
- [ ] **Everything green, live current:** retain the targeted regression tests, note tested SHA and corrected knight repro in HPA-762, and request the original FEN/move sequence or screenshot. Do **not** claim a defect is fixed without a demonstrated failure.
- [ ] **New evidence points elsewhere:** expand the investigation only as far as required by a failing observable test; no second rules implementation, extra provider state, telemetry, or broad refactor.

## Verification

- [ ] Run focused tests, plus existing invalid-engine gate:

~~~bash
cd apps/web
bun test src/lib/chess/game.test.ts src/components/ChessGame.test.tsx
bun test src/lib/chess/rival/stockfish-provider.test.ts
bun run test:e2e e2e/chess-rival.spec.ts
~~~

- [ ] Run repository checks if implementation changed:

~~~bash
# repository root
bun run typecheck
bun run lint
bun run format:check
~~~

- [ ] Record the tested revision, deployment evidence, new/modified test results, whether the reported behavior reproduced, and any actual code fix in the **existing PR #60** and HPA-762. Keep the draft until the implementation and verification are ready for review.

**Stop condition:** If the current implementation and real site both pass and the incident-time revision cannot be confirmed, stop after useful regression coverage and clearly document **unreproduced report**. Do not turn an evidence gap into speculative source code.
