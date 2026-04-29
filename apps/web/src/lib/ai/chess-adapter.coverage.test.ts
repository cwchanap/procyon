import { test, expect, describe, beforeEach } from 'bun:test';
import { ChessAdapter } from './chess-adapter';
import { createInitialGameState } from '../chess/game';
import type { GameState, Move, ChessPiece } from '../chess/types';

describe('ChessAdapter - formatMoveHistory (via generatePrompt)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = createInitialGameState();
	});

	test('prompt includes move history when moves exist', () => {
		// FILES = ['a','b','c','d','e','f','g','h'], RANKS = ['8','7','6','5','4','3','2','1']
		// row 6, col 4 => RANKS[6]='2', FILES[4]='e' => 'e2'
		// row 4, col 4 => RANKS[4]='4', FILES[4]='e' => 'e4'
		const move: Move = {
			from: { row: 6, col: 4 },
			to: { row: 4, col: 4 },
			piece: { type: 'pawn', color: 'white' },
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e2-e4');
	});

	test('prompt includes multiple moves in history', () => {
		const whiteMove: Move = {
			from: { row: 6, col: 4 },
			to: { row: 4, col: 4 },
			piece: { type: 'pawn', color: 'white' },
		};
		const blackMove: Move = {
			from: { row: 1, col: 4 },
			to: { row: 3, col: 4 },
			piece: { type: 'pawn', color: 'black' },
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [whiteMove, blackMove],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		// Both moves should appear
		expect(prompt).toContain('e2-e4');
		expect(prompt).toContain('e7-e5');
	});

	test('prompt includes captured piece move in history', () => {
		const capturedPiece: ChessPiece = { type: 'pawn', color: 'black' };
		const move: Move = {
			from: { row: 3, col: 4 },
			to: { row: 2, col: 3 },
			piece: { type: 'pawn', color: 'white' },
			capturedPiece,
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e5-d6');
	});
});
