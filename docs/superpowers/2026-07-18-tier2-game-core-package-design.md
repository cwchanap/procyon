# Tier 2 — `@procyon/game-core` Shared Core (Design Spec)

**Status:** Approved (pending spec review)
**Date:** 2026-07-18
**Project:** [procyon](https://linear.app/cwchanap/project/procyon-b82f2cc99230)
**Related:** [HPA-154 (Tier 2)](https://linear.app/cwchanap/issue/HPA-154/tier-2-extract-shared-game-core-package), HPA-153 (Tier 1, landed), HPA-155 (Tier 4), HPA-156 (Tier 3)

## 1. Goal

Create `packages/game-core/` — a new workspace package holding the truly-duplicated structural primitives currently copy-pasted across the four engine variants (chess, xiangqi, shogi, jungle): `Position` / `BaseMove` / `GameStatus` / `BaseGameState` types, `GridBoard` helpers, sliding/stepping move-generation scaffolds, and the check / legal-move algorithm shells parameterized by each game's attack function. Leave genuinely distinct rules (castling, drops, terrain, palace, promotion) in each variant.

Two latent bugs land in scope as side effects: chess's shallow `copyBoard` and the duplicate `algebraicToPosition` in `chess/game.ts` that shadows `chess/board.ts`.

**Guiding principle (approved):** _Share the scaffold, specialize the rules._ The shared package exposes generic primitives parameterized by piece shape and dimensions; each variant keeps its rules and narrows the shared types via `extends`.

## 2. Background

`packages/` is empty today. Each variant in `apps/web/src/lib/{chess,xiangqi,shogi,jungle}/` reimplements the same scaffolding from scratch:

- `Position {row,col}` — byte-identical across all four (`chess/types.ts:16-19`, `xiangqi/types.ts:18-21`, `shogi/types.ts:25-28`, `jungle/types.ts:19-22`).
- `GameStatus` — identical union in chess/xiangqi/jungle; shogi is a subset (no `stalemate`).
- `Move` / `GameState` skeletons — same shape, parameterized by piece type.
- Board helpers (`isValidPosition`, `getPieceAt`, `setPieceAt`, `copyBoard`, `isSquareEmpty`, `isSquareOccupiedByOpponent`, `isSquareOccupiedByAlly`) — near-identical ×4.
- Sliding/stepping move loops — chess rook/bishop ≡ shogi rook/bishop (~95%); chess king/knight and shogi king/knight/silver/gold/pawn share the same offset-loop scaffold (6 instances).
- `findPiece` + `isInCheck` + `hasLegalMove` + `moveLeavesKingInCheck` — duplicated across chess/xiangqi/shogi (jungle has no check analog).

Estimated dedup: ~650–750 removable lines (~25% of the ~2,900 engine LOC), per the survey in HPA-154.

**Dependency status:** Tier 1 (hook adoption) is landed (`0647858 refactor(web, chess): adopt shared lifecycle hooks and GamePlayLayout`). Tier 2 is largely independent of the AI/React layers and may proceed.

## 3. Approach

**Approach A (approved): Source-only workspace package, shallow generics, single PR with bisectable commits.**

- Source-only: `packages/game-core/package.json` `exports` points at `./src/index.ts`. No build step. Matches the repo's `allowImportingTsExtensions` + `noEmit` + bundler resolution. Astro and Bun consume the TS source directly.
- Shallow generics: `Position`, `GridBoard<TPiece>`, `BaseMove<TPiece>` are generic over piece shape. `BaseGameState` is a plain skeleton interface that variants `extends` and re-declare concrete types on. Avoids multi-parameter generic plumbing.
- Single PR: all five issue steps land together, but as separately-clean commits in dependency order so the repo stays green at every step and `git bisect` remains meaningful.

Rejected alternatives:

- **Built package (`tsc` → `dist/`)** — adds a turbo `^build` dependency and ceremony; only justified for external publishing or non-TS consumers. Overkill for an internal monorepo.
- **Path alias only (no package)** — contradicts the issue's `packages/game-core/` goal and blocks future sharing with `apps/api`.
- **Deep generics (`BaseGameState<TPiece,TMove,TColor,TStatus>`)** — maximally type-safe but introduces multi-parameter generic plumbing everywhere; fights `verbatimModuleSyntax` ergonomics for marginal dedup gain.
- **Sequenced PRs (5 separate)** — safer review but the user opted for a single PR with bisectable internal commits. Each commit remains independently revertible.

## 4. Package layout

```
packages/game-core/
├── package.json          # name: @procyon/game-core, exports -> ./src/index.ts
├── tsconfig.json         # extends ../../tsconfig.json, lib: ["ESNext"] (no DOM)
├── README.md             # one-pager: purpose, API surface, consumer guide
└── src/
    ├── index.ts          # barrel
    ├── types.ts          # Position, GameStatus, BaseMove<T>, BaseGameState, Direction, Dims
    ├── board.ts          # GridBoard<TPiece> + helpers
    ├── moves.ts          # slidingMoves, steppingMoves, moveLeavesKingInCheck
    ├── check.ts          # findPiece, isInCheck, forEachOwnPieceMove, hasLegalMove
    ├── notation.ts       # CoordinateScheme, posToNotation, notationToPos
    └── __tests__/
        ├── board.test.ts
        ├── moves.test.ts
        ├── check.test.ts
        └── notation.test.ts
```

### 4.1 `package.json`

```json
{
  "name": "@procyon/game-core",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun test src",
    "typecheck": "tsc --noEmit"
  }
}
```

`private: true` — internal workspace package, not published. Consumer version is `workspace:*`.

### 4.2 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "lib": ["ESNext"] },
  "include": ["src/**/*"]
}
```

No DOM lib — the package is pure logic. `structuredClone` (used by `copyBoard`) is in ESNext and available in Bun + all browser runtimes Astro targets.

### 4.3 Workspace wiring

- **Root `package.json`**: already has `"workspaces": ["apps/*", "packages/*"]`. No change.
- **`apps/web/package.json`**: add `"@procyon/game-core": "workspace:*"` to `dependencies`.
- **`apps/api/package.json`**: no change (API has no engine code).
- **Turbo**: `test`, `typecheck`, `lint` tasks inherit from root turbo config (already wildcard across workspaces).

## 5. Shared types

`packages/game-core/src/types.ts`:

```ts
export interface Position {
  row: number;
  col: number;
}
export type GameStatus =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw';

export interface BaseMove<TPiece> {
  from: Position | null; // null accommodates shogi drops
  to: Position;
  piece: TPiece;
  capturedPiece?: TPiece;
}

export interface BaseGameState<TPiece> {
  board: (TPiece | null)[][];
  currentPlayer: string; // variants narrow via re-declaration
  status: GameStatus;
  moveHistory: BaseMove<TPiece>[];
  selectedSquare: Position | null;
  possibleMoves: Position[];
}

export interface Direction {
  row: number;
  col: number;
}
export interface Dims {
  rows: number;
  cols: number;
}
```

### 5.1 Variant adoption

Each variant keeps its existing exported type names for API stability and `extends` the shared base:

```ts
// apps/web/src/lib/chess/types.ts
import type { BaseMove, BaseGameState, GameStatus } from '@procyon/game-core';
export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}
export interface Move extends BaseMove<ChessPiece> {
  isEnPassant?: boolean;
  isCastling?: boolean;
  promotion?: PieceType;
  // re-declares `from: Position` (non-null) — chess has no drops
}
export interface GameState extends BaseGameState<ChessPiece> {
  currentPlayer: PieceColor;
  moveHistory: Move[];
  mode: GameMode;
  aiPlayer?: PieceColor;
  isAiThinking?: boolean;
}
```

Shogi's `Move.from: Position | null` (drops) is satisfied directly by `BaseMove`. Jungle's `JungleGameState` adds `terrain: JungleTerrain[][]` via extension. Xiangqi adds palace/river constants (unchanged).

### 5.2 `Position` helpers

`positionsEqual(a, b)` and `containsPosition(list, pos)` move to `types.ts` — small but currently duplicated.

## 6. `GridBoard` primitives + shallow-copy bug fix

`packages/game-core/src/board.ts`:

```ts
export type GridBoard<TPiece> = (TPiece | null)[][];

export function createEmptyBoard<TPiece>(
  rows: number,
  cols: number
): GridBoard<TPiece>;
export function isValidPosition(pos: Position, dims: Dims): boolean;
export function getPieceAt<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  dims: Dims
): TPiece | null;
export function setPieceAt<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  piece: TPiece | null,
  dims: Dims
): void;
export function copyBoard<TPiece>(board: GridBoard<TPiece>): GridBoard<TPiece>;
export function isSquareEmpty<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  dims: Dims
): boolean;
export function isSquareOccupiedByOpponent<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  pos: Position,
  color: string,
  dims: Dims
): boolean;
export function isSquareOccupiedByAlly<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  pos: Position,
  color: string,
  dims: Dims
): boolean;

// Dimension-binding helper to keep call sites clean
export function bindBoard<TPiece>(dims: Dims): {
  isValidPosition: (pos: Position) => boolean;
  getPieceAt: (board: GridBoard<TPiece>, pos: Position) => TPiece | null;
  setPieceAt: (
    board: GridBoard<TPiece>,
    pos: Position,
    piece: TPiece | null
  ) => void;
  isSquareEmpty: (board: GridBoard<TPiece>, pos: Position) => boolean;
  isSquareOccupiedByOpponent: (
    board: GridBoard<TPiece>,
    pos: Position,
    color: string
  ) => boolean;
  isSquareOccupiedByAlly: (
    board: GridBoard<TPiece>,
    pos: Position,
    color: string
  ) => boolean;
};
```

### 6.1 `copyBoard` deep-clones

```ts
export function copyBoard<TPiece>(board: GridBoard<TPiece>): GridBoard<TPiece> {
  return board.map(row =>
    row.map(piece => (piece === null ? null : structuredClone(piece)))
  );
}
```

`structuredClone` deep-copies piece objects. This matches the existing behavior of xiangqi/shogi/jungle (which already deep-clone) and **fixes the chess shallow-copy bug** where `chess/board.ts:95-99` did `board.map(row => [...row])`, sharing piece-object references between the original and the copy. Any chess code that mutated a piece object in-place after `copyBoard` will see changed behavior — the full chess test suite is the regression gate.

### 6.2 `bindBoard` ergonomic rationale

Each variant currently passes its dimension constants implicitly via locally-defined `isValidPosition`/`getPieceAt`/etc. To keep call sites one-argument cleaner (and avoid repeating `BOARD_SIZE`/`XIANGQI_ROWS` at every call), each variant calls `bindBoard({rows, cols})` once and re-exports the bound helpers from its own `board.ts`:

```ts
// apps/web/src/lib/chess/board.ts
import {
  bindBoard,
  copyBoard,
  createEmptyBoard as _createEmptyBoard,
} from '@procyon/game-core';
import { BOARD_SIZE } from './types';
const {
  isValidPosition,
  getPieceAt,
  setPieceAt,
  isSquareEmpty,
  isSquareOccupiedByOpponent,
  isSquareOccupiedByAlly,
} = bindBoard<ChessPiece>({ rows: BOARD_SIZE, cols: BOARD_SIZE });
export {
  isValidPosition,
  getPieceAt,
  setPieceAt,
  isSquareEmpty,
  isSquareOccupiedByOpponent,
  isSquareOccupiedByAlly,
  copyBoard,
};
```

Variant-local `createInitialBoard`/`getRow` stay per-variant (they reference variant-specific piece layouts and the `getRow` throw-helper used to satisfy `noUncheckedIndexedAccess`).

## 7. Move-generation primitives

`packages/game-core/src/moves.ts`:

```ts
export function slidingMoves<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  from: Position,
  color: string,
  directions: Direction[],
  maxRange: number,
  dims: Dims
): Position[];

export function steppingMoves<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  from: Position,
  color: string,
  offsets: Direction[],
  dims: Dims
): Position[];
```

- `slidingMoves` replaces chess `getRookMoves`/`getBishopMoves` (`chess/moves.ts:75-145`) and shogi rook/bishop generators (`shogi/moves.ts:184-248`) — ~95% identical.
- `steppingMoves` replaces chess king/knight and shogi king/knight/silver/gold/pawn offset loops (6 instances of the same scaffold).
- Both internally use `isSquareEmpty`/`isSquareOccupiedByOpponent` from §6.

### 7.1 `moveLeavesKingInCheck`

`packages/game-core/src/moves.ts`:

```ts
export function moveLeavesKingInCheck<TPiece>(
  board: GridBoard<TPiece>,
  from: Position, // board moves only; drops handled variant-locally (see below)
  to: Position,
  moverColor: string,
  findKing: (board: GridBoard<TPiece>, color: string) => Position | null,
  isAttacked: (
    board: GridBoard<TPiece>,
    pos: Position,
    byColor: string
  ) => boolean,
  dims: Dims
): boolean;
```

The copy/apply/test snippet duplicated 5× across variants collapses here. Internally: `copyBoard`, apply the move (`to` ← piece at `from`, `from` ← null), `findKing(board, moverColor)`, return `isAttacked(board, kingPos, oppositeColor)`. If `findKing` returns null (shouldn't happen in a legal position), return `true` — moving into a position with no king is treated as in-check.

**Drop exclusion:** shogi drops (`from === null`) are not handled here — the moving piece isn't on the board. Shogi's drop-legality checks (nifu, uchifuzume) stay variant-local per §13. The shared helper is board-moves-only.

## 8. Check & legal-move algorithms

`packages/game-core/src/check.ts`:

```ts
export function findPiece<TPiece>(
  board: GridBoard<TPiece>,
  predicate: (p: TPiece) => boolean,
  dims: Dims
): Position | null;

export function isInCheck<TPiece>(
  board: GridBoard<TPiece>,
  kingColor: string,
  kingPos: Position,
  isAttacked: (
    board: GridBoard<TPiece>,
    pos: Position,
    byColor: string
  ) => boolean,
  dims: Dims
): boolean;

export function forEachOwnPieceMove<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  color: string,
  getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
  visit: (from: Position, to: Position) => boolean, // return false to stop early
  dims: Dims
): void;

export function hasLegalMove<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  color: string,
  getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
  leavesKingInCheck: (from: Position, to: Position) => boolean,
  dims: Dims
): boolean;
```

- Each variant supplies its own `isAttacked(board, pos, byColor)` predicate (chess: pawn-attack squares + sliding/stepping; xiangqi: cannon screens; shogi: pawn-forward-attacks; each variant already has this function in some form). The shared `isInCheck` is a one-liner: `isAttacked(board, kingPos, oppositeColor(kingColor))`. It exists as a shared primitive so `moveLeavesKingInCheck` and variant `game.ts` callers route through one name.
- Callers find the king via `findPiece(board, p => p.type === 'king' && p.color === c, dims)` (or the variant's local equivalent) before calling `isInCheck`. Separating `findPiece` from `isInCheck` keeps each function single-purpose and lets variants reuse `findPiece` elsewhere.
- `hasLegalMove` subsumes `hasAnyLegalMoves`/`playerHasValidMoves`/`hasValidMoves` (~100 lines duplicated 4×).
- **Jungle is excluded** — it has no check concept (den-capture win condition). The issue explicitly forbids forcing a Jungle analog.

## 9. Coordinate / notation cleanup

`packages/game-core/src/notation.ts`:

```ts
export interface CoordinateScheme {
  files: string[]; // column labels, left-to-right
  ranks: string[]; // row labels, index 0 = first row
}
export function posToNotation(scheme: CoordinateScheme, pos: Position): string;
export function notationToPos(scheme: CoordinateScheme, str: string): Position;
```

- Adopted by **chess** (`a-h` × `8-1`), **xiangqi** (`a-i` × `10-1`), **jungle** (`a-g` × `9-1`). All three share the row-indexed convention.
- **Shogi excluded** — its notation is transposed (files are numbers `9-1`, ranks are letters `a-i`). Forcing it into one scheme adds complexity for no dedup win; shogi keeps its existing helpers.
- Each variant declares its `CoordinateScheme` constant and re-exports `posToNotation`/`notationToPos` bound to it (or consumers call with the scheme directly).

### 9.1 Chess duplicate `algebraicToPosition` deletion

`chess/game.ts:233-245` defines a second `algebraicToPosition` that shadows `chess/board.ts:106-122` with different error behavior. Delete the duplicate in `game.ts`; route all chess callers through the shared `notationToPos` (or the chess-bound alias).

## 10. Bug fixes in scope

| #    | Bug                                                                                   | Location                                      | Fix                                                                  |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| 10.1 | Chess `copyBoard` shallow-clones piece objects (other 3 variants deep-clone)          | `chess/board.ts:95-99`                        | §6.1 shared `copyBoard` uses `structuredClone`                       |
| 10.2 | Duplicate `algebraicToPosition` shadows board's version with different error behavior | `chess/game.ts:233-245` vs `board.ts:106-122` | §9.1 delete the `game.ts` copy; route through shared `notationToPos` |

## 11. Deletions (estimated)

| Item                                                                  | ~Lines                                        |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `Position` × 4 (chess/xiangqi/shogi/jungle)                           | ~16                                           |
| `GameStatus` × 4                                                      | ~24                                           |
| `Move` / `GameState` shared fields × 4                                | ~60                                           |
| Board helpers (`isValidPosition`/`getPieceAt`/`setPieceAt`/etc.) × 4  | ~125                                          |
| `isSquareEmpty`/`isSquareOccupiedBy*` × 4 (inlined in xiangqi/jungle) | ~48                                           |
| Sliding move loops (chess rook/bishop + shogi rook/bishop)            | ~60                                           |
| Stepping move loops (chess king/knight + shogi ×5)                    | ~60                                           |
| `findPiece`/`isInCheck`/`hasLegalMove`/`moveLeavesKingInCheck` × 3    | ~235                                          |
| Chess duplicate `algebraicToPosition`                                 | ~13                                           |
| **Total removed**                                                     | **~640**                                      |
| Net new logic                                                         | `@procyon/game-core` (~400 lines incl. tests) |

Net repo delta: approximately −250 LOC, plus two bug fixes and a reusable package boundary for Tier 3 (AI adapters) to build on.

## 12. Migration order (single PR, bisectable commits)

Each commit leaves the repo green (typecheck + lint + tests pass).

1. **`chore(packages): scaffold @procyon/game-core`** — empty package, workspace + web dependency, turbo task wiring, README stub. No behavior change.
2. **`feat(game-core): add types + GridBoard primitives`** — Position/GameStatus/BaseMove/BaseGameState/Direction/Dims + `board.ts` helpers + tests. No consumers yet.
3. **`refactor(chess): consume game-core board primitives`** — migrate chess first (smallest variant, carries the shallow-copy bug). Fix the bug here via shared `copyBoard`. Run full chess suite (`game.test.ts`/`board.test.ts`/`moves.test.ts`/`*.coverage.test.ts`/`*.extended.test.ts`).
4. **`refactor(xiangqi): consume game-core board primitives`** — run xiangqi suite.
5. **`refactor(shogi): consume game-core board primitives`** — run shogi suite.
6. **`refactor(jungle): consume game-core board primitives`** — run jungle suite.
7. **`feat(game-core): add slidingMoves + steppingMoves + moveLeavesKingInCheck`** + tests.
8. **`refactor(chess,shogi): consume sliding/stepping primitives`** — run chess + shogi suites.
9. **`feat(game-core): add findPiece + isInCheck + forEachOwnPieceMove + hasLegalMove`** + tests.
10. **`refactor(chess,xiangqi,shogi): consume check primitives`** — run chess/xiangqi/shogi suites. Jungle untouched.
11. **`feat(game-core): add CoordinateScheme + notation`** + tests.
12. **`refactor(chess,xiangqi,jungle): consume notation; delete chess duplicate`** — run chess/xiangqi/jungle suites.
13. **`docs: note @procyon/game-core in AGENTS.md`** — document the shared package in the repo guide.

If any commit's test suite fails (especially commit 3 — the shallow-copy fix), investigate before proceeding. A failure there means chess code relied on shared piece-object references; the fix is to make the chess code clone explicitly or stop mutating in place.

## 13. Out of scope

Per the issue, these genuinely-distinct rules stay per-variant:

- Pawn/soldier movement, castling, en-passant, promotion (chess/shogi).
- Cannon screen-jump, elephant no-cross-river, horse-leg block, flying generals, palace constraints (xiangqi).
- Shogi drops, nifu, uchifuzume, promotion zones.
- Jungle terrain: water, river-jumps, traps, den-win, rat-beats-elephant.

Also out of scope:

- Jungle check algorithm (no analog; do not force one).
- AI adapter / rule-guardian dedup — Tier 3 (HPA-156).
- React lifecycle / layout hooks — Tier 4 (HPA-155, largely landed).
- Shogi notation unification (transposed scheme).

## 14. Risks & verification

- **Risk: shallow-copy fix changes chess behavior** if any code mutated piece objects in-place after `copyBoard`. **Mitigation:** full chess `*.test.ts` + `*.coverage.test.ts` + `*.extended.test.ts` must pass at commit 3; investigate every failure before proceeding.
- **Risk: generic plumbing (`<TPiece extends { color: string }>`) fights `noUncheckedIndexedAccess`.** **Mitigation:** shared helpers access board cells through `getPieceAt` (which returns `null` for OOB and uses `?.`/`??` internally), never through raw `board[row][col]`. Variant color unions (`'white'|'black'`, `'red'|'black'`, `'sente'|'gote'`, `'red'|'blue'`) all satisfy `string`.
- **Risk: `bindBoard` ergonomics regress call-site readability.** **Mitigation:** variants re-export bound helpers from their own `board.ts` under the same names they use today; downstream files import unchanged.
- **Verification gate per commit:** `bun test` in `packages/game-core`, `bun test src` in `apps/web`, `bun run typecheck`, `bun run lint`. No commit lands red. E2E suite (`bun run test:e2e`) runs on the final commit.
- **Estimate:** ~650–750 net LOC removed (per issue), ~+400 in the new package; net ~−250 LOC plus two bug fixes.
