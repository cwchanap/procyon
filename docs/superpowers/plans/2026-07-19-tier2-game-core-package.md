# Tier 2 — `@procyon/game-core` Shared Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the truly-duplicated structural primitives across chess/xiangqi/shogi/jungle into a new `@procyon/game-core` workspace package, fixing two latent bugs (chess shallow `copyBoard` and duplicate `algebraicToPosition`) as side effects.

**Architecture:** Source-only workspace package (`packages/game-core/`) consumed via `workspace:*`. Shallow generics (`GridBoard<TPiece>`, `BaseMove<TPiece>`). Single PR landing in 13 bisectable commits — each commit leaves the repo green (tests + typecheck + lint). The shared package exposes board primitives, move-generation scaffolds, and the enemy-scan/check shells parameterized by each variant's move generator and attack predicate. Variant-specific rules (castling, drops, terrain, palace, promotion) stay in `apps/web/src/lib/{variant}/`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `moduleResolution: bundler`), Bun 1.3.1 (runtime + test runner), Astro (consumer), ESLint 9 flat config, Turbo monorepo.

**Spec:** `docs/superpowers/2026-07-18-tier2-game-core-package-design.md` (revision 4).

## Global Constraints

- **Package manager:** Bun 1.3.1 only (no npm/yarn/pnpm).
- **Workspace:** `packages/game-core/` consumed via `"@procyon/game-core": "workspace:*"`.
- **TypeScript:** strict, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `noEmit: true`. No DOM lib in `game-core` (`lib: ["ESNext"]` only).
- **Tests:** colocated `*.test.ts` next to source (NOT in `__tests__/` subdirectory). Run via `bun test src` from package root.
- **Lint:** ESLint 9 flat config at repo root; packages inherit.
- **Per-commit gate:** `bun test` + `bun run typecheck` + `bun run lint` must all pass before committing. No commit lands red.
- **No comments** in code unless explaining a non-obvious decision.
- **Conventional commit messages:** `feat(game-core):`, `refactor(chess):`, `chore(packages):`, `docs:`.
- **Piece flatness invariant:** all 4 piece shapes are flat objects (`{type, color, ...}`); `copyBoard` uses object-spread, not `structuredClone`.
- **`from` narrowing rule:** chess/xiangqi/jungle MUST re-declare `Move.from: Position` (non-null); only shogi inherits `Position | null`.
- **Status narrowing rule:** every variant MUST re-declare `status` on its `GameState` extension; shogi narrows to `ShogiGameStatus`.
- **No shared `hasLegalMove`:** each variant keeps its own; shared package exposes only `findPiece`/`isSquareAttacked`/`isInCheck`/`forEachOwnPieceMove`/`moveLeavesKingInCheck`.

---

## File Structure

**New package (`packages/game-core/`):**

| File                   | Responsibility                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`         | Workspace package metadata, `exports` → `./src/index.ts`, scripts                                                                                                                    |
| `tsconfig.json`        | Extends root, `lib: ["ESNext"]`                                                                                                                                                      |
| `README.md`            | One-pager: purpose, scope rule, consumer guide                                                                                                                                       |
| `src/index.ts`         | Barrel export                                                                                                                                                                        |
| `src/types.ts`         | `Position`, `GameStatus`, `BaseMove<T>`, `BaseGameState<T>`, `Direction`, `Dims`, `positionsEqual`, `containsPosition`                                                               |
| `src/board.ts`         | `GridBoard<T>`, `createEmptyBoard`, `isValidPosition`, `getPieceAt`, `setPieceAt`, `copyBoard`, `isSquareEmpty`, `isSquareOccupiedByOpponent`, `isSquareOccupiedByAlly`, `bindBoard` |
| `src/board.test.ts`    | Unit tests for board primitives                                                                                                                                                      |
| `src/moves.ts`         | `slidingMoves`, `steppingMoves`, `moveLeavesKingInCheck`, `isOwnKingInCheckOnBoard`                                                                                                  |
| `src/moves.test.ts`    | Unit tests for move primitives                                                                                                                                                       |
| `src/check.ts`         | `findPiece`, `isSquareAttacked`, `isInCheck`, `forEachOwnPieceMove`                                                                                                                  |
| `src/check.test.ts`    | Unit tests for check primitives                                                                                                                                                      |
| `src/notation.ts`      | `CoordinateScheme`, `posToNotation`, `notationToPos`, `tryNotationToPos`                                                                                                             |
| `src/notation.test.ts` | Unit tests for notation                                                                                                                                                              |

**Modified files (per variant):**

| Variant | Files touched                                 |
| ------- | --------------------------------------------- |
| Chess   | `types.ts`, `board.ts`, `moves.ts`, `game.ts` |
| Xiangqi | `types.ts`, `board.ts`, `game.ts`, `moves.ts` |
| Shogi   | `types.ts`, `board.ts`, `game.ts`, `moves.ts` |
| Jungle  | `types.ts`, `board.ts`, `game.ts`             |

**Repo-level:**

| File                               | Change                                    |
| ---------------------------------- | ----------------------------------------- |
| `package.json` (root)              | No change (workspaces already configured) |
| `apps/web/package.json`            | Add `@procyon/game-core` dependency       |
| `.github/workflows/unit-tests.yml` | Add `test-game-core` job                  |
| `AGENTS.md`                        | Document shared package                   |

---

## Task 1: Scaffold `@procyon/game-core` package

**Goal:** Create the empty workspace package, wire it into the monorepo, verify the workspace resolves it. No behavior change yet.

**Files:**

- Create: `packages/game-core/package.json`
- Create: `packages/game-core/tsconfig.json`
- Create: `packages/game-core/README.md`
- Create: `packages/game-core/src/index.ts`
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/unit-tests.yml`

**Interfaces:**

- Produces: an importable `@procyon/game-core` workspace package with an empty barrel.

- [ ] **Step 1: Create `packages/game-core/package.json`**

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

- [ ] **Step 2: Create `packages/game-core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "lib": ["ESNext"] },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/game-core/src/index.ts`**

```ts
// Barrel export for @procyon/game-core.
// Modules added in subsequent tasks.
export {};
```

- [ ] **Step 4: Create `packages/game-core/README.md`**

```markdown
# @procyon/game-core

Shared structural primitives for the chess/xiangqi/shogi/jungle engines.

**Scope rule:** share the scaffold, specialize the rules. Generic piece-movement primitives (sliding/stepping offsets), board helpers parameterized by `Dims`, the `isSquareAttacked` enemy-scan scaffold, and the `moveLeavesKingInCheck` copy/apply/test shell live here. Variant-specific rules (castling, cannon screens, shogi drops/nifu/uchifuzume, jungle terrain) AND variant-specific compositions (`hasLegalMove`/`hasAnyLegalMoves`) stay in `apps/web/src/lib/{variant}/`.

See `docs/superpowers/2026-07-18-tier2-game-core-package-design.md` for full design.
```

- [ ] **Step 5: Add dependency to `apps/web/package.json`**

In `apps/web/package.json`, add to `dependencies` (alphabetical):

```json
"@procyon/game-core": "workspace:*",
```

Then run from repo root:

```bash
bun install
```

Expected: `bun install` resolves the workspace package; `packages/game-core/` is linked into `node_modules/@procyon/game-core`.

- [ ] **Step 6: Verify import resolves**

Create a temporary sanity check in `apps/web/src/lib/chess/board.ts` (will be reverted before commit):

```bash
cd apps/web
echo 'import "@procyon/game-core";' > /tmp/sanity.ts
bun build /tmp/sanity.ts --outfile /dev/null
```

Expected: builds without "cannot resolve" errors. If it fails, verify `packages/game-core/package.json` `exports` field and that `bun install` ran.

Remove the sanity file: `rm /tmp/sanity.ts`.

- [ ] **Step 7: Add CI job for `game-core`**

In `.github/workflows/unit-tests.yml`, add a third job after `test-api`:

```yaml
test-game-core:
  runs-on: ubuntu-latest
  permissions:
    contents: read
    actions: read
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup Bun
      uses: oven-sh/setup-bun@v1
      with:
        bun-version: '1.3.1'

    - name: Cache Bun dependencies
      uses: actions/cache@v4
      with:
        path: ~/.bun/install/cache
        key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
        restore-keys: |
          ${{ runner.os }}-bun-

    - name: Install dependencies
      run: bun install

    - name: Unit tests (game-core)
      run: bun run test --filter=@procyon/game-core

    - name: Lint (game-core)
      run: bun run lint --filter=@procyon/game-core

    - name: Typecheck (game-core)
      run: bun run typecheck --filter=@procyon/game-core
```

- [ ] **Step 8: Run full verification gate**

```bash
cd packages/game-core && bun test && bun run typecheck && bun run lint
```

Expected: tests pass (0 tests, since barrel is empty), typecheck clean, lint clean.

Then from repo root:

```bash
bun run typecheck && bun run lint
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/game-core apps/web/package.json .github/workflows/unit-tests.yml
git commit -m "chore(packages): scaffold @procyon/game-core workspace package

Empty source-only workspace package consumed via workspace:*.
- packages/game-core/ with package.json (exports ./src/index.ts), tsconfig (ESNext only)
- apps/web adds @procyon/game-core dependency
- CI adds test-game-core job (test + lint + typecheck)"
```

---

## Task 2: Add shared types + `GridBoard` primitives

**Goal:** Implement `Position`/`BaseMove`/`BaseGameState`/`GameStatus`/`Dims`/`Direction` types and the full `GridBoard` helper API with TDD. No consumers yet.

**Files:**

- Create: `packages/game-core/src/types.ts`
- Create: `packages/game-core/src/board.ts`
- Create: `packages/game-core/src/board.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**

- Produces: `Position`, `GameStatus`, `BaseMove<T>`, `BaseGameState<T>`, `Direction`, `Dims`, `positionsEqual`, `containsPosition`, `GridBoard<T>`, `createEmptyBoard`, `isValidPosition`, `getPieceAt`, `setPieceAt`, `copyBoard`, `isSquareEmpty`, `isSquareOccupiedByOpponent`, `isSquareOccupiedByAlly`, `bindBoard`.

- [ ] **Step 1: Write failing tests for `types.ts`**

Create `packages/game-core/src/types.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { positionsEqual, containsPosition } from './types';

describe('positionsEqual', () => {
  test('returns true for identical positions', () => {
    expect(positionsEqual({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
  });
  test('returns false for different positions', () => {
    expect(positionsEqual({ row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false);
    expect(positionsEqual({ row: 0, col: 2 }, { row: 1, col: 2 })).toBe(false);
  });
});

describe('containsPosition', () => {
  test('returns true when position is in list', () => {
    expect(
      containsPosition(
        [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ],
        { row: 1, col: 1 }
      )
    ).toBe(true);
  });
  test('returns false when position is not in list', () => {
    expect(containsPosition([{ row: 0, col: 0 }], { row: 1, col: 1 })).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/game-core && bun test src/types.test.ts
```

Expected: FAIL with `Cannot find module './types'` or similar.

- [ ] **Step 3: Implement `types.ts`**

Create `packages/game-core/src/types.ts`:

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
  from: Position | null;
  to: Position;
  piece: TPiece;
  capturedPiece?: TPiece;
}

export interface BaseGameState<TPiece> {
  board: (TPiece | null)[][];
  currentPlayer: string;
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

export function positionsEqual(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function containsPosition(list: Position[], pos: Position): boolean {
  return list.some(p => p.row === pos.row && p.col === pos.col);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/game-core && bun test src/types.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Write failing tests for `board.ts`**

Create `packages/game-core/src/board.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  bindBoard,
  copyBoard,
  createEmptyBoard,
  getPieceAt,
  isSquareEmpty,
  isSquareOccupiedByAlly,
  isSquareOccupiedByOpponent,
  isValidPosition,
  setPieceAt,
} from './board';
import type { GridBoard } from './board';

interface Piece {
  color: string;
  type: string;
}
const DIMS = { rows: 8, cols: 8 };

describe('createEmptyBoard', () => {
  test('creates an 8x8 grid of nulls', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    expect(board.length).toBe(8);
    expect(board[0]!.length).toBe(8);
    expect(board[3]![5]).toBeNull();
  });
});

describe('isValidPosition', () => {
  test('in-bounds returns true', () => {
    expect(isValidPosition({ row: 0, col: 0 }, DIMS)).toBe(true);
    expect(isValidPosition({ row: 7, col: 7 }, DIMS)).toBe(true);
  });
  test('out-of-bounds returns false', () => {
    expect(isValidPosition({ row: -1, col: 0 }, DIMS)).toBe(false);
    expect(isValidPosition({ row: 0, col: 8 }, DIMS)).toBe(false);
    expect(isValidPosition({ row: 8, col: 0 }, DIMS)).toBe(false);
  });
});

describe('getPieceAt / setPieceAt', () => {
  test('set then get round-trips', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    const piece: Piece = { color: 'white', type: 'pawn' };
    setPieceAt(board, { row: 1, col: 2 }, piece, DIMS);
    expect(getPieceAt(board, { row: 1, col: 2 }, DIMS)).toEqual(piece);
  });
  test('OOB set is a no-op, OOB get returns null', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 99, col: 0 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    expect(getPieceAt(board, { row: 99, col: 0 }, DIMS)).toBeNull();
  });
});

describe('isSquareEmpty / isSquareOccupiedByOpponent / isSquareOccupiedByAlly', () => {
  test('empty square', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    expect(isSquareEmpty(board, { row: 0, col: 0 }, DIMS)).toBe(true);
    expect(
      isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(false);
    expect(
      isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(false);
  });
  test('opponent piece', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'black', type: 'pawn' },
      DIMS
    );
    expect(isSquareEmpty(board, { row: 0, col: 0 }, DIMS)).toBe(false);
    expect(
      isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(true);
    expect(
      isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(false);
  });
  test('ally piece', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    expect(
      isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(false);
    expect(
      isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'white', DIMS)
    ).toBe(true);
  });
});

describe('copyBoard', () => {
  test('spread-clones piece objects (flat shapes)', () => {
    const board: GridBoard<Piece> = [[{ color: 'white', type: 'pawn' }, null]];
    const copy = copyBoard(board);
    copy[0]![0]!.color = 'black';
    expect(board[0]![0]!.color).toBe('white');
  });

  test('does NOT deep-clone nested piece properties (documented limit)', () => {
    interface PieceWithMeta {
      color: string;
      type: string;
      meta: { moves: number };
    }
    const original: PieceWithMeta = {
      color: 'white',
      type: 'pawn',
      meta: { moves: 0 },
    };
    const board: GridBoard<PieceWithMeta> = [[original, null]];
    const copy = copyBoard(board);
    copy[0]![0]!.meta.moves = 5;
    expect(original.meta.moves).toBe(5);
    copy[0]![0]!.color = 'black';
    expect(original.color).toBe('white');
  });
});

describe('bindBoard', () => {
  test('bound helpers behave like unbound helpers', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    const bound = bindBoard<Piece>(DIMS);
    expect(bound.isValidPosition({ row: 0, col: 0 })).toBe(true);
    bound.setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'pawn' }
    );
    expect(bound.getPieceAt(board, { row: 0, col: 0 })?.color).toBe('white');
    expect(bound.isSquareEmpty(board, { row: 1, col: 1 })).toBe(true);
    expect(
      bound.isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'white')
    ).toBe(true);
    expect(
      bound.isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'black')
    ).toBe(true);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd packages/game-core && bun test src/board.test.ts
```

Expected: FAIL (`Cannot find module './board'`).

- [ ] **Step 7: Implement `board.ts`**

Create `packages/game-core/src/board.ts`:

```ts
import {
  containsPosition,
  positionsEqual,
  type Dims,
  type Position,
} from './types';

export type GridBoard<TPiece> = (TPiece | null)[][];

export function createEmptyBoard<TPiece>(
  rows: number,
  cols: number
): GridBoard<TPiece> {
  return Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(null));
}

export function isValidPosition(pos: Position, dims: Dims): boolean {
  return (
    pos.row >= 0 && pos.row < dims.rows && pos.col >= 0 && pos.col < dims.cols
  );
}

export function getPieceAt<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  dims: Dims
): TPiece | null {
  if (!isValidPosition(pos, dims)) return null;
  return board[pos.row]?.[pos.col] ?? null;
}

export function setPieceAt<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  piece: TPiece | null,
  dims: Dims
): void {
  if (!isValidPosition(pos, dims)) return;
  const row = board[pos.row];
  if (row) {
    row[pos.col] = piece;
  }
}

export function copyBoard<TPiece extends { color: string }>(
  board: GridBoard<TPiece>
): GridBoard<TPiece> {
  return board.map(row =>
    row.map(piece => (piece === null ? null : { ...piece }))
  );
}

export function isSquareEmpty<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  dims: Dims
): boolean {
  return getPieceAt(board, pos, dims) === null;
}

export function isSquareOccupiedByOpponent<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  pos: Position,
  color: string,
  dims: Dims
): boolean {
  const piece = getPieceAt(board, pos, dims);
  return piece !== null && piece.color !== color;
}

export function isSquareOccupiedByAlly<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  pos: Position,
  color: string,
  dims: Dims
): boolean {
  const piece = getPieceAt(board, pos, dims);
  return piece !== null && piece.color === color;
}

// Dimension-binding helper. Implementation returns an object literal with
// arrow-function properties (NOT method shorthand) — matches the declared
// return type exactly and avoids method-vs-property this-binding divergences.
export function bindBoard<TPiece extends { color: string }>(
  dims: Dims
): {
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
} {
  return {
    isValidPosition: pos => isValidPosition(pos, dims),
    getPieceAt: (board, pos) => getPieceAt(board, pos, dims),
    setPieceAt: (board, pos, piece) => setPieceAt(board, pos, piece, dims),
    isSquareEmpty: (board, pos) => isSquareEmpty(board, pos, dims),
    isSquareOccupiedByOpponent: (board, pos, color) =>
      isSquareOccupiedByOpponent(board, pos, color, dims),
    isSquareOccupiedByAlly: (board, pos, color) =>
      isSquareOccupiedByAlly(board, pos, color, dims),
  };
}

// Re-export position helpers for consumers importing from board.ts.
export { containsPosition, positionsEqual };
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd packages/game-core && bun test src/board.test.ts
```

Expected: PASS (all board tests).

- [ ] **Step 9: Update barrel `src/index.ts`**

```ts
export * from './types';
export * from './board';
```

- [ ] **Step 10: Run full package gate**

```bash
cd packages/game-core && bun test && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add packages/game-core/src
git commit -m "feat(game-core): add shared types and GridBoard primitives

- types.ts: Position, GameStatus, BaseMove<T>, BaseGameState<T>,
  Direction, Dims, positionsEqual, containsPosition
- board.ts: GridBoard<T>, createEmptyBoard, isValidPosition, getPieceAt,
  setPieceAt, copyBoard (spread-clone, constrained to { color: string }),
  isSquareEmpty/ByOpponent/ByAlly, bindBoard
- Full unit test coverage including the spread-clone deep-semantics test"
```

---

## Task 3: Migrate chess to consume `game-core` board primitives (fixes shallow-copy bug)

**Goal:** Replace chess's duplicated `Position`/board helpers with imports from `@procyon/game-core`. Re-declare `Move.from: Position` (non-null). Fix the shallow-copy bug via shared `copyBoard`.

**Files:**

- Modify: `apps/web/src/lib/chess/types.ts`
- Modify: `apps/web/src/lib/chess/board.ts`
- Test: existing `apps/web/src/lib/chess/board.test.ts`, `game.test.ts`, `*.coverage.test.ts`, `*.extended.test.ts`

**Interfaces:**

- Consumes: `Position`, `bindBoard`, `copyBoard`, `BaseMove`, `BaseGameState`, `GameStatus` from `@procyon/game-core`.
- Produces: chess `types.ts` exports `Position` (alias of shared), chess `Move extends BaseMove<ChessPiece>` with `from: Position` non-null, chess `board.ts` re-exports bound helpers.

- [ ] **Step 1: Baseline existing chess tests**

```bash
cd apps/web && bun test src/lib/chess/
```

Expected: all green. Record the pass count for after-migration comparison.

- [ ] **Step 2: Migrate `chess/types.ts`**

Edit `apps/web/src/lib/chess/types.ts` — replace the local `Position` definition with a re-export, and have `Move` extend `BaseMove`:

```ts
import type {
  BaseGameState,
  BaseMove,
  GameStatus as SharedGameStatus,
  Position as GameCorePosition,
} from '@procyon/game-core';

export type Position = GameCorePosition;
export type GameStatus = SharedGameStatus;

export type PieceType =
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn';
export type PieceColor = 'white' | 'black';

export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export interface Move extends BaseMove<ChessPiece> {
  from: Position;
  to: Position;
  isEnPassant?: boolean;
  isCastling?: boolean;
  promotion?: PieceType;
}

export type GameMode = 'human-vs-human' | 'human-vs-ai';

export interface GameState extends BaseGameState<ChessPiece> {
  status: GameStatus;
  currentPlayer: PieceColor;
  moveHistory: Move[];
  mode: GameMode;
  aiPlayer?: PieceColor;
  isAiThinking?: boolean;
}

export const BOARD_SIZE = 8;
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
```

- [ ] **Step 3: Migrate `chess/board.ts`**

Replace the local `isValidPosition`/`getPieceAt`/`setPieceAt`/`isSquareEmpty`/`isSquareOccupiedByOpponent`/`isSquareOccupiedByAlly`/`copyBoard` with the bound shared helpers. Keep `getRow`/`createInitialBoard`/`positionToAlgebraic`/`algebraicToPosition` variant-local for now (notation migrates in Task 12):

```ts
import { bindBoard, copyBoard as sharedCopyBoard } from '@procyon/game-core';
import type { ChessPiece, PieceColor, PieceType, Position } from './types';
import { BOARD_SIZE } from './types';

export { copyBoard } from '@procyon/game-core';

const bound = bindBoard<ChessPiece>({
  rows: BOARD_SIZE,
  cols: BOARD_SIZE,
});
export const isValidPosition = bound.isValidPosition;
export const getPieceAt = bound.getPieceAt;
export const setPieceAt = bound.setPieceAt;
export const isSquareEmpty = bound.isSquareEmpty;
export const isSquareOccupiedByOpponent = bound.isSquareOccupiedByOpponent;
export const isSquareOccupiedByAlly = bound.isSquareOccupiedByAlly;

export function getRow(
  board: (ChessPiece | null)[][],
  row: number
): (ChessPiece | null)[] {
  const r = board[row];
  if (!r) throw new Error(`Chess board row ${row} is missing`);
  return r;
}

export function createInitialBoard(): (ChessPiece | null)[][] {
  const board: (ChessPiece | null)[][] = Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(null));

  for (let col = 0; col < BOARD_SIZE; col++) {
    getRow(board, 1)[col] = { type: 'pawn', color: 'black' };
    getRow(board, 6)[col] = { type: 'pawn', color: 'white' };
  }

  const pieceOrder: PieceType[] = [
    'rook',
    'knight',
    'bishop',
    'queen',
    'king',
    'bishop',
    'knight',
    'rook',
  ];

  for (let col = 0; col < BOARD_SIZE; col++) {
    getRow(board, 0)[col] = { type: pieceOrder[col]!, color: 'black' };
    getRow(board, 7)[col] = { type: pieceOrder[col]!, color: 'white' };
  }

  return board;
}

export function positionToAlgebraic(pos: Position): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return `${files[pos.col]}${8 - pos.row}`;
}

export function algebraicToPosition(algebraic: string): Position {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const file = algebraic[0];
  const rank = algebraic[1];

  if (!file || !rank) {
    throw new Error(`Invalid algebraic notation: ${algebraic}`);
  }

  const col = files.indexOf(file);
  const row = 8 - parseInt(rank);

  if (col === -1 || isNaN(row)) {
    throw new Error(`Invalid algebraic notation: ${algebraic}`);
  }

  return { row, col };
}
```

- [ ] **Step 4: Run chess tests**

```bash
cd apps/web && bun test src/lib/chess/
```

Expected: all green. The shared `copyBoard` now spread-clones piece objects; if any chess test fails, investigate — it means code relied on shared piece-object references after `copyBoard` (the bug). Fix by making the chess code stop mutating piece objects in place.

- [ ] **Step 5: Run full typecheck + lint**

```bash
cd apps/web && bun run typecheck && bun run lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/chess
git commit -m "refactor(chess): consume game-core board primitives

- types.ts: Position aliases game-core Position; Move extends BaseMove
  with from: Position (non-null narrowing); GameState extends BaseGameState
- board.ts: isValidPosition/getPieceAt/setPieceAt/isSquare*/copyBoard
  now sourced from bindBoard + game-core copyBoard
- Fixes the shallow-copyBoard bug: piece objects were shared between
  original and copy via [...row]; now spread-cloned per cell.
- Variant-local: getRow, createInitialBoard, positionToAlgebraic,
  algebraicToPosition (notation migrates in a later commit)"
```

---

## Task 4: Migrate xiangqi board primitives

**Goal:** Same migration as chess, for xiangqi. Xiangqi `copyBoard` already deep-clones, so no behavior change expected.

**Files:**

- Modify: `apps/web/src/lib/xiangqi/types.ts`
- Modify: `apps/web/src/lib/xiangqi/board.ts`
- Test: existing `apps/web/src/lib/xiangqi/*.test.ts`

**Interfaces:**

- Produces: `XiangqiPosition = Position` (alias), `XiangqiMove extends BaseMove<XiangqiPiece>` with `from: Position` non-null.

- [ ] **Step 1: Baseline existing xiangqi tests**

```bash
cd apps/web && bun test src/lib/xiangqi/
```

Expected: all green.

- [ ] **Step 2: Migrate `xiangqi/types.ts`**

Edit the `Position` and `Move` definitions at the top of `apps/web/src/lib/xiangqi/types.ts`:

```ts
import type {
  BaseGameState,
  BaseMove,
  GameStatus as SharedGameStatus,
  Position as GameCorePosition,
} from '@procyon/game-core';

export type XiangqiPosition = GameCorePosition;
export type XiangqiGameStatus = SharedGameStatus;

// ... (XiangqiPieceType, XiangqiPieceColor, XiangqiPiece unchanged)

export interface XiangqiMove extends BaseMove<XiangqiPiece> {
  from: XiangqiPosition;
  to: XiangqiPosition;
}

export interface XiangqiGameState extends BaseGameState<XiangqiPiece> {
  status: XiangqiGameStatus;
  currentPlayer: XiangqiPieceColor;
  moveHistory: XiangqiMove[];
}
```

Leave all palace/river/symbol/file/rank constants unchanged.

- [ ] **Step 3: Migrate `xiangqi/board.ts`**

Replace local `isValidPosition`/`getPieceAt`/`setPieceAt`/`isSquareEmpty`/etc./`copyBoard` (if present) with the bound shared helpers. Keep `getRow`/`createInitialXiangqiBoard`/`isInPalace`/`isOnSameSideOfRiver`/`hasCrossedRiver` variant-local:

```ts
import { bindBoard } from '@procyon/game-core';
import type { XiangqiPiece, XiangqiPieceColor, XiangqiPosition } from './types';
import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  PALACE_COLS,
  PALACE_ROWS,
  RIVER_ROW,
} from './types';

export { copyBoard } from '@procyon/game-core';

const bound = bindBoard<XiangqiPiece>({
  rows: XIANGQI_ROWS,
  cols: XIANGQI_COLS,
});
export const isValidPosition = bound.isValidPosition;
export const getPieceAt = bound.getPieceAt;
export const setPieceAt = bound.setPieceAt;
export const isSquareEmpty = bound.isSquareEmpty;
export const isSquareOccupiedByOpponent = bound.isSquareOccupiedByOpponent;
export const isSquareOccupiedByAlly = bound.isSquareOccupiedByAlly;

// getRow, createInitialXiangqiBoard, isInPalace, isOnSameSideOfRiver,
// hasCrossedRiver — keep their existing implementations unchanged.
```

(Delete the now-duplicate local `copyBoard`, `isSquareEmpty`/`isSquareOccupiedBy*` if they exist in xiangqi/board.ts — they do per the design survey.)

- [ ] **Step 4: Run xiangqi tests + typecheck + lint**

```bash
cd apps/web && bun test src/lib/xiangqi/ && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/xiangqi
git commit -m "refactor(xiangqi): consume game-core board primitives

- types.ts: XiangqiPosition aliases game-core Position; XiangqiMove
  extends BaseMove with from: Position (non-null); XiangqiGameState
  extends BaseGameState with status re-declared
- board.ts: isValidPosition/getPieceAt/setPieceAt/isSquare*/copyBoard
  sourced from bindBoard + game-core copyBoard
- Variant-local: getRow, createInitialXiangqiBoard, palace/river helpers"
```

---

## Task 5: Migrate shogi board primitives

**Goal:** Same migration for shogi. Shogi inherits `BaseMove.from: Position | null` (for drops) — no narrowing. Status narrows to `ShogiGameStatus`.

**Files:**

- Modify: `apps/web/src/lib/shogi/types.ts`
- Modify: `apps/web/src/lib/shogi/board.ts`
- Test: existing `apps/web/src/lib/shogi/*.test.ts`

**Interfaces:**

- Produces: `ShogiPosition = Position`, `ShogiMove extends BaseMove<ShogiPiece>` (inherits nullable `from`), `ShogiGameState extends BaseGameState<ShogiPiece>` with `status: ShogiGameStatus`.

- [ ] **Step 1: Baseline existing shogi tests**

```bash
cd apps/web && bun test src/lib/shogi/
```

Expected: all green.

- [ ] **Step 2: Migrate `shogi/types.ts`**

Edit `apps/web/src/lib/shogi/types.ts` — replace local `ShogiPosition`/`ShogiMove`/`ShogiGameState`:

```ts
import type {
  BaseGameState,
  BaseMove,
  Position as GameCorePosition,
} from '@procyon/game-core';

export type ShogiPosition = GameCorePosition;

export type ShogiGameStatus = 'playing' | 'check' | 'checkmate' | 'draw';

// ... (ShogiPieceType, ShogiPieceColor, ShogiPiece unchanged)

export interface ShogiMove extends BaseMove<ShogiPiece> {
  // from: ShogiPosition | null inherited from BaseMove (shogi uses null for drops)
  isPromotion?: boolean;
  isDrop?: boolean;
}

export interface ShogiGameState extends BaseGameState<ShogiPiece> {
  status: ShogiGameStatus;
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

export const SHOGI_BOARD_SIZE = 9;
// ... (rest unchanged: SHOGI_FILES, SHOGI_RANKS, PIECE_UNICODE, etc.)
```

- [ ] **Step 3: Migrate `shogi/board.ts`**

Same pattern as chess/xiangqi. Replace local `isValidPosition`/`getPieceAt`/`setPieceAt`/`isSquare*`/`copyBoard` with bound shared helpers. Keep `getRow`/`createInitialShogiBoard` variant-local.

- [ ] **Step 4: Run shogi tests + typecheck + lint**

```bash
cd apps/web && bun test src/lib/shogi/ && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/shogi
git commit -m "refactor(shogi): consume game-core board primitives

- types.ts: ShogiPosition aliases game-core Position; ShogiMove extends
  BaseMove (inherits from: Position | null for drops); ShogiGameState
  extends BaseGameState with status: ShogiGameStatus (narrows base,
  drops 'stalemate' which shogi doesn't produce)
- board.ts: helpers sourced from bindBoard + game-core copyBoard"
```

---

## Task 6: Migrate jungle board primitives + `copyTerrain`

**Goal:** Same migration for jungle. Jungle additionally keeps a variant-local `copyTerrain` for its `terrain: JungleTerrain[][]` (which the shared `copyBoard` constraint correctly rejects).

**Files:**

- Modify: `apps/web/src/lib/jungle/types.ts`
- Modify: `apps/web/src/lib/jungle/board.ts`
- Test: existing `apps/web/src/lib/jungle/*.test.ts`

**Interfaces:**

- Produces: `JunglePosition = Position`, `JungleMove extends BaseMove<JunglePiece>` with `from: Position` non-null, `JungleGameState extends BaseGameState<JunglePiece>`, variant-local `copyTerrain`.

- [ ] **Step 1: Baseline existing jungle tests**

```bash
cd apps/web && bun test src/lib/jungle/
```

Expected: all green.

- [ ] **Step 2: Migrate `jungle/types.ts`**

```ts
import type {
  BaseGameState,
  BaseMove,
  GameStatus as SharedGameStatus,
  Position as GameCorePosition,
} from '@procyon/game-core';

export type JunglePosition = GameCorePosition;
export type JungleGameStatus = SharedGameStatus;

// ... (JunglePieceType, JunglePieceColor, JunglePiece unchanged)

export interface JungleMove extends BaseMove<JunglePiece> {
  from: JunglePosition;
  to: JunglePosition;
}

export interface JungleGameState extends BaseGameState<JunglePiece> {
  status: JungleGameStatus;
  currentPlayer: JunglePieceColor;
  moveHistory: JungleMove[];
  terrain: JungleTerrain[][];
}

// ... (rest unchanged)
```

- [ ] **Step 3: Migrate `jungle/board.ts` + add `copyTerrain`**

Replace local board helpers with bound shared ones. Add variant-local `copyTerrain`:

```ts
import { bindBoard } from '@procyon/game-core';
import type { JunglePiece, JunglePosition, JungleTerrain } from './types';
import { JUNGLE_COLS, JUNGLE_ROWS } from './types';

export { copyBoard } from '@procyon/game-core';

const bound = bindBoard<JunglePiece>({
  rows: JUNGLE_ROWS,
  cols: JUNGLE_COLS,
});
export const isValidPosition = bound.isValidPosition;
export const getPieceAt = bound.getPieceAt;
export const setPieceAt = bound.setPieceAt;
export const isSquareEmpty = bound.isSquareEmpty;
export const isSquareOccupiedByOpponent = bound.isSquareOccupiedByOpponent;
export const isSquareOccupiedByAlly = bound.isSquareOccupiedByAlly;

// JungleTerrain lacks `color` — it cannot be passed to the shared copyBoard
// (compile-time error from the <TPiece extends { color: string }> constraint).
// copyTerrain is variant-local and deep-clones via manual map+spread.
export function copyTerrain(terrain: JungleTerrain[][]): JungleTerrain[][] {
  return terrain.map(row => row.map(cell => ({ ...cell })));
}

// getRow, createInitialJungleBoard — keep their existing implementations.
```

If jungle currently uses a local `copyBoard`-equivalent for terrain, route it through `copyTerrain`. Search for `terrain.map` / `[...terrain` usages and update.

- [ ] **Step 4: Verify the type-level boundary rejects terrain through `copyBoard`**

Add a temporary negative check (do NOT commit — verify in editor only):

```ts
// In any jungle file, temporarily try:
// copyBoard(state.terrain);
// TS should error: Type 'JungleTerrain' does not satisfy the constraint '{ color: string }'.
```

Expected: TS error confirming the boundary works. Remove the temporary check.

- [ ] **Step 5: Run jungle tests + typecheck + lint**

```bash
cd apps/web && bun test src/lib/jungle/ && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/jungle
git commit -m "refactor(jungle): consume game-core board primitives + local copyTerrain

- types.ts: JunglePosition aliases game-core Position; JungleMove extends
  BaseMove with from: Position (non-null); JungleGameState extends
  BaseGameState with status re-declared and terrain field kept
- board.ts: piece-board helpers sourced from bindBoard + game-core copyBoard;
  new variant-local copyTerrain deep-clones JungleTerrain[][] manually
  (the shared copyBoard constraint rejects terrain at compile time)"
```

---

## Task 7: Add `slidingMoves` + `steppingMoves` + `moveLeavesKingInCheck`

**Goal:** Implement the move-generation primitives with TDD. `moveLeavesKingInCheck` includes the lower-level `isOwnKingInCheckOnBoard` (for shogi's promotion-variant substitution seam).

**Files:**

- Create: `packages/game-core/src/moves.ts`
- Create: `packages/game-core/src/moves.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**

- Consumes: `GridBoard`, `Position`, `Direction`, `Dims`, `copyBoard`, `isSquareEmpty`, `isSquareOccupiedByOpponent` from `./board` and `./types`.
- Produces: `slidingMoves`, `steppingMoves`, `moveLeavesKingInCheck`, `isOwnKingInCheckOnBoard`.

- [ ] **Step 1: Write failing tests for `moves.ts`**

Create `packages/game-core/src/moves.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  isOwnKingInCheckOnBoard,
  moveLeavesKingInCheck,
  slidingMoves,
  steppingMoves,
} from './moves';
import { createEmptyBoard, setPieceAt } from './board';
import type { GridBoard } from './board';

interface Piece {
  color: string;
  type: string;
}
const DIMS = { rows: 8, cols: 8 };

describe('slidingMoves', () => {
  test('rook-like piece generates horizontal and vertical moves', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 3, col: 3 },
      { color: 'white', type: 'rook' },
      DIMS
    );
    const moves = slidingMoves(
      board,
      { row: 3, col: 3 },
      'white',
      [
        { row: 0, col: 1 },
        { row: 0, col: -1 },
        { row: 1, col: 0 },
        { row: -1, col: 0 },
      ],
      8,
      DIMS
    );
    // Rook on empty 8x8 from d4 has 14 reachable squares.
    expect(moves.length).toBe(14);
  });

  test('rook-like piece stops at first opponent piece and includes it', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 3, col: 3 },
      { color: 'white', type: 'rook' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 3, col: 5 },
      { color: 'black', type: 'pawn' },
      DIMS
    );
    const moves = slidingMoves(
      board,
      { row: 3, col: 3 },
      'white',
      [{ row: 0, col: 1 }],
      8,
      DIMS
    );
    expect(moves).toEqual([
      { row: 3, col: 4 },
      { row: 3, col: 5 },
    ]);
  });

  test('rook-like piece stops at first ally piece and excludes it', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 3, col: 3 },
      { color: 'white', type: 'rook' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 3, col: 5 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    const moves = slidingMoves(
      board,
      { row: 3, col: 3 },
      'white',
      [{ row: 0, col: 1 }],
      8,
      DIMS
    );
    expect(moves).toEqual([{ row: 3, col: 4 }]);
  });
});

describe('steppingMoves', () => {
  test('king-like offsets produce 8 moves on an empty board center', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 4, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    const moves = steppingMoves(
      board,
      { row: 4, col: 4 },
      'white',
      [
        { row: -1, col: -1 },
        { row: -1, col: 0 },
        { row: -1, col: 1 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
        { row: 1, col: -1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
      ],
      DIMS
    );
    expect(moves.length).toBe(8);
  });

  test('ally square is excluded, opponent square is included', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 4, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 3, col: 4 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 5, col: 4 },
      { color: 'black', type: 'pawn' },
      DIMS
    );
    const moves = steppingMoves(
      board,
      { row: 4, col: 4 },
      'white',
      [
        { row: -1, col: 0 },
        { row: 1, col: 0 },
      ],
      DIMS
    );
    expect(moves).toEqual([{ row: 5, col: 4 }]);
  });
});

describe('moveLeavesKingInCheck', () => {
  test('returns false when move is safe', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 7, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 6, col: 4 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    const leaves = moveLeavesKingInCheck<Piece>(
      board,
      { row: 6, col: 4 },
      { row: 5, col: 4 },
      b => findKing(b, 'white'),
      () => false, // nothing attacks
      () => false // missing-king policy
    );
    expect(leaves).toBe(false);
  });

  test('returns true when moving the piece exposes the king', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 7, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 6, col: 4 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 1, col: 4 },
      { color: 'black', type: 'rook' },
      DIMS
    );
    const leaves = moveLeavesKingInCheck<Piece>(
      board,
      { row: 6, col: 4 },
      { row: 5, col: 3 }, // pawn moves away from the file
      b => findKing(b, 'white'),
      (b, pos) => isAttackedByRook(b, pos, 'black'),
      () => false
    );
    expect(leaves).toBe(true);
  });

  test('onMissingKing callback is invoked when king absent after move', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    const leaves = moveLeavesKingInCheck<Piece>(
      board,
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      () => null, // king never found
      () => false,
      () => true // missing-king policy: treated as in-check
    );
    expect(leaves).toBe(true);
  });
});

describe('isOwnKingInCheckOnBoard', () => {
  test('checks the post-move board directly', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 7, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 1, col: 4 },
      { color: 'black', type: 'rook' },
      DIMS
    );
    const inCheck = isOwnKingInCheckOnBoard<Piece>(
      board,
      b => findKing(b, 'white'),
      (b, pos) => isAttackedByRook(b, pos, 'black'),
      () => false
    );
    expect(inCheck).toBe(true);
  });
});

// Helpers
function findKing(board: GridBoard<Piece>, color: string) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r]!.length; c++) {
      const p = board[r]![c];
      if (p && p.type === 'king' && p.color === color)
        return { row: r, col: c };
    }
  }
  return null;
}
function isAttackedByRook(
  board: GridBoard<Piece>,
  target: { row: number; col: number },
  byColor: string
): boolean {
  const dirs = [
    { row: 0, col: 1 },
    { row: 0, col: -1 },
    { row: 1, col: 0 },
    { row: -1, col: 0 },
  ];
  for (const d of dirs) {
    for (let i = 1; i < 8; i++) {
      const r = target.row + d.row * i;
      const c = target.col + d.col * i;
      if (r < 0 || r >= 8 || c < 0 || c >= 8) break;
      const p = board[r]![c];
      if (p) {
        if (p.color === byColor && p.type === 'rook') return true;
        break;
      }
    }
  }
  return false;
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/game-core && bun test src/moves.test.ts
```

Expected: FAIL (`Cannot find module './moves'`).

- [ ] **Step 3: Implement `moves.ts`**

Create `packages/game-core/src/moves.ts`:

```ts
import {
  copyBoard,
  isSquareEmpty,
  isSquareOccupiedByOpponent,
  type GridBoard,
} from './board';
import type { Direction, Dims, Position } from './types';

export function slidingMoves<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  from: Position,
  color: string,
  directions: Direction[],
  maxRange: number,
  dims: Dims
): Position[] {
  const moves: Position[] = [];
  for (const dir of directions) {
    for (let i = 1; i <= maxRange; i++) {
      const pos = {
        row: from.row + dir.row * i,
        col: from.col + dir.col * i,
      };
      if (!isInBounds(pos, dims)) break;
      if (isSquareEmpty(board, pos, dims)) {
        moves.push(pos);
      } else if (isSquareOccupiedByOpponent(board, pos, color, dims)) {
        moves.push(pos);
        break;
      } else {
        break;
      }
    }
  }
  return moves;
}

export function steppingMoves<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  from: Position,
  color: string,
  offsets: Direction[],
  dims: Dims
): Position[] {
  const moves: Position[] = [];
  for (const offset of offsets) {
    const pos = {
      row: from.row + offset.row,
      col: from.col + offset.col,
    };
    if (!isInBounds(pos, dims)) continue;
    if (isSquareEmpty(board, pos, dims)) {
      moves.push(pos);
    } else if (isSquareOccupiedByOpponent(board, pos, color, dims)) {
      moves.push(pos);
    }
  }
  return moves;
}

export function moveLeavesKingInCheck<TPiece>(
  board: GridBoard<TPiece>,
  from: Position,
  to: Position,
  findOwnKing: (board: GridBoard<TPiece>) => Position | null,
  isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
  onMissingKing: () => boolean
): boolean {
  const next = copyBoardAsPossible(board);
  const piece = next[from.row]?.[from.col] ?? null;
  if (piece === null) return onMissingKing(); // malformed input
  setCell(next, from, null);
  setCell(next, to, piece);
  return isOwnKingInCheckOnBoard(
    next,
    findOwnKing,
    isOwnKingAttacked,
    onMissingKing
  );
}

export function isOwnKingInCheckOnBoard<TPiece>(
  board: GridBoard<TPiece>,
  findOwnKing: (board: GridBoard<TPiece>) => Position | null,
  isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
  onMissingKing: () => boolean
): boolean {
  const kingPos = findOwnKing(board);
  if (kingPos === null) return onMissingKing();
  return isOwnKingAttacked(board, kingPos);
}

function isInBounds(pos: Position, dims: Dims): boolean {
  return (
    pos.row >= 0 && pos.row < dims.rows && pos.col >= 0 && pos.col < dims.cols
  );
}

// moveLeavesKingInCheck applies the move on a mutable clone. The clone uses
// copyBoard when TPiece satisfies { color: string }; for the rare case where
// a caller passes a non-colored TPiece (not currently used by any variant),
// fall back to a shallow row clone. This keeps moveLeavesKingInCheck usable
// without forcing the color constraint at the signature level.
function copyBoardAsPossible<TPiece>(
  board: GridBoard<TPiece>
): GridBoard<TPiece> {
  // Shallow clone — moveLeavesKingInCheck only reassigns cells, never mutates
  // piece objects in place, so a row-clone suffices for the apply step.
  return board.map(row => [...row]);
}

function setCell<TPiece>(
  board: GridBoard<TPiece>,
  pos: Position,
  piece: TPiece | null
): void {
  const row = board[pos.row];
  if (row) {
    row[pos.col] = piece;
  }
}
```

Note: `moveLeavesKingInCheck` uses a row-clone (not `copyBoard`) internally because it only reassigns cells — it does not mutate piece objects, so deep-cloning pieces is unnecessary for the trial board. This sidesteps the `<TPiece extends { color: string }>` constraint on `copyBoard` and lets `moveLeavesKingInCheck` stay generic over any `TPiece`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/game-core && bun test src/moves.test.ts
```

Expected: PASS (all moves tests).

- [ ] **Step 5: Update barrel**

Edit `packages/game-core/src/index.ts`:

```ts
export * from './types';
export * from './board';
export * from './moves';
```

- [ ] **Step 6: Run full package gate**

```bash
cd packages/game-core && bun test && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/game-core/src
git commit -m "feat(game-core): add slidingMoves + steppingMoves + check shells

- slidingMoves: directional ray-cast for rook/bishop/chariot/cannon-lance
- steppingMoves: offset-list scan for king/knight/gold/silver/pawn/horse
- moveLeavesKingInCheck: copy/apply/test with closure-based attacker
  predicate and explicit onMissingKing policy callback
- isOwnKingInCheckOnBoard: lower-level check on a pre-modified board,
  for shogi's promotion-variant substitution seam"
```

---

## Task 8: Migrate chess + shogi sliding/stepping consumption

**Goal:** Replace chess `getRookMoves`/`getBishopMoves` and shogi's rook/bishop generators with calls to `slidingMoves`. Replace chess king/knight and shogi gold/silver/knight/pawn/lance/king with `steppingMoves`.

**Files:**

- Modify: `apps/web/src/lib/chess/moves.ts`
- Modify: `apps/web/src/lib/shogi/moves.ts`
- Test: existing `apps/web/src/lib/chess/moves.test.ts`, `moves.coverage.test.ts`, `moves.extended.test.ts`, `apps/web/src/lib/shogi/moves.test.ts`, `moves.coverage.test.ts`

**Interfaces:**

- Consumes: `slidingMoves`, `steppingMoves` from `@procyon/game-core`.

- [ ] **Step 1: Baseline existing chess + shogi moves tests**

```bash
cd apps/web && bun test src/lib/chess/moves.test.ts src/lib/chess/moves.coverage.test.ts src/lib/chess/moves.extended.test.ts src/lib/shogi/moves.test.ts src/lib/shogi/moves.coverage.test.ts
```

Expected: all green.

- [ ] **Step 2: Migrate `chess/moves.ts` rook/bishop**

Edit `apps/web/src/lib/chess/moves.ts` — replace `getRookMoves` and `getBishopMoves` bodies with `slidingMoves` calls:

```ts
import { slidingMoves, steppingMoves } from '@procyon/game-core';
// ... existing imports

const CHESS_DIMS = { rows: 8, cols: 8 } as const;

function getRookMoves(
  board: (ChessPiece | null)[][],
  piece: ChessPiece,
  from: Position
): Position[] {
  return slidingMoves(
    board,
    from,
    piece.color,
    [
      { row: 0, col: 1 },
      { row: 0, col: -1 },
      { row: 1, col: 0 },
      { row: -1, col: 0 },
    ],
    8,
    CHESS_DIMS
  );
}

function getBishopMoves(
  board: (ChessPiece | null)[][],
  piece: ChessPiece,
  from: Position
): Position[] {
  return slidingMoves(
    board,
    from,
    piece.color,
    [
      { row: 1, col: 1 },
      { row: 1, col: -1 },
      { row: -1, col: 1 },
      { row: -1, col: -1 },
    ],
    8,
    CHESS_DIMS
  );
}
```

Similarly, migrate `getKingMoves` (steppingMoves with 8 king offsets) and `getKnightMoves` (steppingMoves with 8 knight L-offsets). Leave `getPawnMoves`, `getQueenMoves` (it composes rook+bishop), castling detection unchanged.

- [ ] **Step 3: Migrate `shogi/moves.ts` rook/bishop and gold/silver/knight/etc.**

Apply the same pattern. Shogi rook/bishop become `slidingMoves` with maxRange = 9; the offset-based pieces (king/gold/silver/knight/pawn/lance) become `steppingMoves` with their respective offset lists. Leave promoted-piece variants and drops unchanged.

- [ ] **Step 4: Run chess + shogi moves tests**

```bash
cd apps/web && bun test src/lib/chess/ src/lib/shogi/
```

Expected: all green.

- [ ] **Step 5: Run typecheck + lint**

```bash
cd apps/web && bun run typecheck && bun run lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/chess/moves.ts apps/web/src/lib/shogi/moves.ts
git commit -m "refactor(chess,shogi): consume slidingMoves/steppingMoves

- chess: getRookMoves/getBishopMoves/getKingMoves/getKnightMoves now
  delegate to game-core slidingMoves/steppingMoves
- shogi: rook/bishop/gold/silver/knight/pawn/lance/king generators
  delegate to slidingMoves/steppingMoves
- Pawn moves, castling, promotions, drops stay variant-local"
```

---

## Task 9: Add `findPiece` + `isSquareAttacked` + `isInCheck` + `forEachOwnPieceMove`

**Goal:** Implement the check/legal-move primitives with TDD. `isSquareAttacked` is the real dedup — the enemy-scan scaffold.

**Files:**

- Create: `packages/game-core/src/check.ts`
- Create: `packages/game-core/src/check.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**

- Consumes: `GridBoard`, `Dims`, `Position` from `./types` and `./board`.
- Produces: `findPiece`, `isSquareAttacked`, `isInCheck`, `forEachOwnPieceMove`.

- [ ] **Step 1: Write failing tests**

Create `packages/game-core/src/check.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  findPiece,
  forEachOwnPieceMove,
  isInCheck,
  isSquareAttacked,
} from './check';
import { createEmptyBoard, setPieceAt } from './board';

interface Piece {
  color: string;
  type: string;
}
const DIMS = { rows: 8, cols: 8 };

describe('findPiece', () => {
  test('returns position of first matching piece', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 7, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    expect(
      findPiece(board, p => p.type === 'king' && p.color === 'white', DIMS)
    ).toEqual({
      row: 7,
      col: 4,
    });
  });
  test('returns null when no match', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    expect(findPiece(board, p => p.type === 'king', DIMS)).toBeNull();
  });
});

describe('isSquareAttacked', () => {
  test('returns true when an enemy piece can reach the target', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'black', type: 'rook' },
      DIMS
    );
    setPieceAt(
      board,
      { row: 0, col: 4 },
      { color: 'white', type: 'king' },
      DIMS
    );
    const attacked = isSquareAttacked(
      board,
      { row: 0, col: 4 },
      'black',
      (b, from) => {
        // simplistic: rook attacks horizontally if same row
        if (from.row !== 0) return [];
        const moves: { row: number; col: number }[] = [];
        for (let c = 0; c < 8; c++) {
          if (c !== from.col) moves.push({ row: 0, col: c });
        }
        return moves;
      },
      DIMS
    );
    expect(attacked).toBe(true);
  });
  test('returns false when no enemy piece reaches the target', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'rook' },
      DIMS
    );
    const attacked = isSquareAttacked(
      board,
      { row: 5, col: 5 },
      'black',
      () => [],
      DIMS
    );
    expect(attacked).toBe(false);
  });
});

describe('isInCheck', () => {
  test('delegates to the isAttacked closure', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    expect(isInCheck(board, { row: 4, col: 4 }, () => true)).toBe(true);
    expect(isInCheck(board, { row: 4, col: 4 }, () => false)).toBe(false);
  });
});

describe('forEachOwnPieceMove', () => {
  test('visits each (from, to) pair for own pieces; stops when visit returns false', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    const visited: string[] = [];
    forEachOwnPieceMove(
      board,
      'white',
      () => [
        { row: 1, col: 0 },
        { row: 2, col: 0 },
      ],
      (from, to) => {
        visited.push(`${from.row},${from.col}->${to.row},${to.col}`);
        return true;
      },
      DIMS
    );
    expect(visited).toEqual(['0,0->1,0', '0,0->2,0']);
  });
  test('returns early when visit returns false', () => {
    const board = createEmptyBoard<Piece>(8, 8);
    setPieceAt(
      board,
      { row: 0, col: 0 },
      { color: 'white', type: 'pawn' },
      DIMS
    );
    let count = 0;
    forEachOwnPieceMove(
      board,
      'white',
      () => [
        { row: 1, col: 0 },
        { row: 2, col: 0 },
      ],
      () => {
        count++;
        return false;
      },
      DIMS
    );
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/game-core && bun test src/check.test.ts
```

Expected: FAIL (`Cannot find module './check'`).

- [ ] **Step 3: Implement `check.ts`**

Create `packages/game-core/src/check.ts`:

```ts
import type { GridBoard } from './board';
import type { Dims, Position } from './types';

export function findPiece<TPiece>(
  board: GridBoard<TPiece>,
  predicate: (p: TPiece) => boolean,
  dims: Dims
): Position | null {
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      const piece = board[row]?.[col];
      if (piece && predicate(piece)) {
        return { row, col };
      }
    }
  }
  return null;
}

export function isSquareAttacked<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  targetPos: Position,
  attackerColor: string,
  getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
  dims: Dims
): boolean {
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      const piece = board[row]?.[col];
      if (piece && piece.color === attackerColor) {
        const moves = getMovesForPiece(board, { row, col });
        for (const move of moves) {
          if (move.row === targetPos.row && move.col === targetPos.col) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function isInCheck<TPiece>(
  board: GridBoard<TPiece>,
  kingPos: Position,
  isAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean
): boolean {
  return isAttacked(board, kingPos);
}

export function forEachOwnPieceMove<TPiece extends { color: string }>(
  board: GridBoard<TPiece>,
  color: string,
  getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
  visit: (from: Position, to: Position) => boolean,
  dims: Dims
): void {
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      const piece = board[row]?.[col];
      if (piece && piece.color === color) {
        const from = { row, col };
        const moves = getMovesForPiece(board, from);
        for (const to of moves) {
          if (!visit(from, to)) return;
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/game-core && bun test src/check.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

```ts
export * from './types';
export * from './board';
export * from './moves';
export * from './check';
```

- [ ] **Step 6: Run full package gate**

```bash
cd packages/game-core && bun test && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/game-core/src
git commit -m "feat(game-core): add findPiece + isSquareAttacked + isInCheck + forEachOwnPieceMove

- findPiece: first-position scan by predicate (king-finding helper)
- isSquareAttacked: the dedup primitive — enemy-piece iteration scaffold
  duplicated across chess/xiangqi/shogi game.ts isKingInCheck functions
- isInCheck: thin naming wrapper around a closure-based isAttacked
- forEachOwnPieceMove: iterate (from, to) board moves for own pieces,
  early-exit via visit returning false; for variants' hasAnyLegalMoves"
```

---

## Task 10: Migrate chess + xiangqi + shogi check consumption

**Goal:** Replace each variant's local `isKingInCheck` with a composition over `findPiece` + `isSquareAttacked`. Replace each variant's local `hasAnyLegalMoves` with a composition over `forEachOwnPieceMove` + `moveLeavesKingInCheck`. Jungle is NOT migrated (no check concept).

**Files:**

- Modify: `apps/web/src/lib/chess/game.ts`
- Modify: `apps/web/src/lib/xiangqi/game.ts`
- Modify: `apps/web/src/lib/shogi/game.ts`
- Test: existing `apps/web/src/lib/{chess,xiangqi,shogi}/*.test.ts`

**Interfaces:**

- Consumes: `findPiece`, `isSquareAttacked`, `moveLeavesKingInCheck`, `forEachOwnPieceMove` from `@procyon/game-core`.

- [ ] **Step 1: Baseline existing tests**

```bash
cd apps/web && bun test src/lib/chess/ src/lib/xiangqi/ src/lib/shogi/
```

Expected: all green.

- [ ] **Step 2: Migrate chess `game.ts`**

Edit `apps/web/src/lib/chess/game.ts` — replace `isKingInCheck` (lines 117-158) with a thin composition. Replace the chess-side `moveLeavesKingInCheck` (or `doesMoveLeaveKingInCheck`) helper with calls to the shared one:

```ts
import {
  findPiece,
  forEachOwnPieceMove,
  isSquareAttacked,
  moveLeavesKingInCheck as sharedMoveLeavesKingInCheck,
  type Dims,
} from '@procyon/game-core';

const CHESS_DIMS: Dims = { rows: 8, cols: 8 };

export function isKingInCheck(
  board: (ChessPiece | null)[][],
  kingColor: PieceColor
): boolean {
  const kingPos = findPiece(
    board,
    p => p.type === 'king' && p.color === kingColor,
    CHESS_DIMS
  );
  if (kingPos === null) return false; // chess policy: missing king = not in check
  const opponent: PieceColor = kingColor === 'white' ? 'black' : 'white';
  return isSquareAttacked(
    board,
    kingPos,
    opponent,
    (b, from) => {
      const piece = b[from.row]?.[from.col];
      if (!piece) return [];
      return getPossibleMoves(b, piece, from);
    },
    CHESS_DIMS
  );
}

// Replace the chess-local moveLeavesKingInCheck with a thin wrapper.
export function moveLeavesKingInCheck(
  board: (ChessPiece | null)[][],
  from: Position,
  to: Position,
  moverColor: PieceColor
): boolean {
  const opponent: PieceColor = moverColor === 'white' ? 'black' : 'white';
  return sharedMoveLeavesKingInCheck<ChessPiece>(
    board,
    from,
    to,
    b =>
      findPiece(
        b,
        p => p.type === 'king' && p.color === moverColor,
        CHESS_DIMS
      ),
    (b, pos) =>
      isSquareAttacked(
        b,
        pos,
        opponent,
        (bb, from) => {
          const piece = bb[from.row]?.[from.col];
          if (!piece) return [];
          return getPossibleMoves(bb, piece, from);
        },
        CHESS_DIMS
      ),
    () => false // chess missing-king policy
  );
}
```

Leave `hasAnyLegalMoves` (chess's version) intact structurally — it now calls the migrated `moveLeavesKingInCheck`. Optionally refactor its iteration to use `forEachOwnPieceMove` (if the structure permits cleanly); otherwise leave its existing loop and just benefit from the migrated sub-calls.

- [ ] **Step 3: Migrate xiangqi `game.ts`**

Same pattern as chess. Replace `isKingInCheck` (lines 139-161) and any `moveLeavesKingInCheck`-equivalent with compositions over shared primitives. Use `XIANGQI_DIMS = { rows: XIANGQI_ROWS, cols: XIANGQI_COLS }`. Missing-king policy: `() => false`.

- [ ] **Step 4: Migrate shogi `game.ts`**

Replace `isKingInCheck` with the same composition, but missing-king policy for shogi is `() => true` (defensive default per the spec's P2-1 decision). For shogi's `hasAnyLegalMoves` (`shogi/game.ts:428-508`), keep its full structure (promotion variants + drops) but route the per-move legality check through the migrated wrappers per §8.2/§8.3 of the spec:

- For board moves (non-drop): use `isOwnKingInCheckOnBoard` (imported from `@procyon/game-core`) on a cloned board where the promotion-variant `testPiece` has been swapped in.
- For drop moves: build the temp board with the dropped piece placed, then call `isOwnKingInCheckOnBoard`.

```ts
import {
  findPiece,
  isOwnKingInCheckOnBoard,
  isSquareAttacked,
  type Dims,
} from '@procyon/game-core';

const SHOGI_DIMS: Dims = { rows: 9, cols: 9 };

export function isKingInCheck(
  board: (ShogiPiece | null)[][],
  kingColor: ShogiPieceColor
): boolean {
  const kingPos = findPiece(
    board,
    p => p.type === 'king' && p.color === kingColor,
    SHOGI_DIMS
  );
  if (kingPos === null) return true; // shogi policy: missing king = in check
  const opponent: ShogiPieceColor = kingColor === 'sente' ? 'gote' : 'sente';
  return isSquareAttacked(
    board,
    kingPos,
    opponent,
    (b, from) => {
      const piece = b[from.row]?.[from.col];
      if (!piece) return [];
      return getPossibleMoves(b, piece, from);
    },
    SHOGI_DIMS
  );
}
```

The `hasAnyLegalMoves` body in shogi keeps its promotion-variant + drop enumeration; each per-move check now uses `isOwnKingInCheckOnBoard` on a prepared test board rather than re-implementing the copy/apply/attack-scan inline.

- [ ] **Step 5: Run chess + xiangqi + shogi tests**

```bash
cd apps/web && bun test src/lib/chess/ src/lib/xiangqi/ src/lib/shogi/
```

Expected: all green. If the shogi missing-king test fails because it expected `false` (chess-like), confirm against the actual shogi test expectation — the spec's P2-1 documented shogi as `true`; if the real test expects `false`, change the policy to `() => false` and update the spec.

- [ ] **Step 6: Run typecheck + lint**

```bash
cd apps/web && bun run typecheck && bun run lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/chess/game.ts apps/web/src/lib/xiangqi/game.ts apps/web/src/lib/shogi/game.ts
git commit -m "refactor(chess,xiangqi,shogi): consume game-core check primitives

- chess/xiangqi isKingInCheck now composes findPiece + isSquareAttacked
  (the dedup primitive); missing-king policy: false
- shogi isKingInCheck same pattern; missing-king policy: true
- shogi hasAnyLegalMoves keeps its promotion-variant + drop enumeration;
  per-move check uses isOwnKingInCheckOnBoard on a prepared test board
- Jungle untouched (no check concept)"
```

---

## Task 11: Add `CoordinateScheme` + notation primitives

**Goal:** Implement the notation helpers with TDD, covering multi-character ranks for xiangqi (`a10`/`e10`).

**Files:**

- Create: `packages/game-core/src/notation.ts`
- Create: `packages/game-core/src/notation.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**

- Produces: `CoordinateScheme`, `posToNotation`, `notationToPos`, `tryNotationToPos`.

- [ ] **Step 1: Write failing tests**

Create `packages/game-core/src/notation.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { notationToPos, posToNotation, tryNotationToPos } from './notation';

const CHESS = {
  files: 'abcdefgh'.split(''),
  ranks: '87654321'.split(''),
};
const XIANGQI = {
  files: 'abcdefghi'.split(''),
  ranks: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
};
const JUNGLE = {
  files: 'abcdefg'.split(''),
  ranks: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
};

describe('posToNotation', () => {
  test('chess single-char ranks', () => {
    expect(posToNotation(CHESS, { row: 0, col: 0 })).toBe('a8');
    expect(posToNotation(CHESS, { row: 7, col: 7 })).toBe('h1');
  });
  test('xiangqi multi-char ranks (a10, e10, i1)', () => {
    expect(posToNotation(XIANGQI, { row: 0, col: 0 })).toBe('a10');
    expect(posToNotation(XIANGQI, { row: 0, col: 4 })).toBe('e10');
    expect(posToNotation(XIANGQI, { row: 9, col: 8 })).toBe('i1');
    expect(posToNotation(XIANGQI, { row: 5, col: 4 })).toBe('e5');
  });
});

describe('notationToPos', () => {
  test('chess round-trip', () => {
    expect(notationToPos(CHESS, 'a8')).toEqual({ row: 0, col: 0 });
    expect(notationToPos(CHESS, 'h1')).toEqual({ row: 7, col: 7 });
  });
  test('xiangqi multi-char round-trip', () => {
    expect(notationToPos(XIANGQI, 'a10')).toEqual({ row: 0, col: 0 });
    expect(notationToPos(XIANGQI, 'e10')).toEqual({ row: 0, col: 4 });
    expect(notationToPos(XIANGQI, 'i1')).toEqual({ row: 9, col: 8 });
  });
  test('throws on invalid input', () => {
    expect(() => notationToPos(CHESS, 'z9')).toThrow();
    expect(() => notationToPos(CHESS, 'a')).toThrow();
    expect(() => notationToPos(XIANGQI, 'a11')).toThrow();
    expect(() => notationToPos(XIANGQI, 'j10')).toThrow();
  });
});

describe('tryNotationToPos', () => {
  test('returns null on invalid input', () => {
    expect(tryNotationToPos(CHESS, 'z9')).toBeNull();
    expect(tryNotationToPos(CHESS, 'a')).toBeNull();
    expect(tryNotationToPos(XIANGQI, 'a11')).toBeNull();
    expect(tryNotationToPos(XIANGQI, 'j10')).toBeNull();
  });
  test('returns position on valid input', () => {
    expect(tryNotationToPos(CHESS, 'a8')).toEqual({ row: 0, col: 0 });
    expect(tryNotationToPos(XIANGQI, 'e10')).toEqual({ row: 0, col: 4 });
  });
});

describe('jungle round-trip', () => {
  test('all three coordinate lengths work', () => {
    expect(posToNotation(JUNGLE, { row: 0, col: 0 })).toBe('a9');
    expect(notationToPos(JUNGLE, 'a9')).toEqual({ row: 0, col: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/game-core && bun test src/notation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `notation.ts`**

Create `packages/game-core/src/notation.ts`:

```ts
import type { Position } from './types';

export interface CoordinateScheme {
  files: string[];
  ranks: string[];
}

export function posToNotation(scheme: CoordinateScheme, pos: Position): string {
  return `${scheme.files[pos.col]}${scheme.ranks[pos.row]}`;
}

export function notationToPos(scheme: CoordinateScheme, str: string): Position {
  if (str.length < 2) {
    throw new Error(`Invalid notation: ${str}`);
  }
  const file = str[0]!;
  const rank = str.slice(1);
  const col = scheme.files.indexOf(file);
  const row = scheme.ranks.indexOf(rank);
  if (col === -1 || row === -1) {
    throw new Error(`Invalid notation: ${str}`);
  }
  return { row, col };
}

export function tryNotationToPos(
  scheme: CoordinateScheme,
  str: string
): Position | null {
  try {
    return notationToPos(scheme, str);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/game-core && bun test src/notation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update barrel**

```ts
export * from './types';
export * from './board';
export * from './moves';
export * from './check';
export * from './notation';
```

- [ ] **Step 6: Run full package gate**

```bash
cd packages/game-core && bun test && bun run typecheck && bun run lint
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/game-core/src
git commit -m "feat(game-core): add CoordinateScheme + notation primitives

- CoordinateScheme { files: string[]; ranks: string[] }
- posToNotation / notationToPos (throws) / tryNotationToPos (nullable)
- Token parser: file = str[0], rank = str.slice(1) — handles multi-char
  xiangqi ranks (a10, e10) as well as single-char chess/jungle ranks
- Round-trip tests covering chess, xiangqi (multi-char), jungle"
```

---

## Task 12: Migrate chess + xiangqi + jungle notation; delete chess duplicate

**Goal:** Route chess callers through `notationToPos`/`tryNotationToPos`. Delete both chess `algebraicToPosition` copies. Migrate xiangqi and jungle notation helpers similarly. Shogi stays variant-local (transposed scheme).

**Files:**

- Modify: `apps/web/src/lib/chess/board.ts`
- Modify: `apps/web/src/lib/chess/game.ts` (delete duplicate `algebraicToPosition` at lines 233-245)
- Modify: `apps/web/src/lib/xiangqi/board.ts` (or wherever `getPositionString`/`parsePosition` live)
- Modify: `apps/web/src/lib/jungle/board.ts` (if notation helpers exist)
- Test: existing variant `*.test.ts`, especially `xiangqi/board.test.ts:223-230` (`getPositionString` round-trip).

**Interfaces:**

- Consumes: `CoordinateScheme`, `posToNotation`, `notationToPos`, `tryNotationToPos` from `@procyon/game-core`.

- [ ] **Step 1: Baseline existing notation tests**

```bash
cd apps/web && bun test src/lib/chess/board.test.ts src/lib/xiangqi/board.test.ts src/lib/jungle/board.test.ts
```

Expected: all green.

- [ ] **Step 2: Define scheme constants and migrate chess**

Edit `apps/web/src/lib/chess/board.ts` — replace local `positionToAlgebraic`/`algebraicToPosition` with bound shared helpers:

```ts
import {
  bindBoard,
  type CoordinateScheme,
  notationToPos as sharedNotationToPos,
  posToNotation as sharedPosToNotation,
  tryNotationToPos as sharedTryNotationToPos,
} from '@procyon/game-core';
import type { Position } from './types';
// ... existing imports

export const CHESS_SCHEME: CoordinateScheme = {
  files: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ranks: ['8', '7', '6', '5', '4', '3', '2', '1'],
};

export function positionToAlgebraic(pos: Position): string {
  return sharedPosToNotation(CHESS_SCHEME, pos);
}

// Throwing variant — replaces the chess/board.ts:106-122 copy.
export function algebraicToPosition(algebraic: string): Position {
  return sharedNotationToPos(CHESS_SCHEME, algebraic);
}

// Nullable variant — replaces the chess/game.ts:233-245 copy.
// Callers that depend on null-on-invalid migrate to this name.
export function tryAlgebraicToPosition(algebraic: string): Position | null {
  return sharedTryNotationToPos(CHESS_SCHEME, algebraic);
}
```

Then in `apps/web/src/lib/chess/game.ts`:

- DELETE the duplicate `algebraicToPosition` function (lines 233-245).
- Update any `game.ts` callers that used the local nullable version to import `tryAlgebraicToPosition` from `./board` instead.
- Update any `game.ts` callers that used the throwing version to import `algebraicToPosition` from `./board`.

- [ ] **Step 3: Migrate xiangqi notation**

Find xiangqi's notation helpers (likely `getPositionString` in `xiangqi/board.ts` per `xiangqi/board.test.ts:223`). Replace with:

```ts
import {
  type CoordinateScheme,
  posToNotation as sharedPosToNotation,
  notationToPos as sharedNotationToPos,
  tryNotationToPos as sharedTryNotationToPos,
} from '@procyon/game-core';

export const XIANGQI_SCHEME: CoordinateScheme = {
  files: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  ranks: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
};

export function getPositionString(pos: XiangqiPosition): string {
  return sharedPosToNotation(XIANGQI_SCHEME, pos);
}
// If xiangqi has a parsePosition/notationToPosition, route through
// sharedNotationToPos (throws) or sharedTryNotationToPos (nullable).
```

- [ ] **Step 4: Migrate jungle notation (if applicable)**

Check `jungle/board.ts` and `jungle/types.ts` for notation helpers. If present, define `JUNGLE_SCHEME` and route through shared helpers. If absent, skip.

- [ ] **Step 5: Run all variant tests + typecheck + lint**

```bash
cd apps/web && bun test src/lib/chess/ src/lib/xiangqi/ src/lib/jungle/ && bun run typecheck && bun run lint
```

Expected: all green. The `xiangqi/board.test.ts:223-230` `getPositionString` round-trip tests must pass — this verifies the multi-char rank parsing works against real xiangqi coordinates.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/chess apps/web/src/lib/xiangqi apps/web/src/lib/jungle
git commit -m "refactor(chess,xiangqi,jungle): consume game-core notation; delete chess duplicate

- chess: define CHESS_SCHEME; positionToAlgebraic/algebraicToPosition route
  through shared posToNotation/notationToPos; new tryAlgebraicToPosition
  (nullable) for callers that previously used the game.ts duplicate
- chess/game.ts: DELETE duplicate algebraicToPosition (lines 233-245)
- xiangqi: getPositionString routes through shared posToNotation with
  XIANGQI_SCHEME (multi-char ranks a10/e10 round-trip verified)
- jungle: notation helpers routed through shared scheme where present
- Shogi notation stays variant-local (transposed scheme)"
```

---

## Task 13: Document `@procyon/game-core` in AGENTS.md

**Goal:** Add a paragraph to AGENTS.md so future contributors know what belongs in the shared package vs. the variants.

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Locate the insertion point**

```bash
rg -n "Game Engine Architecture" AGENTS.md
```

Expected: matches a section heading. Read the lines under it to find the "Multi-Game Pattern" subsection.

- [ ] **Step 2: Insert the shared-core paragraph**

In `AGENTS.md`, under "Game Engine Architecture → Multi-Game Pattern", insert before the existing "1. Types" step:

```markdown
**Shared core (`@procyon/game-core`):** the truly-duplicated structural primitives — `Position`, `BaseMove<TPiece>`, `BaseGameState<TPiece>`, `GridBoard<TPiece>` helpers, `slidingMoves`/`steppingMoves`/`moveLeavesKingInCheck`, and `findPiece`/`isSquareAttacked`/`isInCheck`/`forEachOwnPieceMove` — live in `packages/game-core/`, not in each variant. The scope rule: **share the scaffold, specialize the rules.** Generic piece-movement primitives (sliding/stepping offsets), board helpers parameterized by `Dims`, the `isSquareAttacked` enemy-scan scaffold, and the `moveLeavesKingInCheck` copy/apply/test shell belong in the shared package. Variant-specific rules (castling, cannon screens, shogi drops/nifu/uchifuzume, jungle terrain) AND variant-specific compositions (`hasLegalMove`/`hasAnyLegalMoves` — each variant owns its own because shogi enumerates promotion variants and drops) stay in `apps/web/src/lib/{variant}/`. When adding a new primitive, ask: is the logic identical across ≥3 variants modulo dimensions and piece types? If yes → `game-core`. If it references a variant-specific concept (palace, river, promotion zone, drops) → stays variant-local.
```

- [ ] **Step 3: Verify the doc reads cleanly**

```bash
rg -n "game-core|Multi-Game Pattern" AGENTS.md
```

Expected: the new paragraph appears under Multi-Game Pattern, before "1. Types".

- [ ] **Step 4: Run the full repo gate**

```bash
bun test --filter=@procyon/game-core
bun test src
cd apps/web && bun run typecheck && bun run lint
cd ../.. && bun run typecheck && bun run lint
```

Expected: all green. This is the final commit; everything must pass.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: note @procyon/game-core in AGENTS.md

Add the shared-core scope rule (share scaffold, specialize rules) under
Game Engine Architecture so contributors know what belongs in
packages/game-core/ vs. apps/web/src/lib/{variant}/."
```

---

## Self-Review Notes

**Spec coverage check:**

- §4 package layout → Task 1 ✓
- §5 shared types (Position, BaseMove, BaseGameState, status narrowing, Position aliases) → Task 2 (types) + Tasks 3–6 (variant adoption) ✓
- §6 GridBoard primitives + shallow-copy bug fix → Task 2 (impl) + Task 3 (chess migration with bug fix) ✓
- §7 slidingMoves/steppingMoves + moveLeavesKingInCheck → Task 7 ✓
- §8 check algorithms (findPiece, isSquareAttacked, isInCheck, forEachOwnPieceMove; no shared hasLegalMove) → Task 9 ✓
- §8.1/§8.2/§8.3 variant hasLegalMove compositions (chess/xiangqi thin, shogi promotion-variant seam) → Task 10 ✓
- §9 CoordinateScheme + notation + multi-char ranks → Task 11 ✓
- §9.1 chess duplicate algebraicToPosition deletion → Task 12 ✓
- §10 bug fixes (10.1 shallow copyBoard, 10.2 duplicate algebraicToPosition) → Tasks 3 + 12 ✓
- §12 migration order (13 commits) → Tasks 1–13 ✓
- §14 regression tests (spread-clone, missing-king, multi-char ranks) → Tasks 2, 7, 11 ✓
- P2-2 CI test-game-core job → Task 1 ✓
- P2-4 copyBoard { color: string } constraint → Task 2 ✓

**Type consistency check:**

- `bindBoard<TPiece extends { color: string }>` used consistently in Tasks 2–6.
- `moveLeavesKingInCheck<TPiece>` (no color constraint; uses row-clone internally) used in Tasks 7, 10.
- `isOwnKingInCheckOnBoard<TPiece>` (no color constraint) used in Tasks 7, 10 for shogi.
- `findPiece<TPiece>` (no constraint) used in Task 9, 10.
- `isSquareAttacked<TPiece extends { color: string }>` used in Tasks 9, 10.
- `CHESS_DIMS`/`XIANGQI_DIMS`/`SHOGI_DIMS` constants introduced in Tasks 3/4/5 and reused in 8/10.
- `CHESS_SCHEME`/`XIANGQI_SCHEME`/`JUNGLE_SCHEME` constants introduced in Task 12.

**Placeholder scan:** none — every step has complete code or exact commands.

**Known risks carried into execution:**

- Task 3 (chess shallow-copy fix) is the highest-risk commit. If chess tests fail, the cause is in-place piece mutation after `copyBoard`; fix by making the chess code stop mutating or use explicit clones.
- Task 10 (shogi missing-king policy) — if the actual shogi test expects `false` (not `true`), use `() => false` and note the divergence from the spec.
- Task 12 (xiangqi notation round-trip) — the `xiangqi/board.test.ts:223-230` tests must pass; if xiangqi's existing `getPositionString` produces a different format than `posToNotation(XIANGQI_SCHEME, ...)`, reconcile the scheme constant to match existing behavior, not the other way around.
