import { describe, test, expect } from 'bun:test';
import { applyJungleAIMove } from './ai-move';
import { createInitialGameState } from './game';
import type { JunglePosition } from './types';

describe('applyJungleAIMove', () => {
	test('throws "no selectable piece" when the source square is empty', () => {
		// a4 = col 3, row 5 — an empty square in the initial jungle
		// position. selectSquare finds no piece there, so the helper
		// surfaces the "no selectable piece" guard.
		const state = createInitialGameState();
		const fromPos: JunglePosition = { row: 5, col: 3 };
		const toPos: JunglePosition = { row: 4, col: 3 };

		expect(() => applyJungleAIMove(state, fromPos, toPos, 'a4', 'a5')).toThrow(
			/AI move invalid: no selectable piece at a4/
		);
	});

	test('throws "unable to apply" when the destination is illegal', () => {
		// a1 = red lion (row 8, col 0). a5 = row 4, col 0 — four squares
		// away. The lion moves only one square orthogonally, so a1->a5
		// is illegal: selectSquare selects the lion but the second call
		// does not grow moveHistory.
		const state = createInitialGameState();
		const fromPos: JunglePosition = { row: 8, col: 0 };
		const toPos: JunglePosition = { row: 4, col: 0 };

		expect(() => applyJungleAIMove(state, fromPos, toPos, 'a1', 'a5')).toThrow(
			/AI move invalid: unable to apply a1 -> a5/
		);
	});

	test('applies a legal one-square lion move and switches the turn', () => {
		// a1 = red lion (row 8, col 0). a2 = row 7, col 0 — one square
		// forward, an empty square. The lion can step there legally.
		const state = createInitialGameState();
		const fromPos: JunglePosition = { row: 8, col: 0 };
		const toPos: JunglePosition = { row: 7, col: 0 };

		const result = applyJungleAIMove(state, fromPos, toPos, 'a1', 'a2');

		expect(result.moveHistory).toHaveLength(1);
		expect(result.currentPlayer).toBe('blue');
		expect(result.selectedSquare).toBeNull();
	});
});
