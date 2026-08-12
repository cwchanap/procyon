import { describe, expect, test } from 'bun:test';
import {
	ENGINE_DIFFICULTIES,
	getEngineDifficultyLabel,
	getRivalSide,
	isEngineDifficulty,
	isRivalMoveSuccess,
	type ActiveRivalSession,
	type RivalMoveResult,
} from './types';

describe('chess rival types', () => {
	test('defines the complete ordered local-engine difficulty vocabulary', () => {
		expect(ENGINE_DIFFICULTIES).toEqual([
			{ value: 'casual', label: 'Casual' },
			{ value: 'normal', label: 'Normal' },
			{ value: 'strong', label: 'Strong' },
		]);
		expect(isEngineDifficulty('casual')).toBe(true);
		expect(isEngineDifficulty('normal')).toBe(true);
		expect(isEngineDifficulty('strong')).toBe(true);
		expect(isEngineDifficulty('expert')).toBe(false);
		expect(getEngineDifficultyLabel('normal')).toBe('Normal');
	});

	test('derives the opposite rival side', () => {
		expect(getRivalSide('white')).toBe('black');
		expect(getRivalSide('black')).toBe('white');
	});

	test('narrows successful move results', () => {
		const result: RivalMoveResult = {
			ok: true,
			move: { from: 'e7', to: 'e5' },
			meta: { thinking: 'Develop', confidence: 0.7 },
		};
		expect(isRivalMoveSuccess(result)).toBe(true);
	});

	test('active sessions contain frozen ownership fields', () => {
		const session: ActiveRivalSession = {
			id: 1,
			opponent: { kind: 'engine', id: 'stockfish' },
			humanSide: 'white',
			rivalSide: 'black',
			startedByUserId: null,
		};
		expect(session.rivalSide).toBe('black');
	});
});
