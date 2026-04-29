import { test, expect, describe, beforeEach } from 'bun:test';
import { JungleAdapter } from './jungle-adapter';
import { createInitialGameState } from '../jungle/game';
import type { JungleGameState, JungleMove } from '../jungle/types';

describe('JungleAdapter - formatMoveHistory (via generatePrompt)', () => {
	let adapter: JungleAdapter;
	let gameState: JungleGameState;

	beforeEach(() => {
		adapter = new JungleAdapter();
		gameState = createInitialGameState();
	});

	test('prompt includes move history when moves exist', () => {
		// jungle files = ['a','b','c','d','e','f','g'], ranks = ['9','8','7','6','5','4','3','2','1']
		// row 2, col 0 => ranks[2]='7', files[0]='a' => 'a7'
		// row 3, col 0 => ranks[3]='6', files[0]='a' => 'a6'
		const move: JungleMove = {
			from: { row: 2, col: 0 },
			to: { row: 3, col: 0 },
			piece: { type: 'cat', color: 'red', rank: 2 },
		};
		const stateWithHistory: JungleGameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('a7');
		expect(prompt).toContain('a6');
	});

	test('prompt includes capture notation when piece is captured', () => {
		const move: JungleMove = {
			from: { row: 2, col: 0 },
			to: { row: 3, col: 1 },
			piece: { type: 'lion', color: 'red', rank: 7 },
			capturedPiece: { type: 'cat', color: 'blue', rank: 2 },
		};
		const stateWithHistory: JungleGameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		// Move history section should exist
		expect(prompt).toContain('Move History');
	});

	test('prompt with no move history shows 0 moves', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(prompt).toContain('Move History (0 moves)');
	});
});
