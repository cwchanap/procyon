# HPA-160 Complete Standard Chess Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make human and rival chess games share one complete standard-rules pipeline covering legal king safety, castling, en passant, four promotion choices, terminal results, and supported automatic draws.

**Architecture:** Pin `chess.js` 1.4.0 and isolate it in `apps/web/src/lib/chess/rules.ts`. Keep React and persistence state as serializable Procyon types containing `initialFen`, current `fen`, and rich move history; reconstruct one ephemeral engine per public action. Route game orchestration, LM rival validation, tutorial positions, and puzzles through that façade, then remove the legacy pseudo-legal chess generator.

**Tech Stack:** TypeScript, Bun, React 18, Astro 4, Testing Library, chess.js 1.4.0

## Global Constraints

- Pin exactly `chess.js` version `1.4.0` in `apps/web/package.json` and commit `bun.lock`.
- `chess.js` types and mutable `Chess` objects stay inside `apps/web/src/lib/chess/rules.ts`; expose only Procyon-local types.
- `initialFen`, `fen`, `pendingPromotion`, and `terminationReason` are required `GameState` fields. Do not add optional compatibility fields or generic `Partial<GameState>` fixtures that can create incoherent cached views.
- `initialFen + moveHistory` is the replay record; `fen`, `board`, `currentPlayer`, `status`, and `terminationReason` are derived together.
- Every public rules action reconstructs from `initialFen` and replays the full rich move history at most once; it deliberately does not fast-path `fen`, because replay is the fail-closed consistency check. This is O(n) per action and O(n²) across a completed game's successive moves, accepted for HPA-160 and deferred to HPA-166.
- `createGameStateFromFen` creates a new replay root with empty prior history. A mid-game FEN therefore starts repetition counting at one occurrence; callers that need earlier repetition history must supply `initialFen + moveHistory`.
- Rival prompt generation calls one whole-side legal-move query and one batched attack query; it never reconstructs an engine once per piece or destination.
- Never default a missing promotion to queen. Human moves enter pending promotion; rival and scripted moves reject missing promotion data.
- LM valid-move listings use `a7-a8=Q`, `a7-a8=R`, `a7-a8=B`, or `a7-a8=N`; response JSON uses `promotion: 'queen'|'rook'|'bishop'|'knight'` only for promotion moves.
- Legal destination indicators equal the deduplicated authoritative destination set.
- Pinned pieces still count in attack and defender maps even though their pinned moves are not legal moves.
- Automatically terminate threefold repetition and fifty-move-rule positions as required by HPA-160; insufficient material is an immediate standard dead-position result.
- FIDE fivefold-repetition and seventy-five-move automatic draws, plus dead-position detection beyond chess.js 1.4.0's insufficient-material predicate, are explicitly out of scope.
- Repetition identity includes placement, side, castling rights, and effective en-passant availability, but not halfmove/fullmove counters.
- Authored FEN/board factories throw when chess.js 1.4.0 rejects the position. The board factory additionally requires an 8×8 board with exactly one king per side. Acceptance means structurally loadable by chess.js, not proof that the position is historically reachable or that every authored right is meaningful.
- Runtime move failures return a rejected `MoveAttempt` and never mutate state.
- DEV-only forced outcomes stay in `ChessGame` component state and never patch the authoritative chess `GameState`.
- `chess.js` is expected to ship in the client bundles that execute chess games, tutorials, and puzzles; measuring or reducing that bundle cost belongs to HPA-166.
- Preserve current play-history result contracts and AI-turn invalidation behavior.
- Do not add Stockfish, worker assets, export-format changes, or unrelated `@procyon/game-core` abstractions.

---

## File Structure

- Create `apps/web/src/lib/chess/rules.ts`: the only chess.js adapter; owns FEN conversion, replay, legal moves, attacks, application, and adjudication.
- Create `apps/web/src/lib/chess/rules.test.ts`: authoritative rules, replay, metadata, special-move, and terminal-result matrix.
- Modify `apps/web/src/lib/chess/types.ts`: serializable state, promotion, request, termination, and move-result contracts.
- Modify `apps/web/src/lib/chess/game.ts`: Procyon-facing selection, human promotion, rival application, and UI-state wrappers.
- Consolidate `apps/web/src/lib/chess/game.test.ts`: orchestration-only tests.
- Create `apps/web/src/lib/chess/tutorials.ts` and `tutorials.test.ts`: valid-FEN tutorial definitions kept outside the React component.
- Create `apps/web/src/components/ChessPromotionDialog.tsx` and `.test.tsx`: accessible four-choice promotion interaction.
- Modify `apps/web/src/components/ChessGame.tsx` and `ChessGame.test.tsx`: human/rival integration, terminal copy, board locking, and tutorial use.
- Modify `apps/web/src/components/game/GameDebugAndModeGuard.test.tsx`: preserve DEV outcome behavior without mutating authoritative chess state.
- Modify `apps/web/src/lib/ai/chess-adapter.ts`, `rule-guardian.ts`, `types.ts`, and `service.ts`: authoritative move enumeration and promotion propagation.
- Modify the existing AI tests beside those files: promotion prompt, parser, guardian, pinned legality, and threat-map coverage.
- Modify `apps/web/src/lib/puzzle/types.ts`, `apps/web/src/hooks/usePuzzle.ts`, `usePuzzle.test.ts`, and `apps/web/src/components/puzzle/PuzzleSolver.tsx`: carry one complete chess state through a puzzle.
- Delete `apps/web/src/lib/chess/moves.ts` and its three test files after all production consumers migrate.

---

### Task 1: Pin chess.js and establish serializable state plus position factories

**Files:**

- Modify: `apps/web/package.json:12-38`
- Modify: `bun.lock`
- Modify: `apps/web/src/lib/chess/types.ts:1-47`
- Create: `apps/web/src/lib/chess/rules.ts`
- Create: `apps/web/src/lib/chess/rules.test.ts`
- Modify: `apps/web/src/lib/chess/game.ts:21-36`
- Modify fixtures in: `apps/web/src/lib/ai/base-adapter.coverage.test.ts`, `base-rule-guardian.coverage.test.ts`, `chess-adapter.test.ts`, `chess-adapter.coverage.test.ts`, `rule-guardian.extended.test.ts`, `rule-guardian.test.ts`, `service.extended.test.ts`, `service.test.ts`

**Interfaces:**

- Produces: `PromotionPiece`, `ChessSquare`, `ChessTerminationReason`, `PendingPromotion`, `ChessMoveRequest`, `LegalChessMove`, `MoveRejectionReason`, `MoveAttempt`, `AttackQuery`, `AttackResult`.
- Produces: `createInitialGameState(options?)`, `createGameStateFromFen(fen, options?)`, `createGameStateFromBoard(board, sideToMove, options?)`.
- Produces: `getLegalMoves(state, from?)`, `getLegalDestinations(state, from)`, `queryAttacks(state, queries)`, `isSquareAttackedBy(state, square, color)`, `getAttackers(state, square, color)`, `isTerminalState(state)`.
- Consumes: existing Procyon `Position`, `ChessPiece`, `GameMode`, and board notation helpers.

- [ ] **Step 1: Add failing factory, legal-destination, and attack-map tests**

Add these cases to the new `rules.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import type { ChessPiece } from './types';
import {
  createGameStateFromBoard,
  createGameStateFromFen,
  createInitialGameState,
  getAttackers,
  getLegalDestinations,
  getLegalMoves,
  isTerminalState,
  isSquareAttackedBy,
  queryAttacks,
} from './rules';

describe('chess rules state factories', () => {
  test('creates a reproducible initial state with twenty legal moves', () => {
    const state = createInitialGameState();

    expect(state.initialFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(state.fen).toBe(state.initialFen);
    expect(state.currentPlayer).toBe('white');
    expect(state.moveHistory).toEqual([]);
    expect(state.pendingPromotion).toBeNull();
    expect(state.terminationReason).toBeNull();
    expect(isTerminalState(state)).toBe(false);
    expect(getLegalMoves(state)).toHaveLength(20);
  });

  test('throws for authored invalid FEN instead of normalizing it', () => {
    expect(() => createGameStateFromFen('not-a-fen')).toThrow();
  });

  test('throws for authored boards without exactly one king per side', () => {
    const board = Array.from({ length: 8 }, () =>
      Array<ChessPiece | null>(8).fill(null)
    );
    board[7]![4] = { type: 'king', color: 'white' };
    expect(() => createGameStateFromBoard(board, 'white')).toThrow();
  });

  test('throws for authored boards that are not exactly eight by eight', () => {
    const board = createInitialGameState().board.slice(0, 7);
    expect(() => createGameStateFromBoard(board, 'white')).toThrow();
  });

  test('board conversion uses explicit safe defaults', () => {
    const initial = createInitialGameState();
    const state = createGameStateFromBoard(initial.board, 'black');

    expect(state.fen.split(' ').slice(1)).toEqual(['b', '-', '-', '0', '1']);
    expect(state.initialFen).toBe(state.fen);
  });

  test('destinations exactly equal the deduplicated authoritative candidates', () => {
    const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
    const from = { row: 1, col: 0 };
    const destinations = getLegalDestinations(state, from);
    const expected = [
      ...new Map(
        getLegalMoves(state, from).map(move => [
          `${move.to.row}:${move.to.col}`,
          move.to,
        ])
      ).values(),
    ];

    expect(destinations).toEqual(expected);
    expect(getLegalMoves(state, from)).toHaveLength(4);
    expect(destinations).toEqual([{ row: 0, col: 0 }]);
  });

  test('a pinned piece still attacks a square it cannot legally move to', () => {
    const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');

    expect(isSquareAttackedBy(state, { row: 6, col: 3 }, 'white')).toBe(true);
    expect(getAttackers(state, { row: 6, col: 3 }, 'white')).toContainEqual({
      row: 6,
      col: 4,
    });
    expect(
      queryAttacks(state, [
        { square: { row: 6, col: 3 }, attacker: 'white' },
        { square: { row: 6, col: 4 }, attacker: 'black' },
      ])
    ).toEqual([
      {
        square: { row: 6, col: 3 },
        attacker: 'white',
        attacked: true,
        attackers: [{ row: 6, col: 4 }],
      },
      {
        square: { row: 6, col: 4 },
        attacker: 'black',
        attacked: true,
        attackers: [{ row: 0, col: 4 }],
      },
    ]);
    expect(getLegalDestinations(state, { row: 6, col: 4 })).not.toContainEqual({
      row: 6,
      col: 3,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing façade failure**

Run:

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts
```

Expected: FAIL because `./rules` and its exports do not exist.

- [ ] **Step 3: Install the exact dependency and define the public state contracts**

Run:

```bash
cd apps/web
rtk bun add chess.js@1.4.0 --exact
```

Update `types.ts` with these exact contracts:

```ts
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';
export type ChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type ChessRank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type ChessSquare = `${ChessFile}${ChessRank}`;

export type ChessTerminationReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'insufficient-material';

export interface PendingPromotion {
  from: Position;
  to: Position;
  color: PieceColor;
  choices: PromotionPiece[];
}

export interface ChessMoveRequest {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: PromotionPiece;
}

export interface Move extends BaseMove<ChessPiece> {
  from: Position;
  to: Position;
  promotion?: PromotionPiece;
  isEnPassant?: boolean;
  isCastling?: boolean;
  san: string;
  lan: string;
  beforeFen: string;
  afterFen: string;
}

export interface GameState extends BaseGameState<ChessPiece> {
  status: GameStatus;
  currentPlayer: PieceColor;
  moveHistory: Move[];
  mode: GameMode;
  aiPlayer?: PieceColor;
  isAiThinking?: boolean;
  initialFen: string;
  fen: string;
  pendingPromotion: PendingPromotion | null;
  terminationReason: ChessTerminationReason | null;
}
```

Also define `LegalChessMove` and `MoveAttempt` in `types.ts` so later tasks share one spelling:

```ts
export interface LegalChessMove {
  from: Position;
  to: Position;
  piece: ChessPiece;
  capturedPiece?: ChessPiece;
  promotion?: PromotionPiece;
  isEnPassant: boolean;
  isCastling: boolean;
  san: string;
  lan: string;
}

export type MoveRejectionReason =
  | 'terminal'
  | 'invalid-coordinate'
  | 'wrong-side'
  | 'illegal-move'
  | 'invalid-promotion'
  | 'state-inconsistent';

export interface AttackQuery {
  square: Position;
  attacker: PieceColor;
}

export interface AttackResult extends AttackQuery {
  attacked: boolean;
  attackers: Position[];
}

export type MoveAttempt =
  | { kind: 'applied'; state: GameState; move: Move }
  | {
      kind: 'promotion-required';
      from: Position;
      to: Position;
      color: PieceColor;
      choices: PromotionPiece[];
    }
  | {
      kind: 'rejected';
      reason: MoveRejectionReason;
    };
```

`PendingPromotion.choices` remains data-driven even though standard chess
currently returns all four pieces: the domain result owns the legal completion
options and the dialog renders exactly what that result supplies.

- [ ] **Step 4: Implement FEN conversion, factory construction, legal moves, and attacks**

In `rules.ts`, keep all imports from chess.js private to this file and use explicit conversion tables:

```ts
import {
  Chess,
  DEFAULT_POSITION,
  type Color,
  type Move as EngineMove,
  type PieceSymbol,
  type Square,
} from 'chess.js';
import { positionToAlgebraic, tryAlgebraicToPosition } from './board';
import type {
  AttackQuery,
  AttackResult,
  ChessPiece,
  ChessSquare,
  GameMode,
  GameState,
  LegalChessMove,
  PieceColor,
  Position,
  PromotionPiece,
} from './types';

const TO_ENGINE_COLOR: Record<PieceColor, Color> = { white: 'w', black: 'b' };
const FROM_ENGINE_COLOR: Record<Color, PieceColor> = { w: 'white', b: 'black' };
const TO_ENGINE_PIECE: Record<ChessPiece['type'], PieceSymbol> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
};
const FROM_ENGINE_PIECE: Record<PieceSymbol, ChessPiece['type']> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};
const PROMOTION_FROM_ENGINE = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
} as const;

export interface ChessStateOptions {
  mode?: GameMode;
  aiPlayer?: PieceColor;
  isAiThinking?: boolean;
}

export interface BoardFenOptions extends ChessStateOptions {
  castling?: string;
  enPassant?: ChessSquare | null;
  halfmove?: number;
  fullmove?: number;
}

function positionToSquare(position: Position): ChessSquare {
  return positionToAlgebraic(position) as ChessSquare;
}

function squareToPosition(square: string): Position {
  const position = tryAlgebraicToPosition(square);
  if (!position) throw new Error(`Invalid chess square: ${square}`);
  return position;
}

function boardFromEngine(engine: Chess): (ChessPiece | null)[][] {
  return engine.board().map(row =>
    row.map(piece =>
      piece
        ? {
            type: FROM_ENGINE_PIECE[piece.type],
            color: FROM_ENGINE_COLOR[piece.color],
          }
        : null
    )
  );
}

function fenPlacement(board: (ChessPiece | null)[][]): string {
  return board
    .map(row => {
      let empty = 0;
      let rank = '';
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) rank += String(empty);
        empty = 0;
        const symbol = TO_ENGINE_PIECE[piece.type];
        rank += piece.color === 'white' ? symbol.toUpperCase() : symbol;
      }
      return rank + (empty ? String(empty) : '');
    })
    .join('/');
}

function assertBoardContract(board: (ChessPiece | null)[][]): void {
  if (board.length !== 8 || board.some(rank => rank.length !== 8)) {
    throw new Error('Chess board must be exactly 8×8');
  }

  const kingCounts: Record<PieceColor, number> = { white: 0, black: 0 };
  for (const rank of board) {
    for (const piece of rank) {
      if (piece?.type === 'king') kingCounts[piece.color] += 1;
    }
  }
  if (kingCounts.white !== 1 || kingCounts.black !== 1) {
    throw new Error('Chess board must contain exactly one king per side');
  }
}
```

Construct state through one helper, with initial status limited to playing/check/checkmate/stalemate until Task 3 adds draw predicates:

```ts
function stateFromEngine(
  engine: Chess,
  initialFen: string,
  options: ChessStateOptions,
  moveHistory: GameState['moveHistory'] = []
): GameState {
  const status = engine.isCheckmate()
    ? 'checkmate'
    : engine.isStalemate()
      ? 'stalemate'
      : engine.isCheck()
        ? 'check'
        : 'playing';
  return {
    board: boardFromEngine(engine),
    currentPlayer: FROM_ENGINE_COLOR[engine.turn()],
    status,
    moveHistory,
    selectedSquare: null,
    possibleMoves: [],
    mode: options.mode ?? 'human-vs-human',
    aiPlayer: options.aiPlayer,
    isAiThinking: options.isAiThinking ?? false,
    initialFen,
    fen: engine.fen(),
    pendingPromotion: null,
    terminationReason:
      status === 'checkmate'
        ? 'checkmate'
        : status === 'stalemate'
          ? 'stalemate'
          : null,
  };
}

export function createInitialGameState(
  options: ChessStateOptions = {}
): GameState {
  return createGameStateFromFen(DEFAULT_POSITION, options);
}

export function createGameStateFromFen(
  fen: string,
  options: ChessStateOptions = {}
): GameState {
  const engine = new Chess(fen);
  return stateFromEngine(engine, engine.fen(), options);
}

export function createGameStateFromBoard(
  board: (ChessPiece | null)[][],
  sideToMove: PieceColor,
  options: BoardFenOptions = {}
): GameState {
  assertBoardContract(board);
  const fen = [
    fenPlacement(board),
    TO_ENGINE_COLOR[sideToMove],
    options.castling ?? '-',
    options.enPassant ?? '-',
    options.halfmove ?? 0,
    options.fullmove ?? 1,
  ].join(' ');
  return createGameStateFromFen(fen, options);
}

export function isTerminalState(state: GameState): boolean {
  return (
    state.terminationReason !== null ||
    state.status === 'checkmate' ||
    state.status === 'stalemate' ||
    state.status === 'draw'
  );
}
```

Map verbose candidates and attacks without exposing engine types:

```ts
function legalMoveFromEngine(move: EngineMove): LegalChessMove {
  return {
    from: squareToPosition(move.from),
    to: squareToPosition(move.to),
    piece: {
      type: FROM_ENGINE_PIECE[move.piece],
      color: FROM_ENGINE_COLOR[move.color],
    },
    capturedPiece: move.captured
      ? {
          type: FROM_ENGINE_PIECE[move.captured],
          color: FROM_ENGINE_COLOR[move.color === 'w' ? 'b' : 'w'],
        }
      : undefined,
    promotion: move.promotion
      ? PROMOTION_FROM_ENGINE[
          move.promotion as keyof typeof PROMOTION_FROM_ENGINE
        ]
      : undefined,
    isEnPassant: move.isEnPassant(),
    isCastling: move.isKingsideCastle() || move.isQueensideCastle(),
    san: move.san,
    lan: move.lan,
  };
}

export function getLegalMoves(
  state: GameState,
  from?: Position
): LegalChessMove[] {
  const engine = replayEngine(state);
  const moves = from
    ? engine.moves({
        square: positionToSquare(from) as Square,
        verbose: true,
      })
    : engine.moves({ verbose: true });
  return moves.map(legalMoveFromEngine);
}

export function getLegalDestinations(
  state: GameState,
  from: Position
): Position[] {
  const unique = new Map<string, Position>();
  for (const move of getLegalMoves(state, from)) {
    unique.set(`${move.to.row}:${move.to.col}`, move.to);
  }
  return [...unique.values()];
}

export function queryAttacks(
  state: GameState,
  queries: readonly AttackQuery[]
): AttackResult[] {
  const engine = replayEngine(state);
  return queries.map(query => {
    const square = positionToSquare(query.square) as Square;
    const attacker = TO_ENGINE_COLOR[query.attacker];
    return {
      ...query,
      attacked: engine.isAttacked(square, attacker),
      attackers: engine.attackers(square, attacker).map(squareToPosition),
    };
  });
}

export function isSquareAttackedBy(
  state: GameState,
  square: Position,
  attacker: PieceColor
): boolean {
  return queryAttacks(state, [{ square, attacker }])[0]?.attacked ?? false;
}

export function getAttackers(
  state: GameState,
  square: Position,
  attacker: PieceColor
): Position[] {
  return queryAttacks(state, [{ square, attacker }])[0]?.attackers ?? [];
}
```

`queryAttacks` is the adapter-facing bulk path: one call may contain every
attack and defence query needed for a prompt, while the two single-square
helpers remain convenient UI/test wrappers. `replayEngine` initially loads
`initialFen`, replays any existing rich moves, and throws on a cached-FEN
mismatch. Task 2 will add explicit rejection mapping around that failure.

- [ ] **Step 5: Update construction fixtures and the compatibility factory**

Make `game.ts#createInitialGameState(mode, aiPlayer)` delegate without changing its public signature:

```ts
import { createInitialGameState as createRulesInitialGameState } from './rules';

export function createInitialGameState(
  mode: GameMode = 'human-vs-human',
  aiPlayer?: PieceColor
): GameState {
  return createRulesInitialGameState({ mode, aiPlayer });
}
```

In AI tests with literal chess states, replace incomplete literals with either:

```ts
const state = createGameStateFromFen('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1');
```

or a spread from `createInitialGameState()` when a test changes only UI fields:

```ts
const stateWithSelection: GameState = {
  ...createInitialGameState(),
  selectedSquare: { row: 6, col: 4 },
};
```

All four new chess state fields are required. Use this migration matrix rather
than weakening the type:

| Existing test surface                                                                                                                                                      | Migration                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/chess/moves.test.ts`, `moves.extended.test.ts`, `moves.coverage.test.ts`                                                                                              | Delete with `moves.ts` in Task 8; do not retain pseudo-legal expectations.                                                                                                                                                          |
| `lib/chess/game.test.ts`, `game.coverage.test.ts`, `game.extended.test.ts`, `game.functions.test.ts`, `game.simple.test.ts`                                                | Replace with Task 4's FEN-backed orchestration suite, then delete the four superseded files.                                                                                                                                        |
| `lib/chess/board.test.ts`                                                                                                                                                  | Keep raw-board unit coverage unchanged. These tests do not construct playable `GameState` or enter the rules façade, so partial boards remain valid test inputs.                                                                    |
| `lib/ai/base-adapter.coverage.test.ts`                                                                                                                                     | Spread `createInitialGameState()` so required fields exist, then allow its deliberately synthetic board override only inside direct `BaseAdapter` hook tests. Those values must never enter `rules.ts`.                             |
| `lib/ai/base-rule-guardian.coverage.test.ts`                                                                                                                               | Build chess-shaped guardian inputs from `createInitialGameState()` and override UI-only fields only.                                                                                                                                |
| `lib/ai/chess-adapter.test.ts`, `chess-adapter.coverage.test.ts`, `rule-guardian.test.ts`, `rule-guardian.extended.test.ts`, `service.test.ts`, `service.extended.test.ts` | Replace every playable chess literal with `createInitialGameState()` or `createGameStateFromFen(...)`; never override `board`, `fen`, `initialFen`, `currentPlayer`, `moveHistory`, `status`, or `terminationReason` independently. |

The production factories are the shared fixture surface. Do not introduce a
generic test-only factory accepting `Partial<GameState>`, because it would
recreate the inconsistent-state path this façade is designed to reject.

- [ ] **Step 6: Run focused tests and type checking**

Run:

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts src/lib/ai/base-adapter.coverage.test.ts src/lib/ai/base-rule-guardian.coverage.test.ts src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts src/lib/ai/service.test.ts src/lib/ai/service.extended.test.ts
rtk bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the façade foundation**

```bash
rtk git add apps/web/package.json bun.lock apps/web/src/lib/chess/types.ts apps/web/src/lib/chess/rules.ts apps/web/src/lib/chess/rules.test.ts apps/web/src/lib/chess/game.ts apps/web/src/lib/ai
rtk git commit -m "feat(chess): add authoritative rules facade"
```

---

### Task 2: Apply and replay every standard move type atomically

**Files:**

- Modify: `apps/web/src/lib/chess/rules.ts`
- Modify: `apps/web/src/lib/chess/rules.test.ts`

**Interfaces:**

- Consumes: `ChessMoveRequest`, `MoveAttempt`, factories, and the private replay helper from Task 1.
- Produces: `attemptMove(state, request): MoveAttempt`.
- Produces: rich `Move` records with SAN, coordinate LAN, before/after FEN, capture, castling, en-passant, and promotion metadata.

- [ ] **Step 1: Add failing special-move and replay tests**

Add table-driven tests:

```ts
import { attemptMove } from './rules';

test('applies castling atomically for either color and side', () => {
  const white = createGameStateFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const whiteResult = attemptMove(white, { from: 'e1', to: 'g1' });
  expect(whiteResult.kind).toBe('applied');
  if (whiteResult.kind !== 'applied') throw new Error('expected applied');
  expect(whiteResult.move.isCastling).toBe(true);
  expect(whiteResult.move.san).toBe('O-O');
  expect(whiteResult.move.lan).toBe('e1g1');
  expect(whiteResult.state.board[7]?.[6]?.type).toBe('king');
  expect(whiteResult.state.board[7]?.[5]?.type).toBe('rook');

  const whiteQueenside = attemptMove(white, { from: 'e1', to: 'c1' });
  expect(whiteQueenside.kind).toBe('applied');
  if (whiteQueenside.kind !== 'applied') {
    throw new Error('expected applied');
  }
  expect(whiteQueenside.move.san).toBe('O-O-O');
  expect(whiteQueenside.state.board[7]?.[2]?.type).toBe('king');
  expect(whiteQueenside.state.board[7]?.[3]?.type).toBe('rook');

  const black = createGameStateFromFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  const blackResult = attemptMove(black, { from: 'e8', to: 'c8' });
  expect(blackResult.kind).toBe('applied');
  if (blackResult.kind !== 'applied') throw new Error('expected applied');
  expect(blackResult.move.san).toBe('O-O-O');
  expect(blackResult.state.board[0]?.[2]?.type).toBe('king');
  expect(blackResult.state.board[0]?.[3]?.type).toBe('rook');

  const blackKingside = attemptMove(black, { from: 'e8', to: 'g8' });
  expect(blackKingside.kind).toBe('applied');
  if (blackKingside.kind !== 'applied') {
    throw new Error('expected applied');
  }
  expect(blackKingside.move.san).toBe('O-O');
  expect(blackKingside.state.board[0]?.[6]?.type).toBe('king');
  expect(blackKingside.state.board[0]?.[5]?.type).toBe('rook');
});

test('applies en passant and removes the captured pawn', () => {
  const state = createGameStateFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const result = attemptMove(state, { from: 'e5', to: 'd6' });
  expect(result.kind).toBe('applied');
  if (result.kind !== 'applied') throw new Error('expected applied');
  expect(result.move.isEnPassant).toBe(true);
  expect(result.move.capturedPiece).toEqual({
    type: 'pawn',
    color: 'black',
  });
  expect(result.move.lan).toBe('e5d6');
  expect(result.state.board[3]?.[3]).toBeNull();
  expect(result.state.board[2]?.[3]?.type).toBe('pawn');
});

test('requires an explicit promotion and applies all four choices', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const pending = attemptMove(state, { from: 'a7', to: 'a8' });
  expect(pending).toMatchObject({
    kind: 'promotion-required',
    choices: ['queen', 'rook', 'bishop', 'knight'],
  });

  for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const) {
    const result = attemptMove(state, { from: 'a7', to: 'a8', promotion });
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('expected applied');
    expect(result.state.board[0]?.[0]?.type).toBe(promotion);
    expect(result.move.promotion).toBe(promotion);
    expect(result.move.lan).toBe(
      `a7a8${{ queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[promotion]}`
    );
  }
});

test('rejects moves that expose the moving king', () => {
  const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
  expect(attemptMove(state, { from: 'e2', to: 'd2' })).toEqual({
    kind: 'rejected',
    reason: 'illegal-move',
  });
});
```

Cover castling rejection, en-passant expiry, capture promotion, invalid
promotion, and replay mismatch with these tests:

```ts
test('rejects every castling disqualifier', () => {
  const blocked = createGameStateFromFen(
    'r3k2r/8/8/8/8/8/8/R3KN1R w KQkq - 0 1'
  );
  expect(attemptMove(blocked, { from: 'e1', to: 'g1' })).toMatchObject({
    kind: 'rejected',
  });

  const checked = createGameStateFromFen('4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  expect(attemptMove(checked, { from: 'e1', to: 'g1' })).toMatchObject({
    kind: 'rejected',
  });

  const crossesAttack = createGameStateFromFen(
    'k4r2/8/8/8/8/8/8/4K2R w K - 0 1'
  );
  expect(attemptMove(crossesAttack, { from: 'e1', to: 'g1' })).toMatchObject({
    kind: 'rejected',
  });

  const rightsLost = createGameStateFromFen('4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
  expect(attemptMove(rightsLost, { from: 'e1', to: 'g1' })).toMatchObject({
    kind: 'rejected',
  });
});

test('en passant expires and cannot expose the moving king', () => {
  let expired = createGameStateFromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  for (const request of [
    { from: 'd7', to: 'd5' },
    { from: 'e1', to: 'e2' },
    { from: 'e8', to: 'e7' },
  ] as const) {
    const result = attemptMove(expired, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    expired = result.state;
  }
  expect(attemptMove(expired, { from: 'e5', to: 'd6' })).toMatchObject({
    kind: 'rejected',
  });

  const exposesKing = createGameStateFromFen(
    '4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
  );
  expect(attemptMove(exposesKing, { from: 'e5', to: 'd6' })).toMatchObject({
    kind: 'rejected',
  });
});

test('records capture promotion and rejects invalid promotion/state data', () => {
  const capture = createGameStateFromFen('r6k/1P6/8/8/8/8/8/7K w - - 0 1');
  const promoted = attemptMove(capture, {
    from: 'b7',
    to: 'a8',
    promotion: 'rook',
  });
  expect(promoted.kind).toBe('applied');
  if (promoted.kind !== 'applied') throw new Error('expected applied');
  expect(promoted.move.capturedPiece?.type).toBe('rook');
  expect(promoted.move.promotion).toBe('rook');

  expect(
    attemptMove(capture, {
      from: 'b7',
      to: 'a8',
      promotion: 'king' as PromotionPiece,
    })
  ).toEqual({ kind: 'rejected', reason: 'invalid-promotion' });

  expect(
    attemptMove(
      { ...capture, fen: capture.fen.replace(' w ', ' b ') },
      { from: 'b7', to: 'a8', promotion: 'queen' }
    )
  ).toEqual({ kind: 'rejected', reason: 'state-inconsistent' });
});
```

- [ ] **Step 2: Run the focused test and verify `attemptMove` is missing**

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts
```

Expected: FAIL because `attemptMove` is not exported.

- [ ] **Step 3: Implement one-reconstruction move selection and promotion detection**

Use the replayed engine once, filter verbose candidates by coordinate and promotion, and distinguish missing promotion from illegality:

```ts
const TO_ENGINE_PROMOTION = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
} as const;

export function attemptMove(
  state: GameState,
  request: ChessMoveRequest
): MoveAttempt {
  if (isTerminalState(state)) {
    return { kind: 'rejected', reason: 'terminal' };
  }

  let engine: Chess;
  try {
    engine = replayEngine(state);
  } catch {
    return { kind: 'rejected', reason: 'state-inconsistent' };
  }

  const from = tryAlgebraicToPosition(request.from);
  const to = tryAlgebraicToPosition(request.to);
  if (!from || !to) {
    return { kind: 'rejected', reason: 'invalid-coordinate' };
  }
  const piece = engine.get(request.from as Square);
  if (!piece || FROM_ENGINE_COLOR[piece.color] !== state.currentPlayer) {
    return { kind: 'rejected', reason: 'wrong-side' };
  }

  const candidates = engine
    .moves({ square: request.from as Square, verbose: true })
    .filter(move => move.to === request.to);
  const promotionCandidates = candidates.filter(move => move.isPromotion());
  if (!request.promotion && promotionCandidates.length > 0) {
    return {
      kind: 'promotion-required',
      from,
      to,
      color: state.currentPlayer,
      choices: ['queen', 'rook', 'bishop', 'knight'],
    };
  }

  const enginePromotion = request.promotion
    ? TO_ENGINE_PROMOTION[request.promotion]
    : undefined;
  const candidate = candidates.find(
    move => (move.promotion ?? undefined) === enginePromotion
  );
  if (!candidate) {
    return {
      kind: 'rejected',
      reason: request.promotion ? 'invalid-promotion' : 'illegal-move',
    };
  }

  const applied = engine.move({
    from: request.from,
    to: request.to,
    promotion: enginePromotion,
  });
  const move = moveRecordFromEngine(applied);
  const nextState = stateFromEngine(
    engine,
    state.initialFen,
    {
      mode: state.mode,
      aiPlayer: state.aiPlayer,
      isAiThinking: state.isAiThinking,
    },
    [...state.moveHistory, move]
  );
  return { kind: 'applied', state: nextState, move };
}
```

- [ ] **Step 4: Implement exact replay and rich move mapping**

Replay every stored move using its coordinate request and promotion, then verify the cached FEN:

```ts
function replayEngine(state: GameState): Chess {
  const engine = new Chess(state.initialFen);
  for (const move of state.moveHistory) {
    engine.move({
      from: positionToSquare(move.from),
      to: positionToSquare(move.to),
      promotion: move.promotion
        ? TO_ENGINE_PROMOTION[move.promotion]
        : undefined,
    });
  }
  if (engine.fen() !== state.fen) {
    throw new Error('Chess state FEN does not match replay history');
  }
  return engine;
}

function moveRecordFromEngine(move: EngineMove): Move {
  const mapped = legalMoveFromEngine(move);
  return {
    from: mapped.from,
    to: mapped.to,
    piece: mapped.piece,
    capturedPiece: mapped.capturedPiece,
    promotion: mapped.promotion,
    isEnPassant: mapped.isEnPassant,
    isCastling: mapped.isCastling,
    san: mapped.san,
    lan: mapped.lan,
    beforeFen: move.before,
    afterFen: move.after,
  };
}
```

- [ ] **Step 5: Run the special-move matrix**

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit atomic move application**

```bash
rtk git add apps/web/src/lib/chess/rules.ts apps/web/src/lib/chess/rules.test.ts
rtk git commit -m "feat(chess): apply complete standard move types"
```

---

### Task 3: Add exact adjudication and terminal-state invariants

**Files:**

- Modify: `apps/web/src/lib/chess/rules.ts`
- Modify: `apps/web/src/lib/chess/rules.test.ts`

**Interfaces:**

- Consumes: the same engine instance used by factories and `attemptMove`.
- Produces: exact `status` plus `terminationReason` for checkmate, stalemate, insufficient material, threefold repetition, fifty-move rule, check, and playing.
- Produces: terminal rejection from every façade move attempt.

- [ ] **Step 1: Add failing terminal and draw tests**

```ts
test('distinguishes checkmate and stalemate at factory time', () => {
  const mate = createGameStateFromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  expect(mate.status).toBe('checkmate');
  expect(mate.terminationReason).toBe('checkmate');

  const stalemate = createGameStateFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  expect(stalemate.status).toBe('stalemate');
  expect(stalemate.terminationReason).toBe('stalemate');
});

test('automatically adjudicates threefold despite changing halfmove clocks', () => {
  let state = createInitialGameState();
  for (const request of [
    { from: 'g1', to: 'f3' },
    { from: 'g8', to: 'f6' },
    { from: 'f3', to: 'g1' },
    { from: 'f6', to: 'g8' },
    { from: 'g1', to: 'f3' },
    { from: 'g8', to: 'f6' },
    { from: 'f3', to: 'g1' },
    { from: 'f6', to: 'g8' },
  ] as const) {
    const result = attemptMove(state, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    state = result.state;
  }
  expect(state.status).toBe('draw');
  expect(state.terminationReason).toBe('threefold-repetition');
});

test('mid-game FEN starts repetition history at its current position', () => {
  let state = createGameStateFromFen('6nk/8/8/8/8/8/8/KN6 w - - 17 42');
  expect(state.initialFen).toBe(state.fen);
  expect(state.moveHistory).toEqual([]);

  const cycle = [
    { from: 'b1', to: 'c3' },
    { from: 'g8', to: 'f6' },
    { from: 'c3', to: 'b1' },
    { from: 'f6', to: 'g8' },
  ] as const;

  for (const request of cycle) {
    const result = attemptMove(state, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    state = result.state;
  }
  expect(state.terminationReason).toBeNull();

  for (const request of cycle) {
    const result = attemptMove(state, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    state = result.state;
  }
  expect(state.terminationReason).toBe('threefold-repetition');
});

test('castling and effective en-passant rights prevent premature repetition', () => {
  let castling = createGameStateFromFen('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
  for (const request of [
    { from: 'e1', to: 'f1' },
    { from: 'e8', to: 'f8' },
    { from: 'f1', to: 'e1' },
    { from: 'f8', to: 'e8' },
    { from: 'e1', to: 'f1' },
    { from: 'e8', to: 'f8' },
    { from: 'f1', to: 'e1' },
    { from: 'f8', to: 'e8' },
  ] as const) {
    const result = attemptMove(castling, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    castling = result.state;
  }
  expect(castling.terminationReason).toBeNull();

  let enPassant = createGameStateFromFen('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1');
  for (const request of [
    { from: 'a1', to: 'a2' },
    { from: 'h8', to: 'h7' },
    { from: 'a2', to: 'a1' },
    { from: 'h7', to: 'h8' },
    { from: 'a1', to: 'a2' },
    { from: 'h8', to: 'h7' },
    { from: 'a2', to: 'a1' },
    { from: 'h7', to: 'h8' },
  ] as const) {
    const result = attemptMove(enPassant, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    enPassant = result.state;
  }
  expect(enPassant.terminationReason).toBeNull();

  let ineffectiveEnPassant = createGameStateFromFen(
    '7k/8/8/3p4/8/8/8/K7 w - d6 0 1'
  );
  expect(ineffectiveEnPassant.fen.split(' ')[3]).toBe('-');
  for (const request of [
    { from: 'a1', to: 'a2' },
    { from: 'h8', to: 'h7' },
    { from: 'a2', to: 'a1' },
    { from: 'h7', to: 'h8' },
    { from: 'a1', to: 'a2' },
    { from: 'h8', to: 'h7' },
    { from: 'a2', to: 'a1' },
    { from: 'h7', to: 'h8' },
  ] as const) {
    const result = attemptMove(ineffectiveEnPassant, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    ineffectiveEnPassant = result.state;
  }
  expect(ineffectiveEnPassant.terminationReason).toBe('threefold-repetition');
});

test('the fifty-move clock draws at 100 and a pawn move resets it', () => {
  const nearDraw = createGameStateFromFen('7k/8/8/8/8/8/P7/K6R w - - 99 50');
  const pawn = attemptMove(nearDraw, { from: 'a2', to: 'a3' });
  expect(pawn.kind).toBe('applied');
  if (pawn.kind !== 'applied') throw new Error('expected applied');
  expect(pawn.state.fen.split(' ')[4]).toBe('0');
  expect(pawn.state.terminationReason).toBeNull();

  const qualifying = createGameStateFromFen('7k/8/8/8/8/8/8/K6R w - - 99 50');
  const rook = attemptMove(qualifying, { from: 'h1', to: 'h2' });
  expect(rook.kind).toBe('applied');
  if (rook.kind !== 'applied') throw new Error('expected applied');
  expect(rook.state.terminationReason).toBe('fifty-move');
});
```

Add the insufficient-material matrix and a completed-game guard:

```ts
test('uses the chess.js insufficient-material definition', () => {
  for (const fen of [
    '7k/8/8/8/8/8/8/7K w - - 0 1',
    '7k/8/8/8/8/8/8/K1B5 w - - 0 1',
    '7k/8/8/8/8/8/8/KN6 w - - 0 1',
    '7k/8/8/8/5b2/8/8/K1B5 w - - 0 1',
  ]) {
    const state = createGameStateFromFen(fen);
    expect(state.status).toBe('draw');
    expect(state.terminationReason).toBe('insufficient-material');
  }

  const twoKnights = createGameStateFromFen('7k/8/8/8/8/8/8/KNN5 w - - 0 1');
  expect(twoKnights.terminationReason).toBeNull();
});

test('finishes a legal game and rejects all later moves', () => {
  let state = createInitialGameState();
  for (const request of [
    { from: 'f2', to: 'f3' },
    { from: 'e7', to: 'e5' },
    { from: 'g2', to: 'g4' },
    { from: 'd8', to: 'h4' },
  ] as const) {
    const result = attemptMove(state, request);
    if (result.kind !== 'applied') throw new Error('expected applied');
    state = result.state;
  }

  expect(state.status).toBe('checkmate');
  expect(state.terminationReason).toBe('checkmate');
  expect(isTerminalState(state)).toBe(true);
  expect(attemptMove(state, { from: 'e1', to: 'f2' })).toEqual({
    kind: 'rejected',
    reason: 'terminal',
  });
});
```

- [ ] **Step 2: Run the focused suite and verify draw expectations fail**

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts
```

Expected: FAIL because draw predicates and reasons are not yet mapped.

- [ ] **Step 3: Implement ordered status derivation**

Replace the temporary status logic with:

```ts
function deriveStatus(engine: Chess): {
  status: GameState['status'];
  terminationReason: GameState['terminationReason'];
} {
  if (engine.isCheckmate()) {
    return { status: 'checkmate', terminationReason: 'checkmate' };
  }
  if (engine.isStalemate()) {
    return { status: 'stalemate', terminationReason: 'stalemate' };
  }
  if (engine.isInsufficientMaterial()) {
    return { status: 'draw', terminationReason: 'insufficient-material' };
  }
  if (engine.isThreefoldRepetition()) {
    return { status: 'draw', terminationReason: 'threefold-repetition' };
  }
  if (engine.isDrawByFiftyMoves()) {
    return { status: 'draw', terminationReason: 'fifty-move' };
  }
  if (engine.isCheck()) {
    return { status: 'check', terminationReason: null };
  }
  return { status: 'playing', terminationReason: null };
}
```

Call `deriveStatus(engine)` inside `stateFromEngine` so factories and completed
moves share the exact order. Keep the exported `isTerminalState` from Task 1 as
the only domain terminal predicate; its status/reason checks already cover the
new draw reasons.

- [ ] **Step 4: Run authoritative rules tests**

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit adjudication**

```bash
rtk git add apps/web/src/lib/chess/rules.ts apps/web/src/lib/chess/rules.test.ts
rtk git commit -m "feat(chess): adjudicate standard terminal results"
```

---

### Task 4: Replace game orchestration with the shared move-attempt pipeline

**Files:**

- Modify: `apps/web/src/lib/chess/game.ts:1-223`
- Replace: `apps/web/src/lib/chess/game.test.ts`
- Delete after coverage is consolidated: `apps/web/src/lib/chess/game.coverage.test.ts`, `game.extended.test.ts`, `game.functions.test.ts`, `game.simple.test.ts`

**Interfaces:**

- Consumes: `attemptMove`, `getLegalDestinations`, `isTerminalState`, and factory functions.
- Produces: compatible `createInitialGameState(mode, aiPlayer)`.
- Produces: `makeMove(state, from, to, promotion?)`, `confirmPromotion(state, promotion)`, `cancelPromotion(state)`, `makeAIMove(state, from, to, promotion?)`.
- Preserves: `selectSquare`, `setAIThinking`, `isAITurn`, and `getGameStatus`.
- Removes: exported raw-board `isKingInCheck(board, color)`; callers use authoritative legal moves, status, or attack queries instead.

- [ ] **Step 1: Replace legacy game tests with orchestration tests**

```ts
import { describe, expect, test } from 'bun:test';
import {
  cancelPromotion,
  confirmPromotion,
  createInitialGameState,
  isAITurn,
  makeAIMove,
  makeMove,
  selectSquare,
} from './game';
import { createGameStateFromFen, isTerminalState } from './rules';

test('selection exposes only legal destinations for a pinned rook', () => {
  const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
  const selected = selectSquare(state, { row: 6, col: 4 });
  expect(selected.possibleMoves).not.toContainEqual({ row: 6, col: 3 });
});

test('selection switches to another own piece and clears on an empty square', () => {
  const initial = createInitialGameState();
  const selected = selectSquare(initial, { row: 6, col: 4 });
  expect(selected.selectedSquare).toEqual({ row: 6, col: 4 });

  const reselected = selectSquare(selected, { row: 6, col: 3 });
  expect(reselected.selectedSquare).toEqual({ row: 6, col: 3 });
  expect(reselected.possibleMoves).toHaveLength(2);
  expect(reselected.possibleMoves).toEqual(
    expect.arrayContaining([
      { row: 5, col: 3 },
      { row: 4, col: 3 },
    ])
  );

  const cleared = selectSquare(reselected, { row: 3, col: 3 });
  expect(cleared.selectedSquare).toBeNull();
  expect(cleared.possibleMoves).toEqual([]);
});

test('human promotion waits without changing board or turn', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const pending = makeMove(state, { row: 1, col: 0 }, { row: 0, col: 0 });
  expect(pending?.fen).toBe(state.fen);
  expect(pending?.currentPlayer).toBe('white');
  expect(pending?.pendingPromotion?.choices).toEqual([
    'queen',
    'rook',
    'bishop',
    'knight',
  ]);

  const applied = confirmPromotion(pending!, 'knight');
  expect(applied?.board[0]?.[0]?.type).toBe('knight');
  expect(applied?.currentPlayer).toBe('black');
});

test('cancelling promotion clears every selection field', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const pending = makeMove(state, { row: 1, col: 0 }, { row: 0, col: 0 })!;
  const cancelled = cancelPromotion(pending);
  expect(cancelled.pendingPromotion).toBeNull();
  expect(cancelled.selectedSquare).toBeNull();
  expect(cancelled.possibleMoves).toEqual([]);
  expect(cancelled.fen).toBe(state.fen);
});

test('rival moves require promotion and share the human result', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  expect(makeAIMove(state, 'a7', 'a8')).toBeNull();
  const rival = makeAIMove(state, 'a7', 'a8', 'rook');
  const human = makeMove(state, { row: 1, col: 0 }, { row: 0, col: 0 }, 'rook');
  expect(rival).toEqual(human);
});
```

Cover rival special moves and terminal-state guards with these tests:

```ts
test('rival castling and en passant use the same atomic rules', () => {
  const castle = createGameStateFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const castled = makeAIMove(castle, 'e1', 'g1');
  expect(castled?.board[7]?.[6]?.type).toBe('king');
  expect(castled?.board[7]?.[5]?.type).toBe('rook');

  const enPassant = createGameStateFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const captured = makeAIMove(enPassant, 'e5', 'd6');
  expect(captured?.board[3]?.[3]).toBeNull();
  expect(captured?.moveHistory.at(-1)?.isEnPassant).toBe(true);
});

test('wrong-side and terminal interactions are inert', () => {
  const initial = createInitialGameState();
  expect(selectSquare(initial, { row: 1, col: 0 })).toEqual(initial);

  const terminal = createGameStateFromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', {
    mode: 'human-vs-ai',
    aiPlayer: 'black',
  });
  expect(selectSquare(terminal, { row: 0, col: 7 })).toEqual(terminal);
  expect(makeMove(terminal, { row: 0, col: 7 }, { row: 1, col: 7 })).toBeNull();
  expect(makeAIMove(terminal, 'h8', 'h7')).toBeNull();
  expect(isTerminalState(terminal)).toBe(true);
  expect(isAITurn(terminal)).toBe(false);
});
```

- [ ] **Step 2: Run the orchestration test and verify pending APIs fail**

```bash
cd apps/web
rtk bun test src/lib/chess/game.test.ts
```

Expected: FAIL because the old orchestrator has no pending-promotion APIs.

- [ ] **Step 3: Rewrite `game.ts` as a thin façade wrapper**

```ts
import { attemptMove, getLegalDestinations, isTerminalState } from './rules';

export function selectSquare(state: GameState, position: Position): GameState {
  if (isTerminalState(state) || state.pendingPromotion) return state;
  const piece = getPieceAt(state.board, position);
  const isSelected =
    state.selectedSquare?.row === position.row &&
    state.selectedSquare.col === position.col;
  if (!piece || piece.color !== state.currentPlayer || isSelected) {
    return { ...state, selectedSquare: null, possibleMoves: [] };
  }
  return {
    ...state,
    selectedSquare: position,
    possibleMoves: getLegalDestinations(state, position),
  };
}

export function makeMove(
  state: GameState,
  from: Position,
  to: Position,
  promotion?: PromotionPiece
): GameState | null {
  const result = attemptMove(state, {
    from: positionToAlgebraic(from) as ChessSquare,
    to: positionToAlgebraic(to) as ChessSquare,
    promotion,
  });
  if (result.kind === 'applied') return result.state;
  if (result.kind === 'promotion-required') {
    return {
      ...state,
      selectedSquare: from,
      possibleMoves: [],
      pendingPromotion: {
        from,
        to,
        color: result.color,
        choices: result.choices,
      },
    };
  }
  return null;
}

export function confirmPromotion(
  state: GameState,
  promotion: PromotionPiece
): GameState | null {
  const pending = state.pendingPromotion;
  if (!pending || !pending.choices.includes(promotion)) return null;
  return makeMove(
    { ...state, pendingPromotion: null },
    pending.from,
    pending.to,
    promotion
  );
}

export function cancelPromotion(state: GameState): GameState {
  return {
    ...state,
    pendingPromotion: null,
    selectedSquare: null,
    possibleMoves: [],
  };
}

export function makeAIMove(
  state: GameState,
  from: string,
  to: string,
  promotion?: PromotionPiece
): GameState | null {
  const fromPosition = tryAlgebraicToPosition(from);
  const toPosition = tryAlgebraicToPosition(to);
  if (!fromPosition || !toPosition) return null;
  const result = attemptMove(state, {
    from: from as ChessSquare,
    to: to as ChessSquare,
    promotion,
  });
  return result.kind === 'applied' ? result.state : null;
}

export function getGameStatus(state: GameState): GameState['status'] {
  return state.status;
}

export function setAIThinking(state: GameState, thinking: boolean): GameState {
  return { ...state, isAiThinking: thinking };
}

export function isAITurn(state: GameState): boolean {
  return (
    !isTerminalState(state) &&
    state.mode === 'human-vs-ai' &&
    state.currentPlayer === state.aiPlayer
  );
}
```

Delete `isKingInCheck` rather than preserving an overload or missing-king
fallback. Its only production consumer outside this file is the chess
adapter's pseudo-legal validation shell, which Task 5 removes. The superseded
raw-board game tests are deleted after their legal-state behaviors are covered
through `rules.test.ts` and the orchestration suite.

- [ ] **Step 4: Remove redundant manual status recomputation from orchestration tests**

Ensure no game test constructs a custom board without a matching FEN. Use `createGameStateFromFen` for authored states and assert that status updates in the same returned state as the move.

- [ ] **Step 5: Run orchestration and authoritative rules tests**

```bash
cd apps/web
rtk bun test src/lib/chess/game.test.ts src/lib/chess/rules.test.ts
rtk bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit orchestration**

```bash
rtk git add apps/web/src/lib/chess/game.ts apps/web/src/lib/chess/game.test.ts apps/web/src/lib/chess/game.coverage.test.ts apps/web/src/lib/chess/game.extended.test.ts apps/web/src/lib/chess/game.functions.test.ts apps/web/src/lib/chess/game.simple.test.ts
rtk git commit -m "refactor(chess): route game flow through rules facade"
```

---

### Task 5: Route LM rival prompting, parsing, threats, and validation through the façade

**Files:**

- Modify: `apps/web/src/lib/ai/types.ts:53-59`
- Modify: `apps/web/src/lib/ai/service.ts:342-390`
- Modify: `apps/web/src/lib/ai/chess-adapter.ts:1-345`
- Modify: `apps/web/src/lib/ai/rule-guardian.ts:1-31`
- Modify: `apps/web/src/lib/ai/chess-adapter.test.ts`
- Modify: `apps/web/src/lib/ai/chess-adapter.coverage.test.ts`
- Modify: `apps/web/src/lib/ai/rule-guardian.test.ts`
- Modify: `apps/web/src/lib/ai/rule-guardian.extended.test.ts`
- Modify: `apps/web/src/lib/ai/service.test.ts`

**Interfaces:**

- Consumes: `getLegalMoves`, `queryAttacks`, `attemptMove`, `ChessMoveRequest`, `PromotionPiece`.
- Produces: `AIMove.promotion?: PromotionPiece`.
- Preserves: Shogi `promote?: boolean` and `pieceType?: string`.

- [ ] **Step 1: Add failing adapter, parser, and guardian tests**

```ts
import { createInitialGameState } from '../chess/game';
import { createGameStateFromFen } from '../chess/rules';

test('lists all legal promotion variants and explains the required field', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const adapter = new ChessAdapter();
  const moves = adapter.getAllValidMoves(state).join('\n');
  const prompt = adapter.generatePrompt(state);

  expect(moves).toContain('a7-a8=Q');
  expect(moves).toContain('a7-a8=R');
  expect(moves).toContain('a7-a8=B');
  expect(moves).toContain('a7-a8=N');
  expect(prompt).toContain(
    'promotion is required when the move ends on rank 8 or rank 1'
  );
  expect(prompt).toContain('omit promotion for every other move');
  expect(prompt).toMatch(/"promotion": "(queen|rook|bishop|knight)"/);

  const normalPrompt = adapter.generatePrompt(createInitialGameState());
  expect(normalPrompt).not.toContain('"promotion":');
});

test('does not offer a pseudo-legal move by a pinned piece', () => {
  const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
  expect(new ChessAdapter().getAllValidMoves(state).join('\n')).not.toContain(
    'e2-d2'
  );
});

test('guardian rejects missing promotion and accepts underpromotion', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const guardian = new ChessRuleGuardian();
  expect(
    guardian.validateAIMove(state, {
      move: { from: 'a7', to: 'a8' },
      confidence: 90,
    })
  ).toMatchObject({ isValid: false });
  expect(
    guardian.validateAIMove(state, {
      move: { from: 'a7', to: 'a8', promotion: 'knight' },
      confidence: 90,
    })
  ).toEqual({ isValid: true });

  expect(
    guardian.validateAIMove(createInitialGameState(), {
      move: { from: 'e2', to: 'e4', promotion: 'queen' },
      confidence: 90,
    })
  ).toMatchObject({ isValid: false });
});
```

Exercise the parser directly through a typed test-only view so the provider is irrelevant:

```ts
test('preserves chess promotion while parsing an AI response', () => {
  const service = createChessAI({
    ...defaultAIConfig,
    enabled: true,
    apiKey: 'test-key',
  });
  const parser = service as unknown as {
    parseAIResponse(response: string): AIResponse | null;
  };
  const parsed = parser.parseAIResponse(
    JSON.stringify({
      move: { from: 'a7', to: 'a8', promotion: 'rook' },
      reasoning: 'Underpromote to avoid stalemate',
      confidence: 88,
    })
  );

  expect(parsed?.move.promotion).toBe('rook');
  expect(parsed?.move.from).toBe('a7');
  expect(parsed?.move.to).toBe('a8');
});
```

- [ ] **Step 2: Run focused AI tests and verify the promotion path fails**

```bash
cd apps/web
rtk bun test src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts src/lib/ai/service.test.ts
```

Expected: FAIL because the shared response and chess adapter omit promotion.

- [ ] **Step 3: Add the shared response field and preserve it while parsing**

```ts
import type { PromotionPiece } from '../chess/types';

export interface AIMove {
  from: string;
  to: string;
  pieceType?: string;
  promote?: boolean;
  promotion?: PromotionPiece;
  reasoning?: string;
}
```

In `UniversalAIService.parseAIResponse`, add:

```ts
promotion: parsed.move.promotion,
```

next to the existing `pieceType` and Shogi `promote` assignments.

- [ ] **Step 4: Replace chess move enumeration and threat scans**

Replace the chess adapter's legacy move imports with:

```ts
import { getLegalMoves, queryAttacks } from '../chess/rules';
import { BOARD_SIZE } from '../chess/types';
import type {
  ChessMoveRequest,
  ChessPiece,
  ChessSquare,
  GameState,
  Move,
  PieceColor,
  Position,
} from '../chess/types';
```

Override `ChessAdapter#getAllValidMoves` so promotion metadata is not lost through the base `(from, to)` callback:

```ts
override getAllValidMoves(gameState: GameState): string[] {
	const suffix = { queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' } as const;
	const rawMoves = getLegalMoves(gameState).map(move => {
		const from = this.positionToAlgebraic(move.from);
		const to = this.positionToAlgebraic(move.to);
		const promotion = move.promotion ? `=${suffix[move.promotion]}` : '';
		return `${from}-${to}${promotion} (${this.getPieceSymbolForMove(move.piece)})`;
	});
	return this.finalizeMoves(rawMoves);
}

protected override forEachOwnPieceMove(
	gameState: GameState,
	cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
): void {
	for (const move of getLegalMoves(gameState)) {
		cb(move.piece, move.from, move.to);
	}
}
```

Keep `forEachOwnPieceMove` only because `BaseAdapter` declares the hook
abstract; `ChessAdapter#getAllValidMoves` is the only runtime enumeration path
for chess. Remove chess overrides and imports for `expandMoveVariants`,
`getPossibleMoves`, `isMoveValid`, manual board simulation, and
`isKingInCheck`; the public override bypasses the base pseudo-legal validation
shell.

Replace the example parser and response-example construction so the canonical
`=Q`, `=R`, `=B`, or `=N` suffix becomes the typed JSON property, while normal
moves omit it:

```ts
private getExampleMoveFromValidMoves(
  validMovesText: string
): ChessMoveRequest {
  const match = validMovesText.match(
    /([a-h][1-8])-([a-h][1-8])(?:=([QRBN]))?/
  );
  if (!match) return { from: 'e2', to: 'e4' };

  const [, from, to, suffix] = match;
  if (!from || !to) return { from: 'e2', to: 'e4' };
  const promotionBySuffix = {
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight',
  } as const;
  const promotion = suffix
    ? promotionBySuffix[suffix as keyof typeof promotionBySuffix]
    : undefined;
  return {
    from: from as ChessSquare,
    to: to as ChessSquare,
    ...(promotion ? { promotion } : {}),
  };
}

const exampleMove = this.getExampleMoveFromValidMoves(validMoves);
const responseExample = JSON.stringify(
  {
    move: exampleMove,
    reasoning: 'Brief tactical/strategic reason',
    confidence: 85,
  },
  null,
  2
);
```

Insert `${responseExample}` under `Respond in JSON:` instead of manually
interpolating only `from` and `to`.

Change `findHangingPieces` to accept `GameState` and resolve all attack and
defence questions through one batched replay:

```ts
private findHangingPieces(
  gameState: GameState
): Array<{ piece: string; square: string }> {
  const color = gameState.currentPlayer;
  const opponent: PieceColor = color === 'white' ? 'black' : 'white';
  const pieces: Array<{ piece: ChessPiece; position: Position }> = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = gameState.board[row]?.[col];
      if (piece?.color === color) {
        pieces.push({ piece, position: { row, col } });
      }
    }
  }

  const results = queryAttacks(gameState, [
    ...pieces.map(({ position }) => ({
      square: position,
      attacker: opponent,
    })),
    ...pieces.map(({ position }) => ({
      square: position,
      attacker: color,
    })),
  ]);
  const count = pieces.length;

  return pieces.flatMap(({ piece, position }, index) => {
    const attacked = results[index]?.attacked ?? false;
    const defended = results[index + count]?.attacked ?? false;
    if (!attacked || defended) return [];
    return [{
      piece: piece.type,
      square: this.positionToAlgebraic(position),
    }];
  });
}
```

Call it as `this.findHangingPieces(gameState)`. This preserves pinned
attacker/defender semantics while reducing prompt threat analysis from up to two
replays per own piece to one replay total.

- [ ] **Step 5: Implement chess-specific guardian validation**

```ts
export class ChessRuleGuardian extends BaseRuleGuardian<ChessGameState> {
  gameVariant = 'chess' as const;

  protected override validateVariantRules(
    gameState: ChessGameState,
    _piece: NonNullable<ChessGameState['board'][number][number]>,
    _parsed: { fromPos: GamePosition; toPos: GamePosition },
    aiResponse: AIResponse
  ): MoveValidationResult {
    const result = attemptMove(gameState, {
      from: aiResponse.move.from as ChessSquare,
      to: aiResponse.move.to as ChessSquare,
      promotion: aiResponse.move.promotion,
    });
    if (result.kind === 'applied') return { isValid: true };
    if (result.kind === 'promotion-required') {
      return {
        isValid: false,
        reason: 'Chess promotion moves must include promotion',
      };
    }
    return { isValid: false, reason: `Illegal chess move: ${result.reason}` };
  }
}
```

- [ ] **Step 6: Run AI tests and type checking**

```bash
cd apps/web
rtk bun test src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts src/lib/ai/service.test.ts
rtk bun run typecheck
```

Expected: PASS, including all non-chess guardian tests.

- [ ] **Step 7: Commit rival integration**

```bash
rtk git add apps/web/src/lib/ai
rtk git commit -m "feat(chess): validate complete rival moves"
```

---

### Task 6: Add human promotion UI, exact result copy, and valid-FEN tutorials

**Files:**

- Create: `apps/web/src/components/ChessPromotionDialog.tsx`
- Create: `apps/web/src/components/ChessPromotionDialog.test.tsx`
- Create: `apps/web/src/lib/chess/tutorials.ts`
- Create: `apps/web/src/lib/chess/tutorials.test.ts`
- Modify: `apps/web/src/components/ChessGame.tsx:37-45,178-320,330-430,516-716,719-820`
- Modify: `apps/web/src/components/ChessGame.test.tsx`
- Modify: `apps/web/src/components/game/GameDebugAndModeGuard.test.tsx`

**Interfaces:**

- Consumes: `pendingPromotion`, `confirmPromotion`, `cancelPromotion`, exact `terminationReason`, and rival `promotion`.
- Produces: `ChessPromotionDialog({ color, choices, onChoose, onCancel })`.
- Produces: valid tutorial FEN definitions with both kings and explicit rights.

- [ ] **Step 1: Add failing dialog and tutorial tests**

```tsx
import { expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import type { PromotionPiece } from '../lib/chess/types';
import ChessPromotionDialog from './ChessPromotionDialog';

setupReactDom();

test('offers four labelled choices and supports escape cancellation', () => {
  const choices: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];
  const onChoose = mock(() => {});
  const onCancel = mock(() => {});
  const view = render(
    <ChessPromotionDialog
      color='white'
      choices={choices}
      onChoose={onChoose}
      onCancel={onCancel}
    />
  );

  expect(
    view.getByRole('dialog', { name: 'Choose promotion piece' })
  ).toBeTruthy();
  expect(document.activeElement).toBe(
    view.getByRole('button', { name: 'Promote to queen' })
  );
  fireEvent.click(view.getByRole('button', { name: 'Promote to rook' }));
  expect(onChoose).toHaveBeenCalledWith('rook');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
});
```

In `tutorials.test.ts`, assert every tutorial factory succeeds, contains exactly
two kings, preserves the accepted FEN, and exposes the intended castling and
promotion moves:

```ts
import { describe, expect, test } from 'bun:test';
import { getLegalMoves } from './rules';
import { CHESS_TUTORIALS, createChessTutorialState } from './tutorials';

const EXPECTED_FENS = {
  'basic-movement': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'knight-moves': '7k/8/1p6/8/4N3/8/3p4/7K w - - 0 1',
  'check-demo': '4r2k/8/8/8/8/8/8/R3K3 w - - 0 1',
  castling: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
  'pawn-promotion': '7k/3P4/8/8/8/8/8/4K3 w - - 0 1',
} as const;

describe('chess tutorials', () => {
  for (const demo of CHESS_TUTORIALS) {
    test(`${demo.id} is a valid two-king FEN`, () => {
      const state = createChessTutorialState(demo.id);
      const kings = state.board.flat().filter(piece => piece?.type === 'king');
      expect(kings).toHaveLength(2);
      expect(state.fen).toBe(EXPECTED_FENS[demo.id]);
    });
  }

  test('castling tutorial exposes both legal castles', () => {
    const state = createChessTutorialState('castling');
    const lan = getLegalMoves(state, { row: 7, col: 4 }).map(move => move.lan);
    expect(lan).toContain('e1g1');
    expect(lan).toContain('e1c1');
  });

  test('check tutorial derives check from its authored position', () => {
    const state = createChessTutorialState('check-demo');
    expect(state.status).toBe('check');
    expect(state.currentPlayer).toBe('white');
  });

  test('promotion tutorial exposes all four explicit choices', () => {
    const state = createChessTutorialState('pawn-promotion');
    const promotions = getLegalMoves(state, { row: 1, col: 3 }).map(
      move => move.promotion
    );
    expect(promotions.sort()).toEqual(['bishop', 'knight', 'queen', 'rook']);
  });
});
```

Retain the current titles, descriptions, focus squares, highlight squares, and explanations alongside these FENs.

- [ ] **Step 2: Run the new UI/tutorial tests and verify missing modules**

```bash
cd apps/web
rtk bun test src/components/ChessPromotionDialog.test.tsx src/lib/chess/tutorials.test.ts
```

Expected: FAIL because both modules are new.

- [ ] **Step 3: Implement the accessible promotion dialog**

Use one labelled modal dialog, autofocus its first (queen) choice, and handle
Escape:

```tsx
interface ChessPromotionDialogProps {
  color: PieceColor;
  choices: PromotionPiece[];
  onChoose: (promotion: PromotionPiece) => void;
  onCancel: () => void;
}

export default function ChessPromotionDialog({
  color,
  choices,
  onChoose,
  onCancel,
}: ChessPromotionDialogProps) {
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstChoiceRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const symbols: Record<PieceColor, Record<PromotionPiece, string>> = {
    white: { queen: '♕', rook: '♖', bishop: '♗', knight: '♘' },
    black: { queen: '♛', rook: '♜', bishop: '♝', knight: '♞' },
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50'>
      <div
        tabIndex={-1}
        role='dialog'
        aria-modal='true'
        aria-labelledby='chess-promotion-title'
        className='mx-4 rounded-lg border border-line bg-ink-700 p-6'
      >
        <h3 id='chess-promotion-title'>Choose promotion piece</h3>
        <div className='mt-4 flex gap-3'>
          {choices.map((choice, index) => (
            <button
              key={choice}
              type='button'
              ref={index === 0 ? firstChoiceRef : undefined}
              aria-label={`Promote to ${choice}`}
              onClick={() => onChoose(choice)}
              className='rounded-lg border border-line bg-ink-600 px-4 py-3 text-3xl text-ivory shadow-lg transition-colors hover:border-brass hover:bg-ink-700'
            >
              {symbols[color][choice]}
            </button>
          ))}
        </div>
        <button
          type='button'
          onClick={onCancel}
          className='mt-4 w-full rounded-lg border border-line bg-ink-600 px-4 py-2 text-ivory hover:bg-ink-700'
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Extract and verify tutorial definitions**

Move the current tutorial metadata into `tutorials.ts` with these exact stable
labels and authored positions:

| ID               | Title                     | FEN                                                        |
| ---------------- | ------------------------- | ---------------------------------------------------------- |
| `basic-movement` | `Basic Piece Movement`    | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` |
| `knight-moves`   | `Knight Movement Pattern` | `7k/8/1p6/8/4N3/8/3p4/7K w - - 0 1`                        |
| `check-demo`     | `Check and King Safety`   | `4r2k/8/8/8/8/8/8/R3K3 w - - 0 1`                          |
| `castling`       | `Castling Rules`          | `4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1`                         |
| `pawn-promotion` | `Pawn Promotion`          | `7k/3P4/8/8/8/8/8/4K3 w - - 0 1`                           |

Keep the current description, focus square, highlight squares, and explanation
for each matching ID, then export:

```ts
export type ChessTutorialId =
  | 'basic-movement'
  | 'knight-moves'
  | 'check-demo'
  | 'castling'
  | 'pawn-promotion';

export interface ChessTutorialDemo {
  id: ChessTutorialId;
  title: string;
  description: string;
  fen: string;
  focusSquare?: Position;
  highlightSquares?: Position[];
  explanation: string;
}

export function createChessTutorialState(id: string): GameState {
  const demo =
    CHESS_TUTORIALS.find(item => item.id === id) ?? CHESS_TUTORIALS[0];
  if (!demo) throw new Error('Chess tutorials must not be empty');
  return createGameStateFromFen(demo.fen);
}
```

- [ ] **Step 5: Integrate promotion, terminal copy, tutorials, and rival promotion**

In `ChessGame.tsx`:

- replace manual tutorial boards with `CHESS_TUTORIALS` and `createChessTutorialState`; both entering tutorial mode and changing demos replace the complete state rather than spreading a new board into cached state;
- import and use `isTerminalState` from `../lib/chess/rules`;
- import `positionToAlgebraic` from `../lib/chess/board`;
- import `PieceColor` with the other chess types;
- remove every post-move `{ ...newGameState, status: getGameStatus(newGameState) }`;
- pass `aiResponse.move.promotion` into `makeAIMove`;
- add `handlePromotionChoice` and `handlePromotionCancel`;
- render `ChessPromotionDialog` from `gameState.pendingPromotion`;
- keep DEV-forced results outside `gameState`, and use the effective result only for display, play-history recording, board locking, and the game-ended latch;
- disable `ChessBoard` while promotion is pending, AI is thinking/playing, or the effective game-over predicate is true;
- use `isAITurn(gameState)` plus `!gameOver` in the rival-trigger effect;
- keep debug/export logging after a promotion is completed, not when it becomes pending.

Replace both tutorial state mutation paths with one callback:

```ts
const loadTutorial = useCallback((demoId: string) => {
  const tutorialState = createChessTutorialState(demoId);
  setCurrentDemo(demoId);
  setGameState(tutorialState);
  setForcedOutcome(null);
}, []);

// In toggleToMode:
if (newMode === 'tutorial') {
  loadTutorial(currentDemo);
}

// DemoSelector callback:
const handleDemoChange = loadTutorial;
```

Do not preserve the current `handleDemoChange(prev => ({ ...prev, board }))`
path: that leaves `fen`, `initialFen`, history, turn, and adjudication cached
from the previous position.

Represent debug-only results outside the authoritative state:

```ts
type ForcedChessStatus = Extract<
  GameState['status'],
  'checkmate' | 'stalemate'
>;

type ForcedChessOutcome = {
  status: ForcedChessStatus;
  currentPlayer?: PieceColor;
} | null;

const [forcedOutcome, setForcedOutcome] = useState<ForcedChessOutcome>(null);
const effectiveStatus = forcedOutcome?.status ?? gameState.status;
const effectiveCurrentPlayer =
  forcedOutcome?.currentPlayer ?? gameState.currentPlayer;
const gameOver = forcedOutcome !== null || isTerminalState(gameState);

const getWinnerColor = useCallback(
  () => (effectiveCurrentPlayer === 'white' ? 'black' : 'white'),
  [effectiveCurrentPlayer]
);

const setForcedDebugOutcome = (patch: {
  status: string;
  currentPlayer?: PieceColor;
}) =>
  setForcedOutcome({
    status: patch.status as ForcedChessStatus,
    ...(patch.currentPlayer !== undefined
      ? { currentPlayer: patch.currentPlayer }
      : {}),
  });
```

In the existing `usePlayHistory` call, replace
`gameStatus: gameState.status` with `gameStatus: effectiveStatus` and pass the
`getWinnerColor` callback above. In the existing `useGameDebugOutcomes` call,
replace only `setOutcome` with `setOutcome: setForcedDebugOutcome`; keep its
current invalidation, AI-side, win/draw status, and preparation callbacks.

Use `gameOver` in the game-ended latch, `ChessBoard` lock, debug-button
visibility, and rival effect. Use `effectiveStatus` and
`effectiveCurrentPlayer` for status/result rendering. Call
`setForcedOutcome(null)` from `resetGame`, every real game start, every mode
change, and tutorial loading. Do not change the shared
`useGameDebugOutcomes` contract or other variants.

Use the applied rich move as the source for the existing human debug/export
schema:

```ts
const recordCompletedHumanMove = useCallback(
  (before: GameState, after: GameState) => {
    const move = after.moveHistory.at(-1);
    if (!move || after.moveHistory.length !== before.moveHistory.length + 1) {
      return;
    }
    const from = positionToAlgebraic(move.from);
    const to = positionToAlgebraic(move.to);

    if (isDebugMode && gameMode === 'ai') {
      setAiDebugMoves(prev => [
        ...prev,
        createAIMove(`${from} → ${to}`, false),
      ]);
    }
    gameExporterRef.current?.addMove(
      Math.floor(before.moveHistory.length / 2) + 1,
      before.currentPlayer,
      from,
      to,
      move.piece.type
    );
  },
  [createAIMove, gameMode, isDebugMode]
);
```

Preserve the current click semantics with this exact order in both tutorial and
play modes:

```ts
const selected = gameState.selectedSquare;
if (!selected) {
  setGameState(selectSquare(gameState, position));
  return;
}

const next = makeMove(gameState, selected, position);
if (next) {
  setGameState(next);
  if (next.pendingPromotion) return;
  recordCompletedHumanMove(gameState, next);
  return;
}

// Own piece => switch selection. Illegal empty/opponent square => clear it.
setGameState(selectSquare(gameState, position));
```

Delete the old coordinate reconstruction blocks. In
`handlePromotionChoice`, call `recordCompletedHumanMove(gameState, next)` after
`confirmPromotion` returns an applied state and before returning.
`handlePromotionCancel` calls only `cancelPromotion`.

Use this board lock expression:

```tsx
disabled={
  Boolean(gameState.pendingPromotion) ||
  Boolean(gameState.isAiThinking) ||
  (gameMode === 'ai' && gameState.currentPlayer === aiPlayer) ||
  gameOver
}
```

Use exact result copy:

```ts
const terminalCopy: Record<
  NonNullable<GameState['terminationReason']>,
  string
> = {
  checkmate: 'Checkmate!',
  stalemate: 'Draw by stalemate',
  'threefold-repetition': 'Draw by threefold repetition',
  'fifty-move': 'Draw by the fifty-move rule',
  'insufficient-material': 'Draw by insufficient material',
};

const getStatusText = (): string => {
  if (forcedOutcome?.status === 'checkmate') {
    return 'Checkmate!';
  }
  if (forcedOutcome?.status === 'stalemate') {
    return 'Draw by stalemate';
  }
  if (gameState.terminationReason) {
    return terminalCopy[gameState.terminationReason];
  }
  if (gameState.status === 'check') {
    return `${effectiveCurrentPlayer === 'white' ? 'White' : 'Black'} is in check`;
  }
  return `${effectiveCurrentPlayer === 'white' ? 'White' : 'Black'} to move`;
};
```

- [ ] **Step 6: Add the ChessGame promotion journey**

Add this underpromotion test to `ChessGame.test.tsx`:

```tsx
test('completes an underpromotion from the tutorial only after a choice', async () => {
  const view = render(<ChessGame />);
  fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
  fireEvent.click(view.getByRole('button', { name: 'Pawn Promotion' }));
  fireEvent.click(view.getByRole('button', { name: 'Square 1-3' }));
  fireEvent.click(view.getByRole('button', { name: 'Square 0-3' }));

  expect(
    view.getByRole('dialog', { name: 'Choose promotion piece' })
  ).toBeTruthy();
  expect(view.getByRole('button', { name: 'Square 0-3' }).textContent).toBe('');

  fireEvent.click(view.getByRole('button', { name: 'Promote to knight' }));
  await waitFor(() => {
    expect(view.queryByRole('dialog')).toBeNull();
    expect(
      view.getByRole('button', { name: 'Square 0-3' }).textContent
    ).toContain('♘');
  });
});
```

Add this cancellation case beside it:

```tsx
test('cancels promotion without moving the pawn or retaining selection', () => {
  const view = render(<ChessGame />);
  fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
  fireEvent.click(view.getByRole('button', { name: 'Pawn Promotion' }));
  fireEvent.click(view.getByRole('button', { name: 'Square 1-3' }));
  fireEvent.click(view.getByRole('button', { name: 'Square 0-3' }));

  fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

  expect(view.queryByRole('dialog')).toBeNull();
  expect(
    view.getByRole('button', { name: 'Square 1-3' }).textContent
  ).toContain('♙');
  expect(view.getByRole('button', { name: 'Square 0-3' }).textContent).toBe('');
  expect(
    view.getByRole('button', { name: 'Square 1-3' }).className
  ).not.toContain('ring-brass');
  expect(
    view.getByRole('button', { name: 'Square 0-3' }).hasAttribute('disabled')
  ).toBe(false);
});
```

Add the component-level selection contract:

```tsx
test('switches own-piece selection and clears it after an illegal empty click', () => {
  const view = render(<ChessGame />);
  fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));

  const e2 = view.getByRole('button', { name: 'Square 6-4' });
  const d2 = view.getByRole('button', { name: 'Square 6-3' });
  const d5 = view.getByRole('button', { name: 'Square 3-3' });

  fireEvent.click(e2);
  expect(e2.className).toContain('ring-brass');

  fireEvent.click(d2);
  expect(e2.className).not.toContain('ring-brass');
  expect(d2.className).toContain('ring-brass');

  fireEvent.click(d5);
  expect(d2.className).not.toContain('ring-brass');
});
```

In the existing `ChessGame — DEV debug outcome buttons` describe block in
`GameDebugAndModeGuard.test.tsx`, add:

```tsx
test('forced win locks chess without changing the rendered position', async () => {
  const view = render(<ChessGame />);
  const start = await waitFor(() =>
    view.getByRole('button', { name: /start/i })
  );
  fireEvent.click(start);

  const KE = (window as unknown as { KeyboardEvent: typeof KeyboardEvent })
    .KeyboardEvent;
  act(() => {
    window.dispatchEvent(new KE('keydown', { key: 'd', shiftKey: true }));
  });

  const board = view.getByTestId('chess-board');
  const renderedPosition = board.textContent;
  fireEvent.click(await waitFor(() => view.getByTitle('Debug: Win')));

  await waitFor(() => {
    expect(view.getByRole('button', { name: /Play Again/i })).toBeTruthy();
  });
  expect(board.textContent).toBe(renderedPosition);
  expect(
    view
      .getAllByRole('button', { name: /^Square / })
      .every(square => (square as HTMLButtonElement).disabled)
  ).toBe(true);
});
```

- [ ] **Step 7: Run component and tutorial tests**

```bash
cd apps/web
rtk bun test src/components/ChessPromotionDialog.test.tsx src/components/ChessGame.test.tsx src/components/game/GameDebugAndModeGuard.test.tsx src/lib/chess/tutorials.test.ts
rtk bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the human interaction**

```bash
rtk git add apps/web/src/components/ChessPromotionDialog.tsx apps/web/src/components/ChessPromotionDialog.test.tsx apps/web/src/components/ChessGame.tsx apps/web/src/components/ChessGame.test.tsx apps/web/src/components/game/GameDebugAndModeGuard.test.tsx apps/web/src/lib/chess/tutorials.ts apps/web/src/lib/chess/tutorials.test.ts
rtk git commit -m "feat(chess): add explicit human promotion flow"
```

---

### Task 7: Carry authoritative chess state through puzzle sequences

**Files:**

- Modify: `apps/web/src/lib/puzzle/types.ts:1-47`
- Modify: `apps/web/src/hooks/usePuzzle.ts:1-455`
- Modify: `apps/web/src/hooks/usePuzzle.test.ts`
- Modify: `apps/web/src/components/puzzle/PuzzleSolver.tsx:58-155`

**Interfaces:**

- Consumes: `createGameStateFromBoard`, `selectSquare`, and `attemptMove`.
- Produces: `PuzzleMove.promotion?: PromotionPiece`.
- Changes: `PuzzleState.board/selectedSquare/possibleMoves` become one `PuzzleState.gameState: GameState | null`.
- Defines: `PuzzleData.initialBoard` is runtime API data and must be an 8×8 board with exactly one king per side; invalid data fails the puzzle closed instead of throwing through React.

- [ ] **Step 1: Add failing pure and hook-level puzzle tests**

Add React DOM setup and `renderHook` coverage to `usePuzzle.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import type { PuzzleData } from '../lib/puzzle/types';
import { createGameStateFromFen } from '../lib/chess/rules';
import { applyPuzzleMove, usePuzzle } from './usePuzzle';

setupReactDom();

function boardFromFen(fen: string): PuzzleData['initialBoard'] {
  return createGameStateFromFen(fen).board;
}

function makePuzzle(overrides: Partial<PuzzleData> = {}): PuzzleData {
  return {
    id: 1,
    slug: 'test-puzzle',
    title: 'Test puzzle',
    description: 'Test the authoritative chess state.',
    difficulty: 'beginner',
    playerColor: 'white',
    initialBoard: boardFromFen('7k/8/8/8/8/8/R7/7K w - - 0 1'),
    solution: [{ from: 'a2', to: 'a8' }],
    hint: {
      pieceSquare: { row: 6, col: 0 },
      targetSquare: { row: 0, col: 0 },
    },
    ...overrides,
  };
}

test('keeps one game state across player and opponent solution moves', async () => {
  const puzzle = makePuzzle({
    playerColor: 'white',
    initialBoard: boardFromFen('7k/8/8/8/8/8/R7/7K w - - 0 1'),
    solution: [
      { from: 'a2', to: 'a8' },
      { from: 'h8', to: 'h7' },
    ],
  });
  const { result } = renderHook(() => usePuzzle());
  act(() => result.current.startPuzzle(puzzle));
  act(() => result.current.handleSquareClick({ row: 6, col: 0 }));
  act(() => result.current.handleSquareClick({ row: 0, col: 0 }));
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 700));
  });

  expect(result.current.state.phase).toBe('solved');
  expect(result.current.state.gameState?.moveHistory).toHaveLength(2);
  expect(result.current.state.gameState?.board[0]?.[0]?.type).toBe('rook');
  expect(result.current.state.gameState?.board[1]?.[7]?.type).toBe('king');
});

test('rejects a scripted promotion that omits the piece', () => {
  const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  expect(applyPuzzleMove(state, { from: 'a7', to: 'a8' })).toBeNull();
  expect(
    applyPuzzleMove(state, {
      from: 'a7',
      to: 'a8',
      promotion: 'bishop',
    })?.board[0]?.[0]?.type
  ).toBe('bishop');
});

test('fails closed when API puzzle data omits a king', () => {
  const puzzle = makePuzzle({
    initialBoard: Array.from({ length: 8 }, () => Array<null>(8).fill(null)),
  });
  const { result } = renderHook(() => usePuzzle());

  act(() => result.current.startPuzzle(puzzle));

  expect(result.current.state.phase).toBe('failed');
  expect(result.current.state.gameState).toBeNull();
  expect(result.current.state.showSolution).toBe(true);
});
```

Import `PuzzleData` and `createGameStateFromFen` for those helpers, plus
`applyPuzzleMove` for the direct promotion assertion.

- [ ] **Step 2: Run puzzle tests and confirm the new state contract fails**

```bash
cd apps/web
rtk bun test src/hooks/usePuzzle.test.ts
```

Expected: FAIL because `PuzzleState.gameState`, `PuzzleMove.promotion`, and `applyPuzzleMove` do not exist.

- [ ] **Step 3: Change puzzle types to retain one authoritative state**

```ts
import type {
  ChessSquare,
  GameState,
  Position,
  PromotionPiece,
} from '../chess/types';

export interface PuzzleMove {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: PromotionPiece;
}

export interface PuzzleState {
  phase: PuzzlePhase;
  puzzle: PuzzleData | null;
  gameState: GameState | null;
  solutionStep: number;
  failedAttempts: number;
  showHint: boolean;
  showSolution: boolean;
}
```

Retain `PuzzleData.initialBoard`, but document its runtime boundary on the
property itself:

```ts
/** API contract: 8×8 board with exactly one white king and one black king. */
initialBoard: (ChessPiece | null)[][];
```

The TypeScript shape cannot enforce king counts, so `startPuzzle` still
validates by constructing the authoritative state.

- [ ] **Step 4: Replace board reconstruction with state-preserving puzzle moves**

Export a small pure helper for direct coverage:

```ts
export function applyPuzzleMove(
  gameState: GameState,
  move: PuzzleMove
): GameState | null {
  const result = attemptMove(gameState, {
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  });
  return result.kind === 'applied' ? result.state : null;
}
```

Replace the hook's initial state and `wrongMoveState` with:

```ts
const [state, setState] = useState<PuzzleState>({
  phase: 'idle',
  puzzle: null,
  gameState: null,
  solutionStep: 0,
  failedAttempts: 0,
  showHint: false,
  showSolution: false,
});

function wrongMoveState(prev: PuzzleState): PuzzleState {
  const failedAttempts = prev.failedAttempts + 1;
  return {
    ...prev,
    failedAttempts,
    showSolution: failedAttempts >= MAX_FAILED_ATTEMPTS,
    phase: failedAttempts >= MAX_FAILED_ATTEMPTS ? 'failed' : 'playing',
  };
}
```

Replace `startPuzzle` and `tryAgain` with:

```ts
const tryCreatePuzzleState = (puzzle: PuzzleData): GameState | null => {
  try {
    return createGameStateFromBoard(puzzle.initialBoard, puzzle.playerColor);
  } catch {
    return null;
  }
};

const startPuzzle = useCallback((puzzle: PuzzleData) => {
  const gameState = tryCreatePuzzleState(puzzle);
  setState({
    phase: gameState ? 'playing' : 'failed',
    puzzle,
    gameState,
    solutionStep: 0,
    failedAttempts: 0,
    showHint: false,
    showSolution: !gameState,
  });
}, []);

const tryAgain = useCallback(() => {
  setState(prev => {
    if (!prev.puzzle) return prev;
    const gameState = tryCreatePuzzleState(prev.puzzle);
    return {
      ...prev,
      phase: gameState ? 'playing' : 'failed',
      gameState,
      solutionStep: 0,
      failedAttempts: 0,
      showHint: false,
      showSolution: !gameState,
    };
  });
}, []);
```

Replace `handleSquareClick` with a reducer over the retained game state:

```ts
const clearGameSelection = (gameState: GameState): GameState => ({
  ...gameState,
  selectedSquare: null,
  possibleMoves: [],
  pendingPromotion: null,
});

const handleSquareClick = useCallback((position: Position) => {
  setState(prev => {
    const gameState = prev.gameState;
    const puzzle = prev.puzzle;
    if (prev.phase !== 'playing' || !puzzle || !gameState) return prev;

    const selected = gameState.selectedSquare;
    const clicked = gameState.board[position.row]?.[position.col] ?? null;
    if (!selected || (clicked && clicked.color === gameState.currentPlayer)) {
      return { ...prev, gameState: selectSquare(gameState, position) };
    }

    const isLegalDestination = gameState.possibleMoves.some(
      move => move.row === position.row && move.col === position.col
    );
    if (!isLegalDestination) {
      return { ...prev, gameState: clearGameSelection(gameState) };
    }

    const expected = puzzle.solution[prev.solutionStep];
    const from = positionToAlgebraic(selected);
    const to = positionToAlgebraic(position);
    if (!expected || expected.from !== from || expected.to !== to) {
      return wrongMoveState({
        ...prev,
        gameState: clearGameSelection(gameState),
      });
    }

    const nextGameState = applyPuzzleMove(gameState, expected);
    if (!nextGameState || nextGameState.pendingPromotion) {
      return {
        ...prev,
        phase: 'failed',
        showSolution: true,
        gameState: clearGameSelection(gameState),
      };
    }

    const nextStep = prev.solutionStep + 1;
    const solved = nextStep >= puzzle.solution.length;
    return {
      ...prev,
      phase: solved ? 'solved' : nextStep % 2 === 1 ? 'opponent' : 'playing',
      gameState: nextGameState,
      solutionStep: nextStep,
    };
  });
}, []);
```

Have the delayed opponent use the same exact helper:

```ts
const applyOpponentMove = useCallback(
  (puzzle: PuzzleData, gameState: GameState, step: number) => {
    const scripted = puzzle.solution[step];
    const next = scripted ? applyPuzzleMove(gameState, scripted) : null;
    if (!next || next.pendingPromotion) {
      setState(prev => ({
        ...prev,
        phase: 'failed',
        showSolution: true,
        gameState: clearGameSelection(gameState),
      }));
      return;
    }
    setState(prev => {
      const nextStep = prev.solutionStep + 1;
      return {
        ...prev,
        phase: nextStep >= puzzle.solution.length ? 'solved' : 'playing',
        gameState: next,
        solutionStep: nextStep,
      };
    });
  },
  []
);
```

Drive the opponent timer from the retained state:

```ts
useEffect(() => {
  if (state.phase !== 'opponent' || !state.puzzle || !state.gameState) {
    return;
  }
  const puzzle = state.puzzle;
  const gameState = state.gameState;
  const solutionStep = state.solutionStep;

  const timer = setTimeout(() => {
    applyOpponentMove(puzzle, gameState, solutionStep);
  }, OPPONENT_MOVE_DELAY_MS);

  return () => clearTimeout(timer);
}, [
  state.phase,
  state.puzzle,
  state.gameState,
  state.solutionStep,
  applyOpponentMove,
]);
```

- [ ] **Step 5: Render directly from `PuzzleState.gameState`**

In `PuzzleSolver.tsx`, use:

```ts
const EMPTY_CHESS_BOARD: GameState['board'] = Array.from({ length: 8 }, () =>
  Array<ChessPiece | null>(8).fill(null)
);

const gameState = state.gameState;
const board = gameState?.board ?? EMPTY_CHESS_BOARD;
const selectedSquare = gameState?.selectedSquare ?? null;
const possibleMoves = gameState?.possibleMoves ?? [];
```

Keep `EMPTY_CHESS_BOARD` at module scope for the short idle render; do not
create a fake rules state without kings.

- [ ] **Step 6: Run puzzle and chess-domain tests**

```bash
cd apps/web
rtk bun test src/hooks/usePuzzle.test.ts src/lib/chess/game.test.ts src/lib/chess/rules.test.ts
rtk bun run typecheck
```

Expected: PASS. Existing seeded puzzle data needs no edits because none of its ten moves promotes.

- [ ] **Step 7: Commit puzzle migration**

```bash
rtk git add apps/web/src/lib/puzzle/types.ts apps/web/src/hooks/usePuzzle.ts apps/web/src/hooks/usePuzzle.test.ts apps/web/src/components/puzzle/PuzzleSolver.tsx
rtk git commit -m "refactor(puzzles): preserve authoritative chess state"
```

---

### Task 8: Remove the duplicate pseudo-legal engine and run whole-feature verification

**Files:**

- Delete: `apps/web/src/lib/chess/moves.ts`
- Delete: `apps/web/src/lib/chess/moves.test.ts`
- Delete: `apps/web/src/lib/chess/moves.extended.test.ts`
- Delete: `apps/web/src/lib/chess/moves.coverage.test.ts`
- Modify only if the import audit finds a stale production consumer: the importing file, replacing it with the already-defined façade call.

**Interfaces:**

- Consumes: all migrated callers from Tasks 4, 5, and 7.
- Produces: one and only one playable chess legality implementation.

- [ ] **Step 1: Prove no production consumer still imports the legacy generator**

Run:

```bash
rtk rg -n "from ['\"].*/chess/moves|from ['\"]\\./moves|getPossibleMoves|isMoveValid" apps/web/src --glob '!lib/chess/moves*.test.ts' --glob '!lib/chess/moves.ts'
```

Expected: no chess production matches. Matches belonging to Xiangqi, Shogi, or Jungle are out of scope and remain.

- [ ] **Step 2: Delete the unused chess generator and obsolete tests**

Delete exactly the four files listed above with `apply_patch`. Do not change `@procyon/game-core` or the other variants.

- [ ] **Step 3: Run the complete focused feature matrix**

```bash
cd apps/web
rtk bun test src/lib/chess/rules.test.ts src/lib/chess/game.test.ts src/lib/chess/tutorials.test.ts src/lib/ai/base-adapter.coverage.test.ts src/lib/ai/base-rule-guardian.coverage.test.ts src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts src/lib/ai/service.test.ts src/lib/ai/service.extended.test.ts src/components/ChessPromotionDialog.test.tsx src/components/ChessGame.test.tsx src/components/game/GameDebugAndModeGuard.test.tsx src/hooks/usePuzzle.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run all web tests and static verification**

```bash
cd apps/web
rtk bun test src
rtk bun run typecheck
rtk bun run lint
rtk bun run build
cd ../..
rtk git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Review the final diff against HPA-160**

Confirm from the diff and tests:

- both castling sides work for both colors and all disqualifiers are covered;
- en passant applies, expires, and respects king safety;
- human promotion blocks until Q/R/B/N choice and cancellation changes no position;
- LM rival castling, en passant, queen promotion, and underpromotion use the same move attempt;
- one rival prompt performs one whole-side legal replay and one batched attack replay, never one replay per piece;
- promotion-only prompts include a typed `promotion` example and normal prompts omit that JSON field;
- every displayed destination is legal;
- checkmate, stalemate, threefold, fifty-move, and insufficient-material reasons are exact;
- terminal states reject selection and moves;
- the check tutorial derives `check`, the castling tutorial exposes both rights, and every tutorial contains both kings;
- puzzles retain one full state, reject scripted promotion without a piece, and fail closed for invalid API boards;
- every surviving chess `GameState` fixture uses a production factory, while obsolete game/move suites are explicitly consolidated or deleted;
- invalid authored FEN throws while accepted FEN is not described as proof of legal reachability, and runtime move rejection leaves state untouched;
- every chess entry point and board lock uses `isTerminalState`;
- DEV forced outcomes never patch `GameState`, and both tutorial-switch paths replace the complete state;
- the raw-board `isKingInCheck` export and all playable pseudo-legal consumers are gone;
- no mutable chess.js object or chess.js type escapes `rules.ts`.

- [ ] **Step 6: Commit cleanup and verification**

```bash
rtk git add apps/web/src
rtk git commit -m "test(chess): complete standard rules coverage"
```

---

## Spec Coverage Check

| Approved design requirement                                                    | Implemented by |
| ------------------------------------------------------------------------------ | -------------- |
| Exact chess.js 1.4.0 façade and serializable FEN/history state                 | Tasks 1-2      |
| Bulk legal moves, batched pinned attack semantics, and no prompt replay thrash | Tasks 1, 5     |
| Castling, en passant, Q/R/B/N promotion, and king safety                       | Tasks 2, 4, 6  |
| Check, checkmate, stalemate, repetition, fifty-move, insufficient material     | Task 3         |
| Automatic supported draws and terminal move guard                              | Tasks 3-4      |
| Human promotion dialog and clear cancellation                                  | Tasks 4, 6     |
| Same legal pipeline for LM rival and future algebraic/UCI seam                 | Tasks 4-5      |
| Valid tutorial FEN with minimal visible king additions                         | Task 6         |
| Puzzle promotion field and continuous game state                               | Task 7         |
| Puzzle API board shape and exact king-count validation                         | Tasks 1, 7     |
| Required-state fixture migration without partial compatibility states          | Tasks 1, 4, 8  |
| Full-history replay root and accepted O(n) per-action cost                     | Tasks 1-3      |
| Tutorial state replacement and DEV outcomes outside authoritative state        | Task 6         |
| One authoritative chess rules implementation                                   | Task 8         |
| Focused plus whole-web automated verification                                  | Tasks 1-8      |
