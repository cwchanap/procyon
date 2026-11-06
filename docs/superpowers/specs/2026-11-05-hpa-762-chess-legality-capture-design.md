# HPA-762 — Standard Chess Move-Legality and Capture Regression Design

**Status:** Proposed — design review, not implemented
**Date:** 2026-11-05
**Linear:** [HPA-762 — Standard Chess: on-device AI plays an illegal pawn move, and human captures fail to execute](https://linear.app/cwchanap/issue/HPA-762/standard-chess-on-device-ai-plays-an-illegal-pawn-move-and-human)
**Scope:** One bug-fix PR, extending this draft planning PR after design review.

## Problem and corrected reproductions

A live-site playtest reported (1) Black's e-pawn moving backward from e5 to e6 after 1.e4 e5 2.Nf3, and (2) human captures apparently doing nothing. An AI pawn retreat and a legal capture being ignored would be game-breaking, but neither root cause has been established in the checked-in code.

The ticket's second capture example needs correction:

| Scenario | Legal? | Expected |
| --- | --- | --- |
| 1.e4 d5 2.exd5 | Yes | White pawn on e4 captures the black pawn on d5; turn and FEN advance |
| 1.Nf3 e5 2.Nxe5 | Yes | White knight on f3 captures the black pawn on e5 |
| Knight f3 → e4 (ticket's “Nxe4”) | **No** | Reject without changing board/history; a knight cannot move one file and one rank |
| After 1.e4 e5 2.Nf3, black pawn e5 → e6 | **No** | Reject; Black pawns cannot retreat |

These examples assume no intervening move makes the position different. Do not change rules so that the invalid f3→e4 click becomes accepted.

## Current-code audit (main at 5d4e2b1d)

- `apps/web/src/lib/chess/rules.ts` owns the short-lived `chess.js` engine, serializable state and replay. `attemptMove` filters legal verbose moves and records the resulting FEN/history; `getLegalDestinations` drives UI indicators. `replayEngine` rejects FEN/history mismatch.
- `apps/web/src/lib/chess/game.ts` delegates both `makeMove` (human) and `makeAIMove` (rival) to that same `attemptMove`. `selectSquare` draws destinations from the same authoritative rules.
- `apps/web/src/components/ChessGame.tsx` passes square clicks to `handleSquareClick`. For a selection it tries `makeMove`, otherwise it calls `selectSquare`; the rival callback uses a generation/FEN/turn-checked session result, then `makeAIMove`.
- `apps/web/src/components/ChessBoard.tsx` renders one button per square and an overlaid capture ring for occupied legal destinations.
- `apps/web/src/lib/chess/rival/stockfish-provider.ts` sends `position fen <current fen>` and parses the Worker result through `stockfish-protocol.ts`. This provider does not itself apply board mutations; the game boundary must continue to reject illegal suggestions.
- `apps/web/src/lib/chess/rival/stockfish-protocol.ts` validates UCI move *format*, not legality; this separation is intentional.
- Existing tests already cover many standard rules, en passant, promotion, bad engine moves, Worker packaging, and basic browser opponent flows, but do not explicitly cover these exact ordinary captures or the 1.e4 e5 2.Nf3 / e5→e6 regression.

The current architecture appears to prohibit the reported AI pawn retreat. It is **not proven** that the reported live-site sequence can be reproduced on current main; stale UI, a different deployed build, or a session transition remain hypotheses, not findings.

## Design decision

**Keep `chess.js` as the sole rules authority.** Reuse the existing state and provider boundaries. Add deterministic regression coverage first; change the smallest component demonstrated to be incorrect by a failing test. No replacement chess engine, custom legality fallback, new shared game abstraction, second state store, or broad rewrite.

### Diagnostic decision tree

1. **Rules-level failure:** Reproduce using `createInitialGameState` / `attemptMove` / `makeMove` / `makeAIMove` with exact moves. If a legal capture is rejected, inspect the current FEN, move-history replay, square conversion and promotion request. If an illegal retreat is applied, fix the `rules.ts` / orchestration boundary without creating parallel rules.
2. **React/UI-only failure:** If the pure game API succeeds, exercise `ChessGame` with button clicks against an injected/fake rival, including occupied capture targets, board disabled state and turn transitions. Fix only the click handler or board interaction that drops a legal click. Avoid bypassing the legality gate or manually mutating board state.
3. **Worker/session-only failure:** If a deterministic browser fake passes, inspect the actual Worker request/response against the exact position FEN. Confirm generation/session/FEN ownership and ensure a syntactically valid but illegal `bestmove` leads to the existing engine move-failed/New Game path while preserving the last legal board.
4. **Cannot reproduce on main:** Verify which source revision the reported site serves and retest on that build. Record the observed FEN, move history, requested UCI move, and rendered squares when possible. Do not invent a production root cause or land speculative changes. Update HPA-762 with evidence and the remaining reproducibility gap.

Any diagnostic traces should be test-local or temporary; do not add persistent logging, telemetry, or a player-facing debug facility for this issue.

## State and interaction invariants

- Only `attemptMove` may advance the playable chess position; no direct board cell edits.
- After an applied move, `state.board`, `state.fen`, `state.currentPlayer` and the newest `moveHistory` record describe the **same** position.
- After rejection, the game keeps the same position/FEN/history and human-to-move or rival failure state as appropriate.
- Clicking a legal occupied enemy square must reach the same move path as clicking a legal empty destination.
- Invalid opponent move output is never committed, even if it passes UCI syntax parsing. Preserve current engine-only failure behavior (no same-position automatic retry).
- Black-oriented board display must not alter logical square coordinates; affected game tests should use White orientation from the issue, with a light orientation regression if that is where the failure occurs.
- Preserve the LLM rival and other chess variants without changing their interfaces.

## Scope and non-goals

In scope: exact scenario regression tests at the appropriate layer(s); a minimal implementation fix **only after** the failing boundary is identified; confirmation in a browser that humans can capture and invalid AI moves cannot corrupt a match.

Out of scope: rule redesign, Stockfish tuning or difficulty changes, new engine recovery flow, game persistence/reload work (HPA-763), Aeroplane fixes (HPA-761), other variants, database migrations, new art/SFX, UI redesign, or backward-compatibility shims.

## Acceptance criteria

- White human vs Black on-device computer can complete a legal `exd5` capture after `1.e4 d5`; the captured pawn disappears, move record captures the correct piece, FEN and turn agree with the board.
- White human can complete a legal `Nxe5` after `1.Nf3 e5`; `f3→e4` is rejected as illegal with no state mutation.
- After `1.e4 e5 2.Nf3`, the black e-pawn cannot be applied from e5 to e6 by the rules API or an injected UCI result. A rejected suggestion leaves the prior position intact and surfaces existing engine failure feedback.
- Deterministic component/browser tests guard the click-to-state pipeline, alongside a lightweight real-Worker smoke check if the issue reproduces beyond mocks.
- Existing promotion, castling, en passant, terminal-state, opponent-session, and LLM paths remain green.
- Any deployed-only discrepancy is documented with the tested revision and exact reproduction evidence, rather than silently asserted fixed.

## Implementation vehicle

Keep **one PR for HPA-762**. This draft starts with design and checklist files under `docs/superpowers/`. Once reviewed, add only the verified minimal code/tests **to the same PR**. See the paired implementation plan for the red/green/test sequence and stop conditions.
