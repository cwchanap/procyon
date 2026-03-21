import { test, expect, describe } from 'bun:test';
import {
	createInitialGameState,
	makeMove,
	selectSquare,
	setAIThinking,
	isAITurn,
	algebraicToPosition,
} from './game';
import { setPieceAt } from './board';
import type { ChessPiece, GameState } from './types';

describe('Chess Game - selectSquare', () => {
	test('selects a piece of the current player', () => {
		const state = createInitialGameState();
		const next = selectSquare(state, { row: 6, col: 4 }); // e2 white pawn

		expect(next.selectedSquare).toEqual({ row: 6, col: 4 });
		expect(next.possibleMoves.length).toBeGreaterThan(0);
	});

	test('clears selection when clicking on empty square', () => {
		const state = createInitialGameState();
		// First select a piece
		const selected = selectSquare(state, { row: 6, col: 4 });
		expect(selected.selectedSquare).not.toBeNull();

		// Click on empty square
		const cleared = selectSquare(selected, { row: 4, col: 4 });
		expect(cleared.selectedSquare).toBeNull();
		expect(cleared.possibleMoves).toHaveLength(0);
	});

	test('clears selection when clicking on opponent piece', () => {
		const state = createInitialGameState();
		// Current player is white; clicking on black piece (row 1) clears selection
		const next = selectSquare(state, { row: 1, col: 4 }); // e7 black pawn

		expect(next.selectedSquare).toBeNull();
		expect(next.possibleMoves).toHaveLength(0);
	});

	test('deselects when clicking the same square again', () => {
		const state = createInitialGameState();
		const selected = selectSquare(state, { row: 6, col: 4 });
		const deselected = selectSquare(selected, { row: 6, col: 4 });

		expect(deselected.selectedSquare).toBeNull();
		expect(deselected.possibleMoves).toHaveLength(0);
	});

	test('switches selection when clicking different own piece', () => {
		const state = createInitialGameState();
		const first = selectSquare(state, { row: 6, col: 4 }); // e2 pawn
		const second = selectSquare(first, { row: 6, col: 3 }); // d2 pawn

		expect(second.selectedSquare).toEqual({ row: 6, col: 3 });
	});
});

describe('Chess Game - setAIThinking', () => {
	test('sets isAiThinking to true', () => {
		const state = createInitialGameState();
		const next = setAIThinking(state, true);
		expect(next.isAiThinking).toBe(true);
	});

	test('sets isAiThinking to false', () => {
		const state = createInitialGameState('human-vs-ai', 'black');
		const thinking = setAIThinking(state, true);
		const done = setAIThinking(thinking, false);
		expect(done.isAiThinking).toBe(false);
	});

	test('does not mutate the original state', () => {
		const state = createInitialGameState();
		setAIThinking(state, true);
		expect(state.isAiThinking).toBeFalsy();
	});
});

describe('Chess Game - isAITurn', () => {
	test('returns false for human-vs-human mode', () => {
		const state = createInitialGameState('human-vs-human');
		expect(isAITurn(state)).toBe(false);
	});

	test('returns true when it is AI player turn', () => {
		const state = createInitialGameState('human-vs-ai', 'black');
		// currentPlayer starts as 'white', not AI's turn
		expect(isAITurn(state)).toBe(false);

		// Simulate switching to black's turn
		const blackTurn: GameState = { ...state, currentPlayer: 'black' };
		expect(isAITurn(blackTurn)).toBe(true);
	});

	test('returns true for AI turn when in check status', () => {
		const state = createInitialGameState('human-vs-ai', 'black');
		const blackInCheck: GameState = {
			...state,
			currentPlayer: 'black',
			status: 'check',
		};
		expect(isAITurn(blackInCheck)).toBe(true);
	});

	test('returns false when game is over (checkmate)', () => {
		const state = createInitialGameState('human-vs-ai', 'black');
		const checkmated: GameState = {
			...state,
			currentPlayer: 'black',
			status: 'checkmate',
		};
		expect(isAITurn(checkmated)).toBe(false);
	});

	test('returns false when game is stalemate', () => {
		const state = createInitialGameState('human-vs-ai', 'white');
		const stalemate: GameState = {
			...state,
			currentPlayer: 'white',
			status: 'stalemate',
		};
		expect(isAITurn(stalemate)).toBe(false);
	});
});

describe('Chess Game - algebraicToPosition', () => {
	test('converts a1 to bottom-left position', () => {
		expect(algebraicToPosition('a1')).toEqual({ row: 7, col: 0 });
	});

	test('converts h8 to top-right position', () => {
		expect(algebraicToPosition('h8')).toEqual({ row: 0, col: 7 });
	});

	test('converts e4 correctly', () => {
		expect(algebraicToPosition('e4')).toEqual({ row: 4, col: 4 });
	});

	test('converts e2 correctly', () => {
		expect(algebraicToPosition('e2')).toEqual({ row: 6, col: 4 });
	});

	test('returns null for string shorter than 2 chars', () => {
		expect(algebraicToPosition('e')).toBeNull();
	});

	test('returns null for string longer than 2 chars', () => {
		expect(algebraicToPosition('e10')).toBeNull();
	});

	test('returns null for out-of-bounds column', () => {
		expect(algebraicToPosition('z4')).toBeNull();
	});

	test('returns null for out-of-bounds row', () => {
		expect(algebraicToPosition('a9')).toBeNull();
	});

	test('returns null for rank 0', () => {
		expect(algebraicToPosition('a0')).toBeNull();
	});

	test('converts all files correctly', () => {
		const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		files.forEach((file, col) => {
			const pos = algebraicToPosition(`${file}1`);
			expect(pos).toEqual({ row: 7, col });
		});
	});
});

describe('Chess Game - makeMove captures move history', () => {
	test('move history is updated after a move', () => {
		const state = createInitialGameState();
		const newState = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 });

		expect(newState?.moveHistory).toHaveLength(1);
		expect(newState?.moveHistory[0].piece.type).toBe('pawn');
	});

	test('capture is recorded in move history', () => {
		const state = createInitialGameState();

		state.board = Array.from({ length: 8 }, () => Array(8).fill(null));

		const whiteKing: ChessPiece = { type: 'king', color: 'white' };
		const blackKing: ChessPiece = { type: 'king', color: 'black' };
		const whiteRook: ChessPiece = { type: 'rook', color: 'white' };
		const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };

		setPieceAt(state.board, { row: 7, col: 0 }, whiteKing);
		setPieceAt(state.board, { row: 0, col: 0 }, blackKing);
		setPieceAt(state.board, { row: 4, col: 4 }, whiteRook);
		setPieceAt(state.board, { row: 4, col: 6 }, blackPawn);

		const newState = makeMove(state, { row: 4, col: 4 }, { row: 4, col: 6 });

		expect(newState?.moveHistory[0].capturedPiece?.type).toBe('pawn');
	});
});
