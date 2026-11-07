# HPA-762 — Chess capture and illegal-move regression design

**Status:** Implemented; revised after [initial PR #60 review](https://github.com/cwchanap/procyon/pull/60#issuecomment-6676225300), [revision 2 review](https://github.com/cwchanap/procyon/pull/60#pullrequestreview-5796113768), and review reception addressing capture retention and test coverage gaps
**Issue:** [HPA-762](https://linear.app/cwchanap/issue/HPA-762/standard-chess-on-device-ai-plays-an-illegal-pawn-move-and-human)
**Date:** 2026-11-05
**Scope:** One PR for design, focused tests, and any **proven** fix.

## Problem and accurate reproduction

The November 4 live-site report describes Black's e-pawn moving *backward* e5→e6 after `1.e4 e5 2.Nf3` and apparently ignored human captures. One reported knight example was not legal in the first place.

| Case | Correct result |
| --- | --- |
| `1.e4 d5 2.exd5` | Legal pawn capture. White pawn on d5; Black pawn removed; Black to move. |
| `1.Nf3 e5 2.Nxe5` | Legal knight capture. White knight on e5; Black pawn removed. |
| White knight f3→e4, regardless of target | **Illegal** knight displacement; no move should occur. Correct the Linear report rather than make it pass. |
| Black e-pawn e5→e6 after `1.e4 e5 2.Nf3` | **Illegal** pawn retreat; must not alter board/FEN/history. |

The review author ran these cases against current main (`5d4e2b1`) with the public game API. They reported that both captures applied, f3→e4 was rejected, and the AI pawn retreat returned `null`. These are reviewer-provided scratch results, **not** a reproduction of the November 4 production failure; no repository changes were involved. In the final regression, assert `attemptMove` rejects the pawn retreat specifically as `illegal-move`, rather than treating any `null` result as proof.

## Current architecture and already-covered behavior

- `apps/web/src/lib/chess/rules.ts` implements the authoritative standard-chess façade over `chess.js`; `attemptMove` applies legal moves and checks serializable FEN/history, `getLegalDestinations` supplies the legal click targets.
- `apps/web/src/lib/chess/game.ts` routes both `makeMove` and `makeAIMove` through `attemptMove`. `ChessGame.tsx:605-633` handles square clicks; `ChessBoard.tsx:77-91` renders the underlying square buttons. The capture overlay in `board-accents.ts` is `pointer-events-none`.
- `stockfish-provider.ts` sends the current state FEN as the UCI position command. `stockfish-protocol.ts` parses move notation, while legality and stale-result handling remain in the existing game/session boundary.
- `ChessGame.test.tsx` already verifies a rejected illegal successful engine suggestion leaves the board unchanged and stops instead of retrying; `stockfish-provider.test.ts` already pins the FEN command. `board.test.ts` covers algebraic conversion; `ChessBoard.test.tsx` covers Black orientation. `stockfish-assets.spec.ts` already verifies the real bundled worker.

**Remaining meaningful gap:** an occupied-square human capture *via UI button clicks* in a running rival session. Build focused coverage for that path, not another general chess engine or redundant Worker-validation suite.

## Decision: establish deployment provenance before changing code

The application uses Astro static output and Cloudflare hosting. On a production report, first inspect **Cloudflare Workers & Pages → procyon → Deployments / Builds** (the Cloudflare deployment notification on PR #60 links to that service). Record:

1. The deployed revision/build serving `https://procyon.cwchanap.dev/chess/` at the **November 4** incident time, if historical records are available.
2. The **current** production revision and whether it includes the `chess.js` foundation commit `32a4fcb` (2026-07-28) and subsequent chess/rival changes.
3. Whether the public URL and build environment match the reported experience. Check for cached older assets when versions disagree.

GitHub's Cloudflare bot reported a successful `afc21fb7` build on November 6, **after** the incident. Do not infer that this build was serving the November 4 session or that it fixes anything. When the dashboard cannot prove the old build, state that limitation.

- **Outdated deploy verified:** get the current code deployed through the existing pipeline, retest the two captures and opening, then record the result. No speculative rules patch.
- **Current deploy or unknown:** confirm the precise production reproduction and run the small tests below. If pure rules pass but clicks fail, inspect `handleSquareClick`/`ChessBoard` and fix the smallest demonstrated UI defect.
- **Everything green:** record evidence and request the original move history/FEN or screenshot. Do not claim a confirmed production fix.

## Minimal acceptance coverage

1. **One compact rules test (table-driven if helpful):** `exd5`, `Nxe5` apply with correct capture record, FEN and turn; e5→e6 returns `{kind: 'rejected', reason: 'illegal-move'}` from a valid non-terminal position. No separate negative knight geometry test.
2. **One new React component test:** fake Black engine first plays `d7d5` after the White human plays e2→e4. Use a **call-aware fake** with a deferred/legal second response: White's capture immediately hands the turn back to Black, and a one-move static fake must not replay `d7d5`. Click White pawn on occupied d5; verify White pawn replaces Black pawn, e4 empties and turn advances. If deferred, settle the second call with a legal move (such as `g8f6`) before test cleanup.
3. **Extend the existing Black-oriented browser journey:** script White engine moves **`['e2e4', 'g1f3', 'd2d4']`**. Human Black replies d7→d5 and then captures d5→e4. The third fake move must be legal after the capture because the Worker repeats its last scripted move when the list is exhausted; otherwise it would illegally replay `g1f3` and create a misleading error. Verify captured White pawn disappears, Black pawn occupies e4, and the scripted follow-up does not halt the session.

Reuse existing tests for invalid engine results, square mapping, orientation and real engine packaging. Do not add a real-Stockfish midgame smoke or duplicate illegal-move browser test unless new evidence reveals an uncovered failure.

## Invariants and non-goals

- Only the `chess.js` rules façade can commit a chess position. The board, FEN, move history and side-to-move remain consistent after an applied move; rejected moves preserve the position.
- A human click on a legal occupied target must follow the same application path as clicking an empty legal destination.
- An illegal engine suggestion remains uncommitted and follows the **existing** failure/New Game behavior. No automatic same-position retry or bypass of legality.
- If a UI test fails, investigate `ChessGame.tsx:605-633` or `ChessBoard.tsx:77-91` first; expand beyond them only if the evidence requires it.
- No new state store, telemetry, chess engine, broad refactor, migration, art/SFX, or Aeroplane fixes (HPA-761/HPA-763).

## Completion criterion

Capture tests pass in both human orientations as covered above, existing illegal-move guard remains green, and the original report is reconciled with a verified deployment revision or an explicitly documented inability to reproduce. Only describe a bug as fixed if a failing behavior is reproduced and corrected. All implementation work belongs in **this same PR**, per [implementation plan](../plans/2026-11-05-hpa-762-chess-legality-capture.md).
