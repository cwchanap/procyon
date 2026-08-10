import { describe, expect, test } from 'bun:test';
import { GAME_ROUTES, isAIConfigGamePath } from './game-id';

describe('game routes', () => {
	test('defines Aeroplane as a game route but not an AI-config route', () => {
		expect(GAME_ROUTES.aeroplane).toBe('/aeroplane');
		expect(isAIConfigGamePath('/aeroplane')).toBe(false);
	});

	test('keeps all strategy routes AI-config enabled', () => {
		for (const path of ['/chess', '/xiangqi', '/shogi', '/jungle']) {
			expect(isAIConfigGamePath(path)).toBe(true);
		}
	});
});
