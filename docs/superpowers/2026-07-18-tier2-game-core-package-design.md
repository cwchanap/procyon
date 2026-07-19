# Tier 2 — `@procyon/game-core` Shared Core (Design Spec)

**Status:** Approved — revision 2 after spec review (11 comments addressed)
**Date:** 2026-07-18 (rev 2026-07-19)
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

**Approach A: Source-only workspace package, shallow generics, single PR with bisectable commits.**

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
    ├── board.test.ts     # colocated, matches repo convention (chess/board.ts ↔ board.test.ts)
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
  status: GameStatus; // re-declared for clarity; chess accepts all 5 values
  currentPlayer: PieceColor;
  moveHistory: Move[];
  mode: GameMode;
  aiPlayer?: PieceColor;
  isAiThinking?: boolean;
}
```

Shogi narrows `status` to drop `'stalemate'` (shogi has no stalemate rule):

```ts
// apps/web/src/lib/shogi/types.ts
import type { BaseMove, BaseGameState } from '@procyon/game-core';

export type ShogiGameStatus = 'playing' | 'check' | 'checkmate' | 'draw';

export interface ShogiMove extends BaseMove<ShogiPiece> {
  // from: Position | null inherited — shogi uses null for drops
  isPromotion?: boolean;
  isDrop?: boolean;
}
export interface ShogiGameState extends BaseGameState<ShogiPiece> {
  status: ShogiGameStatus; // NARROWS the base GameStatus — without this, shogi
  // would silently accept 'stalemate' from the base type
  currentPlayer: ShogiPieceColor;
  moveHistory: ShogiMove[];
  senteHand: ShogiPiece[];
  goteHand: ShogiPiece[];
  selectedHandPiece: ShogiPiece | null;
  pendingPromotion?: {
    piece: ShogiPiece;
    from: ShogiPosition;
    to: ShogiPosition;
  };
}
```

**Status narrowing rule (documented):** every variant MUST re-declare `status` on its `GameState` extension. Chess/xiangqi/jungle re-declare as the full `GameStatus`; shogi re-declares as `ShogiGameStatus`. Re-declaring is already the established pattern for `currentPlayer` (which narrows `string` to the variant's color union); status follows the same discipline. Variants that fail to re-declare `status` will silently widen — TS will not error, so reviewers must check for the re-declaration during migration (call out in commit-message checklist).

Shogi's `Move.from: Position | null` (drops) is satisfied directly by `BaseMove`. Jungle's `JungleGameState` adds `terrain: JungleTerrain[][]` via extension and re-declares `status: GameStatus`. Xiangqi adds palace/river constants (unchanged) and re-declares `status: GameStatus`.

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

// Dimension-binding helper to keep call sites clean.
// Implementation returns an object literal with arrow-function properties
// (NOT method shorthand) — matches the declared return type exactly and
// avoids method-vs-property `this`-binding divergences.
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

**Jungle terrain cloning:** the shared `copyBoard` is piece-board-only. Jungle's `JungleGameState` also carries `terrain: JungleTerrain[][]` which must be cloned independently. Jungle retains a variant-local `copyTerrain(terrain): JungleTerrain[][]` (deep clone via `structuredClone`) and composes: `copyGameState(s) = { ...s, board: copyBoard(s.board), terrain: copyTerrain(s.terrain) }`. Implementers must NOT route `terrain` through the shared helper — `copyBoard` only knows about `(TPiece | null)[][]`.

**`bindBoard` identity note (Minor #7):** the destructured-and-re-exported bound helpers are closures. Their TypeScript identity is `typeof` the closure (e.g. `(pos: Position) => boolean`), not `typeof import('@procyon/game-core').isValidPosition` (which is the unbound 2-arg form). Any consumer using `typeof`-based typing against the variant's `board.ts` exports will see the bound signature — this is the intended shape. The unbound forms remain importable from `@procyon/game-core` directly when needed.

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

**Shogi call-site shape** (`apps/web/src/lib/shogi/moves.ts`) — the board-vs-drop branch point:

```ts
import { moveLeavesKingInCheck } from '@procyon/game-core';

function leavesKingInCheck(move: ShogiMove, color: ShogiPieceColor): boolean {
  if (move.isDrop || move.from === null) {
    // Drop: shared helper can't apply it (piece not on board).
    // Route to variant-local drop-legality (nifu/uchifuzume + own-king-in-check).
    return shogiDropLeavesKingInCheck(move, color);
  }
  // Board move: delegate to shared helper.
  return moveLeavesKingInCheck(
    board,
    move.from,
    move.to,
    color,
    findShogiKing,
    isSquareAttacked,
    SHOGI_DIMS
  );
}
```

The `shogiDropLeavesKingInCheck` variant-local helper builds a temporary board with the dropped piece placed, then reuses the shared `isInCheck` predicate on the modified board. Nifu/uchifuzume are checked separately before reaching this branch (they reject the move candidate earlier in `getLegalMoves`).

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
| `findPiece`/`isInCheck`/`hasLegalMove`/`moveLeavesKingInCheck` × 3    | ~210                                          |
| Chess duplicate `algebraicToPosition`                                 | ~13                                           |
| **Total removed**                                                     | **~615**                                      |
| Net new logic                                                         | `@procyon/game-core` (~400 lines incl. tests) |

Net repo delta: approximately −215 LOC, plus two bug fixes and a reusable package boundary for Tier 3 (AI adapters) to build on.

**On the line-count estimates (Nit #9):** all counts are **source LOC removed from `apps/web/src/lib/{variant}/`**, not test LOC. The `~210` for check/legal-move primitives across 3 variants breaks down as: `findPiece`+`isInCheck` ~110, `hasLegalMove`/`hasAnyLegalMoves`/`playerHasValidMoves`/`hasValidMoves` consolidation ~75 (3 variants × ~25), `moveLeavesKingInCheck` ~25 — figures sourced from the HPA-154 survey. The new `@procyon/game-core` adds ~400 lines including its own colocated unit tests; the net delta reflects shared-package overhead eating into the raw removal.

## 12. Migration order (single PR, bisectable commits)

Each commit leaves the repo green (typecheck + lint + tests pass).

1. **`chore(packages): scaffold @procyon/game-core`** — empty package, workspace + web dependency, turbo task wiring, README stub. No behavior change.
2. **`feat(game-core): add types + GridBoard primitives`** — Position/GameStatus/BaseMove/BaseGameState/Direction/Dims + `board.ts` helpers + tests. No consumers yet.
3. **`refactor(chess): consume game-core board primitives`** — migrate chess first because it carries the highest-risk change (the shallow-copy bug fix, §10.1). Going first means any failure surfaces immediately and isn't entangled with three other variants' migrations. Chess is NOT the smallest variant — it has the most rule surface (castling, en-passant, promotion) — but blast-radius isolation trumps size here. Fix the bug in this commit via shared `copyBoard`. Run full chess suite (`game.test.ts`/`board.test.ts`/`moves.test.ts`/`*.coverage.test.ts`/`*.extended.test.ts`) plus the new `copyBoard` deep-semantics unit test (§14).
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

    Sketch of the addition under **Game Engine Architecture → Multi-Game Pattern** (insert before the existing "1. Types" step):

    > **Shared core (`@procyon/game-core`):** the truly-duplicated structural primitives — `Position`, `BaseMove<TPiece>`, `BaseGameState<TPiece>`, `GridBoard<TPiece>` helpers, `slidingMoves`/`steppingMoves`/`moveLeavesKingInCheck`, and `findPiece`/`isInCheck`/`hasLegalMove`/`forEachOwnPieceMove` — live in `packages/game-core/`, not in each variant. The scope rule: **share the scaffold, specialize the rules.** Generic piece-movement primitives (sliding/stepping offsets), board helpers parameterized by `Dims`, and check/legality shells parameterized by an `isAttacked` predicate belong in the shared package. Variant-specific rules (castling, cannon screens, shogi drops/nifu/uchifuzume, jungle terrain) stay in `apps/web/src/lib/{variant}/`. When adding a new primitive, ask: is the logic identical across ≥3 variants modulo dimensions and piece types? If yes → `game-core`. If it references a variant-specific concept (palace, river, promotion zone) → stays variant-local.

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

- **Risk: shallow-copy fix changes chess behavior** if any code mutated piece objects in-place after `copyBoard`. **Mitigation:** full chess `*.test.ts` + `*.coverage.test.ts` + `*.extended.test.ts` must pass at commit 3; investigate every failure before proceeding. **Plus a dedicated regression test** (Minor #6) that asserts deep-copy semantics directly — the existing suites don't encode this invariant or the bug would already have failed:

  ```ts
  // packages/game-core/src/board.test.ts
  test('copyBoard deep-clones piece objects', () => {
    const board: GridBoard<{ color: string; type: string }> = [
      [{ color: 'white', type: 'pawn' }, null],
    ];
    const copy = copyBoard(board);
    // Mutate a piece object on the copy.
    (copy[0]![0] as { color: string }).color = 'black';
    // Original must be unchanged.
    expect(board[0]![0]!.color).toBe('white');
  });
  ```

  This locks in the fix so a future "performance optimization" can't silently reintroduce the shallow clone.

- **Risk: shogi status silently widens if `ShogiGameState` omits the `status` re-declaration** (Medium #1). **Mitigation:** the status-narrowing rule is documented in §5.1; commit-message checklist for the shogi migration commit (§12 step 5) must explicitly call out that `ShogiGameState.status: ShogiGameStatus` is re-declared. TS will not error on widening, so review discipline is the gate.
- **Risk: jungle terrain accidentally routed through shared `copyBoard`.** **Mitigation:** §6.2 documents that jungle retains a variant-local `copyTerrain` and composes it with the shared piece-board `copyBoard`; the shared helper's signature is `GridBoard<TPiece>` only and won't typecheck if passed a terrain array.
- **Risk: shogi drop branch point mis-placed.** **Mitigation:** §7.1 sketches the exact call-site shape in `shogi/moves.ts` (board moves → shared helper; drops → `shogiDropLeavesKingInCheck` local), locking in the branch before implementation.
- **Risk: generic plumbing (`<TPiece extends { color: string }>`) fights `noUncheckedIndexedAccess`.** **Mitigation:** shared helpers access board cells through `getPieceAt` (which returns `null` for OOB and uses `?.`/`??` internally), never through raw `board[row][col]`. Variant color unions (`'white'|'black'`, `'red'|'black'`, `'sente'|'gote'`, `'red'|'blue'`) all satisfy `string`.
- **Risk: `bindBoard` ergonomics regress call-site readability, or `typeof`-based typing breaks.** **Mitigation:** variants re-export bound helpers from their own `board.ts` under the same names they use today; downstream files import unchanged. The bound helpers' identity is the closure type (§6.2 note); consumers needing the unbound 2-arg form import from `@procyon/game-core` directly.
- **Verification gate per commit:** `bun test` in `packages/game-core`, `bun test src` in `apps/web`, `bun run typecheck`, `bun run lint`. No commit lands red. E2E suite (`bun run test:e2e`) runs on the final commit.
- **Estimate:** ~615 net source LOC removed (per the §11 breakdown), ~+400 in the new package; net ~−215 LOC plus two bug fixes.
