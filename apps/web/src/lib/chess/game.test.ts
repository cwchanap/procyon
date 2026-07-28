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

describe('chess game orchestration', () => {
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
		const human = makeMove(
			state,
			{ row: 1, col: 0 },
			{ row: 0, col: 0 },
			'rook'
		);
		expect(rival).toEqual(human);
	});

	test('rival castling and en passant use the same atomic rules', () => {
		const castle = createGameStateFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
		const castled = makeAIMove(castle, 'e1', 'g1');
		expect(castled?.board[7]?.[6]?.type).toBe('king');
		expect(castled?.board[7]?.[5]?.type).toBe('rook');

		const enPassant = createGameStateFromFen(
			'4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
		);
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
		expect(
			makeMove(terminal, { row: 0, col: 7 }, { row: 1, col: 7 })
		).toBeNull();
		expect(makeAIMove(terminal, 'h8', 'h7')).toBeNull();
		expect(isTerminalState(terminal)).toBe(true);
		expect(isAITurn(terminal)).toBe(false);
	});
});
