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
