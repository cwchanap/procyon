import { test, expect, describe, beforeEach } from 'bun:test';
import { ShogiAdapter } from './shogi-adapter';
import { createInitialGameState } from '../shogi/game';
import type { ShogiGameState } from '../shogi/types';

describe('ShogiAdapter', () => {
	let adapter: ShogiAdapter;
	let gameState: ShogiGameState;

	beforeEach(() => {
		adapter = new ShogiAdapter();
		gameState = createInitialGameState();
	});

	describe('gameVariant', () => {
		test('should return shogi', () => {
			expect(adapter.gameVariant).toBe('shogi');
		});
	});

	describe('constructor', () => {
		test('should create adapter with default debug false', () => {
			const a = new ShogiAdapter();
			expect(a).toBeInstanceOf(ShogiAdapter);
		});

		test('should create adapter with debug true', () => {
			const a = new ShogiAdapter(true);
			expect(a).toBeInstanceOf(ShogiAdapter);
		});
	});

	describe('positionToAlgebraic', () => {
		test('should convert row 0, col 0 to correct notation', () => {
			// Shogi: files are 9-1 (col 0 = file 9), ranks a-i (row 0 = rank a)
			expect(adapter.positionToAlgebraic({ row: 0, col: 0 })).toBe('9a');
		});

		test('should convert row 8, col 8 to correct notation', () => {
			expect(adapter.positionToAlgebraic({ row: 8, col: 8 })).toBe('1i');
		});

		test('should convert middle positions correctly', () => {
			expect(adapter.positionToAlgebraic({ row: 4, col: 4 })).toBe('5e');
		});

		test('should throw for out-of-bounds positions', () => {
			expect(() => adapter.positionToAlgebraic({ row: -1, col: 0 })).toThrow();
			expect(() => adapter.positionToAlgebraic({ row: 0, col: -1 })).toThrow();
			expect(() => adapter.positionToAlgebraic({ row: 9, col: 0 })).toThrow();
			expect(() => adapter.positionToAlgebraic({ row: 0, col: 9 })).toThrow();
		});
	});

	describe('algebraicToPosition', () => {
		test('should convert algebraic notation to position', () => {
			expect(adapter.algebraicToPosition('9a')).toEqual({ row: 0, col: 0 });
			expect(adapter.algebraicToPosition('1i')).toEqual({ row: 8, col: 8 });
			expect(adapter.algebraicToPosition('5e')).toEqual({ row: 4, col: 4 });
		});

		test('should be case insensitive', () => {
			expect(adapter.algebraicToPosition('5E')).toEqual({ row: 4, col: 4 });
			expect(adapter.algebraicToPosition('9A')).toEqual({ row: 0, col: 0 });
		});

		test('should throw for invalid notation', () => {
			expect(() => adapter.algebraicToPosition('')).toThrow();
			expect(() => adapter.algebraicToPosition('0a')).toThrow();
			expect(() => adapter.algebraicToPosition('9z')).toThrow();
		});
	});

	describe('round trip conversion', () => {
		test('position to algebraic and back should be identity', () => {
			const positions = [
				{ row: 0, col: 0 },
				{ row: 0, col: 8 },
				{ row: 8, col: 0 },
				{ row: 8, col: 8 },
				{ row: 4, col: 4 },
			];

			for (const pos of positions) {
				const algebraic = adapter.positionToAlgebraic(pos);
				const back = adapter.algebraicToPosition(algebraic);
				expect(back).toEqual(pos);
			}
		});
	});

	describe('convertGameState', () => {
		test('should convert shogi game state to base game state', () => {
			const baseState = adapter.convertGameState(gameState);

			expect(baseState.board).toBe(gameState.board);
			expect(baseState.currentPlayer).toBe('sente');
			expect(baseState.status).toBe('playing');
			expect(baseState.moveHistory).toEqual([]);
			expect(baseState.selectedSquare).toBeNull();
			expect(baseState.possibleMoves).toEqual([]);
		});
	});

	describe('getPieceSymbol', () => {
		test('should return correct symbols for sente pieces', () => {
			expect(
				adapter.getPieceSymbol({ type: 'king', color: 'sente', isPromoted: false })
			).toBeTruthy();
			expect(
				adapter.getPieceSymbol({ type: 'rook', color: 'sente', isPromoted: false })
			).toBeTruthy();
			expect(
				adapter.getPieceSymbol({ type: 'pawn', color: 'sente', isPromoted: false })
			).toBeTruthy();
		});

		test('should return correct symbols for gote pieces', () => {
			expect(
				adapter.getPieceSymbol({ type: 'king', color: 'gote', isPromoted: false })
			).toBeTruthy();
			expect(
				adapter.getPieceSymbol({ type: 'rook', color: 'gote', isPromoted: false })
			).toBeTruthy();
		});

		test('should return ? for unknown piece type', () => {
			expect(
				adapter.getPieceSymbol({ type: 'unknown' as never, color: 'sente', isPromoted: false })
			).toBe('?');
		});
	});

	describe('createVisualBoard', () => {
		test('should create visual board with proper formatting', () => {
			const visual = adapter.createVisualBoard(gameState);

			expect(visual).toContain('9  8  7  6  5  4  3  2  1');
			expect(visual).toContain('a');
			expect(visual).toContain('i');
			expect(visual).toContain('┌');
			expect(visual).toContain('└');
		});

		test('should include legend', () => {
			const visual = adapter.createVisualBoard(gameState);
			expect(visual).toContain('Legend');
		});
	});

	describe('getAllValidMoves', () => {
		test('should return valid moves for initial position', () => {
			const moves = adapter.getAllValidMoves(gameState);

			// Returns grouped moves as a single string in an array
			expect(moves.length).toBeGreaterThan(0);
			expect(typeof moves[0]).toBe('string');
		});

		test('should indicate no valid moves for no-move state', () => {
			// Create a state with no pieces for current player
			const emptyState: ShogiGameState = {
				...gameState,
				board: gameState.board.map(row => row.map(() => null)),
				senteHand: [],
				goteHand: [],
			};

			const moves = adapter.getAllValidMoves(emptyState);
			expect(moves[0]).toContain('No valid moves');
		});
	});

	describe('generatePrompt', () => {
		test('should generate a prompt with game information', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('sente');
			expect(prompt).toContain('playing');
			expect(prompt).toContain('BOARD');
		});

		test('should include JSON response format', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('"move"');
			expect(prompt).toContain('"from"');
			expect(prompt).toContain('"to"');
			expect(prompt).toContain('"reasoning"');
		});

		test('should include shogi-specific instructions', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('drop');
			expect(prompt).toContain('promotion');
		});

		test('should include valid moves section', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('VALID MOVES');
		});
	});

	describe('analyzeThreatsSafety', () => {
		test('should return analysis string for normal position', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);

			expect(typeof analysis).toBe('string');
			expect(analysis.length).toBeGreaterThan(0);
			expect(analysis).toContain('Material');
		});

		test('should indicate check in analysis when in check', () => {
			const checkState: ShogiGameState = { ...gameState, status: 'check' };
			const analysis = adapter.analyzeThreatsSafety(checkState);

			expect(analysis).toContain('CHECK');
		});

		test('should include hand piece count', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);
			expect(analysis).toContain('Hand pieces');
		});
	});
});
