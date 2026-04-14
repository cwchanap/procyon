import { test, expect, describe } from 'bun:test';
import {
	createInitialGameState,
	makeMove,
	getGameStatus,
	isKingInCheck,
} from './game';
import { setPieceAt } from './board';
import type { ChessPiece, GameState } from './types';

// Helper to create a clean empty board state
function makeEmptyState(currentPlayer: 'white' | 'black' = 'white'): GameState {
	const state = createInitialGameState();
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			state.board[row][col] = null;
		}
	}
	state.currentPlayer = currentPlayer;
	return state;
}

describe('Chess getGameStatus - playing state', () => {
	test('should return playing on initial board', () => {
		const state = createInitialGameState();
		expect(getGameStatus(state)).toBe('playing');
	});

	test('should return playing when current player has moves and is not in check', () => {
		const state = makeEmptyState('white');
		setPieceAt(state.board, { row: 7, col: 4 }, { type: 'king', color: 'white' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		// Only kings on board, white king has multiple escape squares
		expect(getGameStatus(state)).toBe('playing');
	});
});

describe('Chess getGameStatus - stalemate detection', () => {
	test('should detect stalemate when current player has no legal moves and is not in check', () => {
		// Classic stalemate: black king at a8, white queen at c7, white king at b6
		// Black king cannot move anywhere without walking into an attacked square
		const state = makeEmptyState('black');

		const blackKing: ChessPiece = { type: 'king', color: 'black' };
		const whiteQueen: ChessPiece = { type: 'queen', color: 'white' };
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };

		setPieceAt(state.board, { row: 0, col: 0 }, blackKing); // a8
		setPieceAt(state.board, { row: 1, col: 2 }, whiteQueen); // c7
		setPieceAt(state.board, { row: 2, col: 1 }, whiteKing); // b6

		// Verify black is not currently in check
		expect(isKingInCheck(state.board, 'black')).toBe(false);

		// All possible black king moves (a7, b7, b8) are covered by white pieces
		// so black has no legal moves => stalemate
		expect(getGameStatus(state)).toBe('stalemate');
	});

	test('stalemate only applies when player is NOT in check', () => {
		// Same position as above but with additional attacker giving check => checkmate, not stalemate
		const state = makeEmptyState('black');

		const blackKing: ChessPiece = { type: 'king', color: 'black' };
		const whiteQueen: ChessPiece = { type: 'queen', color: 'white' };
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const whiteRook: ChessPiece = { type: 'rook', color: 'white' };

		setPieceAt(state.board, { row: 0, col: 0 }, blackKing); // a8
		setPieceAt(state.board, { row: 1, col: 2 }, whiteQueen); // c7
		setPieceAt(state.board, { row: 2, col: 1 }, whiteKing); // b6
		setPieceAt(state.board, { row: 0, col: 7 }, whiteRook); // h8 - checks king on row 0

		// Black king is now in check from the rook
		expect(isKingInCheck(state.board, 'black')).toBe(true);
		// With no legal moves and in check => checkmate
		expect(getGameStatus(state)).toBe('checkmate');
	});
});

describe('Chess makeMove - null returns for invalid inputs', () => {
	test('should return null when from square is empty', () => {
		const state = createInitialGameState();
		// Row 3 col 3 is an empty square in the initial position
		const result = makeMove(state, { row: 3, col: 3 }, { row: 4, col: 3 });
		expect(result).toBeNull();
	});

	test('should return null when trying to move opponent piece', () => {
		const state = createInitialGameState();
		// White to move, but black pawn is at row 1
		const result = makeMove(
			state,
			{ row: 1, col: 4 }, // e7 - black pawn
			{ row: 2, col: 4 } // e6
		);
		expect(result).toBeNull();
	});

	test('should return null for an out-of-bounds from position', () => {
		const state = createInitialGameState();
		const result = makeMove(state, { row: -1, col: 0 }, { row: 0, col: 0 });
		expect(result).toBeNull();
	});

	test('should return null when move is not in the list of possible moves', () => {
		const state = makeEmptyState('white');
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		setPieceAt(state.board, { row: 7, col: 4 }, whiteKing);
		// King cannot jump 3 squares
		const result = makeMove(state, { row: 7, col: 4 }, { row: 4, col: 4 });
		expect(result).toBeNull();
	});
});

describe('Chess makeMove - piece captures and state updates', () => {
	test('should update board correctly when capturing opponent piece', () => {
		const state = makeEmptyState('white');
		const whiteRook: ChessPiece = { type: 'rook', color: 'white' };
		const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackKing: ChessPiece = { type: 'king', color: 'black' };

		setPieceAt(state.board, { row: 7, col: 0 }, whiteKing); // a1
		setPieceAt(state.board, { row: 0, col: 0 }, blackKing); // a8
		setPieceAt(state.board, { row: 4, col: 4 }, whiteRook);
		setPieceAt(state.board, { row: 4, col: 7 }, blackPawn);

		const result = makeMove(state, { row: 4, col: 4 }, { row: 4, col: 7 });

		expect(result).not.toBeNull();
		expect(result?.board[4]?.[7]?.type).toBe('rook');
		expect(result?.board[4]?.[7]?.color).toBe('white');
		expect(result?.board[4]?.[4]).toBeNull();
		expect(result?.currentPlayer).toBe('black');
	});

	test('should mark piece as hasMoved after a move', () => {
		const state = createInitialGameState();
		// Move e2 pawn forward
		const result = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 });
		expect(result?.board[4]?.[4]?.hasMoved).toBe(true);
	});

	test('should switch currentPlayer after a valid move', () => {
		const state = createInitialGameState();
		expect(state.currentPlayer).toBe('white');
		const result = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 });
		expect(result?.currentPlayer).toBe('black');
	});

	test('should clear selectedSquare and possibleMoves after a move', () => {
		const state = createInitialGameState();
		const stateWithSelection: GameState = {
			...state,
			selectedSquare: { row: 6, col: 4 },
			possibleMoves: [{ row: 4, col: 4 }],
		};
		const result = makeMove(stateWithSelection, { row: 6, col: 4 }, { row: 4, col: 4 });
		expect(result?.selectedSquare).toBeNull();
		expect(result?.possibleMoves).toEqual([]);
	});
});

describe('Chess isKingInCheck - additional scenarios', () => {
	test('should not detect check when no opponent pieces can reach king', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));

		setPieceAt(board, { row: 7, col: 4 }, { type: 'king', color: 'white' }); // e1
		setPieceAt(board, { row: 0, col: 0 }, { type: 'rook', color: 'black' }); // a8 (not aligned)

		expect(isKingInCheck(board, 'white')).toBe(false);
	});

	test('should return false when king is not present on board', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		// No king on board
		expect(isKingInCheck(board, 'white')).toBe(false);
	});

	test('should detect check from black knight', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));

		setPieceAt(board, { row: 7, col: 4 }, { type: 'king', color: 'white' }); // e1
		// Knight at f3 attacks e1 (2 up, 1 left from knight perspective)
		// e1 is (7,4), knight at (5,3) attacks (7,4)? Knight moves: ±1/±2 or ±2/±1
		// From (5,3): (3,2), (3,4), (4,1), (4,5), (6,1), (6,5), (7,2), (7,4) YES!
		setPieceAt(board, { row: 5, col: 3 }, { type: 'knight', color: 'black' }); // d3

		expect(isKingInCheck(board, 'white')).toBe(true);
	});

	test('should detect check from black bishop on diagonal', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));

		setPieceAt(board, { row: 4, col: 4 }, { type: 'king', color: 'white' }); // e5
		setPieceAt(board, { row: 1, col: 1 }, { type: 'bishop', color: 'black' }); // b7 - diagonal

		expect(isKingInCheck(board, 'white')).toBe(true);
	});
});
