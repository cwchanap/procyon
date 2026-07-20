import { describe, expect, test } from 'bun:test';
import { positionsEqual, containsPosition } from './types';

describe('positionsEqual', () => {
	test('returns true for identical positions', () => {
		expect(positionsEqual({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
	});
	test('returns false for different positions', () => {
		expect(positionsEqual({ row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false);
		expect(positionsEqual({ row: 0, col: 2 }, { row: 1, col: 2 })).toBe(false);
	});
});

describe('containsPosition', () => {
	test('returns true when position is in list', () => {
		expect(
			containsPosition(
				[
					{ row: 0, col: 0 },
					{ row: 1, col: 1 },
				],
				{ row: 1, col: 1 }
			)
		).toBe(true);
	});
	test('returns false when position is not in list', () => {
		expect(containsPosition([{ row: 0, col: 0 }], { row: 1, col: 1 })).toBe(
			false
		);
	});
});
