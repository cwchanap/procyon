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
