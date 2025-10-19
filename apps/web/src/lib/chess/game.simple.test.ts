import { test, expect, describe } from 'bun:test';
import {
	makeMove,
	createInitialGameState,
	isKingInCheck,
	makeAIMove,
} from './game';
import { setPieceAt } from './board';
import type { ChessPiece } from './types';

describe('Chess Move Validation - Core Check Prevention', () => {
	test('makeMove should reject moves that leave king in check', () => {
		// Start with initial game state
		const gameState = createInitialGameState('human-vs-human');

		// Clear the board and set up a simple check scenario
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				gameState.board[row][col] = null;
			}
		}

		// Place white king at e1, black rook at e8, white pawn at d2
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackRook: ChessPiece = { type: 'rook', color: 'black' };
		const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };

		setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
		setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
		setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn); // d2

		// Verify the king is in check
		expect(isKingInCheck(gameState.board, 'white')).toBe(true);

		// Try to move the pawn forward - this should be rejected because it doesn't resolve check
		const result = makeMove(
			gameState,
			{ row: 6, col: 3 }, // d2
			{ row: 5, col: 3 } // d3
		);

		// The move should be rejected (return null)
		expect(result).toBe(null);
	});

	test('makeMove should accept king moves that escape check', () => {
		// Start with initial game state
		const gameState = createInitialGameState('human-vs-human');

		// Clear the board
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				gameState.board[row][col] = null;
			}
		}

		// Place white king at e1 and black rook at e8
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackRook: ChessPiece = { type: 'rook', color: 'black' };

		setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
		setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8

		// Verify the king is in check
		expect(isKingInCheck(gameState.board, 'white')).toBe(true);

		// Move king to f1 to escape check
		const result = makeMove(
			gameState,
			{ row: 7, col: 4 }, // e1
			{ row: 7, col: 5 } // f1
		);

		// The move should be accepted
		expect(result).not.toBe(null);
		expect(result?.currentPlayer).toBe('black'); // Turn should switch

		// Verify the king is no longer in check
		expect(isKingInCheck(result!.board, 'white')).toBe(false);
	});

	test('makeAIMove should reject invalid moves when in check', () => {
		// Start with initial game state for AI
		const gameState = createInitialGameState('human-vs-ai', 'white');

		// Clear the board
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				gameState.board[row][col] = null;
			}
		}

		// Place white king at e1, black rook at e8, white pawn at d2
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackRook: ChessPiece = { type: 'rook', color: 'black' };
		const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };

		setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
		setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
		setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn); // d2

		// Verify the king is in check
		expect(isKingInCheck(gameState.board, 'white')).toBe(true);

		// AI tries to make a pawn move that doesn't resolve check
		const result = makeAIMove(gameState, 'd2', 'd3');

		// The AI move should be rejected
		expect(result).toBe(null);
	});

	test('isKingInCheck should correctly detect check status', () => {
		// Create an empty board
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));

		// Place white king at e1 and black rook at e8
		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackRook: ChessPiece = { type: 'rook', color: 'black' };

		setPieceAt(board, { row: 7, col: 4 }, whiteKing); // e1
		setPieceAt(board, { row: 0, col: 4 }, blackRook); // e8

		// Should detect check
		expect(isKingInCheck(board, 'white')).toBe(true);

		// Move king away from check
		setPieceAt(board, { row: 7, col: 4 }, null); // remove from e1
		setPieceAt(board, { row: 7, col: 5 }, whiteKing); // place at f1

		// Should no longer be in check
		expect(isKingInCheck(board, 'white')).toBe(false);
	});

	test('makeMove should work normally when not in check', () => {
		// Start with initial game state
		const gameState = createInitialGameState('human-vs-human');

		// Make a normal pawn move (e2 to e4)
		const result = makeMove(
			gameState,
			{ row: 6, col: 4 }, // e2
			{ row: 4, col: 4 } // e4
		);

		// Should succeed
		expect(result).not.toBe(null);
		expect(result?.currentPlayer).toBe('black');
	});
});
