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
