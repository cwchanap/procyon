import { test, expect, describe } from 'bun:test';
import { getPossibleMoves, isMoveValid } from './moves';
import { createInitialBoard, setPieceAt } from './board';
import type { ChessPiece } from './types';

describe('isMoveValid - direct tests', () => {
	test('returns true for a valid pawn move', () => {
		const board = createInitialBoard();
		const pawn = board[6]![4]!; // e2 white pawn
		expect(isMoveValid(board, { row: 6, col: 4 }, { row: 5, col: 4 }, pawn)).toBe(true);
	});

	test('returns true for a valid two-step pawn advance', () => {
		const board = createInitialBoard();
		const pawn = board[6]![4]!; // e2 white pawn
		expect(isMoveValid(board, { row: 6, col: 4 }, { row: 4, col: 4 }, pawn)).toBe(true);
	});

	test('returns false for an invalid pawn move (backward)', () => {
		const board = createInitialBoard();
		const pawn = board[6]![4]!; // e2 white pawn
		expect(isMoveValid(board, { row: 6, col: 4 }, { row: 7, col: 4 }, pawn)).toBe(false);
	});

	test('returns false for an invalid knight jump (not L-shape)', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const knight: ChessPiece = { type: 'knight', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, knight);
		// Straight horizontal is not an L-shape
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 6 }, knight)).toBe(false);
	});

	test('returns true for a valid knight L-shape move', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const knight: ChessPiece = { type: 'knight', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, knight);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 2, col: 3 }, knight)).toBe(true);
	});

	test('returns false when destination is occupied by own piece', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		const ally: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, rook);
		setPieceAt(board, { row: 4, col: 7 }, ally);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 7 }, rook)).toBe(false);
	});

	test('returns true when capturing opponent piece', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		const opponent: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, rook);
		setPieceAt(board, { row: 4, col: 7 }, opponent);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 7 }, rook)).toBe(true);
	});
});

describe('Pawn - additional edge cases', () => {
	test('white pawn cannot move two squares when not on starting row', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 3, col: 4 }, pawn); // e5 (not starting row)
		const moves = getPossibleMoves(board, pawn, { row: 3, col: 4 });
		expect(moves).toContainEqual({ row: 2, col: 4 }); // One square forward
		expect(moves).not.toContainEqual({ row: 1, col: 4 }); // Cannot jump two squares
	});

	test('white pawn cannot move forward when blocked', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		const blocker: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(board, { row: 6, col: 4 }, pawn); // e2
		setPieceAt(board, { row: 5, col: 4 }, blocker); // e3 (blocking)
		const moves = getPossibleMoves(board, pawn, { row: 6, col: 4 });
		expect(moves).not.toContainEqual({ row: 5, col: 4 });
		expect(moves).not.toContainEqual({ row: 4, col: 4 }); // Two-step also blocked
	});

	test('white pawn two-step blocked if intermediate square is occupied', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		const blocker: ChessPiece = { type: 'rook', color: 'black' };
		setPieceAt(board, { row: 6, col: 0 }, pawn); // a2
		setPieceAt(board, { row: 5, col: 0 }, blocker); // a3 (intermediate square occupied)
		const moves = getPossibleMoves(board, pawn, { row: 6, col: 0 });
		// Cannot go to a3 (blocked) or a4 (two-step through blocked square)
		expect(moves).not.toContainEqual({ row: 5, col: 0 });
		expect(moves).not.toContainEqual({ row: 4, col: 0 });
	});

	test('black pawn moves downward from starting row 1', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const pawn: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 1, col: 4 }, pawn); // e7 starting position
		const moves = getPossibleMoves(board, pawn, { row: 1, col: 4 });
		expect(moves).toContainEqual({ row: 2, col: 4 }); // e6
		expect(moves).toContainEqual({ row: 3, col: 4 }); // e5 (two steps from start)
	});

	test('pawn cannot capture forward, only diagonally', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };
		const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, whitePawn);
		setPieceAt(board, { row: 3, col: 4 }, blackPawn); // Directly in front - blocks but no capture
		const moves = getPossibleMoves(board, whitePawn, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 3, col: 4 }); // Cannot capture forward
	});
});

describe('Rook - sliding and blocking', () => {
	test('rook at corner has 14 moves on empty board', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		setPieceAt(board, { row: 0, col: 0 }, rook);
		const moves = getPossibleMoves(board, rook, { row: 0, col: 0 });
		expect(moves.length).toBe(14); // 7 horizontal + 7 vertical
	});

	test('rook is blocked by ally and can capture opponent', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const rook: ChessPiece = { type: 'rook', color: 'white' };
		const ally: ChessPiece = { type: 'pawn', color: 'white' };
		const opp: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, rook);
		setPieceAt(board, { row: 4, col: 2 }, ally); // Blocks left side
		setPieceAt(board, { row: 2, col: 4 }, opp); // Can capture upward
		const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 4, col: 2 }); // Ally block
		expect(moves).not.toContainEqual({ row: 4, col: 1 }); // Beyond ally
		expect(moves).toContainEqual({ row: 4, col: 3 }); // Can reach square before ally
		expect(moves).toContainEqual({ row: 2, col: 4 }); // Can capture opponent
		expect(moves).not.toContainEqual({ row: 1, col: 4 }); // Cannot go beyond opponent
	});
});

describe('Bishop - diagonal movement', () => {
	test('bishop in corner has limited diagonal moves', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const bishop: ChessPiece = { type: 'bishop', color: 'white' };
		setPieceAt(board, { row: 0, col: 0 }, bishop); // a8 corner
		const moves = getPossibleMoves(board, bishop, { row: 0, col: 0 });
		// Only one diagonal is available from corner
		expect(moves.length).toBe(7);
		expect(moves).toContainEqual({ row: 7, col: 7 });
	});

	test('bishop can capture diagonally', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const bishop: ChessPiece = { type: 'bishop', color: 'white' };
		const target: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, bishop);
		setPieceAt(board, { row: 2, col: 6 }, target);
		const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });
		expect(moves).toContainEqual({ row: 2, col: 6 }); // Can capture
		expect(moves).not.toContainEqual({ row: 1, col: 7 }); // Beyond capture
	});
});

describe('Queen - combined movement', () => {
	test('queen at center has maximum moves on empty board', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const queen: ChessPiece = { type: 'queen', color: 'white' };
		setPieceAt(board, { row: 3, col: 3 }, queen); // d5 center
		const moves = getPossibleMoves(board, queen, { row: 3, col: 3 });
		// 14 (rook-like) + ... varies by position
		expect(moves.length).toBeGreaterThan(20);
	});

	test('queen captures on diagonals and straights', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const queen: ChessPiece = { type: 'queen', color: 'white' };
		const opp1: ChessPiece = { type: 'pawn', color: 'black' };
		const opp2: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, queen);
		setPieceAt(board, { row: 4, col: 7 }, opp1); // Horizontal
		setPieceAt(board, { row: 1, col: 7 }, opp2); // Diagonal
		const moves = getPossibleMoves(board, queen, { row: 4, col: 4 });
		expect(moves).toContainEqual({ row: 4, col: 7 }); // Capture horizontal
		expect(moves).toContainEqual({ row: 1, col: 7 }); // Capture diagonal
	});
});

describe('Knight - L-shape and edge positions', () => {
	test('knight at corner a8 has only 2 possible moves', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const knight: ChessPiece = { type: 'knight', color: 'white' };
		setPieceAt(board, { row: 0, col: 0 }, knight); // a8 corner
		const moves = getPossibleMoves(board, knight, { row: 0, col: 0 });
		expect(moves.length).toBe(2);
		expect(moves).toContainEqual({ row: 1, col: 2 }); // b7
		expect(moves).toContainEqual({ row: 2, col: 1 }); // c6
	});

	test('knight can capture over blocking pieces', () => {
		const board = createInitialBoard();
		const knight = board[7]![1]!; // b1 white knight
		const moves = getPossibleMoves(board, knight, { row: 7, col: 1 });
		// Knight jumps over white pawns at row 6
		expect(moves).toContainEqual({ row: 5, col: 0 }); // a3
		expect(moves).toContainEqual({ row: 5, col: 2 }); // c3
	});
});

describe('King - movement restrictions', () => {
	test('king can capture adjacent opponent piece', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const king: ChessPiece = { type: 'king', color: 'white' };
		const opp: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(board, { row: 4, col: 4 }, king);
		setPieceAt(board, { row: 4, col: 5 }, opp);
		const moves = getPossibleMoves(board, king, { row: 4, col: 4 });
		expect(moves).toContainEqual({ row: 4, col: 5 }); // Can capture
	});

	test('king at bottom-left corner has exactly 3 moves', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const king: ChessPiece = { type: 'king', color: 'white' };
		setPieceAt(board, { row: 7, col: 0 }, king); // a1 corner
		const moves = getPossibleMoves(board, king, { row: 7, col: 0 });
		expect(moves.length).toBe(3);
	});

	test('king has exactly 8 moves in open center', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const king: ChessPiece = { type: 'king', color: 'white' };
		setPieceAt(board, { row: 4, col: 4 }, king); // e5 center
		const moves = getPossibleMoves(board, king, { row: 4, col: 4 });
		expect(moves.length).toBe(8);
	});
});
