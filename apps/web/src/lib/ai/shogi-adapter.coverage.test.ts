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
		// sente pawn {row:6, col:4}: FILES[4]='5', RANKS[6]='g' => from='5g', RANKS[5]='f' => to='5f'
		// gote pawn {row:2, col:4}: FILES[4]='5', RANKS[2]='c' => from='5c', RANKS[3]='d' => to='5d'
		// pawn symbol: '歩' for both colors
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
		expect(prompt).toContain('1. 歩5g-5f'); // sente move has number prefix
		expect(prompt).toContain('歩5c-5d'); // gote move follows without number prefix
		expect(prompt).not.toContain('2. 歩5c-5d'); // gote should NOT have a number prefix
	});
});

describe('ShogiAdapter - mustPromote (via getAllValidMoves)', () => {
	let adapter: ShogiAdapter;

	beforeEach(() => {
		adapter = new ShogiAdapter();
	});

	test('gote pawn at row 8 must promote (getAllValidMoves shows promotion)', () => {
		const state = createInitialGameState();
		// Place a gote pawn at row 7, col 3; it can only move to row 8 which is must-promote zone
		// SHOGI_FILES[3]='6', SHOGI_RANKS[7]='h', SHOGI_RANKS[8]='i' => from='6h', to='6i'
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
		expect(Array.isArray(moves)).toBe(true);
		const moveStr = moves[0] ?? '';
		// mustPromote=true: only promoted version should appear, not the undecorated move
		expect(moveStr).toContain('6h-6i+'); // must promote at row 8
		expect(moveStr).not.toContain('6h-6i ('); // no non-promoted alternative
	});

	test('gote knight at row 7 must promote (beyond last rank)', () => {
		const state = createInitialGameState();
		// Gote knight at row 6, col 3; can jump to row 8 (col 2 or col 4) — both must promote
		// SHOGI_FILES[3]='6', SHOGI_RANKS[6]='g' => from='6g'
		// to row 8, col 2: FILES[2]='7', RANKS[8]='i' => '7i'
		// to row 8, col 4: FILES[4]='5', RANKS[8]='i' => '5i'
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
		const moveStr = moves[0] ?? '';
		// mustPromote=true for gote knight landing on row 8: only promoted versions
		expect(moveStr).toContain('6g-7i+'); // must promote
		expect(moveStr).not.toContain('6g-7i ('); // no non-promoted version
	});
});
