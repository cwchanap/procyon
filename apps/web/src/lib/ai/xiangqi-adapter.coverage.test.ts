import { test, expect, describe, beforeEach } from 'bun:test';
import { XiangqiAdapter } from './xiangqi-adapter';
import { createInitialXiangqiGameState } from '../xiangqi/game';
import type { XiangqiGameState, XiangqiMove } from '../xiangqi/types';

describe('XiangqiAdapter - formatMoveHistory (via generatePrompt)', () => {
	let adapter: XiangqiAdapter;
	let gameState: XiangqiGameState;

	beforeEach(() => {
		adapter = new XiangqiAdapter();
		gameState = createInitialXiangqiGameState();
	});

	test('prompt includes red move history with move number', () => {
		// XIANGQI_FILES = ['a','b','c','d','e','f','g','h','i']
		// XIANGQI_RANKS = ['10','9','8','7',...,'1']
		// row 6, col 4 => RANKS[6]='4', FILES[4]='e' => 'e4'
		// row 5, col 4 => RANKS[5]='5', FILES[4]='e' => 'e5'
		const redMove: XiangqiMove = {
			from: { row: 6, col: 4 },
			to: { row: 5, col: 4 },
			piece: { type: 'soldier', color: 'red' },
		};
		const stateWithHistory: XiangqiGameState = {
			...gameState,
			moveHistory: [redMove],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e4-e5');
	});

	test('prompt includes black move history without move number', () => {
		const redMove: XiangqiMove = {
			from: { row: 6, col: 4 },
			to: { row: 5, col: 4 },
			piece: { type: 'soldier', color: 'red' },
		};
		const blackMove: XiangqiMove = {
			from: { row: 3, col: 4 },
			to: { row: 4, col: 4 },
			piece: { type: 'soldier', color: 'black' },
		};
		const stateWithHistory: XiangqiGameState = {
			...gameState,
			moveHistory: [redMove, blackMove],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e4-e5');
		// Both move notations should appear
		expect(prompt).toContain('e7-e6');
	});

	test('prompt with no history contains game start', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(typeof prompt).toBe('string');
		expect(prompt).toContain('Game start');
	});
});
