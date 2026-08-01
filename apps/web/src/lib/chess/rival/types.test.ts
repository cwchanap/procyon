import { describe, expect, test } from 'bun:test';
import {
	getRivalSide,
	isRivalMoveSuccess,
	type ActiveRivalSession,
	type RivalMoveResult,
} from './types';

describe('chess rival types', () => {
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
