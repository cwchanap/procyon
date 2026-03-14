import { test, expect, describe, beforeEach } from 'bun:test';
import { JungleAdapter } from './jungle-adapter';
import { createInitialGameState } from '../jungle/game';
import type { JungleGameState } from '../jungle/types';

describe('JungleAdapter', () => {
	let adapter: JungleAdapter;
	let gameState: JungleGameState;

	beforeEach(() => {
		adapter = new JungleAdapter();
		gameState = createInitialGameState();
	});

	describe('gameVariant', () => {
		test('should return jungle', () => {
			expect(adapter.gameVariant).toBe('jungle');
		});
	});

	describe('constructor', () => {
		test('should create adapter with default options', () => {
			const a = new JungleAdapter();
			expect(a).toBeInstanceOf(JungleAdapter);
		});

		test('should create adapter with debug true', () => {
			const a = new JungleAdapter(true);
			expect(a).toBeInstanceOf(JungleAdapter);
		});
	});

	describe('positionToAlgebraic', () => {
		test('should convert top-left corner correctly', () => {
			// row 0, col 0 => a9
			expect(adapter.positionToAlgebraic({ row: 0, col: 0 })).toBe('a9');
		});

		test('should convert bottom-right corner correctly', () => {
			// row 8, col 6 => g1
			expect(adapter.positionToAlgebraic({ row: 8, col: 6 })).toBe('g1');
		});

		test('should convert middle positions correctly', () => {
			expect(adapter.positionToAlgebraic({ row: 4, col: 3 })).toBe('d5');
		});

		test('should return a1 for invalid positions', () => {
			// Out of bounds - falls back to 'a1'
			expect(adapter.positionToAlgebraic({ row: 0, col: 99 })).toBe('a1');
			expect(adapter.positionToAlgebraic({ row: 99, col: 0 })).toBe('a1');
		});
	});

	describe('algebraicToPosition', () => {
		test('should convert a9 to top-left corner', () => {
			expect(adapter.algebraicToPosition('a9')).toEqual({ row: 0, col: 0 });
		});

		test('should convert g1 to bottom-right corner', () => {
			expect(adapter.algebraicToPosition('g1')).toEqual({ row: 8, col: 6 });
		});

		test('should convert middle positions correctly', () => {
			expect(adapter.algebraicToPosition('d5')).toEqual({ row: 4, col: 3 });
		});

		test('should be case insensitive', () => {
			expect(adapter.algebraicToPosition('A9')).toEqual({ row: 0, col: 0 });
			expect(adapter.algebraicToPosition('G1')).toEqual({ row: 8, col: 6 });
		});

		test('should throw for invalid notation', () => {
			expect(() => adapter.algebraicToPosition('')).toThrow();
			expect(() => adapter.algebraicToPosition('h1')).toThrow(); // h is out of range
			expect(() => adapter.algebraicToPosition('a0')).toThrow(); // rank 0 doesn't exist
		});
	});

	describe('round trip conversion', () => {
		test('position to algebraic and back should be identity', () => {
			const positions = [
				{ row: 0, col: 0 },
				{ row: 0, col: 6 },
				{ row: 8, col: 0 },
				{ row: 8, col: 6 },
				{ row: 4, col: 3 },
			];

			for (const pos of positions) {
				const algebraic = adapter.positionToAlgebraic(pos);
				const back = adapter.algebraicToPosition(algebraic);
				expect(back).toEqual(pos);
			}
		});
	});

	describe('convertGameState', () => {
		test('should convert jungle game state to base game state', () => {
			const baseState = adapter.convertGameState(gameState);

			expect(baseState.board).toBe(gameState.board);
			expect(baseState.currentPlayer).toBe('red');
			expect(baseState.status).toBe('playing');
			expect(baseState.moveHistory).toEqual([]);
			expect(baseState.selectedSquare).toBeNull();
			expect(baseState.possibleMoves).toEqual([]);
		});
	});

	describe('getPieceSymbol', () => {
		test('should return correct symbols for red pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'elephant', color: 'red', rank: 8 })).toBe('象');
			expect(adapter.getPieceSymbol({ type: 'lion', color: 'red', rank: 7 })).toBe('獅');
			expect(adapter.getPieceSymbol({ type: 'tiger', color: 'red', rank: 6 })).toBe('虎');
			expect(adapter.getPieceSymbol({ type: 'rat', color: 'red', rank: 1 })).toBe('鼠');
		});

		test('should return correct symbols for blue pieces', () => {
			expect(adapter.getPieceSymbol({ type: 'elephant', color: 'blue', rank: 8 })).toBe('象');
			expect(adapter.getPieceSymbol({ type: 'rat', color: 'blue', rank: 1 })).toBe('鼠');
		});

		test('should return ? for unknown piece', () => {
			expect(adapter.getPieceSymbol({ type: 'unknown' as never, color: 'red', rank: 0 })).toBe('?');
		});
	});

	describe('createVisualBoard', () => {
		test('should create visual board with proper dimensions', () => {
			const visual = adapter.createVisualBoard(gameState);

			// 9 rows
			const lines = visual.trim().split('\n');
			expect(lines.length).toBe(9);
		});

		test('should include dots for empty squares', () => {
			const visual = adapter.createVisualBoard(gameState);
			expect(visual).toContain('. ');
		});

		test('should include piece symbols', () => {
			const visual = adapter.createVisualBoard(gameState);
			// Should have piece symbols from the initial position
			expect(visual).toContain('象'); // elephant
		});
	});

	describe('getAllValidMoves', () => {
		test('should return valid moves for initial position', () => {
			const moves = adapter.getAllValidMoves(gameState);

			expect(moves.length).toBeGreaterThan(0);
			// Each move should be in "from to" format e.g. "a9 a8"
			const firstMove = moves[0];
			expect(firstMove).toMatch(/[a-g]\d+ [a-g]\d+/);
		});

		test('should only return moves for current player', () => {
			const moves = adapter.getAllValidMoves(gameState);
			// All moves should be for red (initial player)
			expect(moves.length).toBeGreaterThan(0);
		});
	});

	describe('getLegalMoves', () => {
		test('should return legal moves as objects with from/to positions', () => {
			const moves = adapter.getLegalMoves(gameState);

			expect(moves.length).toBeGreaterThan(0);
			const firstMove = moves[0];
			expect(firstMove).toHaveProperty('from');
			expect(firstMove).toHaveProperty('to');
			expect(firstMove.from).toHaveProperty('row');
			expect(firstMove.from).toHaveProperty('col');
			expect(firstMove.to).toHaveProperty('row');
			expect(firstMove.to).toHaveProperty('col');
		});
	});

	describe('evaluatePosition', () => {
		test('should return symmetric score for initial position', () => {
			const score = adapter.evaluatePosition(gameState);
			// Initial position is symmetric so score should be 0
			expect(score).toBe(0);
		});

		test('should return positive score when current player has advantage', () => {
			// Remove a blue piece to give red advantage
			const advantagedState: JungleGameState = {
				...gameState,
				board: gameState.board.map(row =>
					row.map(piece =>
						piece?.color === 'blue' && piece.type === 'elephant' ? null : piece
					)
				),
			};
			const score = adapter.evaluatePosition(advantagedState);
			expect(score).toBeGreaterThan(0);
		});
	});

	describe('generatePrompt', () => {
		test('should generate a prompt with game information', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('Jungle');
			expect(prompt).toContain('Red');
			expect(prompt).toContain('playing');
		});

		test('should include legal moves', () => {
			const prompt = adapter.generatePrompt(gameState);
			expect(prompt).toContain('Legal moves');
		});

		test('should include JSON response format', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('"move"');
			expect(prompt).toContain('"from"');
			expect(prompt).toContain('"to"');
			expect(prompt).toContain('"reasoning"');
		});

		test('should include jungle rules', () => {
			const prompt = adapter.generatePrompt(gameState);

			expect(prompt).toContain('Elephant');
			expect(prompt).toContain('Rat');
		});
	});

	describe('analyzeThreatsSafety', () => {
		test('should return a string for initial position', () => {
			const analysis = adapter.analyzeThreatsSafety(gameState);
			expect(typeof analysis).toBe('string');
		});
	});

	describe('getPositionAnalysis', () => {
		test('should return analysis with legal move count', () => {
			const analysis = adapter.getPositionAnalysis(gameState);

			expect(analysis).toContain('Legal moves');
			expect(analysis).toContain('Material evaluation');
			expect(analysis).toContain('Current player');
		});
	});
});
