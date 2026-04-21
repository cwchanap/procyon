import { test, expect, describe } from 'bun:test';
import { getPossibleMoves, isMoveValid } from './moves';
import { setPieceAt } from './board';
import type { ChessPiece } from './types';

function emptyBoard(): (ChessPiece | null)[][] {
	return Array(8)
		.fill(null)
		.map(() => Array(8).fill(null));
}

// ---------------------------------------------------------------------------
// default case - unknown piece type
// ---------------------------------------------------------------------------

describe('getPossibleMoves - unknown piece type', () => {
	test('returns empty array for unknown piece type', () => {
		const board = emptyBoard();
		const unknown = { type: 'unicorn', color: 'white' } as unknown as ChessPiece;
		setPieceAt(board, { row: 4, col: 4 }, unknown);
		const moves = getPossibleMoves(board, unknown, { row: 4, col: 4 });
		expect(moves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Pawn edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - pawn boundary cases', () => {
	test('white pawn on row 1 (one step from promotion) moves one square', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 1, col: 4 }, pawn);
		const moves = getPossibleMoves(board, pawn, { row: 1, col: 4 });
		expect(moves).toContainEqual({ row: 0, col: 4 });
		expect(moves).not.toContainEqual({ row: -1, col: 4 }); // off board
	});

	test('black pawn on row 6 (one step from promotion) moves one square', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 6, col: 4 }, pawn);
		const moves = getPossibleMoves(board, pawn, { row: 6, col: 4 });
		expect(moves).toContainEqual({ row: 7, col: 4 });
		expect(moves).not.toContainEqual({ row: 8, col: 4 }); // off board
	});

	test('white pawn on starting row cannot move two squares if first square is blocked', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		const blocker: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 6, col: 4 }, pawn);
		setPieceAt(board, { row: 5, col: 4 }, blocker); // blocks first square
		const moves = getPossibleMoves(board, pawn, { row: 6, col: 4 });
		expect(moves).not.toContainEqual({ row: 5, col: 4 });
		expect(moves).not.toContainEqual({ row: 4, col: 4 });
	});

	test('white pawn diagonal capture only available when opponent present', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, pawn);
		// No pieces diagonally
		const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 3, col: 3 });
		expect(moves).not.toContainEqual({ row: 3, col: 5 });
	});

	test('white pawn cannot capture own piece diagonally', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		const ally: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, pawn);
		setPieceAt(board, { row: 3, col: 5 }, ally); // ally diagonal
		const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 3, col: 5 });
	});
});

// ---------------------------------------------------------------------------
// Rook edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - rook boundary cases', () => {
	test('rook at corner a8 has 14 moves', () => {
		const board = emptyBoard();
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		setPieceAt(board, { row: 0, col: 0 }, rook);
		const moves = getPossibleMoves(board, rook, { row: 0, col: 0 });
		expect(moves).toHaveLength(14);
	});

	test('rook captures in both directions', () => {
		const board = emptyBoard();
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		const left: ChessPiece = { type: 'pawn', color: 'black' };
		const right: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, rook);
		setPieceAt(board, { row: 4, col: 2 }, left);
		setPieceAt(board, { row: 4, col: 6 }, right);
		const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });
		expect(moves).toContainEqual({ row: 4, col: 2 }); // can capture left
		expect(moves).toContainEqual({ row: 4, col: 6 }); // can capture right
		expect(moves).not.toContainEqual({ row: 4, col: 1 }); // behind capture
		expect(moves).not.toContainEqual({ row: 4, col: 7 }); // behind capture
	});
});

// ---------------------------------------------------------------------------
// Bishop edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - bishop boundary cases', () => {
	test('bishop at corner h1 has 7 moves', () => {
		const board = emptyBoard();
		const bishop: ChessPiece = { type: 'bishop', color: 'white' };
		setPieceAt(board, { row: 7, col: 7 }, bishop);
		const moves = getPossibleMoves(board, bishop, { row: 7, col: 7 });
		expect(moves).toHaveLength(7);
	});

	test('bishop can capture on diagonal', () => {
		const board = emptyBoard();
		const bishop: ChessPiece = { type: 'bishop', color: 'white' };
		const target: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, bishop);
		setPieceAt(board, { row: 2, col: 6 }, target);
		const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });
		expect(moves).toContainEqual({ row: 2, col: 6 });
		expect(moves).not.toContainEqual({ row: 1, col: 7 }); // behind capture
	});
});

// ---------------------------------------------------------------------------
// Knight edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - knight boundary cases', () => {
	test('knight at corner a8 has exactly 2 moves', () => {
		const board = emptyBoard();
		const knight: ChessPiece = { type: 'knight', color: 'white' };
		setPieceAt(board, { row: 0, col: 0 }, knight);
		const moves = getPossibleMoves(board, knight, { row: 0, col: 0 });
		expect(moves).toHaveLength(2);
		expect(moves).toContainEqual({ row: 1, col: 2 });
		expect(moves).toContainEqual({ row: 2, col: 1 });
	});
});

// ---------------------------------------------------------------------------
// isMoveValid - edge cases
// ---------------------------------------------------------------------------

describe('isMoveValid - boundary cases', () => {
	test('returns false for destination same as from', () => {
		const board = emptyBoard();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, pawn);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 4 }, pawn)).toBe(false);
	});

	test('returns false for queen trying to jump over a piece', () => {
		const board = emptyBoard();
		const queen: ChessPiece = { type: 'queen', color: 'white' };
		const blocker: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, queen);
		setPieceAt(board, { row: 4, col: 5 }, blocker);
		// Queen can't reach col 6 because ally blocks at col 5
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 6 }, queen)).toBe(false);
	});
});
