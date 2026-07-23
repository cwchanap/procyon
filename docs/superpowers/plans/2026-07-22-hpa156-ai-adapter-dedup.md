# HPA-156: AI Adapter Layer Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the four AI adapters and four rule-guardian classes into `BaseAdapter<T>` + `BaseRuleGuardian<T>` hierarchies with shared `notation-utils.ts`, removing ~587 net lines of duplication.

**Architecture:** Abstract base classes with template-method hooks. Shared scaffolding (state conversion, coordinate parsing, move-list formatting, piece iteration, validation core) lives on the base. Variant-specific rules (shogi drops/promotion, xiangqi palace/river, jungle terrain, chess castling) stay on thin subclasses. Coordinate conversion consolidated into `notation-utils.ts` backed by `@procyon/game-core`'s existing primitives.

**Tech Stack:** TypeScript, Bun test runner, ESLint, Astro web app, `@procyon/game-core` shared package.

## Global Constraints

- **Runtime:** Bun (not npm/node/yarn/pnpm)
- **Test commands:** `cd apps/web && bun test` for unit tests, `bun run lint` and `bun run typecheck` at root via turbo
- **No behavior change to public interfaces:** `GameVariantAdapter<T>` and `RuleGuardian<T>` interfaces in `service.ts` stay unchanged
- **Documented behavior changes only:** `positionToAlgebraic` OOB now throws `Error` (was `undefinedundefined` or `RangeError`), guardian parsing normalizes + tightens (see spec behavior-preservation notes #3–6). All intentional, all contract-tested.
- **Branch:** `jack65786656/hpa-156-tier-3-unify-ai-adapter-layer-with-baseadapter-baseruleguardian`
- **Design spec:** `docs/superpowers/specs/2026-07-21-hpa156-ai-adapter-dedup-design.md`

---

## File Structure

| File                                        | Action            | Responsibility                                                                                            |
| ------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/ai/notation-utils.ts`     | **Create**        | Coordinate conversion + bounds checking keyed on `GAME_CONFIGS`, wrapping `@procyon/game-core` primitives |
| `apps/web/src/lib/ai/base-adapter.ts`       | **Create**        | Abstract `BaseAdapter<T>` with shared scaffolding + template-method hooks                                 |
| `apps/web/src/lib/ai/base-rule-guardian.ts` | **Create**        | Abstract `BaseRuleGuardian<T>` + `RuleGuardian`/`MoveValidationResult` type definitions                   |
| `apps/web/src/lib/ai/chess-adapter.ts`      | Modify            | Extends `BaseAdapter`, keeps live helpers, trims dead code                                                |
| `apps/web/src/lib/ai/xiangqi-adapter.ts`    | Modify            | Extends `BaseAdapter`, keeps prompt/threat logic                                                          |
| `apps/web/src/lib/ai/shogi-adapter.ts`      | Modify            | Extends `BaseAdapter`, keeps drop/promotion logic                                                         |
| `apps/web/src/lib/ai/jungle-adapter.ts`     | Modify            | Extends `BaseAdapter`, keeps all public methods + terrain prompt                                          |
| `apps/web/src/lib/ai/rule-guardian.ts`      | Modify            | 4 thin subclasses extending `BaseRuleGuardian` + re-export types                                          |
| `apps/web/src/lib/ai/game-variant-types.ts` | Modify (commit 5) | Tighten `pieceSymbols` typing with `satisfies`                                                            |
| `apps/web/src/lib/ai/rule-guardian.test.ts` | Modify            | Add contract tests for parsing changes                                                                    |

---

## Task 1: Create `notation-utils.ts` + adopt across adapters and guardians

**Files:**

- Create: `apps/web/src/lib/ai/notation-utils.ts`
- Modify: `apps/web/src/lib/ai/chess-adapter.ts` (lines 198-219: `positionToAlgebraic`, `algebraicToPosition`)
- Modify: `apps/web/src/lib/ai/xiangqi-adapter.ts` (lines 249-270)
- Modify: `apps/web/src/lib/ai/shogi-adapter.ts` (lines 302-345)
- Modify: `apps/web/src/lib/ai/jungle-adapter.ts` (lines 85-120)
- Modify: `apps/web/src/lib/ai/rule-guardian.ts` (lines 90-105, 182-197, 335-350, 408-423)
- Modify: `apps/web/src/lib/ai/rule-guardian.test.ts` (add contract tests)

**Interfaces:**

- Produces: `positionToAlgebraic(variant, pos): string`, `algebraicToPosition(variant, str): GamePosition`, `tryAlgebraicToPosition(variant, str): GamePosition`, `isValidPosition(variant, pos): boolean`, `configFor(variant): GameVariantConfig`

- [ ] **Step 1: Create branch**

```bash
git checkout -b jack65786656/hpa-156-tier-3-unify-ai-adapter-layer-with-baseadapter-baseruleguardian
```

- [ ] **Step 2: Create `notation-utils.ts`**

```ts
// apps/web/src/lib/ai/notation-utils.ts
import {
  posToNotation,
  notationToPos,
  tryNotationToPos,
} from '@procyon/game-core';
import { GAME_CONFIGS } from './game-variant-types';
import type { GameVariant, GameVariantConfig } from './game-variant-types';
import type { GamePosition } from './service';

export function configFor(variant: GameVariant): GameVariantConfig {
  return GAME_CONFIGS[variant];
}

export function positionToAlgebraic(
  variant: GameVariant,
  pos: GamePosition
): string {
  return posToNotation(GAME_CONFIGS[variant], pos);
}

export function algebraicToPosition(
  variant: GameVariant,
  str: string
): GamePosition {
  return notationToPos(GAME_CONFIGS[variant], str.trim().toLowerCase());
}

export function tryAlgebraicToPosition(
  variant: GameVariant,
  str: string
): GamePosition {
  const pos = tryNotationToPos(GAME_CONFIGS[variant], str.trim().toLowerCase());
  return pos ?? { row: -1, col: -1 };
}

export function isValidPosition(
  variant: GameVariant,
  pos: GamePosition
): boolean {
  const { rows, cols } = GAME_CONFIGS[variant].boardSize;
  return pos.row >= 0 && pos.row < rows && pos.col >= 0 && pos.col < cols;
}
```

- [ ] **Step 3: Write contract tests for documented behavior changes**

Add to the top of `apps/web/src/lib/ai/rule-guardian.test.ts` (after existing imports), or create a new `describe` block:

```ts
import {
  positionToAlgebraic,
  algebraicToPosition,
  tryAlgebraicToPosition,
  isValidPosition,
} from './notation-utils';

describe('notation-utils contract tests', () => {
  describe('tryAlgebraicToPosition — guardian parsing', () => {
    test('valid lowercase notation accepted', () => {
      const pos = tryAlgebraicToPosition('chess', 'e2');
      expect(isValidPosition('chess', pos)).toBe(true);
      expect(pos).toEqual({ row: 6, col: 4 });
    });

    test('uppercase notation accepted (harmonized with adapters)', () => {
      const pos = tryAlgebraicToPosition('chess', 'E2');
      expect(isValidPosition('chess', pos)).toBe(true);
      expect(pos).toEqual({ row: 6, col: 4 });
    });

    test('trailing garbage rejected (tightened)', () => {
      const pos = tryAlgebraicToPosition('chess', 'e2junk');
      expect(isValidPosition('chess', pos)).toBe(false);
    });

    test('out-of-bounds notation rejected', () => {
      const pos = tryAlgebraicToPosition('chess', 'z9');
      expect(isValidPosition('chess', pos)).toBe(false);
    });

    test('empty string returns sentinel', () => {
      const pos = tryAlgebraicToPosition('chess', '');
      expect(pos).toEqual({ row: -1, col: -1 });
    });

    test('single char returns sentinel', () => {
      const pos = tryAlgebraicToPosition('chess', 'e');
      expect(pos).toEqual({ row: -1, col: -1 });
    });
  });

  describe('positionToAlgebraic — OOB throws Error', () => {
    test('chess OOB throws (was undefinedundefined)', () => {
      expect(() => positionToAlgebraic('chess', { row: 99, col: 99 })).toThrow(
        Error
      );
    });

    test('jungle OOB throws Error (was RangeError)', () => {
      expect(() => positionToAlgebraic('jungle', { row: 99, col: 99 })).toThrow(
        Error
      );
    });
  });
});
```

- [ ] **Step 4: Run contract tests to verify they pass**

```bash
cd apps/web && bun test src/lib/ai/rule-guardian.test.ts
```

Expected: All new contract tests PASS (they test the new module directly).

- [ ] **Step 5: Migrate chess-adapter.ts coordinate methods**

Replace `positionToAlgebraic` and `algebraicToPosition` methods (lines 198-219) with delegations:

```ts
// In ChessAdapter class — replace existing methods:
positionToAlgebraic(position: GamePosition): string {
	return positionToAlgebraic('chess', position);
}

algebraicToPosition(algebraic: string): GamePosition {
	return algebraicToPosition('chess', algebraic);
}
```

Add import at top:

```ts
import { positionToAlgebraic, algebraicToPosition } from './notation-utils';
```

Remove the now-unused `import { RANKS, FILES, BOARD_SIZE } from '../chess/types'` — but ONLY remove `RANKS` and `FILES` if nothing else uses them. Check with grep first. Keep `BOARD_SIZE` (used in loops).

- [ ] **Step 6: Run chess adapter tests**

```bash
cd apps/web && bun test src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts
```

Expected: ALL PASS. If any test checks for `RangeError` specifically on `positionToAlgebraic`, update it to `toThrow()` or `toThrow(Error)`.

- [ ] **Step 7: Migrate xiangqi-adapter.ts coordinate methods**

Replace `positionToAlgebraic` and `algebraicToPosition` (lines 249-270) with delegations:

```ts
positionToAlgebraic(position: GamePosition): string {
	return positionToAlgebraic('xiangqi', position);
}

algebraicToPosition(algebraic: string): GamePosition {
	return algebraicToPosition('xiangqi', algebraic);
}
```

Add import: `import { positionToAlgebraic, algebraicToPosition } from './notation-utils';`

- [ ] **Step 8: Run xiangqi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/xiangqi-adapter.test.ts src/lib/ai/xiangqi-adapter.coverage.test.ts src/lib/ai/xiangqi-adapter.extended.test.ts
```

Expected: ALL PASS.

- [ ] **Step 9: Migrate shogi-adapter.ts coordinate methods**

Replace `positionToAlgebraic` and `algebraicToPosition` (lines 302-345) with delegations:

```ts
positionToAlgebraic(position: GamePosition): string {
	return positionToAlgebraic('shogi', position);
}

algebraicToPosition(algebraic: string): GamePosition {
	return algebraicToPosition('shogi', algebraic);
}
```

Add import: `import { positionToAlgebraic, algebraicToPosition } from './notation-utils';`

- [ ] **Step 10: Run shogi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/shogi-adapter.test.ts src/lib/ai/shogi-adapter.coverage.test.ts src/lib/ai/shogi-adapter.extended.test.ts
```

Expected: ALL PASS. The `RangeError` on OOB is now `Error` — update any test that checks `toThrow(RangeError)` to `toThrow()` or `toThrow(Error)`.

- [ ] **Step 11: Migrate jungle-adapter.ts coordinate methods**

Replace `positionToAlgebraic` and `algebraicToPosition` (lines 85-120) with delegations:

```ts
positionToAlgebraic(position: GamePosition): string {
	return positionToAlgebraic('jungle', position);
}

algebraicToPosition(algebraic: string): GamePosition {
	return algebraicToPosition('jungle', algebraic);
}
```

Add import: `import { positionToAlgebraic, algebraicToPosition } from './notation-utils';`

- [ ] **Step 12: Run jungle adapter tests**

```bash
cd apps/web && bun test src/lib/ai/jungle-adapter.test.ts src/lib/ai/jungle-adapter.coverage.test.ts
```

Expected: ALL PASS. Same `RangeError` → `Error` test update if needed.

- [ ] **Step 13: Migrate rule-guardian.ts — all four guardians**

For each guardian class, replace the private `algebraicToPosition` and `isValidPosition` methods with delegations to `notation-utils`. The private methods become thin wrappers:

**ChessRuleGuardian** (lines 90-109): Replace private methods:

```ts
private algebraicToPosition(algebraic: string): GamePosition {
	return tryAlgebraicToPosition('chess', algebraic);
}

private isValidPosition(pos: GamePosition): boolean {
	return isValidPosition('chess', pos);
}
```

**XiangqiRuleGuardian** (lines 182-201): Same pattern with `'xiangqi'`.

**ShogiRuleGuardian** (lines 335-354): Same pattern with `'shogi'`. Note: shogi's `algebraicToPosition` currently uses `algebraic[1]` (single char); `tryAlgebraicToPosition` uses `slice(1)` which is a generalization — behavior-preserving on valid shogi input.

**JungleRuleGuardian** (lines 408-427): Same pattern with `'jungle'`.

Add import at top of file:

```ts
import { tryAlgebraicToPosition, isValidPosition } from './notation-utils';
```

- [ ] **Step 14: Run all guardian tests**

```bash
cd apps/web && bun test src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts
```

Expected: ALL PASS. Guardian reason strings change from `"Invalid move format: ..."` to `"out of bounds"` for short/malformed input, but existing tests check `.toContain('out of bounds')` so they stay green.

- [ ] **Step 15: Run lint + typecheck**

```bash
bun run lint && bun run typecheck
```

Expected: Clean. Fix any unused-import warnings from the removed `FILES`/`RANKS`/`SHOGI_FILES`/etc. constants.

- [ ] **Step 16: Commit**

```bash
git add -A && git commit -m "refactor(ai): consolidate coordinate conversion into notation-utils

Replace 8 redeclared file/rank arrays across 4 adapters + 4 guardians with
shared notation-utils.ts backed by @procyon/game-core primitives.

Documented behavior changes (all intentional, contract-tested):
- positionToAlgebraic OOB: now throws Error (was undefinedundefined or RangeError)
- Guardian parsing: normalizes (E2 accepted) + tightens (e2junk rejected)
- Guardian parseMove: returns sentinel {-1,-1} instead of throwing on malformed input"
```

---

## Task 2: Create `BaseAdapter<T>` skeleton + migrate trivial shared methods

**Files:**

- Create: `apps/web/src/lib/ai/base-adapter.ts`
- Modify: `apps/web/src/lib/ai/chess-adapter.ts` (extend BaseAdapter, remove duplicated methods)
- Modify: `apps/web/src/lib/ai/xiangqi-adapter.ts` (same)
- Modify: `apps/web/src/lib/ai/shogi-adapter.ts` (same)
- Modify: `apps/web/src/lib/ai/jungle-adapter.ts` (same, remove inline symbol table)

**Interfaces:**

- Consumes: `GameVariantAdapter<T>` from `service.ts`, `GAME_CONFIGS` from `game-variant-types.ts`, coordinate helpers from `notation-utils.ts`
- Produces: `BaseAdapter<T>` abstract class with `convertGameState`, `positionToAlgebraic`, `algebraicToPosition`, `getPieceSymbol`, `formatMoveHistory` (with hooks), `groupMovesByPiece`, `findPiece`, `forEachPiece` — plus abstract declarations for `getAllValidMoves`, `generatePrompt`, `createVisualBoard`, `analyzeThreatsSafety`

- [ ] **Step 1: Create `base-adapter.ts` with abstract class**

```ts
// apps/web/src/lib/ai/base-adapter.ts
import type {
  GameVariantAdapter,
  BaseGameState,
  GamePosition,
  GamePiece,
  AnyGameState,
} from './service';
import type { GameVariant, GameVariantConfig } from './game-variant-types';
import { GAME_CONFIGS } from './game-variant-types';
import { positionToAlgebraic, algebraicToPosition } from './notation-utils';

export abstract class BaseAdapter<T extends AnyGameState = AnyGameState>
  implements GameVariantAdapter<T>
{
  abstract gameVariant: GameVariant;
  protected debugMode: boolean;

  // Abstract declarations for interface members not yet implemented here.
  // getAllValidMoves + createVisualBoard become concrete in Task 3.
  // generatePrompt + analyzeThreatsSafety stay abstract (variant-specific).
  abstract getAllValidMoves(gameState: T): string[];
  abstract generatePrompt(gameState: T): string;
  abstract createVisualBoard(gameState: T): string;
  abstract analyzeThreatsSafety(gameState: T): string;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  protected getConfig(): GameVariantConfig {
    return GAME_CONFIGS[this.gameVariant];
  }

  convertGameState(gameState: T): BaseGameState {
    return {
      board: gameState.board,
      currentPlayer: gameState.currentPlayer,
      status: gameState.status,
      moveHistory: gameState.moveHistory,
      selectedSquare: gameState.selectedSquare,
      possibleMoves: gameState.possibleMoves,
    };
  }

  positionToAlgebraic(pos: GamePosition): string {
    return positionToAlgebraic(this.gameVariant, pos);
  }

  algebraicToPosition(s: string): GamePosition {
    return algebraicToPosition(this.gameVariant, s);
  }

  getPieceSymbol(piece: GamePiece): string {
    const symbols = this.getConfig().pieceSymbols;
    return symbols[piece.color]?.[piece.type] ?? '?';
  }

  // Shared move-history formatter — subclasses configure window/label/entry.
  protected formatMoveHistory(
    moves: T['moveHistory'],
    window: number,
    emptyLabel: string,
    formatEntry: (move: T['moveHistory'][number], index: number) => string
  ): string {
    if (moves.length === 0) return emptyLabel;
    const recent = moves.slice(-window);
    return recent.map((move, i) => formatEntry(move, i)).join(' ');
  }

  // Fully shared — no hooks needed.
  protected groupMovesByPiece(moves: string[]): string {
    const groups: { [key: string]: string[] } = {};
    for (const move of moves) {
      const pieceMatch = move.match(/\(([^)]+)\)/);
      const pieceType = pieceMatch?.[1] ?? 'Unknown';
      const group = groups[pieceType] ?? (groups[pieceType] = []);
      group.push(move.replace(/\s*\([^)]+\)/, ''));
    }
    let result = '';
    for (const [pieceType, movesArray] of Object.entries(groups)) {
      result += `${pieceType}: ${movesArray.join(', ')}\n`;
    }
    return result.trim();
  }

  protected findPiece(
    board: T['board'],
    type: string,
    color: string
  ): { row: number; col: number } | null {
    const { rows, cols } = this.getConfig().boardSize;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const piece = board[row]?.[col];
        if (piece && piece.type === type && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  protected forEachPiece(
    board: T['board'],
    cb: (
      piece: NonNullable<T['board'][number][number]>,
      row: number,
      col: number
    ) => void
  ): void {
    const { rows, cols } = this.getConfig().boardSize;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const piece = board[row]?.[col];
        if (piece) cb(piece, row, col);
      }
    }
  }
}
```

- [ ] **Step 2: Migrate ChessAdapter to extend BaseAdapter**

In `chess-adapter.ts`:

- Add: `import { BaseAdapter } from './base-adapter';`
- Change class declaration: `export class ChessAdapter extends BaseAdapter<GameState>`
- Add field: `gameVariant = 'chess' as const;`
- Remove: `convertGameState`, `positionToAlgebraic`, `algebraicToPosition`, `getPieceSymbol` (inherited from BaseAdapter)
- Remove: the `private config = GAME_CONFIGS.chess;` field (use `getConfig()` instead — but note: chess's current code accesses `this.config` in `getPieceSymbol`, which is already removed)
- Keep ALL other methods (getAllValidMoves, generatePrompt, createVisualBoard, analyzeThreatsSafety, wouldMoveBeValid, formatMoveHistory, getSimpleMaterialBalance, getCriticalThreats, findPiece (will be removed in Task 3), countMaterial, evaluateKingSafety, getPieceSymbolForMove, groupMovesByPiece (will be removed in Task 3), getExampleMoveFromValidMoves, findHangingPieces, isSquareAttackedBy, isSquareDefendedBy, findAttackedSquares)

**Important:** Chess has its own `formatMoveHistory` (private, line 256-267) that uses `this.positionToAlgebraic` and returns `"from-to"` format. It can delegate to the base `formatMoveHistory` or stay as-is for now. Leave it as-is for Task 2 — it will be refactored in Task 3 if appropriate.

**Important:** Chess's `getPieceSymbol` currently reads from `this.config.pieceSymbols`. The base class version uses `this.getConfig().pieceSymbols`. Same result, different access path. Verify `getPieceSymbol` tests pass.

- [ ] **Step 3: Run chess adapter tests**

```bash
cd apps/web && bun test src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts
```

Expected: ALL PASS.

- [ ] **Step 4: Migrate XiangqiAdapter to extend BaseAdapter**

Same pattern as chess:

- `export class XiangqiAdapter extends BaseAdapter<XiangqiGameState>`
- Add: `gameVariant = 'xiangqi' as const;`
- Remove: `convertGameState`, `positionToAlgebraic`, `algebraicToPosition`, `getPieceSymbol` (inherited)
- Remove: the private `config` field if present (use `getConfig()`)
- **Remove `getPieceSymbolForMove`** (lines 433-435) — it's a thin alias `return this.getPieceSymbol(piece)` and the base class provides this. Check if it's called anywhere; if so, replace calls with `this.getPieceSymbol(piece)`.
- Keep all other methods

- [ ] **Step 5: Run xiangqi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/xiangqi-adapter.test.ts src/lib/ai/xiangqi-adapter.coverage.test.ts src/lib/ai/xiangqi-adapter.extended.test.ts
```

Expected: ALL PASS.

- [ ] **Step 6: Migrate ShogiAdapter to extend BaseAdapter**

Same pattern:

- `export class ShogiAdapter extends BaseAdapter<ShogiGameState>`
- Add: `gameVariant = 'shogi' as const;`
- Remove: `convertGameState`, `positionToAlgebraic`, `algebraicToPosition`, `getPieceSymbol`
- Keep all other methods (including local `countMaterial` which takes `gameState` not `board`)

- [ ] **Step 7: Run shogi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/shogi-adapter.test.ts src/lib/ai/shogi-adapter.coverage.test.ts src/lib/ai/shogi-adapter.extended.test.ts
```

Expected: ALL PASS.

- [ ] **Step 8: Migrate JungleAdapter to extend BaseAdapter**

Same pattern, plus:

- `export class JungleAdapter extends BaseAdapter<JungleGameState>`
- Add: `gameVariant = 'jungle' as const;`
- Remove: `convertGameState`, `positionToAlgebraic`, `algebraicToPosition`
- **Replace `getPieceSymbol`** (lines 125-149): remove the inline `symbols` dict entirely. The base class `getPieceSymbol` reads from `GAME_CONFIGS.jungle.pieceSymbols` which has the exact same data. Verify the symbols match by running tests.
- Keep: `getLegalMoves`, `evaluatePosition`, `getPositionAnalysis` (public+tested API, NOT deleted)
- Keep: `gameStateToPrompt`, `createVisualBoard`, `getAllValidMoves`, `analyzeThreatsSafety`

- [ ] **Step 9: Run jungle adapter tests**

```bash
cd apps/web && bun test src/lib/ai/jungle-adapter.test.ts src/lib/ai/jungle-adapter.coverage.test.ts
```

Expected: ALL PASS. The inline symbol table removal is transparent because `GAME_CONFIGS.jungle.pieceSymbols` has identical data.

- [ ] **Step 10: Run full test suite + lint + typecheck**

```bash
cd apps/web && bun test src/lib/ai/
bun run lint && bun run typecheck
```

Expected: ALL PASS, clean lint/typecheck.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "refactor(ai): extract BaseAdapter with shared scaffolding

Adapters now extend BaseAdapter<T>, inheriting convertGameState,
positionToAlgebraic, algebraicToPosition, getPieceSymbol, groupMovesByPiece,
findPiece, and forEachPiece. Abstract declarations for getAllValidMoves,
generatePrompt, createVisualBoard, analyzeThreatsSafety satisfy the
GameVariantAdapter interface.

Removed: xiangqi's thin-alias getPieceSymbolForMove, jungle's inline
pieceSymbols dict (GAME_CONFIGS is now the sole source).

Kept: chess's dual-symbol getPieceSymbolForMove (tests assert ♙/♟ format),
all local countMaterial implementations (signatures differ per variant)."
```

---

## Task 3: Template methods for move generation + validation; chess dead-code trim

**Files:**

- Modify: `apps/web/src/lib/ai/base-adapter.ts` (add template methods)
- Modify: `apps/web/src/lib/ai/chess-adapter.ts` (trim dead code, use template hooks)
- Modify: `apps/web/src/lib/ai/xiangqi-adapter.ts` (use template hooks)
- Modify: `apps/web/src/lib/ai/shogi-adapter.ts` (use template hooks)
- Modify: `apps/web/src/lib/ai/jungle-adapter.ts` (use template hooks)

**Interfaces:**

- Consumes: `BaseAdapter<T>` from Task 2
- Produces: concrete `getAllValidMoves`, `createVisualBoard`, `wouldMoveBeValid` on BaseAdapter with hooks: `forEachOwnPieceMove`, `getDropMoves`, `expandMoveVariants`, `finalizeMoves`, `isMoveLegal`, `simulateMove`, `isOwnKingInCheck`, `renderSquare`, `renderRowBorder`, `renderHeader`

- [ ] **Step 1: Add template methods to BaseAdapter**

Add to `base-adapter.ts` (these replace the abstract declarations from Task 2 for `getAllValidMoves` and `createVisualBoard`; `generatePrompt` and `analyzeThreatsSafety` stay abstract):

```ts
// Add these protected hook methods with default implementations:

protected expandMoveVariants(
	piece: GamePiece,
	from: GamePosition,
	to: GamePosition
): string[] {
	const symbol = this.getPieceSymbol(piece);
	return [`${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} (${symbol})`];
}

protected getDropMoves(_gameState: T): string[] {
	return []; // Default: no drops. Shogi overrides.
}

protected finalizeMoves(rawMoves: string[]): string[] {
	if (rawMoves.length === 0) {
		return ['No valid moves available (checkmate or stalemate)'];
	}
	return [this.groupMovesByPiece(rawMoves)];
}

// getAllValidMoves template — remove `abstract`, make concrete:
getAllValidMoves(gameState: T): string[] {
	const rawMoves: string[] = [];

	// Board moves via forEachOwnPieceMove hook
	this.forEachOwnPieceMove(gameState, (piece, from, to) => {
		if (this.wouldMoveBeValid(gameState, from, to)) {
			rawMoves.push(...this.expandMoveVariants(piece, from, to));
		}
	});

	// Drop moves (default: none, shogi overrides)
	rawMoves.push(...this.getDropMoves(gameState));

	return this.finalizeMoves(rawMoves);
}

// Hook: iterate own pieces' possible moves. Default uses variant-agnostic
// iteration. Jungle overrides (terrain signature differs).
protected forEachOwnPieceMove(
	gameState: T,
	cb: (piece: NonNullable<T['board'][number][number]>, from: GamePosition, to: GamePosition) => void
): void {
	// Subclasses MUST override this — the move-generation function differs per variant.
	throw new Error('forEachOwnPieceMove must be overridden');
}

// wouldMoveBeValid template — copy/apply/test shell.
// Default: delegate to abstract hooks. Jungle overrides entirely (no king).
protected wouldMoveBeValid(
	gameState: T,
	from: GamePosition,
	to: GamePosition
): boolean {
	const piece = gameState.board[from.row]?.[from.col];
	if (!piece || piece.color !== gameState.currentPlayer) return false;
	if (!this.isMoveLegal(gameState, from, to)) return false;

	const testBoard = this.simulateMove(gameState.board, from, to, piece);
	if (this.isOwnKingInCheck(testBoard, gameState.currentPlayer)) return false;
	return true;
}

protected isMoveLegal(
	_gameState: T,
	_from: GamePosition,
	_to: GamePosition
): boolean {
	return true; // Default: trust getPossibleMoves. Override if variant has special validation.
}

protected simulateMove(
	board: T['board'],
	from: GamePosition,
	to: GamePosition,
	piece: NonNullable<T['board'][number][number]>
): T['board'] {
	// Shallow copy + apply — each variant's board representation differs slightly.
	// Subclasses override with their copyBoard/setPieceAt calls.
	throw new Error('simulateMove must be overridden');
}

protected isOwnKingInCheck(_board: T['board'], _color: string): boolean {
	throw new Error('isOwnKingInCheck must be overridden');
}
```

**Note on `createVisualBoard`:** This stays abstract on BaseAdapter because the rendering differs fundamentally (chess has fancy borders with rank/file headers, xiangqi has river markers, shogi has its own format, jungle is a plain dot grid). Each adapter keeps its own implementation.

**Note on `generatePrompt` and `analyzeThreatsSafety`:** These stay abstract. See spec sections "Why generatePrompt stays mostly on subclasses" and "Why analyzeThreatsSafety stays on the interface AND on every adapter".

- [ ] **Step 2: Override template hooks in ChessAdapter**

Chess needs to provide:

- `forEachOwnPieceMove`: iterate chess pieces using `getPossibleMoves`
- `simulateMove`: use `copyBoard`/`setPieceAt` from chess board utils
- `isOwnKingInCheck`: use `isKingInCheck` from chess game
- `expandMoveVariants`: override for dual symbols `♙/♟`
- `isMoveLegal`: use `isMoveValid` from chess moves

```ts
// In ChessAdapter:

protected forEachOwnPieceMove(
	gameState: GameState,
	cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
): void {
	const { board, currentPlayer } = gameState;
	for (let row = 0; row < BOARD_SIZE; row++) {
		for (let col = 0; col < BOARD_SIZE; col++) {
			const piece = getRow(board, row)[col];
			if (piece && piece.color === currentPlayer) {
				const from = { row, col };
				for (const to of getPossibleMoves(board, piece, from)) {
					cb(piece, from, to);
				}
			}
		}
	}
}

protected simulateMove(
	board: (ChessPiece | null)[][],
	from: Position,
	to: Position,
	piece: ChessPiece
): (ChessPiece | null)[][] {
	const testBoard = copyBoard(board);
	setPieceAt(testBoard, from, null);
	setPieceAt(testBoard, to, piece);
	return testBoard;
}

protected isOwnKingInCheck(board: (ChessPiece | null)[][], color: string): boolean {
	return isKingInCheck(board, color);
}

protected isMoveLegal(
	gameState: GameState,
	from: Position,
	to: Position
): boolean {
	const piece = gameState.board[from.row]?.[from.col];
	if (!piece) return false;
	return isMoveValid(gameState.board, from, to, piece);
}

protected expandMoveVariants(
	piece: ChessPiece,
	from: GamePosition,
	to: GamePosition
): string[] {
	const symbol = this.getPieceSymbolForMove(piece);
	return [`${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} (${symbol})`];
}
```

Now remove the old `getAllValidMoves` and `wouldMoveBeValid` methods from ChessAdapter — they're inherited from BaseAdapter.

- [ ] **Step 3: Trim chess dead code**

Delete these methods from `chess-adapter.ts`:

- `evaluateKingSafety` (only called from `analyzeThreatsSafety`)
- `findAttackedSquares` (only called from `analyzeThreatsSafety`)
- `findPiece` (inherited from BaseAdapter now)
- `groupMovesByPiece` (inherited from BaseAdapter now)

Replace `analyzeThreatsSafety` with a thin stub:

```ts
analyzeThreatsSafety(gameState: GameState): string {
	let analysis = '';
	if (gameState.status === 'check') {
		analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
	}
	const material = this.getSimpleMaterialBalance(gameState);
	analysis += `Material balance: ${material}\n`;
	return analysis;
}
```

This satisfies the two test assertions (`chess-adapter.test.ts:154-167`):

- `'CHECK'` when status is `'check'`
- `'Material'` always present

**KEEP these methods** (all live via `generatePrompt` → `getCriticalThreats` → `findHangingPieces`):

- `getCriticalThreats`, `getSimpleMaterialBalance`, `findHangingPieces`, `isSquareAttackedBy`, `isSquareDefendedBy`, `getExampleMoveFromValidMoves`

- [ ] **Step 4: Run chess adapter tests**

```bash
cd apps/web && bun test src/lib/ai/chess-adapter.test.ts src/lib/ai/chess-adapter.coverage.test.ts
```

Expected: ALL PASS. The `analyzeThreatsSafety` tests check for `'CHECK'` and `'Material'` substrings — both present in the stub.

- [ ] **Step 5: Override template hooks in XiangqiAdapter**

Same pattern as chess — provide `forEachOwnPieceMove`, `simulateMove`, `isOwnKingInCheck`, `isMoveLegal`. Use xiangqi's `getPossibleMoves`, `isMoveValid`, `copyBoard`, `setPieceAt`, `getRow`, `isKingInCheck`.

Remove old `getAllValidMoves` and `wouldMoveBeValid` — inherited from BaseAdapter.

- [ ] **Step 6: Run xiangqi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/xiangqi-adapter.test.ts src/lib/ai/xiangqi-adapter.coverage.test.ts src/lib/ai/xiangqi-adapter.extended.test.ts
```

Expected: ALL PASS.

- [ ] **Step 7: Override template hooks in ShogiAdapter**

Shogi provides the same hooks PLUS:

- `getDropMoves`: generates drop moves from hand pieces
- `expandMoveVariants`: returns 1-2 entries when promotion is optional

```ts
protected getDropMoves(gameState: ShogiGameState): string[] {
	const { board, currentPlayer, senteHand, goteHand } = gameState;
	const handPieces = currentPlayer === 'sente' ? senteHand : goteHand;
	const drops: string[] = [];
	for (const handPiece of handPieces) {
		const pieceSymbol = this.getPieceSymbol(handPiece);
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const dropPos = { row, col };
				if (!board[row]?.[col] && canDropAt(board, handPiece, dropPos)) {
					const testBoard = copyBoard(board);
					setPieceAt(testBoard, dropPos, handPiece);
					if (!isKingInCheck(testBoard, currentPlayer)) {
						drops.push(`*${this.positionToAlgebraic(dropPos)} (${pieceSymbol} drop)`);
					}
				}
			}
		}
	}
	return drops;
}

protected expandMoveVariants(
	piece: ShogiPiece,
	from: GamePosition,
	to: GamePosition
): string[] {
	const fromStr = this.positionToAlgebraic(from);
	const toStr = this.positionToAlgebraic(to);
	const symbol = this.getPieceSymbol(piece);
	const canPromote = this.canPiecePromote(piece, from, to);
	const moves: string[] = [];
	if (canPromote) {
		moves.push(`${fromStr}-${toStr}+ (${symbol})`);
		if (!this.mustPromote(piece, to)) {
			moves.push(`${fromStr}-${toStr} (${symbol})`);
		}
	} else {
		moves.push(`${fromStr}-${toStr} (${symbol})`);
	}
	return moves;
}
```

Remove old `getAllValidMoves` and `wouldMoveBeValid` — inherited.

- [ ] **Step 8: Run shogi adapter tests**

```bash
cd apps/web && bun test src/lib/ai/shogi-adapter.test.ts src/lib/ai/shogi-adapter.coverage.test.ts src/lib/ai/shogi-adapter.extended.test.ts
```

Expected: ALL PASS.

- [ ] **Step 9: Override template hooks in JungleAdapter**

Jungle is structurally different — it overrides `finalizeMoves` (returns raw array, no grouping), `forEachOwnPieceMove` (terrain signature), and `wouldMoveBeValid` (no king to check):

```ts
protected forEachOwnPieceMove(
	gameState: JungleGameState,
	cb: (piece: JunglePiece, from: GamePosition, to: GamePosition) => void
): void {
	for (let row = 0; row < JUNGLE_ROWS; row++) {
		for (let col = 0; col < JUNGLE_COLS; col++) {
			const piece = getPieceAt(gameState.board, { row, col });
			if (piece && piece.color === gameState.currentPlayer) {
				const from = { row, col };
				for (const to of getPossibleMoves(gameState.board, gameState.terrain, from)) {
					cb(piece, from, to);
				}
			}
		}
	}
}

protected expandMoveVariants(
	piece: JunglePiece,
	from: GamePosition,
	to: GamePosition
): string[] {
	// Jungle uses space separator, no piece symbol in parentheses
	return [`${this.positionToAlgebraic(from)} ${this.positionToAlgebraic(to)}`];
}

protected finalizeMoves(rawMoves: string[]): string[] {
	// Jungle returns raw array, no grouping, no "no valid moves" wrapper
	return rawMoves;
}

protected wouldMoveBeValid(
	gameState: JungleGameState,
	_from: GamePosition,
	_to: GamePosition
): boolean {
	return true; // Jungle has no king-check constraint; all getPossibleMoves results are valid
}
```

Remove old `getAllValidMoves` — inherited from BaseAdapter.

**Keep:** `getLegalMoves`, `evaluatePosition`, `getPositionAnalysis`, `gameStateToPrompt`, `createVisualBoard`, `generatePrompt`, `analyzeThreatsSafety`. These all stay as-is.

- [ ] **Step 10: Run jungle adapter tests**

```bash
cd apps/web && bun test src/lib/ai/jungle-adapter.test.ts src/lib/ai/jungle-adapter.coverage.test.ts
```

Expected: ALL PASS.

- [ ] **Step 11: Run full test suite + lint + typecheck**

```bash
cd apps/web && bun test src/lib/ai/
bun run lint && bun run typecheck
```

Expected: ALL PASS, clean.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "refactor(ai): template methods for move generation + validation

Lift getAllValidMoves, wouldMoveBeValid onto BaseAdapter with hooks:
forEachOwnPieceMove, getDropMoves, expandMoveVariants, finalizeMoves,
simulateMove, isOwnKingInCheck.

Chess dead-code trim: delete evaluateKingSafety + findAttackedSquares
(only called by analyzeThreatsSafety, now a thin stub). KEEP
findHangingPieces pipeline (live via getCriticalThreats → generatePrompt).

Shogi: expandMoveVariants returns 1-2 entries for optional promotion.
Jungle: finalizeMoves returns raw array (no grouping); wouldMoveBeValid
always true (no king-check constraint)."
```

---

## Task 4: Create `BaseRuleGuardian<T>` + collapse subclasses

**Files:**

- Create: `apps/web/src/lib/ai/base-rule-guardian.ts`
- Modify: `apps/web/src/lib/ai/rule-guardian.ts` (4 thin subclasses + re-export)

**Interfaces:**

- Consumes: `tryAlgebraicToPosition`, `isValidPosition` from `notation-utils.ts`
- Produces: `BaseRuleGuardian<T>` abstract class, `RuleGuardian<T>` interface, `MoveValidationResult` interface (types defined here, re-exported from `rule-guardian.ts`)

- [ ] **Step 1: Create `base-rule-guardian.ts`**

```ts
// apps/web/src/lib/ai/base-rule-guardian.ts
import type {
  GameVariant,
  GamePosition,
  AnyGameState,
} from './game-variant-types';
import type { AIResponse } from './types';
import { tryAlgebraicToPosition, isValidPosition } from './notation-utils';
import { GAME_CONFIGS } from './game-variant-types';

export interface MoveValidationResult {
  isValid: boolean;
  reason?: string;
  suggestedAlternative?: { from: string; to: string };
}

export interface RuleGuardian<T extends AnyGameState = AnyGameState> {
  gameVariant: GameVariant;
  validateAIMove(gameState: T, aiResponse: AIResponse): MoveValidationResult;
  parseMove(algebraicMove: { from: string; to: string }): {
    fromPos: GamePosition;
    toPos: GamePosition;
    isDrop?: boolean;
  };
}

export abstract class BaseRuleGuardian<T extends AnyGameState = AnyGameState>
  implements RuleGuardian<T>
{
  abstract gameVariant: GameVariant;

  protected getConfig() {
    return GAME_CONFIGS[this.gameVariant];
  }

  parseMove(move: { from: string; to: string }): {
    fromPos: GamePosition;
    toPos: GamePosition;
    isDrop?: boolean;
  } {
    const isDrop = move.from === '*';
    if (isDrop) {
      return {
        fromPos: { row: -1, col: -1 },
        toPos: tryAlgebraicToPosition(this.gameVariant, move.to),
        isDrop: true,
      };
    }
    return {
      fromPos: tryAlgebraicToPosition(this.gameVariant, move.from),
      toPos: tryAlgebraicToPosition(this.gameVariant, move.to),
      isDrop: false,
    };
  }

  validateAIMove(gameState: T, aiResponse: AIResponse): MoveValidationResult {
    try {
      const parsed = this.parseMove(aiResponse.move);

      if (parsed.isDrop) {
        return this.validateDrop(gameState, aiResponse, parsed.toPos);
      }

      if (
        !isValidPosition(this.gameVariant, parsed.fromPos) ||
        !isValidPosition(this.gameVariant, parsed.toPos)
      ) {
        return { isValid: false, reason: 'Move coordinates out of bounds' };
      }
      const piece = gameState.board[parsed.fromPos.row]?.[parsed.fromPos.col];
      if (!piece) {
        return {
          isValid: false,
          reason: `No piece at ${aiResponse.move.from}`,
        };
      }
      if (piece.color !== gameState.currentPlayer) {
        return {
          isValid: false,
          reason: `Not your piece at ${aiResponse.move.from}`,
        };
      }

      return this.validateVariantRules(gameState, piece, parsed, aiResponse);
    } catch (error) {
      return { isValid: false, reason: `Invalid move format: ${error}` };
    }
  }

  protected validateVariantRules(
    _gameState: T,
    _piece: NonNullable<T['board'][number][number]>,
    _parsed: { fromPos: GamePosition; toPos: GamePosition },
    _aiResponse: AIResponse
  ): MoveValidationResult {
    return { isValid: true };
  }

  protected validateDrop(
    _gameState: T,
    aiResponse: AIResponse,
    _toPos: GamePosition
  ): MoveValidationResult {
    return {
      isValid: false,
      reason: `Drop moves not supported by ${this.gameVariant}`,
    };
  }
}
```

- [ ] **Step 2: Rewrite `rule-guardian.ts` as thin subclasses**

Replace the entire file with:

```ts
// apps/web/src/lib/ai/rule-guardian.ts
import { BaseRuleGuardian } from './base-rule-guardian';
import type {
  GameVariant,
  AnyGameState,
  GamePosition,
} from './game-variant-types';
import type { AIResponse } from './types';
import type { ShogiPieceType } from '../shogi';

// Re-export types so existing importers (service.ts, tests) don't break:
export type { RuleGuardian, MoveValidationResult } from './base-rule-guardian';

const VALID_SHOGI_PIECE_TYPES: ShogiPieceType[] = [
  'rook',
  'bishop',
  'gold',
  'silver',
  'knight',
  'lance',
  'pawn',
];

import type { GameState as ChessGameState } from '../chess/types';
import type { XiangqiGameState } from '../xiangqi/types';
import type { ShogiGameState } from '../shogi';
import type { JungleGameState } from '../jungle/types';

export class ChessRuleGuardian extends BaseRuleGuardian<ChessGameState> {
  gameVariant = 'chess' as const;
}

export class XiangqiRuleGuardian extends BaseRuleGuardian<XiangqiGameState> {
  gameVariant = 'xiangqi' as const;

  protected validateVariantRules(
    _gameState: XiangqiGameState,
    piece: NonNullable<XiangqiGameState['board'][number][number]>,
    parsed: { fromPos: GamePosition; toPos: GamePosition },
    _aiResponse: AIResponse
  ): MoveValidationResult {
    if (
      (piece.type === 'king' || piece.type === 'advisor') &&
      !this.isInPalace(parsed.toPos, piece.color)
    ) {
      return { isValid: false, reason: `${piece.type} must stay in palace` };
    }
    if (
      piece.type === 'elephant' &&
      !this.isOnCorrectSide(parsed.toPos, piece.color)
    ) {
      return { isValid: false, reason: 'Elephant cannot cross river' };
    }
    return { isValid: true };
  }

  private isInPalace(pos: GamePosition, color: string): boolean {
    const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
    const palaceCols = [3, 4, 5];
    return palaceRows.includes(pos.row) && palaceCols.includes(pos.col);
  }

  private isOnCorrectSide(pos: GamePosition, color: string): boolean {
    return color === 'red' ? pos.row >= 5 : pos.row <= 4;
  }
}

export class ShogiRuleGuardian extends BaseRuleGuardian<ShogiGameState> {
  gameVariant = 'shogi' as const;

  protected validateDrop(
    gameState: ShogiGameState,
    aiResponse: AIResponse,
    toPos: GamePosition
  ): MoveValidationResult {
    if (!isValidPosition('shogi', toPos)) {
      return { isValid: false, reason: 'Drop coordinates out of bounds' };
    }
    if (gameState.board[toPos.row]?.[toPos.col]) {
      return { isValid: false, reason: 'Cannot drop on occupied square' };
    }
    if (!aiResponse.move.pieceType) {
      return {
        isValid: false,
        reason: 'Drop moves must include pieceType (e.g., "pawn", "lance")',
      };
    }
    if (
      !VALID_SHOGI_PIECE_TYPES.includes(
        aiResponse.move.pieceType as ShogiPieceType
      )
    ) {
      return {
        isValid: false,
        reason: `Invalid pieceType for drop: ${aiResponse.move.pieceType}. Must be one of: ${VALID_SHOGI_PIECE_TYPES.join(', ')}`,
      };
    }
    const hand =
      gameState.currentPlayer === 'sente'
        ? gameState.senteHand
        : gameState.goteHand;
    const pieceInHand = hand.find(
      p =>
        p.type === aiResponse.move.pieceType &&
        p.color === gameState.currentPlayer
    );
    if (!pieceInHand) {
      return {
        isValid: false,
        reason: `You don't have a ${aiResponse.move.pieceType} in your hand`,
      };
    }
    return { isValid: true };
  }
}

export class JungleRuleGuardian extends BaseRuleGuardian<JungleGameState> {
  gameVariant = 'jungle' as const;
}

export function createRuleGuardian<T extends AnyGameState>(
  gameVariant: GameVariant
): RuleGuardian<T> {
  switch (gameVariant) {
    case 'chess':
      return new ChessRuleGuardian() as RuleGuardian<T>;
    case 'xiangqi':
      return new XiangqiRuleGuardian() as RuleGuardian<T>;
    case 'shogi':
      return new ShogiRuleGuardian() as RuleGuardian<T>;
    case 'jungle':
      return new JungleRuleGuardian() as RuleGuardian<T>;
    default:
      throw new Error(`Unsupported game variant: ${gameVariant}`);
  }
}
```

Add `isValidPosition` import at top:

```ts
import { isValidPosition } from './notation-utils';
```

- [ ] **Step 3: Run guardian tests**

```bash
cd apps/web && bun test src/lib/ai/rule-guardian.test.ts src/lib/ai/rule-guardian.extended.test.ts
```

Expected: ALL PASS. Reason strings now say `'Move coordinates out of bounds'` (unqualified) where they used to say `'Move coordinates out of bounds for xiangqi board'` etc. Tests check `.toContain('out of bounds')` so they stay green.

- [ ] **Step 4: Verify service.ts imports still work**

```bash
cd apps/web && bun test src/lib/ai/service.test.ts src/lib/ai/service.extended.test.ts
```

Expected: ALL PASS. `service.ts` imports `RuleGuardian` type from `./rule-guardian` — the re-export keeps this working.

- [ ] **Step 5: Run lint + typecheck**

```bash
bun run lint && bun run typecheck
```

Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(ai): extract BaseRuleGuardian with shared validation core

Collapse 4 guardian classes into thin subclasses of BaseRuleGuardian<T>.
Shared core (parse + bounds + piece-exists + right-color) lives once on the
base. Variant extras via validateVariantRules (xiangqi palace/river) and
validateDrop (shogi hand/pieceType).

RuleGuardian + MoveValidationResult types defined in base-rule-guardian.ts,
re-exported from rule-guardian.ts to avoid circular import.

Reason strings normalized: 'Move coordinates out of bounds' (unqualified).
Tests use .toContain('out of bounds') so stay green."
```

---

## Task 5: Symbol-table typing guard + final audit

**Files:**

- Modify: `apps/web/src/lib/ai/game-variant-types.ts` (tighten `pieceSymbols` typing)
- Verify: all existing tests pass

- [ ] **Step 1: Verify no remaining inline symbol tables**

```bash
rg 'pieceSymbols|symbols\s*=' apps/web/src/lib/ai/ --type ts -l
```

Expected: only `game-variant-types.ts` should contain `pieceSymbols`. No adapter should have inline symbol tables. If any remain, migrate them to use `getPieceSymbol` (which reads from `GAME_CONFIGS`).

- [ ] **Step 2: Tighten `GameVariantConfig.pieceSymbols` typing**

In `game-variant-types.ts`, change the `pieceSymbols` field type from the loose `Record<string, Record<string, string>>` to a variant-aware type. The approach: add a generic parameter to `GameVariantConfig` or use a mapped type.

Since `GameVariantConfig` is currently not generic and is used in `GAME_CONFIGS: Record<GameVariant, GameVariantConfig>`, the simplest approach is to make each variant entry satisfy a per-variant type at the declaration site:

```ts
// In game-variant-types.ts, add this type after GamePieceMap:

// Type helper: the pieceSymbols table shape for a specific variant
type PieceSymbolsFor<V extends GameVariant> = {
	[Color in GamePieceMap[V]['color']]: Record<GamePieceMap[V]['type'], string>;
};

// Then at the GAME_CONFIGS declaration, add satisfies:
export const GAME_CONFIGS = {
	chess: { /* ... */ },
	xiangqi: { /* ... */ },
	shogi: { /* ... */ },
	jungle: { /* ... */ },
} as const satisfies Record<GameVariant, Omit<GameVariantConfig, 'pieceSymbols'> & {
	pieceSymbols: PieceSymbolsFor<GameVariant>;
>;
```

**Note:** This is the trickiest step — the exact type mechanics may need adjustment based on how `GamePieceMap` resolves `'color'` and `'type'`. The goal is that adding a new piece type to a variant's `types.ts` without adding it to `pieceSymbols` causes a compile error.

If the generic approach proves too complex for the existing type structure, an alternative is per-variant `satisfies` at each entry:

```ts
chess: { /* ... */ } satisfies Omit<GameVariantConfig, 'pieceSymbols'> & {
	pieceSymbols: PieceSymbolsFor<'chess'>;
},
```

- [ ] **Step 3: Run typecheck to verify the constraint catches mismatches**

```bash
bun run typecheck
```

Expected: PASS. If it fails, the existing `GAME_CONFIGS` data is missing a symbol — fix the data, not the type.

- [ ] **Step 4: Verify existing files/ranks invariant tests**

Confirm that `game-variant-types.test.ts:240-245` already tests `files.length === boardSize.cols` and `ranks.length === boardSize.rows`. These tests should stay green unchanged.

```bash
cd apps/web && bun test src/lib/ai/game-variant-types.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Run full AI test suite**

```bash
cd apps/web && bun test src/lib/ai/
```

Expected: ALL PASS.

- [ ] **Step 6: Run lint + typecheck at root**

```bash
bun run lint && bun run typecheck
```

Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(ai): tighten pieceSymbols typing with satisfies constraint

GAME_CONFIGS.pieceSymbols now checked at compile time against each
variant's piece-type union. Missing symbols for a new piece type fail
the build instead of being silently omitted.

Existing files/ranks-to-boardSize invariant tests retained unchanged."
```

- [ ] **Step 8: Final verification — run E2E smoke test (optional but recommended)**

```bash
cd apps/web && bun run test:e2e -- --grep "chess|xiangqi|shogi|jungle"
```

Expected: E2E tests that exercise AI move-making stay green (they mock the LLM response, so the refactor doesn't affect them — but this confirms no import/wiring breakage).

---

## Self-Review

### Spec coverage check

| Spec section                                                                                                                                           | Task(s) covering it             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `notation-utils.ts` (coord conversion, bounds, tryAlgebraicToPosition)                                                                                 | Task 1                          |
| `BaseAdapter<T>` skeleton (convertGameState, positionToAlgebraic, getPieceSymbol, formatMoveHistory hooks, groupMovesByPiece, findPiece, forEachPiece) | Task 2                          |
| Abstract declarations (getAllValidMoves, generatePrompt, createVisualBoard, analyzeThreatsSafety)                                                      | Task 2 Step 1                   |
| Template methods (getAllValidMoves with forEachOwnPieceMove/expandMoveVariants/finalizeMoves, wouldMoveBeValid with simulateMove/isOwnKingInCheck)     | Task 3                          |
| Chess dead-code trim (evaluateKingSafety, findAttackedSquares deleted; analyzeThreatsSafety stubbed)                                                   | Task 3 Step 3                   |
| Chess live-code preserved (findHangingPieces, isSquareAttackedBy, isSquareDefendedBy, getCriticalThreats, getSimpleMaterialBalance)                    | Task 3 Step 3 (explicitly kept) |
| Chess dual symbols (expandMoveVariants override for ♙/♟)                                                                                              | Task 3 Step 2                   |
| Shogi promotion expansion (expandMoveVariants returns string[])                                                                                        | Task 3 Step 7                   |
| Jungle finalizeMoves override (raw array, no grouping)                                                                                                 | Task 3 Step 9                   |
| `countMaterial` NOT lifted (stays local)                                                                                                               | Task 2 (not in BaseAdapter)     |
| `generatePrompt` NOT templated (stays abstract)                                                                                                        | Task 2/3 (stays abstract)       |
| `BaseRuleGuardian<T>` with shared core + validateVariantRules/validateDrop hooks                                                                       | Task 4                          |
| RuleGuardian/MoveValidationResult types in base-rule-guardian.ts, re-exported                                                                          | Task 4 Step 1-2                 |
| Symbol guard via satisfies (not Partial)                                                                                                               | Task 5 Step 2                   |
| Files/ranks invariant test (existing, retained)                                                                                                        | Task 5 Step 4                   |
| Contract tests for parsing changes (E2 accepted, e2junk rejected)                                                                                      | Task 1 Step 3                   |
| Behavior-preservation matrix (positionToAlgebraic OOB, RangeError→Error, guardian parseMove)                                                           | Task 1 Steps 3-14               |

All spec sections covered. No gaps found.

### Placeholder scan

No TBDs, TODOs, or vague references. All code blocks are complete. Where existing methods are "lifted verbatim" (xiangqi palace helpers, shogi drop logic), the full code is provided inline.

### Type consistency

- `expandMoveVariants` returns `string[]` consistently in base, chess, shogi, jungle
- `finalizeMoves` takes `string[]`, returns `string[]` consistently
- `forEachOwnPieceMove` callback signature matches across base and all overrides
- `validateVariantRules` / `validateDrop` signatures match between base and xiangqi/shogi overrides
- `BaseAdapter` hook names match between definition and subclass overrides
- `PieceSymbolsFor<V>` type uses `GamePieceMap[V]` consistently
