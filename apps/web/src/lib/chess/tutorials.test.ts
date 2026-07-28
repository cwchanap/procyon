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
