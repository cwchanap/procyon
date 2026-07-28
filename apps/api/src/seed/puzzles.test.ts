import { describe, expect, test } from 'bun:test';
import {
	PUZZLE_DATA,
	isSquareAttacked,
	validatePuzzlePosition,
} from './puzzles';

type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
type Color = 'white' | 'black';
type P = { type: PieceType; color: Color } | null;
const _ = null;

function makeBoard(pieces: P[][]): P[][] {
	return pieces;
}

describe('seed puzzle validation', () => {
	test('every shipped puzzle passes validation (non-moving side not in check)', () => {
		for (const puzzle of PUZZLE_DATA) {
			expect(() =>
				validatePuzzlePosition({
					slug: puzzle.slug,
					playerColor: puzzle.playerColor as Color,
					board: puzzle.board,
				})
			).not.toThrow();
		}
	});

	test('rejects the original invalid positions (regression)', () => {
		// skewer-queen-1: wQ a1 attacks bK e5 via the a1-e5 diagonal
		const skewer = makeBoard([
			[_, _, _, _, { type: 'rook', color: 'black' }, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, { type: 'king', color: 'black' }, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[
				{ type: 'queen', color: 'white' },
				_,
				_,
				_,
				_,
				_,
				{ type: 'king', color: 'white' },
				_,
			],
		]);
		expect(() =>
			validatePuzzlePosition({
				slug: 'skewer-queen-1-original',
				playerColor: 'white',
				board: skewer,
			})
		).toThrow(/already in check/);

		// two-rooks-mate-1: wR h8 attacks bK a8 along rank 8
		const twoRooks = makeBoard([
			[
				{ type: 'king', color: 'black' },
				_,
				_,
				_,
				_,
				_,
				_,
				{ type: 'rook', color: 'white' },
			],
			[{ type: 'pawn', color: 'black' }, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[
				_,
				{ type: 'rook', color: 'white' },
				_,
				_,
				{ type: 'king', color: 'white' },
				_,
				_,
				_,
			],
		]);
		expect(() =>
			validatePuzzlePosition({
				slug: 'two-rooks-mate-1-original',
				playerColor: 'white',
				board: twoRooks,
			})
		).toThrow(/already in check/);

		// queen-fork-1: wQ b3 attacks bK b7 along the b-file
		const queenFork = makeBoard([
			[_, _, _, _, _, _, _, _],
			[_, { type: 'king', color: 'black' }, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, { type: 'rook', color: 'black' }],
			[_, _, _, _, _, _, _, _],
			[_, { type: 'queen', color: 'white' }, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, { type: 'king', color: 'white' }, _],
		]);
		expect(() =>
			validatePuzzlePosition({
				slug: 'queen-fork-1-original',
				playerColor: 'white',
				board: queenFork,
			})
		).toThrow(/already in check/);
	});

	test('rejects non-8×8 boards', () => {
		expect(() =>
			validatePuzzlePosition({
				slug: 'bad-size',
				playerColor: 'white',
				board: Array.from({ length: 7 }, () => Array<P>(8).fill(_)),
			})
		).toThrow(/8×8/);
	});

	test('rejects missing king', () => {
		const noKing = makeBoard([
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, { type: 'king', color: 'white' }, _],
		]);
		expect(() =>
			validatePuzzlePosition({
				slug: 'no-black-king',
				playerColor: 'white',
				board: noKing,
			})
		).toThrow(/one king per side/);
	});

	test('rejects duplicate king', () => {
		const twoKings = makeBoard([
			[_, _, _, _, { type: 'king', color: 'black' }, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[
				_,
				_,
				_,
				_,
				{ type: 'king', color: 'black' },
				_,
				{ type: 'king', color: 'white' },
				_,
			],
		]);
		expect(() =>
			validatePuzzlePosition({
				slug: 'two-black-kings',
				playerColor: 'white',
				board: twoKings,
			})
		).toThrow(/more than one black king/);
	});
});

describe('isSquareAttacked', () => {
	function emptyBoard(): P[][] {
		return Array.from({ length: 8 }, () => Array<P>(8).fill(_));
	}

	test('detects pawn attacks (white pawn attacks up-diagonals)', () => {
		const board = emptyBoard();
		board[4]![4] = { type: 'pawn', color: 'white' }; // e4 (row 4, col 4)
		// White pawn on e4 attacks d5 (row 3, col 3) and f5 (row 3, col 5)
		expect(isSquareAttacked(board, 3, 3, 'white')).toBe(true);
		expect(isSquareAttacked(board, 3, 5, 'white')).toBe(true);
		expect(isSquareAttacked(board, 5, 3, 'white')).toBe(false);
	});

	test('detects pawn attacks (black pawn attacks down-diagonals)', () => {
		const board = emptyBoard();
		board[4]![4] = { type: 'pawn', color: 'black' }; // e4 (row 4, col 4)
		// Black pawn on e4 attacks d3 (row 5, col 3) and f3 (row 5, col 5)
		expect(isSquareAttacked(board, 5, 3, 'black')).toBe(true);
		expect(isSquareAttacked(board, 5, 5, 'black')).toBe(true);
		expect(isSquareAttacked(board, 3, 3, 'black')).toBe(false);
	});

	test('detects knight attacks', () => {
		const board = emptyBoard();
		board[4]![4] = { type: 'knight', color: 'white' }; // e4 (row 4, col 4)
		expect(isSquareAttacked(board, 2, 3, 'white')).toBe(true); // d6
		expect(isSquareAttacked(board, 2, 5, 'white')).toBe(true); // f6
		expect(isSquareAttacked(board, 6, 3, 'white')).toBe(true); // d2
		expect(isSquareAttacked(board, 5, 5, 'white')).toBe(false); // f3 not a knight move
	});

	test('detects sliding attacks with obstruction', () => {
		const board = emptyBoard();
		board[7]![0] = { type: 'rook', color: 'white' }; // a1
		board[7]![3] = { type: 'pawn', color: 'black' }; // d1 blocks
		expect(isSquareAttacked(board, 7, 7, 'white')).toBe(false); // h1 blocked
		expect(isSquareAttacked(board, 7, 2, 'white')).toBe(true); // c1
	});

	test('detects bishop diagonal attacks', () => {
		const board = emptyBoard();
		board[7]![0] = { type: 'bishop', color: 'white' }; // a1
		expect(isSquareAttacked(board, 4, 3, 'white')).toBe(true); // e5 on a1-e5 diagonal
		expect(isSquareAttacked(board, 3, 3, 'white')).toBe(false); // d5 not on diagonal
	});

	test('detects king adjacency', () => {
		const board = emptyBoard();
		board[4]![4] = { type: 'king', color: 'white' }; // e4
		expect(isSquareAttacked(board, 3, 3, 'white')).toBe(true); // d5
		expect(isSquareAttacked(board, 5, 5, 'white')).toBe(true); // f3
		expect(isSquareAttacked(board, 2, 4, 'white')).toBe(false); // e6 too far
	});
});
