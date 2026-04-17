import { test, expect, describe, beforeEach } from 'bun:test';
import { ShogiAdapter } from './shogi-adapter';
import { createInitialGameState } from '../shogi/game';
import type { ShogiGameState } from '../shogi/types';

describe('ShogiAdapter - getPieceSymbol extended coverage', () => {
	let adapter: ShogiAdapter;

	beforeEach(() => {
		adapter = new ShogiAdapter();
	});

	describe('sente piece symbols', () => {
		test('bishop returns 角', () => {
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'sente', isPromoted: false })).toBe('角');
		});

		test('gold returns 金', () => {
			expect(adapter.getPieceSymbol({ type: 'gold', color: 'sente', isPromoted: false })).toBe('金');
		});

		test('silver returns 銀', () => {
			expect(adapter.getPieceSymbol({ type: 'silver', color: 'sente', isPromoted: false })).toBe('銀');
		});

		test('knight returns 桂', () => {
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'sente', isPromoted: false })).toBe('桂');
		});

		test('lance returns 香', () => {
			expect(adapter.getPieceSymbol({ type: 'lance', color: 'sente', isPromoted: false })).toBe('香');
		});

		test('dragon returns 龍', () => {
			expect(adapter.getPieceSymbol({ type: 'dragon', color: 'sente', isPromoted: false })).toBe('龍');
		});

		test('horse (promoted bishop) returns 馬', () => {
			expect(adapter.getPieceSymbol({ type: 'horse', color: 'sente', isPromoted: false })).toBe('馬');
		});

		test('promoted_silver returns 成銀', () => {
			expect(adapter.getPieceSymbol({ type: 'promoted_silver', color: 'sente', isPromoted: true })).toBe('成銀');
		});

		test('promoted_knight returns 成桂', () => {
			expect(adapter.getPieceSymbol({ type: 'promoted_knight', color: 'sente', isPromoted: true })).toBe('成桂');
		});

		test('promoted_lance returns 成香', () => {
			expect(adapter.getPieceSymbol({ type: 'promoted_lance', color: 'sente', isPromoted: true })).toBe('成香');
		});

		test('promoted_pawn returns と', () => {
			expect(adapter.getPieceSymbol({ type: 'promoted_pawn', color: 'sente', isPromoted: true })).toBe('と');
		});
	});

	describe('gote piece symbols', () => {
		test('king returns 王 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'king', color: 'gote', isPromoted: false })).toBe('王');
		});

		test('bishop returns 角 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'bishop', color: 'gote', isPromoted: false })).toBe('角');
		});

		test('gold returns 金 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'gold', color: 'gote', isPromoted: false })).toBe('金');
		});

		test('silver returns 銀 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'silver', color: 'gote', isPromoted: false })).toBe('銀');
		});

		test('knight returns 桂 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'knight', color: 'gote', isPromoted: false })).toBe('桂');
		});

		test('lance returns 香 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'lance', color: 'gote', isPromoted: false })).toBe('香');
		});

		test('pawn returns 歩 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'pawn', color: 'gote', isPromoted: false })).toBe('歩');
		});

		test('dragon returns 龍 for gote', () => {
			expect(adapter.getPieceSymbol({ type: 'dragon', color: 'gote', isPromoted: false })).toBe('龍');
		});
	});
});

describe('ShogiAdapter - analyzeThreatsSafety extended', () => {
	let adapter: ShogiAdapter;
	let gameState: ShogiGameState;

	beforeEach(() => {
		adapter = new ShogiAdapter();
		gameState = createInitialGameState();
	});

	test('returns a string with hand piece count info', () => {
		const analysis = adapter.analyzeThreatsSafety(gameState);
		expect(typeof analysis).toBe('string');
		expect(analysis.toLowerCase()).toContain('hand');
	});

	test('result is non-empty string for initial position', () => {
		const analysis = adapter.analyzeThreatsSafety(gameState);
		expect(analysis.length).toBeGreaterThan(0);
	});

	test('returns analysis for gote player', () => {
		const goteState: ShogiGameState = { ...gameState, currentPlayer: 'gote' };
		const analysis = adapter.analyzeThreatsSafety(goteState);
		expect(typeof analysis).toBe('string');
		expect(analysis.length).toBeGreaterThan(0);
	});
});

describe('ShogiAdapter - generatePrompt extended', () => {
	let adapter: ShogiAdapter;
	let gameState: ShogiGameState;

	beforeEach(() => {
		adapter = new ShogiAdapter();
		gameState = createInitialGameState();
	});

	test('prompt includes current player info', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(prompt).toContain('sente');
	});

	test('prompt includes move number', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(prompt).toContain('1');
	});

	test('prompt includes drop notation hint', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(prompt).toContain('*');
	});

	test('includes check status when in check', () => {
		const checkState: ShogiGameState = { ...gameState, status: 'check' };
		const prompt = adapter.generatePrompt(checkState);
		expect(prompt).toContain('check');
	});
});

describe('ShogiAdapter - getAllValidMoves edge cases', () => {
	let adapter: ShogiAdapter;

	beforeEach(() => {
		adapter = new ShogiAdapter();
	});

	test('returns array of valid moves for initial state', () => {
		const state = createInitialGameState();
		const moves = adapter.getAllValidMoves(state);
		expect(Array.isArray(moves)).toBe(true);
		expect(moves.length).toBeGreaterThan(0);
	});

	test('moves include regular board moves', () => {
		const state = createInitialGameState();
		const moves = adapter.getAllValidMoves(state);
		// Board moves should follow "from-to" format
		expect(moves.some(m => m.includes('-'))).toBe(true);
	});
});
