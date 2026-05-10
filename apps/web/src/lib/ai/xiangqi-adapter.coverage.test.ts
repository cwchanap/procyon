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
		// Red (index 0) gets move-number prefix: "1. <symbol><from>-<to>"
		// soldier red symbol: '兵'
		expect(prompt).toContain('1. 兵e4-e5');
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
		// Red move with prefix, black move (index 1) without number prefix
		// soldier black symbol: '卒'
		expect(prompt).toContain('1. 兵e4-e5'); // red move has prefix
		expect(prompt).toContain('卒e7-e6'); // black move without prefix
		expect(prompt).not.toContain('2. 卒e7-e6'); // black should NOT have number prefix
	});

	test('prompt with no history contains game start', () => {
		const prompt = adapter.generatePrompt(gameState);
		expect(typeof prompt).toBe('string');
		expect(prompt).toContain('Game start');
	});
});
