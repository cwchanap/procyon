import { test, expect, describe, beforeEach } from 'bun:test';
import { XiangqiAdapter } from './xiangqi-adapter';
import { createInitialXiangqiBoard } from '../xiangqi/board';
import type { XiangqiGameState } from '../xiangqi/types';

describe('XiangqiAdapter', () => {
	let adapter: XiangqiAdapter;
	let gameState: XiangqiGameState;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
		gameState = {
			board: createInitialXiangqiBoard(),
			currentPlayer: 'red',
			status: 'playing',
			moveHistory: [],
			selectedSquare: null,
			possibleMoves: [],
		};
	});

	describe('gameVariant', () => {
		test('should return xiangqi', () => {
			expect(adapter.gameVariant).toBe('xiangqi');
		});
	});

	describe('positionToAlgebraic', () => {
		test('should convert position to algebraic notation', () => {
			// Xiangqi uses ranks 1-10 from bottom to top
			expect(adapter.positionToAlgebraic({ row: 9, col: 0 })).toBe('a1');
			expect(adapter.positionToAlgebraic({ row: 0, col: 0 })).toBe('a10');
			expect(adapter.positionToAlgebraic({ row: 9, col: 4 })).toBe('e1');
			expect(adapter.positionToAlgebraic({ row: 0, col: 8 })).toBe('i10');
		});
	});

	describe('algebraicToPosition', () => {
		test('should convert algebraic notation to position', () => {
			expect(adapter.algebraicToPosition('a1')).toEqual({ row: 9, col: 0 });
			expect(adapter.algebraicToPosition('a10')).toEqual({ row: 0, col: 0 });
			expect(adapter.algebraicToPosition('e5')).toEqual({ row: 5, col: 4 });
			expect(adapter.algebraicToPosition('i10')).toEqual({ row: 0, col: 8 });
		});

		test('should be case insensitive', () => {
			expect(adapter.algebraicToPosition('E5')).toEqual({ row: 5, col: 4 });
			expect(adapter.algebraicToPosition('A1')).toEqual({ row: 9, col: 0 });
		});

		test('should throw for invalid notation', () => {
			expect(() => adapter.algebraicToPosition('j1')).toThrow();
			expect(() => adapter.algebraicToPosition('a11')).toThrow();
			expect(() => adapter.algebraicToPosition('')).toThrow();
		});
	});

	describe('convertGameState', () => {
		test('should convert xiangqi game state to base game state', () => {
			const baseState = adapter.convertGameState(gameState);

			expect(baseState.board).toBe(gameState.board);
			expect(baseState.currentPlayer).toBe('red');
			expect(baseState.status).toBe('playing');
			expect(baseState.moveHistory).toEqual([]);
		});
	});

	describe('getAllValidMoves', () => {
		test('should return valid moves for initial position', () => {
			const moves = adapter.getAllValidMoves(gameState);

			expect(moves.length).toBe(1); // Returns grouped moves as single string
			// Check that some expected piece types have moves
			expect(moves[0]).toContain('a1-a2'); // Chariot move
		});
	});

	describe('generatePrompt', () => {
		test('should generate a prompt containing xiangqi-specific content', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('xiangqi');
			expect(prompt).toContain('red');
			expect(prompt).toContain('a  b  c  d  e  f  g  h  i');
		});

		test('should include xiangqi strategic considerations', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('palace');
			expect(prompt).toContain('river');
		});

		test('should include JSON response format', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('"move"');
			expect(prompt).toContain('"from"');
			expect(prompt).toContain('"to"');
		});
	});

	describe('createVisualBoard', () => {
		test('should create visual board with proper formatting', () => {
			const visual = adapter.createVisualBoard(gameState);

			expect(visual).toContain('a  b  c  d  e  f  g  h  i');
			expect(visual).toContain('10');
			expect(visual).toContain('1');
			// Check for river
			expect(visual).toContain('~');
		});
	});

	describe('getPieceSymbol', () => {
		test('should return correct symbols for red pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'red' })).toBe('帅');
			expect(adapter.getPieceSymbol({ type: 'chariot', color: 'red' })).toBe('车');
			expect(adapter.getPieceSymbol({ type: 'cannon', color: 'red' })).toBe('炮');
			expect(adapter.getPieceSymbol({ type: 'horse', color: 'red' })).toBe('马');
		});

		test('should return correct symbols for black pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'black' })).toBe('将');
			expect(adapter.getPieceSymbol({ type: 'chariot', color: 'black' })).toBe('车');
			expect(adapter.getPieceSymbol({ type: 'soldier', color: 'black' })).toBe('卒');
		});
	});

	describe('round trip conversion', () => {
		test('algebraic to position and back should be identity', () => {
			const squares = ['a1', 'i10', 'e5', 'd3', 'b7', 'g10'];

			for (const square of squares) {
				const pos = adapter.algebraicToPosition(square);
				const back = adapter.positionToAlgebraic(pos);
				expect(back).toBe(square);
			}
		});
	});
});
