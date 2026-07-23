import { test, expect, describe } from 'bun:test';
import {
	configFor,
	positionToAlgebraic,
	algebraicToPosition,
	tryAlgebraicToPosition,
	isValidPosition,
} from './notation-utils';
import { GAME_CONFIGS } from './game-variant-types';

describe('notation-utils - configFor', () => {
	test('returns the config for the requested variant', () => {
		expect(configFor('chess')).toBe(GAME_CONFIGS.chess);
		expect(configFor('jungle')).toBe(GAME_CONFIGS.jungle);
	});
});

describe('notation-utils - algebraicToPosition', () => {
	test('converts lowercase notation to a position', () => {
		expect(algebraicToPosition('chess', 'e2')).toEqual({
			row: 6,
			col: 4,
		});
	});

	test('normalizes uppercase and surrounding whitespace', () => {
		expect(algebraicToPosition('chess', '  E2  ')).toEqual({
			row: 6,
			col: 4,
		});
	});
});

describe('notation-utils - tryAlgebraicToPosition', () => {
	test('returns the position for valid notation', () => {
		expect(tryAlgebraicToPosition('chess', 'e2')).toEqual({
			row: 6,
			col: 4,
		});
	});

	test('returns the sentinel for invalid notation', () => {
		expect(tryAlgebraicToPosition('chess', 'z9')).toEqual({
			row: -1,
			col: -1,
		});
	});
});

describe('notation-utils - isValidPosition', () => {
	test('true for in-bounds positions', () => {
		expect(isValidPosition('chess', { row: 0, col: 0 })).toBe(true);
		expect(isValidPosition('chess', { row: 7, col: 7 })).toBe(true);
	});

	test('false for out-of-bounds positions', () => {
		expect(isValidPosition('chess', { row: -1, col: 0 })).toBe(false);
		expect(isValidPosition('chess', { row: 0, col: 8 })).toBe(false);
		expect(isValidPosition('chess', { row: 8, col: 0 })).toBe(false);
	});
});

describe('notation-utils - positionToAlgebraic', () => {
	test('converts a position to algebraic notation', () => {
		expect(positionToAlgebraic('chess', { row: 6, col: 4 })).toBe('e2');
	});
});
