# HPA-160: Complete Standard Chess Rules Design

**Date:** 2026-07-27  
**Issue:** [HPA-160 — Support complete standard chess rules for rival games](https://linear.app/cwchanap/issue/HPA-160/support-complete-standard-chess-rules-for-rival-games)  
**Parent:** [HPA-159 — Add a local non-LLM chess rival](https://linear.app/cwchanap/issue/HPA-159/feature-add-a-local-non-llm-chess-rival)

## Summary

Procyon's current chess implementation handles ordinary piece movement and rejects
many moves that leave the moving king in check, but it is not a complete standard
chess rules implementation. It does not apply castling, en passant, or promotion;
it exposes pseudo-legal destinations in the interface; it does not preserve the
state required for repetition and fifty-move adjudication; and it does not
consistently stop play after a terminal result.

HPA-160 will make `chess.js` the authoritative standard-chess rules engine behind
Procyon's existing chess-facing types and components. A serializable façade will
translate between `chess.js` and Procyon's board, move, UI, puzzle, and rival
contracts. Human moves, language-model moves, and the future Stockfish integration
will all use the same legal-move and result pipeline.

## Goals

- Support legal kingside and queenside castling.
- Support en passant captures.
- Support promotion to queen, rook, bishop, or knight.
- Require a human promotion choice before changing the board.
- Reject moves that leave the moving player's king in check.
- Show only legal destinations.
- Identify check, checkmate, stalemate, threefold repetition, the fifty-move rule,
  and insufficient-material draws.
- Automatically end games on threefold repetition and the fifty-move rule, as
  required by HPA-160.
- Preserve a replayable game record and current FEN.
- Prevent further play after a terminal result.
- Apply identical legality and adjudication rules to humans, language-model
  rivals, and future on-device rivals.
- Preserve existing chess tutorial, puzzle, and language-model behavior.

## Non-goals

- Opponent selection or on-device-rival availability UI (HPA-161).
- Stockfish loading, worker lifecycle, cancellation, retry, or timeout behavior
  (HPA-163).
- Difficulty presets or calibration (HPA-162).
- Local-rival history presentation, opponent metadata, or export redesign
  (HPA-164/HPA-165).
- Release browser certification, performance targets, or third-party notice
  publication (HPA-166/HPA-187).
- Draw offers, claim interactions, takebacks, analysis, hints, or move scoring.
- Chess variants or custom rules.
- Refactoring the other game variants or completing the full shared game-core
  initiative.

## Current-State Audit

The current implementation is split across:

- `apps/web/src/lib/chess/moves.ts` for pseudo-legal piece movement.
- `apps/web/src/lib/chess/game.ts` for selection, move application, king-safety
  rejection, status calculation, and the language-model move entry point.
- `apps/web/src/lib/ai/chess-adapter.ts` and `rule-guardian.ts` for language-model
  move enumeration and validation.
- `apps/web/src/components/ChessGame.tsx` and `ChessBoard.tsx` for the game flow
  and destination indicators.
- `apps/web/src/hooks/usePuzzle.ts` for puzzle position handling.

The existing `Move` type already has optional `isEnPassant`, `isCastling`, and
`promotion` fields, but no implementation populates or applies them. Current
destination indicators come from `getPossibleMoves`, which is pseudo-legal and
can include pinned moves or king moves into check. `makeMove` performs a later
king-safety rejection but only moves one piece from `from` to `to`, so it cannot
apply castling or en passant and never promotes a pawn. `getGameStatus` recognizes
check, checkmate, and stalemate in limited positions, but `makeMove` resets status
to `playing` and has no draw-history state. `ChessRuleGuardian` does not currently
enforce chess-specific legality.

The checkout has extensive ordinary-movement and basic king-safety tests, but no
coverage for castling, en passant, promotion application, repetition, fifty-move
adjudication, insufficient material, terminal move rejection, or promotion UI.

## Architectural Decision

Add `chess.js` to `apps/web` as the authoritative standard-chess rules dependency.
The implementation will use the documented 1.x TypeScript API for legal verbose
moves, coordinate move application, FEN, replay history, and specific terminal
condition predicates.

`chess.js` will be isolated behind a chess-only façade, expected at
`apps/web/src/lib/chess/rules.ts`. A mutable `Chess` object will exist only inside
short-lived façade calls. It will never be stored in React state or exposed to
components, shared game-core, puzzle types, AI service types, or persistence
contracts.

This boundary gives Procyon one authoritative rules implementation without
forcing a broad migration to `chess.js` types. It also produces the FEN and
coordinate-move contract that a later Stockfish worker will require.

## Serializable Game State

`GameState` remains an immutable, serializable Procyon object. It gains:

```ts
type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

type ChessTerminationReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'insufficient-material';

interface PendingPromotion {
  from: Position;
  to: Position;
  color: PieceColor;
  choices: PromotionPiece[];
}

interface GameState {
  // Existing board, turn, mode, status, selection, and thinking fields remain.
  initialFen: string;
  fen: string;
  moveHistory: Move[];
  pendingPromotion: PendingPromotion | null;
  terminationReason: ChessTerminationReason | null;
}
```

Each completed `Move` records enough information for exact replay and later
export work:

```ts
interface Move {
  from: Position;
  to: Position;
  piece: ChessPiece;
  capturedPiece?: ChessPiece;
  promotion?: PromotionPiece;
  isEnPassant?: boolean;
  isCastling?: boolean;
  san: string;
  lan: string;
  beforeFen: string;
  afterFen: string;
}
```

`initialFen + moveHistory` is the reproducible game record. `fen`, `board`,
`currentPlayer`, `status`, and `terminationReason` are cached views generated
together by the façade after a successful move. They must not be independently
mutated by normal game flow.

When repetition history is needed, the façade constructs a new `Chess` instance
from `initialFen` and replays the coordinate moves, including promotion choices.
It verifies that the replayed FEN matches the cached `fen`; inconsistent state
fails closed. Replaying a few hundred half-moves is negligible compared with UI
and rival-turn work and avoids storing a mutable engine object.

The legacy `ChessPiece.hasMoved` field is no longer authoritative. Castling rights
come from FEN and replay history. The field may remain temporarily for seed and
tutorial compatibility, but rules code must ignore it.

## Position Factories

All playable chess state will be created through explicit factories:

- `createInitialGameState(...)` uses the standard starting FEN.
- `createGameStateFromFen(fen, options)` creates a complete state for tests and
  authored positions.
- `createGameStateFromBoard(board, sideToMove, options)` exists only as a
  compatibility boundary for existing authored puzzle data. It creates a FEN
  with explicit castling, en passant, halfmove, and fullmove defaults. Castling
  defaults to unavailable rather than being guessed from piece placement.

Authored tutorial positions will be converted to valid FEN positions containing
both kings. Puzzle flow will create one complete `GameState` at puzzle start and
carry it through the scripted sequence instead of rebuilding a rules state from
the board after every half-move.

## Rules Façade

The façade owns all conversion and rule decisions:

- Procyon `Position` to and from algebraic squares.
- Procyon `ChessPiece` to and from `chess.js` piece codes.
- FEN to Procyon's board snapshot.
- Legal verbose move generation for one square or the whole side to move.
- Move application and verbose-move mapping.
- Replay validation.
- Status and termination-reason derivation.

The primary internal operation returns a discriminated result rather than
partially changing state:

```ts
type MoveAttempt =
  | { kind: 'applied'; state: GameState; move: Move }
  | {
      kind: 'promotion-required';
      from: Position;
      to: Position;
      choices: PromotionPiece[];
    }
  | { kind: 'rejected'; reason: MoveRejectionReason };
```

Expected exported operations are:

- `getLegalMoves(gameState, from)` — returns legal verbose candidates.
- `getLegalDestinations(gameState, from)` — deduplicates candidates by target
  square for board indicators.
- `attemptMove(gameState, request)` — validates and applies one exact move or
  reports why it cannot be completed.
- `replayGame(gameState)` — reconstructs and validates the current engine state.
- `createGameStateFromFen(...)` and `createGameStateFromBoard(...)`.

Existing functions in `game.ts` remain the Procyon-facing orchestration layer and
delegate to this façade. `moves.ts` may retain low-level movement helpers for
other non-game consumers during migration, but it is no longer authoritative for
playable chess legality.

## Human Move Flow

1. Selecting a current-player piece calls `getLegalDestinations`.
2. The board shows only those destinations.
3. Clicking a non-promotion destination calls the shared move attempt and applies
   the resulting state atomically.
4. Clicking a promotion destination with no choice returns
   `promotion-required`. The board does not change. The controller stores
   `pendingPromotion` and opens the promotion dialog.
5. Choosing queen, rook, bishop, or knight retries the same move with the explicit
   promotion choice.
6. Cancelling the dialog clears `pendingPromotion` and restores ordinary
   selection without changing the board or turn.

Castling and en passant need no special UI gestures. They are legal destinations
and are applied atomically from the verbose move returned by `chess.js`.

The board is non-interactive while promotion is pending, during a rival move, or
after a terminal result.

## Promotion Dialog

A chess-specific `PromotionDialog` component will:

- Render all four standard choices using the promoting pawn's color.
- Use a labelled modal/dialog role and move focus into the choice set.
- Keep the board unchanged until a choice is activated.
- Offer cancellation without completing the move.
- Return focus to the game flow after selection or cancellation.

The dialog is part of HPA-160 because requiring a human choice is an explicit
acceptance criterion. Broader local-rival accessibility verification remains
owned by HPA-166/HPA-187.

## Rival and AI Integration

All rival moves use the same exact move request:

```ts
interface ChessMoveRequest {
  from: Position;
  to: Position;
  promotion?: PromotionPiece;
}
```

The existing language-model `AIMove` gains an optional chess `promotion` field.
The existing Shogi `promote` boolean and `pieceType` fields remain unchanged.

`ChessAdapter` will:

- Enumerate legal moves from the façade instead of pseudo-legal movement plus a
  separate king-safety simulation.
- Emit all four promotion variants in the valid-move list.
- Describe the optional promotion field in the chess JSON response format.
- Continue using existing from/to notation for non-promotion moves.

`ChessRuleGuardian` will validate the complete `{from, to, promotion}` request
against the façade. `makeAIMove` will accept an optional promotion, apply only an
`applied` result, and reject `promotion-required` rather than defaulting to a
queen.

This same request shape is the future on-device-rival seam. A later UCI parser can
map `a7a8n` to `{from: 'a7', to: 'a8', promotion: 'knight'}` and call the same
entry point. Castling and en passant require no engine-specific flags because the
authoritative position determines their meaning.

## Result Adjudication

After every completed move, the reconstructed `Chess` instance determines status
in this order:

1. Checkmate.
2. Stalemate.
3. Insufficient material.
4. Threefold repetition.
5. Fifty-move rule.
6. Check.
7. Playing.

Checkmate is resolved before draw predicates so a mating move remains decisive.
HPA-160 intentionally treats threefold repetition and the fifty-move rule as
automatic terminal draws even though formal over-the-board rules normally allow
claims.

Status mapping remains compatible with shared consumers:

- Checkmate -> `status: 'checkmate'`, reason `checkmate`.
- Stalemate -> `status: 'stalemate'`, reason `stalemate`.
- Repetition, fifty-move, or insufficient material -> `status: 'draw'` with the
  specific reason.
- Check -> `status: 'check'`, no termination reason.
- Otherwise -> `status: 'playing'`, no termination reason.

The game status text names the exact draw reason. Existing play-history code may
continue treating all draw statuses identically.

## Terminal-State Invariant

`selectSquare`, human move attempts, language-model moves, and the future
on-device-rival entry point all reject work when `terminationReason` is non-null
or status is terminal. The component's existing game-ended latch continues to
stop rival effects and play-history completion, but the domain guard is the
authoritative protection.

This ensures terminal protection does not depend on React timing or disabled
button state.

## Failure Behavior

Rules operations are pure from the caller's perspective and never mutate the
provided `GameState`.

- Illegal coordinates, wrong-side pieces, illegal destinations, invalid
  promotions, and terminal-state moves produce a rejected result.
- A promotion move without a choice produces `promotion-required` only for the
  human flow; rival wrappers treat it as invalid.
- Replay/FEN inconsistency produces an internal-state rejection and preserves the
  current board.
- A language-model or future engine invalid move leaves the board untouched and
  follows the caller's existing error path.
- Authored invalid FEN is rejected by the position factory rather than silently
  normalized.

Detailed local-rival retry and recovery UI remains HPA-163's responsibility.

## Tutorial and Puzzle Compatibility

Tutorial positions will be expressed as valid FEN rather than manually assembled
partial boards. Tutorial selection uses legal destinations from the same façade,
so highlighted available moves never contradict playable chess rules.

`usePuzzle` will retain its solution-step, attempt, hint, and persistence
semantics, but it will carry a complete chess `GameState` through player and
scripted opponent moves. Puzzle board rendering reads `gameState.board`, and
selection reads legal destinations from the façade. Existing puzzle data begins
with no inferred castling or en passant rights unless those rights are explicitly
added to the puzzle contract in a future ticket.

## Automated Verification

### Rules façade tests

- Standard initial legal moves and coordinate mappings.
- Kingside and queenside castling for both colors.
- Castling rejection when the path is occupied, the king is in check, a crossed
  square is attacked, the destination is attacked, or castling rights are lost.
- En passant availability immediately after a two-square pawn move.
- En passant pawn removal and move metadata.
- En passant expiry after one intervening reply.
- En passant rejection when it exposes the moving king.
- Quiet and capture promotions to queen, rook, bishop, and knight.
- Pinned pieces and all check-evasion categories.
- King moves cannot enter attacked squares.
- Legal-destination output is a subset of authoritative legal moves.
- Check, checkmate, and stalemate.
- Threefold repetition after a repeatable move sequence.
- Fifty-move adjudication after the hundredth qualifying half-move.
- Representative insufficient-material positions, including bare kings,
  king-and-bishop versus king, and king-and-knight versus king.
- Terminal-state move rejection.
- Initial-FEN plus move-history replay exactly reproduces current FEN.
- Verbose move records contain SAN, LAN, before/after FEN, capture, promotion,
  castling, and en passant information when applicable.

### Game orchestration tests

- Human promotion produces pending state without changing board or turn.
- Confirming each promotion choice applies the expected piece.
- Cancelling promotion leaves the position unchanged.
- `selectSquare` exposes legal destinations only.
- Human and rival wrappers produce identical state for the same legal request.
- `makeAIMove` applies rival castling, en passant, queen promotion, and
  underpromotion.
- Missing or invalid rival promotion is rejected.
- Status and specific termination reason update during the same transition as
  the move.
- No move or selection is accepted after a terminal result.
- A legal game sequence from the initial position reaches a normal terminal
  result.

### Component and integration tests

- Promotion dialog renders four choices and an accessible label.
- The board remains unchanged and disabled while the dialog is open.
- Each choice applies the correct promoted piece; cancellation applies none.
- Destination indicators omit pseudo-legal pinned and unsafe-king moves.
- Status copy distinguishes stalemate, repetition, fifty-move, and
  insufficient-material draws.
- The language-model response path forwards promotion.
- Existing tutorial and puzzle journeys remain operational.

### Regression commands

The implementation plan will run focused chess, adapter, guardian, component, and
puzzle tests first, followed by:

```bash
cd apps/web && bun test src
cd apps/web && bun run typecheck
cd apps/web && bun run lint
git diff --check
```

Browser/real-Stockfish release smoke testing remains HPA-187 because HPA-160 does
not add the on-device engine.

## Acceptance-Criteria Mapping

| HPA-160 acceptance criterion | Design coverage |
| --- | --- |
| A full standard chess game can be completed using every legal move type | One authoritative legal move pipeline, special-move façade tests, and a complete-game integration sequence |
| Human promotion supports queen, rook, bishop, and knight | Pending-promotion state plus four-choice dialog and component tests |
| A legal special move selected by the local rival is applied correctly | Shared rival request seam and rival castling/en-passant/promotion tests |
| Every move destination shown by the interface is legal | `getLegalDestinations` derives only from `chess.js` legal verbose moves |
| Supported automatic draw conditions end the game with the correct result | Specific automatic repetition/fifty-move adjudication plus insufficient-material and stalemate reasons |
| Automated coverage exists for every special move and supported terminal condition | Focused façade, orchestration, adapter, guardian, and component matrices above |

## Dependency and Release Boundary

The web package will declare `chess.js` and commit the resulting Bun lockfile
change. HPA-160 will not add Stockfish or load any engine asset.

HPA-187 owns the consolidated third-party notices and release compliance for both
the chess-rules and Stockfish dependencies. HPA-160's move records and FEN state
are intentionally sufficient for HPA-164's later export work, but this ticket
does not redesign current export formats.
