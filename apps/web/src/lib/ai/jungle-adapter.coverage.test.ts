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
		// Format: "N. <pieceSymbol> <from><to>" — cat red = '貓'
		expect(prompt).toContain('1. 貓 a7a6');
	});

	test('prompt includes capture notation when piece is captured', () => {
		// from: {row:2, col:0} => ranks[2]='7', files[0]='a' => 'a7'
		// to: {row:3, col:1} => ranks[3]='6', files[1]='b' => 'b6'
		// lion red => '獅', cat blue => '貓'
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
		// Format: "N. <pieceSymbol> <from><to> x <capturedSymbol>"
		expect(prompt).toContain('獅 a7b6 x 貓');
	});

	test('prompt with no move history shows 0 moves', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(prompt).toContain('Move History (0 moves)');
	});
});
