import { test, expect, describe, beforeEach } from 'bun:test';
import { ChessAdapter } from './chess-adapter';
import { createInitialBoard } from '../chess/board';
import type { GameState } from '../chess/types';

describe('ChessAdapter', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = {
			board: createInitialBoard(),
			currentPlayer: 'white',
			status: 'playing',
			moveHistory: [],
			selectedSquare: null,
			possibleMoves: [],
			mode: 'human-vs-ai',
		};
	});

	describe('gameVariant', () => {
		test('should return chess', () => {
			expect(adapter.gameVariant).toBe('chess');
		});
	});

	describe('positionToAlgebraic', () => {
		test('should convert position to algebraic notation', () => {
			expect(adapter.positionToAlgebraic({ row: 6, col: 4 })).toBe('e2');
			expect(adapter.positionToAlgebraic({ row: 4, col: 4 })).toBe('e4');
			expect(adapter.positionToAlgebraic({ row: 0, col: 0 })).toBe('a8');
			expect(adapter.positionToAlgebraic({ row: 7, col: 7 })).toBe('h1');
		});

		test('should handle all corners', () => {
			expect(adapter.positionToAlgebraic({ row: 0, col: 0 })).toBe('a8');
			expect(adapter.positionToAlgebraic({ row: 0, col: 7 })).toBe('h8');
			expect(adapter.positionToAlgebraic({ row: 7, col: 0 })).toBe('a1');
			expect(adapter.positionToAlgebraic({ row: 7, col: 7 })).toBe('h1');
		});
	});

	describe('algebraicToPosition', () => {
		test('should convert algebraic notation to position', () => {
			expect(adapter.algebraicToPosition('e2')).toEqual({ row: 6, col: 4 });
			expect(adapter.algebraicToPosition('e4')).toEqual({ row: 4, col: 4 });
			expect(adapter.algebraicToPosition('a8')).toEqual({ row: 0, col: 0 });
			expect(adapter.algebraicToPosition('h1')).toEqual({ row: 7, col: 7 });
		});

		test('should be case insensitive', () => {
			expect(adapter.algebraicToPosition('E2')).toEqual({ row: 6, col: 4 });
			expect(adapter.algebraicToPosition('A1')).toEqual({ row: 7, col: 0 });
		});

		test('should throw for invalid notation', () => {
			expect(() => adapter.algebraicToPosition('i1')).toThrow();
			expect(() => adapter.algebraicToPosition('a9')).toThrow();
			expect(() => adapter.algebraicToPosition('')).toThrow();
		});
	});

	describe('convertGameState', () => {
		test('should convert chess game state to base game state', () => {
			const baseState = adapter.convertGameState(gameState);

			expect(baseState.board).toBe(gameState.board);
			expect(baseState.currentPlayer).toBe('white');
			expect(baseState.status).toBe('playing');
			expect(baseState.moveHistory).toEqual([]);
			expect(baseState.selectedSquare).toBeNull();
			expect(baseState.possibleMoves).toEqual([]);
		});
	});

	describe('getAllValidMoves', () => {
		test('should return valid moves for initial position', () => {
			const moves = adapter.getAllValidMoves(gameState);

			expect(moves.length).toBe(1); // Returns grouped moves as single string
			expect(moves[0]).toContain('e2-e4'); // Pawn move
			expect(moves[0]).toContain('b1-c3'); // Knight move
		});

		test('should group moves by piece type', () => {
			const moves = adapter.getAllValidMoves(gameState);

			// Should return grouped moves containing piece symbols
			expect(moves[0]).toContain('♙/♟'); // Pawn moves
			expect(moves[0]).toContain('♘/♞'); // Knight moves
		});
	});

	describe('generatePrompt', () => {
		test('should generate a prompt containing board visualization', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('white');
			expect(prompt).toContain('BOARD');
			expect(prompt).toContain('a  b  c  d  e  f  g  h');
		});

		test('should include valid moves in prompt', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('VALID MOVES');
		});

		test('should include JSON response format', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('"move"');
			expect(prompt).toContain('"from"');
			expect(prompt).toContain('"to"');
			expect(prompt).toContain('"reasoning"');
		});
	});

	describe('createVisualBoard', () => {
		test('should create visual board with proper formatting', () => {
			const visual = adapter.createVisualBoard(gameState);

			expect(visual).toContain('a  b  c  d  e  f  g  h');
			expect(visual).toContain('8');
			expect(visual).toContain('1');
			// Check for piece symbols
			expect(visual).toContain('♜'); // Black rook
			expect(visual).toContain('♖'); // White rook
		});
	});

	describe('getPieceSymbol', () => {
		test('should return correct symbols for white pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'white' })).toBe('♔');
			expect(adapter.getPieceSymbol({ type: 'queen', color: 'white' })).toBe('♕');
			expect(adapter.getPieceSymbol({ type: 'rook', color: 'white' })).toBe('♖');
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'white' })).toBe('♗');
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'white' })).toBe('♘');
			expect(adapter.getPieceSymbol({ type: 'pawn', color: 'white' })).toBe('♙');
		});

		test('should return correct symbols for black pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'black' })).toBe('♚');
			expect(adapter.getPieceSymbol({ type: 'queen', color: 'black' })).toBe('♛');
			expect(adapter.getPieceSymbol({ type: 'rook', color: 'black' })).toBe('♜');
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'black' })).toBe('♝');
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'black' })).toBe('♞');
			expect(adapter.getPieceSymbol({ type: 'pawn', color: 'black' })).toBe('♟');
		});
	});

	describe('analyzeThreatsSafety', () => {
		test('should indicate check status', () => {
			gameState.status = 'check';
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).toContain('CHECK');
		});

		test('should include material balance', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).toContain('Material');
		});
	});

	describe('round trip conversion', () => {
		test('algebraic to position and back should be identity', () => {
			const squares = ['a1', 'h8', 'e4', 'd5', 'b2', 'g7'];

			for (const square of squares) {
				const pos = adapter.algebraicToPosition(square);
				const back = adapter.positionToAlgebraic(pos);
				expect(back).toBe(square);
			}
		});
	});
});
