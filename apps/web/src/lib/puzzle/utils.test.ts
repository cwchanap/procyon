import { test, expect, describe } from 'bun:test';
import { DIFFICULTY_BADGE_STYLES, DIFFICULTY_BADGE_FALLBACK } from './utils';

describe('DIFFICULTY_BADGE_STYLES', () => {
	test('has entries for beginner, intermediate, and advanced', () => {
		expect(DIFFICULTY_BADGE_STYLES).toHaveProperty('beginner');
		expect(DIFFICULTY_BADGE_STYLES).toHaveProperty('intermediate');
		expect(DIFFICULTY_BADGE_STYLES).toHaveProperty('advanced');
	});

	test('beginner style contains jungle color classes', () => {
		expect(DIFFICULTY_BADGE_STYLES['beginner']).toContain('jungle');
	});

	test('intermediate style contains brass color classes', () => {
		expect(DIFFICULTY_BADGE_STYLES['intermediate']).toContain('brass');
	});

	test('advanced style contains cinnabar color classes', () => {
		expect(DIFFICULTY_BADGE_STYLES['advanced']).toContain('C8402F');
	});

	test('all badge styles are non-empty strings', () => {
		for (const [, value] of Object.entries(DIFFICULTY_BADGE_STYLES)) {
			expect(typeof value).toBe('string');
			expect(value.length).toBeGreaterThan(0);
		}
	});

	test('has exactly 3 entries', () => {
		expect(Object.keys(DIFFICULTY_BADGE_STYLES).length).toBe(3);
	});

	test('unknown difficulty key returns undefined at runtime', () => {
		expect(DIFFICULTY_BADGE_STYLES['unknown']).toBeUndefined();
	});
});

describe('DIFFICULTY_BADGE_FALLBACK', () => {
	test('is a non-empty string', () => {
		expect(typeof DIFFICULTY_BADGE_FALLBACK).toBe('string');
		expect(DIFFICULTY_BADGE_FALLBACK.length).toBeGreaterThan(0);
	});

	test('contains ink color classes', () => {
		expect(DIFFICULTY_BADGE_FALLBACK).toContain('ink');
	});

	test('is different from all difficulty-specific styles', () => {
		for (const style of Object.values(DIFFICULTY_BADGE_STYLES)) {
			expect(DIFFICULTY_BADGE_FALLBACK).not.toBe(style);
		}
	});
});
