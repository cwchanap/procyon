import { test, expect, describe } from 'bun:test';
import {
	createInitialXiangqiGameState,
	selectSquare,
	isKingInCheck,
	undoMove,
	resetGame,
} from './game';
import { isValidMove, getPossibleMoves } from './moves';
import { setPieceAt, getPieceAt } from './board';
import type { XiangqiPiece } from './types';

function emptyBoard(): (XiangqiPiece | null)[][] {
	return Array.from({ length: 10 }, () =>
		Array<XiangqiPiece | null>(9).fill(null)
	);
}

// ---------------------------------------------------------------------------
// isValidMove - guard conditions
// ---------------------------------------------------------------------------

describe('isValidMove - guard conditions', () => {
	test('returns false when no piece at from', () => {
		const board = emptyBoard();
		expect(isValidMove(board, { row: 5, col: 5 }, { row: 5, col: 6 })).toBe(false);
	});

	test('returns false when destination is occupied by own piece', () => {
		const board = emptyBoard();
		const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
		const ally: XiangqiPiece = { type: 'soldier', color: 'red' };
		setPieceAt(board, { row: 5, col: 0 }, chariot);
		setPieceAt(board, { row: 5, col: 3 }, ally);
		expect(isValidMove(board, { row: 5, col: 0 }, { row: 5, col: 3 })).toBe(false);
	});

	test('returns false for invalid from position', () => {
		const board = emptyBoard();
		expect(isValidMove(board, { row: -1, col: 0 }, { row: 0, col: 0 })).toBe(false);
	});

	test('returns false for invalid to position', () => {
		const board = emptyBoard();
		const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
		setPieceAt(board, { row: 5, col: 0 }, chariot);
		expect(isValidMove(board, { row: 5, col: 0 }, { row: 5, col: -1 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Elephant move validation
// ---------------------------------------------------------------------------

describe('isValidMove - elephant', () => {
	test('elephant can move 2 diagonals when path is clear', () => {
		const board = emptyBoard();
		const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
		setPieceAt(board, { row: 7, col: 2 }, elephant);
		expect(isValidMove(board, { row: 7, col: 2 }, { row: 9, col: 4 })).toBe(true);
		expect(isValidMove(board, { row: 7, col: 2 }, { row: 9, col: 0 })).toBe(true);
	});

	test('elephant is blocked when path piece present (elephant eye blocked)', () => {
		const board = emptyBoard();
		const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
		const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };
		setPieceAt(board, { row: 7, col: 2 }, elephant);
		// Block the diagonal midpoint
		setPieceAt(board, { row: 8, col: 3 }, blocker);
		expect(isValidMove(board, { row: 7, col: 2 }, { row: 9, col: 4 })).toBe(false);
	});

	test('elephant cannot cross the river', () => {
		const board = emptyBoard();
		const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
		setPieceAt(board, { row: 7, col: 4 }, elephant);
		// Moving within red side (rows 5-9) is allowed
		expect(isValidMove(board, { row: 7, col: 4 }, { row: 5, col: 2 })).toBe(true);
		// Another move within red side (rows 5-9) is also allowed
		expect(isValidMove(board, { row: 7, col: 4 }, { row: 5, col: 6 })).toBe(true);
		setPieceAt(board, { row: 5, col: 2 }, elephant);
		expect(isValidMove(board, { row: 5, col: 2 }, { row: 3, col: 4 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Horse move validation (blocking)
// ---------------------------------------------------------------------------

describe('isValidMove - horse (blocking)', () => {
	test('horse is blocked when leg piece present (row direction)', () => {
		const board = emptyBoard();
		const horse: XiangqiPiece = { type: 'horse', color: 'red' };
		const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };
		setPieceAt(board, { row: 5, col: 4 }, horse);
		setPieceAt(board, { row: 4, col: 4 }, blocker); // blocks upward leg
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 3 })).toBe(false);
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 5 })).toBe(false);
	});

	test('horse is blocked when leg piece present (col direction)', () => {
		const board = emptyBoard();
		const horse: XiangqiPiece = { type: 'horse', color: 'red' };
		const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };
		setPieceAt(board, { row: 5, col: 4 }, horse);
		setPieceAt(board, { row: 5, col: 5 }, blocker); // blocks rightward leg
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 4, col: 6 })).toBe(false);
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 6, col: 6 })).toBe(false);
	});

	test('horse can move freely when leg is unblocked', () => {
		const board = emptyBoard();
		const horse: XiangqiPiece = { type: 'horse', color: 'red' };
		setPieceAt(board, { row: 5, col: 4 }, horse);
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 3 })).toBe(true);
		expect(isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 5 })).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Cannon move validation
// ---------------------------------------------------------------------------

describe('isValidMove - cannon', () => {
	test('cannon moves without capturing when path is clear', () => {
		const board = emptyBoard();
		const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
		setPieceAt(board, { row: 7, col: 1 }, cannon);
		expect(isValidMove(board, { row: 7, col: 1 }, { row: 7, col: 5 })).toBe(true);
	});

	test('cannon cannot jump over pieces without capturing', () => {
		const board = emptyBoard();
		const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
		const screen: XiangqiPiece = { type: 'soldier', color: 'red' };
		const target: XiangqiPiece = { type: 'chariot', color: 'black' };
		setPieceAt(board, { row: 7, col: 1 }, cannon);
		setPieceAt(board, { row: 7, col: 3 }, screen); // screen
		setPieceAt(board, { row: 7, col: 5 }, target); // target to capture
		// Non-capturing move past the screen is rejected (no jumping to empty squares)
		expect(isValidMove(board, { row: 7, col: 1 }, { row: 7, col: 4 })).toBe(false);
		// Can capture target at col 5 (exactly one screen)
		expect(isValidMove(board, { row: 7, col: 1 }, { row: 7, col: 5 })).toBe(true);
	});

	test('cannon cannot capture with no screen', () => {
		const board = emptyBoard();
		const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
		const target: XiangqiPiece = { type: 'chariot', color: 'black' };
		setPieceAt(board, { row: 7, col: 1 }, cannon);
		setPieceAt(board, { row: 7, col: 5 }, target);
		// No screen between cannon and target — cannot capture
		expect(isValidMove(board, { row: 7, col: 1 }, { row: 7, col: 5 })).toBe(false);
	});

	test('cannon cannot move diagonally', () => {
		const board = emptyBoard();
		const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
		setPieceAt(board, { row: 7, col: 1 }, cannon);
		expect(isValidMove(board, { row: 7, col: 1 }, { row: 6, col: 2 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Soldier move validation
// ---------------------------------------------------------------------------

describe('isValidMove - soldier', () => {
	test('red soldier before crossing river can only move forward', () => {
		const board = emptyBoard();
		const soldier: XiangqiPiece = { type: 'soldier', color: 'red' };
		setPieceAt(board, { row: 6, col: 4 }, soldier); // red side, row 6
		expect(isValidMove(board, { row: 6, col: 4 }, { row: 5, col: 4 })).toBe(true); // forward
		expect(isValidMove(board, { row: 6, col: 4 }, { row: 6, col: 3 })).toBe(false); // sideways
		expect(isValidMove(board, { row: 6, col: 4 }, { row: 6, col: 5 })).toBe(false); // sideways
		expect(isValidMove(board, { row: 6, col: 4 }, { row: 7, col: 4 })).toBe(false); // backward
	});

	test('red soldier after crossing river can move forward and sideways', () => {
		const board = emptyBoard();
		const soldier: XiangqiPiece = { type: 'soldier', color: 'red' };
		setPieceAt(board, { row: 4, col: 4 }, soldier); // black side, row 4
		expect(isValidMove(board, { row: 4, col: 4 }, { row: 3, col: 4 })).toBe(true); // forward
		expect(isValidMove(board, { row: 4, col: 4 }, { row: 4, col: 3 })).toBe(true); // sideways
		expect(isValidMove(board, { row: 4, col: 4 }, { row: 4, col: 5 })).toBe(true); // sideways
		expect(isValidMove(board, { row: 4, col: 4 }, { row: 5, col: 4 })).toBe(false); // backward
	});
});

// ---------------------------------------------------------------------------
// getPossibleMoves
// ---------------------------------------------------------------------------

describe('getPossibleMoves', () => {
	test('returns moves for a chariot in open position', () => {
		const board = emptyBoard();
		const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
		setPieceAt(board, { row: 5, col: 4 }, chariot);
		const moves = getPossibleMoves(board, { row: 5, col: 4 });
		// Chariot can reach all squares on same row and column
		expect(moves.length).toBeGreaterThan(0);
		expect(moves).toContainEqual({ row: 5, col: 0 });
		expect(moves).toContainEqual({ row: 5, col: 8 });
		expect(moves).toContainEqual({ row: 0, col: 4 });
		expect(moves).toContainEqual({ row: 9, col: 4 });
	});

	test('returns empty when no piece at position', () => {
		const board = emptyBoard();
		const moves = getPossibleMoves(board, { row: 5, col: 4 });
		expect(moves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// selectSquare - additional branches
// ---------------------------------------------------------------------------

describe('selectSquare - additional branches', () => {
	test('clicking a valid move destination executes the move', () => {
		let state = createInitialXiangqiGameState();
		// Select red horse
		state = selectSquare(state, { row: 9, col: 1 });
		expect(state.selectedSquare).toEqual({ row: 9, col: 1 });
		// Click a valid destination for the horse
		const dest = state.possibleMoves[0];
		expect(dest).toBeDefined();
		state = selectSquare(state, dest!);
		expect(state.currentPlayer).toBe('black');
		expect(state.moveHistory).toHaveLength(1);
	});

	test('clicking invalid destination when piece selected clears selection', () => {
		let state = createInitialXiangqiGameState();
		state = selectSquare(state, { row: 9, col: 1 }); // select horse
		// Click far-away empty square not in possibleMoves
		state = selectSquare(state, { row: 5, col: 8 });
		expect(state.selectedSquare).toBeNull();
	});

	test('clicking own piece switches selection', () => {
		let state = createInitialXiangqiGameState();
		state = selectSquare(state, { row: 9, col: 1 }); // select horse
		state = selectSquare(state, { row: 9, col: 7 }); // select another red piece
		expect(state.selectedSquare).toEqual({ row: 9, col: 7 });
	});
});

// ---------------------------------------------------------------------------
// resetGame
// ---------------------------------------------------------------------------

describe('resetGame', () => {
	test('returns fresh initial state', () => {
		let state = createInitialXiangqiGameState();
		state = selectSquare(state, { row: 6, col: 0 });
		state = selectSquare(state, { row: 5, col: 0 });
		expect(state.currentPlayer).toBe('black');

		const fresh = resetGame();
		expect(fresh.currentPlayer).toBe('red');
		expect(fresh.moveHistory).toHaveLength(0);
		expect(fresh.status).toBe('playing');
	});
});

// ---------------------------------------------------------------------------
// isKingInCheck - additional cases
// ---------------------------------------------------------------------------

describe('isKingInCheck - additional cases', () => {
	test('no check when opponent pieces are blocked', () => {
		const board = emptyBoard();
		const redKing: XiangqiPiece = { type: 'king', color: 'red' };
		const blocker: XiangqiPiece = { type: 'advisor', color: 'red' };
		const blackChariot: XiangqiPiece = { type: 'chariot', color: 'black' };
		setPieceAt(board, { row: 9, col: 4 }, redKing);
		setPieceAt(board, { row: 7, col: 4 }, blocker); // blocks column
		setPieceAt(board, { row: 5, col: 4 }, blackChariot);
		expect(isKingInCheck(board, 'red')).toBe(false);
	});

	test('black king in check from red chariot', () => {
		const board = emptyBoard();
		const blackKing: XiangqiPiece = { type: 'king', color: 'black' };
		const redChariot: XiangqiPiece = { type: 'chariot', color: 'red' };
		setPieceAt(board, { row: 0, col: 4 }, blackKing);
		setPieceAt(board, { row: 5, col: 4 }, redChariot);
		expect(isKingInCheck(board, 'black')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// undoMove - edge cases
// ---------------------------------------------------------------------------

describe('undoMove - additional cases', () => {
	test('undoMove on initial state returns same state', () => {
		const state = createInitialXiangqiGameState();
		const undone = undoMove(state);
		expect(undone.moveHistory).toHaveLength(0);
		expect(undone.currentPlayer).toBe('red');
	});

	test('undoing multiple moves restores full history', () => {
		let state = createInitialXiangqiGameState();
		state = selectSquare(state, { row: 6, col: 0 });
		state = selectSquare(state, { row: 5, col: 0 });
		expect(state.moveHistory).toHaveLength(1);

		const undone = undoMove(state);
		expect(undone.moveHistory).toHaveLength(0);
		expect(getPieceAt(undone.board, { row: 6, col: 0 })?.type).toBe('soldier');
		expect(getPieceAt(undone.board, { row: 5, col: 0 })).toBeNull();
	});
});
