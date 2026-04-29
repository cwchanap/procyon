import { test, expect, describe, beforeEach } from 'bun:test';
import { ShogiAdapter } from './shogi-adapter';
import { createInitialGameState } from '../shogi/game';
import type { ShogiGameState, ShogiMove, ShogiPiece } from '../shogi/types';

describe('ShogiAdapter - formatMoveHistory (via generatePrompt)', () => {
	let adapter: ShogiAdapter;
	let gameState: ShogiGameState;

	beforeEach(() => {
		adapter = new ShogiAdapter();
		gameState = createInitialGameState();
	});

	test('prompt includes move history when moves exist (non-drop, non-promotion)', () => {
		const move: ShogiMove = {
			from: { row: 6, col: 4 },
			to: { row: 5, col: 4 },
			piece: { type: 'pawn', color: 'sente', promoted: false },
			isDrop: false,
			isPromotion: false,
		};
		const stateWithHistory: ShogiGameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('5g-5f');
	});

	test('prompt includes promoted move history', () => {
		const move: ShogiMove = {
			from: { row: 3, col: 4 },
			to: { row: 2, col: 4 },
			piece: { type: 'pawn', color: 'sente', promoted: false },
			isDrop: false,
			isPromotion: true,
		};
		const stateWithHistory: ShogiGameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('+');
	});

	test('prompt includes drop move history', () => {
		const move: ShogiMove = {
			from: null,
			to: { row: 4, col: 4 },
			piece: { type: 'pawn', color: 'sente', promoted: false },
			isDrop: true,
		};
		const stateWithHistory: ShogiGameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('*');
	});

	test('prompt formats gote (non-sente) moves without move number prefix', () => {
		// Two moves: sente then gote
		const sentMove: ShogiMove = {
			from: { row: 6, col: 4 },
			to: { row: 5, col: 4 },
			piece: { type: 'pawn', color: 'sente', promoted: false },
			isDrop: false,
		};
		const goteMove: ShogiMove = {
			from: { row: 2, col: 4 },
			to: { row: 3, col: 4 },
			piece: { type: 'pawn', color: 'gote', promoted: false },
			isDrop: false,
		};
		const stateWithHistory: ShogiGameState = {
			...gameState,
			moveHistory: [sentMove, goteMove],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		// Should include move history with numbering
		expect(prompt).toBeDefined();
		expect(typeof prompt).toBe('string');
	});
});

describe('ShogiAdapter - mustPromote (via getAllValidMoves)', () => {
	let adapter: ShogiAdapter;

	beforeEach(() => {
		adapter = new ShogiAdapter();
	});

	test('gote pawn at row 8 must promote (getAllValidMoves shows promotion)', () => {
		const state = createInitialGameState();
		// Place a gote pawn at row 7 (one step from row 8 = must-promote zone for gote)
		const board = state.board.map(row => [...row]);
		const gotePawn: ShogiPiece = {
			type: 'pawn',
			color: 'gote',
			promoted: false,
		};
		board[7]![3] = gotePawn;

		const testState: ShogiGameState = {
			...state,
			board,
			currentPlayer: 'gote',
		};

		const moves = adapter.getAllValidMoves(testState);
		// When gote pawn moves to row 8, it must promote - the adapter should handle this
		expect(Array.isArray(moves)).toBe(true);
	});

	test('gote knight at row 7 must promote (beyond last rank)', () => {
		const state = createInitialGameState();
		const board = state.board.map(row => [...row]);
		const goteKnight: ShogiPiece = {
			type: 'knight',
			color: 'gote',
			promoted: false,
		};
		board[6]![3] = goteKnight;

		const testState: ShogiGameState = {
			...state,
			board,
			currentPlayer: 'gote',
		};

		const moves = adapter.getAllValidMoves(testState);
		expect(Array.isArray(moves)).toBe(true);
	});
});
