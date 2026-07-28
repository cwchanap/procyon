import { test, expect, describe, beforeEach } from 'bun:test';
import { ChessAdapter } from './chess-adapter';
import { createInitialGameState } from '../chess/game';
import { createGameStateFromFen } from '../chess/rules';
import type { GameState } from '../chess/types';

describe('ChessAdapter', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = createInitialGameState('human-vs-ai');
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

		test('does not advertise a move that exposes the king in a drawn material position', () => {
			const state = createGameStateFromFen(
				'7k/8/7r/8/1b6/8/8/2B1K3 w - - 0 1',
				{ mode: 'human-vs-ai' }
			);

			expect(adapter.getAllValidMoves(state)[0]).not.toContain('c1-h6');
		});

		test('lists all legal promotion variants and explains the required field', () => {
			const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
			const moves = adapter.getAllValidMoves(state).join('\n');
			const prompt = adapter.generatePrompt(state);

			expect(moves).toContain('a7-a8=Q');
			expect(moves).toContain('a7-a8=R');
			expect(moves).toContain('a7-a8=B');
			expect(moves).toContain('a7-a8=N');
			expect(prompt).toContain(
				'promotion is required when the move ends on rank 8 or rank 1'
			);
			expect(prompt).toContain('omit promotion for every other move');
			expect(prompt).toMatch(/"promotion": "(queen|rook|bishop|knight)"/);

			const normalPrompt = adapter.generatePrompt(createInitialGameState());
			expect(normalPrompt).not.toContain('"promotion":');
		});

		test('does not offer a pseudo-legal move by a pinned piece', () => {
			const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');

			expect(adapter.getAllValidMoves(state).join('\n')).not.toContain('e2-d2');
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
			expect(adapter.getPieceSymbol({ type: 'king', color: 'white' })).toBe(
				'♔'
			);
			expect(adapter.getPieceSymbol({ type: 'queen', color: 'white' })).toBe(
				'♕'
			);
			expect(adapter.getPieceSymbol({ type: 'rook', color: 'white' })).toBe(
				'♖'
			);
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'white' })).toBe(
				'♗'
			);
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'white' })).toBe(
				'♘'
			);
			expect(adapter.getPieceSymbol({ type: 'pawn', color: 'white' })).toBe(
				'♙'
			);
		});

		test('should return correct symbols for black pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'black' })).toBe(
				'♚'
			);
			expect(adapter.getPieceSymbol({ type: 'queen', color: 'black' })).toBe(
				'♛'
			);
			expect(adapter.getPieceSymbol({ type: 'rook', color: 'black' })).toBe(
				'♜'
			);
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'black' })).toBe(
				'♝'
			);
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'black' })).toBe(
				'♞'
			);
			expect(adapter.getPieceSymbol({ type: 'pawn', color: 'black' })).toBe(
				'♟'
			);
		});
	});

	describe('analyzeThreatsSafety', () => {
		test('emits the full check-warning sentence when status is "check"', () => {
			gameState.status = 'check';
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).toContain(
				'Your king is in CHECK! Priority: Get out of check immediately.'
			);
		});

		test('does not emit a check warning when status is "playing"', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).not.toContain('CHECK');
			expect(analysis).not.toContain('Priority');
		});

		test('reports "Material balance: Equal" for the starting position', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).toContain('Material balance: Equal');
		});

		test('reports a positive material balance when the opponent loses a queen', () => {
			// Remove black's queen (d8) so white is +9 in material.
			const board = gameState.board;
			board[0]![3] = null;
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(analysis).toContain('Material balance: +9');
		});

		test('check warning precedes the material line', () => {
			gameState.status = 'check';
			const analysis = adapter.analyzeThreatsSafety(gameState);
			const checkIdx = analysis.indexOf('CHECK');
			const materialIdx = analysis.indexOf('Material balance');

			expect(checkIdx).toBeGreaterThan(-1);
			expect(materialIdx).toBeGreaterThan(-1);
			expect(checkIdx).toBeLessThan(materialIdx);
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
