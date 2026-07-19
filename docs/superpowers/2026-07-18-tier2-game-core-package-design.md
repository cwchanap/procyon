# Tier 2 — `@procyon/game-core` Shared Core (Design Spec)

**Status:** Approved — revision 3 after P1/P2 implementation-blocker review (6 comments addressed)
**Date:** 2026-07-18 (rev 2026-07-19 r2, r3)
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
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  }
}
```

`private: true` — internal workspace package, not published. Consumer version is `workspace:*`.

**Lint config (P2-2):** the root `eslint.config.js` already globs all workspace sources by default (eslint-flat-config resolves through the root), so `eslint src` inside the package picks up the shared rules without a package-local config. If the root config needs an explicit `packages/game-core/src` entry in its `files`/`ignores` glob list, add it during commit 1 (§12). Verify by running `bun run lint --filter=game-core` (or `bun run lint` from the package root) before the first consumer commit lands.

### 4.2 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "lib": ["ESNext"] },
  "include": ["src/**/*"]
}
```

No DOM lib — the package is pure logic. `copyBoard` uses object-spread cloning (`{ ...piece }`), not `structuredClone` — see §6.1 for the rationale (the global `structuredClone` is declared in `lib.dom.d.ts`, not in `lib.esnext.d.ts` alone, so a DOM-free package cannot use it without an ambient declaration).

### 4.3 Workspace wiring

- **Root `package.json`**: already has `"workspaces": ["apps/*", "packages/*"]`. No change.
- **`apps/web/package.json`**: add `"@procyon/game-core": "workspace:*"` to `dependencies`.
- **`apps/api/package.json`**: no change (API has no engine code).
- **Turbo**: `test`, `typecheck`, `lint` tasks inherit from root turbo config (already wildcard across workspaces).
- **CI (`.github/workflows/unit-tests.yml`, P2-2):** the existing workflow runs `bun run test --filter=web` and `--filter=api` — the new package is excluded by the filter. Add a third job `test-game-core` mirroring the `test-web` job's checkout/bun/cache steps, running:
  - `bun run test --filter=@procyon/game-core`
  - `bun run lint --filter=@procyon/game-core`
  - `bun run typecheck --filter=@procyon/game-core`

  Alternatively, change `--filter=web` to `--filter=web --filter=@procyon/game-core` in the existing `test-web` job (lower matrix overhead, single job). Recommendation: separate job — isolates failures and surfaces `game-core` regressions distinctly from web. Coverage upload is optional for the package (it's small and fully unit-tested).

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
    row.map(piece => (piece === null ? null : { ...piece }))
  );
}
```

Object-spread (`{ ...piece }`) clones each piece object one level deep. This is sufficient because every variant's piece shape is **flat** — no nested objects:

| Variant | Piece shape                         | Flat? |
| ------- | ----------------------------------- | ----- |
| Chess   | `{ type, color, hasMoved? }`        | ✓     |
| Xiangqi | `{ type, color, hasCrossedRiver? }` | ✓     |
| Shogi   | `{ type, color, isPromoted? }`      | ✓     |
| Jungle  | `{ type, color, rank }`             | ✓     |

**Why not `structuredClone`:** the global `structuredClone` is declared in `lib.dom.d.ts`, not in `lib.esnext.d.ts`. The package deliberately ships with `lib: ["ESNext"]` only (no DOM — pure logic), so `structuredClone` would fail to typecheck (`Cannot find name 'structuredClone'`). Spread-clone sidesteps the lib issue, is faster, and is honest about the actual invariant ("clone flat piece objects" — not "deep-clone arbitrary nested structures").

**Flatness invariant:** adding a piece property that holds a nested object (e.g. `metadata: { ... }`) breaks the deep-clone guarantee. The shared `copyBoard` will share the nested reference. The regression test in §14 asserts the flat case; if a future change introduces nested piece data, the test must be updated AND the clone strategy revisited (switch to `structuredClone` + add `lib.dom` or an ambient `.d.ts`).

This matches the existing behavior of xiangqi/shogi/jungle (which already deep-clone) and **fixes the chess shallow-copy bug** where `chess/board.ts:95-99` did `board.map(row => [...row])`, sharing piece-object references between the original and the copy. Any chess code that mutated a piece object in-place after `copyBoard` will see changed behavior — the full chess test suite is the regression gate.

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
  findOwnKing: (board: GridBoard<TPiece>) => Position | null,
  isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
  onMissingKing: () => boolean
): boolean;
```

The copy/apply/test snippet duplicated 5× across variants collapses here. Internally: `copyBoard`, apply the move (`to` ← piece at `from`, `from` ← null), `findOwnKing(next)` — if null, return `onMissingKing()`; else return `isOwnKingAttacked(next, kingPos)`.

**Color agnosticism (P1-2):** the helper takes no color arguments. The caller pre-binds the mover color into `findOwnKing` (closure over `state.currentPlayer`) and the opponent color into `isOwnKingAttacked` (closure over the variant's `opponentOf(color)`). The shared package never needs to compute "opposite of white" — that knowledge stays in the variant.

**Missing-king policy (P2-1):** `onMissingKing` is an explicit callback because variant tests disagree:

- Chess/xiangqi pass `() => false` (`chess/game.coverage.test.ts:119-125` expects `false`).
- Shogi passes `() => true` (defensive default — kings can't be missing in legal shogi play).

**Drop exclusion:** shogi drops (`from === null`) are not handled here — the moving piece isn't on the board. Shogi's drop-legality checks (nifu, uchifuzume) stay variant-local per §13. The shared helper is board-moves-only.

**Shogi call-site shape** (`apps/web/src/lib/shogi/moves.ts`) — the board-vs-drop branch point:

```ts
import { moveLeavesKingInCheck } from '@procyon/game-core';

function shogiBoardMoveLeavesKingInCheck(
  board: GridBoard<ShogiPiece>,
  from: Position,
  to: Position,
  testPiece: ShogiPiece, // promotion variant already resolved by caller
  moverColor: ShogiPieceColor
): boolean {
  const opponent: ShogiPieceColor = moverColor === 'sente' ? 'gote' : 'sente';
  // If the moving piece is the king, findOwnKing must look at `to` after the move.
  // The shared helper handles this internally because findOwnKing runs on the
  // post-move board.
  return moveLeavesKingInCheck(
    applyPieceForCheck(board, from, to, testPiece), // or let helper apply; see note
    from,
    to,
    b =>
      findPiece(
        b,
        p => p.type === 'king' && p.color === moverColor,
        SHOGI_DIMS
      ),
    (b, pos) => isSquareAttacked(b, pos, opponent),
    () => true // shogi missing-king policy
  );
}
```

Note: the shared helper applies the move internally via `copyBoard` + cell assignment, so callers pass the **original** board and the `from`/`to`/`testPiece` describe the move. For shogi's promotion variants, the caller resolves `testPiece` (promoted or not) before invoking; the shared helper's internal apply uses whatever piece object sits at `from` on the original board, so shogi wrappers that need to substitute the promoted piece must do so via a tiny local adapter (the wrapper clones, swaps the piece at `from`, then delegates to a lower-level check — see §8.2). The exact seam between "shared helper applies the move" and "shogi wrapper substitutes the promoted piece" is the most delicate part of the shogi migration and gets its own commit-message checklist item.

## 8. Check & legal-move algorithms

`packages/game-core/src/check.ts`:

```ts
export function findPiece<TPiece>(
  board: GridBoard<TPiece>,
  predicate: (p: TPiece) => boolean,
  dims: Dims
): Position | null;

// Color-agnostic: caller pre-binds the attacker color into isAttacked.
// kingPos is non-null — callers handle absence and supply their own policy.
export function isInCheck<TPiece>(
  board: GridBoard<TPiece>,
  kingPos: Position,
  isAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean
): boolean;

// Iterates (from, to) board moves for `color`'s own pieces. Drops are NOT
// modeled here — shogi iterates drops separately (see §8.3).
export function forEachOwnPieceMove<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  color: string,
  getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
  visit: (from: Position, to: Position) => boolean, // return false to stop early
  dims: Dims
): void;
```

**Key design decisions (P1-2, P1-3, P2-1):**

- **Color agnosticism (P1-2).** The shared helpers do not know how to compute an opponent color from a string. Instead of taking `kingColor` + an `oppositeColor` callback, `isInCheck` takes a closure `isAttacked: (board, pos) => boolean` with the attacker color already pre-bound by the caller:

  ```ts
  // Variant call site (chess example)
  const opponent: PieceColor = color === 'white' ? 'black' : 'white';
  const kingPos = findPiece(
    board,
    p => p.type === 'king' && p.color === color,
    dims
  );
  const inCheck =
    kingPos !== null
      ? isInCheck(board, kingPos, (b, p) => isSquareAttacked(b, p, opponent))
      : false; // chess/xiangqi policy: no king = not in check
  ```

  This pushes the color-pair knowledge to the variant where it belongs, and keeps the shared API trivially simple (`isInCheck` is literally `return isAttacked(board, kingPos);`).

- **Missing-king policy (P2-1).** Existing tests diverge:

  | Variant | `isKingInCheck` with no king | Source                                                           |
  | ------- | ---------------------------- | ---------------------------------------------------------------- |
  | Chess   | `false`                      | `chess/game.coverage.test.ts:119-125`                            |
  | Xiangqi | `false`                      | (mirror of chess)                                                |
  | Shogi   | `true`                       | (defensive default — kings can't be missing in legal shogi play) |

  The shared `isInCheck` resolves this by **requiring a non-null `kingPos`** — the helper refuses to guess. Each variant encodes its own policy at the call site (chess/xiangqi `kingPos ? isInCheck(...) : false`; shogi `kingPos ? isInCheck(...) : true`). `findPiece` returning `null` is the variant's signal to apply its policy.

  For `moveLeavesKingInCheck` (§7.1) the king moves during the trial, so the helper must locate it after applying the move. It takes an explicit `onMissingKing: () => boolean` callback so each variant expresses its own policy:

  ```ts
  export function moveLeavesKingInCheck<TPiece>(
    board: GridBoard<TPiece>,
    from: Position,
    to: Position,
    findOwnKing: (board: GridBoard<TPiece>) => Position | null,
    isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
    onMissingKing: () => boolean
  ): boolean;
  ```

  Internally: `copyBoard`, apply the move (`to` ← piece at `from`, `from` ← null), `findOwnKing(next)` — if null, return `onMissingKing()`; else return `isOwnKingAttacked(next, kingPos)`. Chess/xiangqi pass `() => false`; shogi passes `() => true`. This makes the policy visible at the call site instead of hidden in a shared default.

- **No shared `hasLegalMove` (P1-3).** The original issue proposed extracting `hasLegalMove` (~100 lines × 4 variants). Code review overturned this: shogi's `hasAnyLegalMoves` (`shogi/game.ts:428-508`) iterates promotion variants (forced/optional/none) AND drop moves — structurally different from chess/xiangqi's board-move-only scan. A single shared signature cannot subsume both without becoming so generic it loses all dedup value.

  Instead, each variant keeps its own `hasLegalMove` (a 5–15 line composition) and the shared package exposes only `forEachOwnPieceMove` + `moveLeavesKingInCheck` as the building blocks. The dedup is honest: ~60 lines removed (the `forEachOwnPieceMove` iterator + `moveLeavesKingInCheck` body) rather than the original ~100-line claim.

- **Jungle is excluded** — it has no check concept (den-capture win condition). The issue explicitly forbids forcing a Jungle analog.

### 8.1 Chess / Xiangqi `hasLegalMove` composition

```ts
// apps/web/src/lib/chess/game.ts
import { forEachOwnPieceMove, moveLeavesKingInCheck } from '@procyon/game-core';

function hasAnyLegalMoves(state: GameState): boolean {
  const opponent: PieceColor =
    state.currentPlayer === 'white' ? 'black' : 'white';
  let found = false;
  forEachOwnPieceMove<ChessPiece>(
    state.board,
    state.currentPlayer,
    (board, from) => getPossibleMoves(board, getPieceAt(board, from)!, from),
    (from, to) => {
      if (
        !moveLeavesKingInCheck(
          state.board,
          from,
          to,
          b =>
            findPiece(
              b,
              p => p.type === 'king' && p.color === state.currentPlayer,
              CHESS_DIMS
            ),
          (b, pos) => isSquareAttacked(b, pos, opponent),
          () => false // chess missing-king policy
        )
      ) {
        found = true;
        return false; // stop early
      }
      return true;
    },
    CHESS_DIMS
  );
  return found;
}
```

Xiangqi's version is identical modulo color unions (`'red'|'black'`) and its `isSquareAttacked`. ~15 lines per variant, down from ~40.

### 8.2 Shogi `hasAnyLegalMoves` composition

Shogi keeps its full structure (`shogi/game.ts:428-508`) but delegates the copy/apply/check snippet to the shared helpers:

```ts
// apps/web/src/lib/shogi/game.ts — revised structure
function hasAnyLegalMoves(state: ShogiGameState): boolean {
  // Board moves — iterate promotion variants (forced/optional/none) as today,
  // but delegate the actual legality check:
  for (const { from, to, testPiece } of boardMoveVariants(state)) {
    if (
      !shogiBoardMoveLeavesKingInCheck(
        state.board,
        from,
        to,
        testPiece,
        state.currentPlayer
      )
    ) {
      return true;
    }
  }
  // Drop moves — variant-local (piece not on board, shared helper can't apply)
  for (const { pos, piece } of dropMoveCandidates(state)) {
    if (
      !shogiDropLeavesKingInCheck(state.board, pos, piece, state.currentPlayer)
    ) {
      return true;
    }
  }
  return false;
}
```

Where `shogiBoardMoveLeavesKingInCheck` is a thin shogi wrapper around the shared `moveLeavesKingInCheck` (handling the promotion-variant piece substitution before delegating), and `shogiDropLeavesKingInCheck` builds a temp board with the dropped piece placed then calls the shared `isInCheck`. The shogi-specific promotion-variant enumeration (forced/optional/none) stays in `boardMoveVariants`.

### 8.3 Promotion-variant substitution seam

Shogi's promotion logic (forced/optional/none, `shogi/game.ts:440-472`) needs to test the move with a _different piece object_ than the one at `from` on the original board (promoted vs unpromoted). The shared `moveLeavesKingInCheck` reads the piece from `board[from]` internally, so it can't directly substitute a promoted piece. The migration resolves this by having the shogi wrapper perform the substitution on a cloned board first, then delegate to a lower-level shared helper that accepts the post-move board directly:

```ts
// Shared (added alongside moveLeavesKingInCheck for shogi's promotion case)
export function isOwnKingInCheckOnBoard<TPiece>(
  board: GridBoard<TPiece>, // already has the move applied
  findOwnKing: (board: GridBoard<TPiece>) => Position | null,
  isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
  onMissingKing: () => boolean
): boolean;
```

Shogi's wrapper: clone, swap piece at `from` to the promoted variant, apply the move, call `isOwnKingInCheckOnBoard`. `moveLeavesKingInCheck` (§7.1) becomes a thin compose of `copyBoard` + apply + `isOwnKingInCheckOnBoard`, used by chess/xiangqi directly. This keeps the promotion-substitution seam explicit and avoids the shared helper silently mis-reading `board[from]`.

## 9. Coordinate / notation cleanup

`packages/game-core/src/notation.ts`:

```ts
export interface CoordinateScheme {
  files: string[]; // column labels, left-to-right
  ranks: string[]; // row labels, index 0 = first row
}

// Throws on invalid input (out-of-range file/rank, wrong length).
export function notationToPos(scheme: CoordinateScheme, str: string): Position;

// Returns null on invalid input — never throws.
export function tryNotationToPos(
  scheme: CoordinateScheme,
  str: string
): Position | null;

export function posToNotation(scheme: CoordinateScheme, pos: Position): string;
```

- Adopted by **chess** (`a-h` × `8-1`), **xiangqi** (`a-i` × `10-1`), **jungle** (`a-g` × `9-1`). All three share the row-indexed convention.
- **Shogi excluded** — its notation is transposed (files are numbers `9-1`, ranks are letters `a-i`). Forcing it into one scheme adds complexity for no dedup win; shogi keeps its existing helpers.
- Each variant declares its `CoordinateScheme` constant and re-exports `posToNotation`/`notationToPos`/`tryNotationToPos` bound to it.

**Why two functions (P1-4):** chess currently has two `algebraicToPosition` implementations with **different error contracts**:

| Location                 | Contract                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `chess/board.ts:106-122` | **Throws** `Error('Invalid algebraic notation: ...')` on bad input |
| `chess/game.ts:233-245`  | **Returns `null`** on bad input                                    |

Existing callers and tests depend on both behaviors. A single shared `notationToPos` cannot satisfy both contracts without breaking one side. The shared package exports both: `notationToPos` (throws — strict, for internal/validation paths) and `tryNotationToPos` (nullable — for parsing untrusted input). Each chess caller migrates to the function matching its existing contract, preserving behavior.

### 9.1 Chess duplicate `algebraicToPosition` deletion

Delete both chess copies (`chess/game.ts:233-245` AND `chess/board.ts:106-122`) and route every caller through the shared helpers:

- Callers that previously used the **throwing** `board.ts` version → `notationToPos(CHESS_SCHEME, str)` (or a chess-bound alias `algebraicToPositionStrict`).
- Callers that previously used the **nullable** `game.ts` version → `tryNotationToPos(CHESS_SCHEME, str)` (or alias `algebraicToPosition`).

The chess `board.ts` re-exports both under the existing names where possible to minimize call-site churn; tests that asserted the throw behavior stay on the strict version, tests that asserted `null` stay on the nullable version.

## 10. Bug fixes in scope

| #    | Bug                                                                                   | Location                                      | Fix                                                                                                       |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 10.1 | Chess `copyBoard` shallow-clones piece objects (other 3 variants deep-clone)          | `chess/board.ts:95-99`                        | §6.1 shared `copyBoard` uses object-spread (`{ ...piece }`)                                               |
| 10.2 | Duplicate `algebraicToPosition` shadows board's version with different error behavior | `chess/game.ts:233-245` vs `board.ts:106-122` | §9.1 delete both chess copies; route to shared `notationToPos` (throws) and `tryNotationToPos` (nullable) |

## 11. Deletions (estimated)

| Item                                                                      | ~Lines                                        |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `Position` × 4 (chess/xiangqi/shogi/jungle)                               | ~16                                           |
| `GameStatus` × 4                                                          | ~24                                           |
| `Move` / `GameState` shared fields × 4                                    | ~60                                           |
| Board helpers (`isValidPosition`/`getPieceAt`/`setPieceAt`/etc.) × 4      | ~125                                          |
| `isSquareEmpty`/`isSquareOccupiedBy*` × 4 (inlined in xiangqi/jungle)     | ~48                                           |
| Sliding move loops (chess rook/bishop + shogi rook/bishop)                | ~60                                           |
| Stepping move loops (chess king/knight + shogi ×5)                        | ~60                                           |
| `findPiece`/`isInCheck`/`forEachOwnPieceMove`/`moveLeavesKingInCheck` × 3 | ~165                                          |
| Chess duplicate `algebraicToPosition` (both copies)                       | ~25                                           |
| **Total removed**                                                         | **~580**                                      |
| Net new logic                                                             | `@procyon/game-core` (~420 lines incl. tests) |

Net repo delta: approximately −160 LOC, plus two bug fixes and a reusable package boundary for Tier 3 (AI adapters) to build on.

**On the line-count estimates (Nit #9):** all counts are **source LOC removed from `apps/web/src/lib/{variant}/`**, not test LOC. The `~165` for check/legal-move primitives across 3 variants breaks down as: `findPiece`+`isInCheck` ~85, `forEachOwnPieceMove` + `moveLeavesKingInCheck` body ~55 (3 variants × ~18), variant-side `hasLegalMove` thinning ~25. The original issue's ~100-line `hasLegalMove` claim was reduced after code review (P1-3): shogi's `hasAnyLegalMoves` cannot be subsumed by a shared helper (it enumerates promotion variants + drops), so each variant keeps its own `hasLegalMove` composition. The new `@procyon/game-core` adds ~420 lines including its own colocated unit tests + the `notationToPos`/`tryNotationToPos` pair; the net delta reflects shared-package overhead eating into the raw removal.

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

- **Risk: shallow-copy fix changes chess behavior** if any code mutated piece objects in-place after `copyBoard`. **Mitigation:** full chess `*.test.ts` + `*.coverage.test.ts` + `*.extended.test.ts` must pass at commit 3; investigate every failure before proceeding. **Plus a dedicated regression test** (Minor #6) that asserts spread-clone semantics directly — the existing suites don't encode this invariant or the bug would already have failed:

  ```ts
  // packages/game-core/src/board.test.ts
  test('copyBoard spread-clones piece objects (flat shapes)', () => {
    const board: GridBoard<{ color: string; type: string }> = [
      [{ color: 'white', type: 'pawn' }, null],
    ];
    const copy = copyBoard(board);
    // Mutate a piece object on the copy.
    (copy[0]![0] as { color: string }).color = 'black';
    // Original must be unchanged.
    expect(board[0]![0]!.color).toBe('white');
  });

  test('copyBoard throws/returns gracefully on non-flat piece shapes (documented limit)', () => {
    // If a future piece introduces nested data, spread-clone shares the nested ref.
    // This test documents the limit: nested objects are NOT deep-cloned.
    const nested = { meta: { moves: 0 } };
    const board: GridBoard<{ meta: { moves: number } }>[] = [[nested as any]];
    const copy = copyBoard(board as any);
    (copy[0]![0] as any).meta.moves = 5;
    // Shared reference — original IS mutated. Documented behavior.
    expect((board[0]![0] as any).meta.moves).toBe(5);
  });
  ```

  The second test pins the flatness assumption: if someone adds a nested piece property, this test will fail on review (not in CI — it asserts the _current_ limit) and force a conversation about switching to `structuredClone` + adding `lib.dom` or an ambient declaration.

- **Risk: missing-king policy diverges across variants** (P2-1). **Mitigation:** the shared `isInCheck` requires non-null `kingPos` (callers handle absence); `moveLeavesKingInCheck` takes an explicit `onMissingKing: () => boolean` callback. Each variant passes its policy at the call site (chess/xiangqi `() => false`, shogi `() => true`). The chess test `game.coverage.test.ts:119-125` and any shogi missing-king test must both pass against the migrated code.
- **Risk: shogi promotion-variant substitution mis-reads `board[from]`** (P1-3 follow-on). **Mitigation:** §8.3 adds a lower-level `isOwnKingInCheckOnBoard` that accepts a post-move board; shogi's wrapper performs the substitution on a clone then delegates. Chess/xiangqi use the high-level `moveLeavesKingInCheck` directly.
- **Risk: shogi status silently widens if `ShogiGameState` omits the `status` re-declaration** (Medium #1). **Mitigation:** the status-narrowing rule is documented in §5.1; commit-message checklist for the shogi migration commit (§12 step 5) must explicitly call out that `ShogiGameState.status: ShogiGameStatus` is re-declared. TS will not error on widening, so review discipline is the gate.
- **Risk: notation contract regression** (P1-4). **Mitigation:** shared package exports both `notationToPos` (throws) and `tryNotationToPos` (nullable); chess callers migrate to the matching contract. Existing tests asserting throw behavior stay on `notationToPos`; tests asserting `null` stay on `tryNotationToPos`.
- **Risk: jungle terrain accidentally routed through shared `copyBoard`.** **Mitigation:** §6.2 documents that jungle retains a variant-local `copyTerrain` and composes it with the shared piece-board `copyBoard`; the shared helper's signature is `GridBoard<TPiece>` only and won't typecheck if passed a terrain array.
- **Risk: CI doesn't run the new package's tests/lint** (P2-2). **Mitigation:** §4.3 adds a `test-game-core` CI job running `bun run test`/`lint`/`typecheck` filtered to `@procyon/game-core`. Without this, regressions in the shared package slip through until a downstream web test catches them.
- **Risk: generic plumbing (`<TPiece extends { color: string }>`) fights `noUncheckedIndexedAccess`.** **Mitigation:** shared helpers access board cells through `getPieceAt` (which returns `null` for OOB and uses `?.`/`??` internally), never through raw `board[row][col]`. Variant color unions (`'white'|'black'`, `'red'|'black'`, `'sente'|'gote'`, `'red'|'blue'`) all satisfy `string`.
- **Risk: `bindBoard` ergonomics regress call-site readability, or `typeof`-based typing breaks.** **Mitigation:** variants re-export bound helpers from their own `board.ts` under the same names they use today; downstream files import unchanged. The bound helpers' identity is the closure type (§6.2 note); consumers needing the unbound 2-arg form import from `@procyon/game-core` directly.
- **Verification gate per commit:** `bun test` + `bun run lint` + `bun run typecheck` in `packages/game-core`, `bun test src` in `apps/web`, root `bun run typecheck`, root `bun run lint`. No commit lands red. E2E suite (`bun run test:e2e`) runs on the final commit. The `test-game-core` CI job (§4.3) gates every PR after the package lands.
- **Estimate:** ~580 net source LOC removed (per the §11 breakdown), ~+420 in the new package; net ~−160 LOC plus two bug fixes. Lower than the issue's original ~650–750 estimate because P1-3 (shogi `hasLegalMove` non-composability) trims the check/legal-move dedup.
