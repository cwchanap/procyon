import { test, expect, describe } from 'bun:test';
import { cn } from './utils';

describe('cn utility', () => {
	test('returns empty string when called with no args', () => {
		expect(cn()).toBe('');
	});

	test('returns a single class name', () => {
		expect(cn('foo')).toBe('foo');
	});

	test('joins multiple class names', () => {
		expect(cn('foo', 'bar')).toBe('foo bar');
	});

	test('filters out falsy values', () => {
		expect(cn('foo', false, undefined, null, '', 'bar')).toBe('foo bar');
	});

	test('supports conditional classes via objects', () => {
		expect(cn({ foo: true, bar: false })).toBe('foo');
	});

	test('supports conditional classes mixed with strings', () => {
		expect(cn('base', { active: true, disabled: false })).toBe('base active');
	});

	test('merges tailwind conflicting classes (tailwind-merge behaviour)', () => {
		// tailwind-merge removes earlier conflicting utilities
		expect(cn('p-4', 'p-8')).toBe('p-8');
	});

	test('merges multiple tailwind conflicts correctly', () => {
		expect(cn('text-sm font-bold', 'text-lg')).toBe('font-bold text-lg');
	});

	test('handles arrays of class names', () => {
		expect(cn(['foo', 'bar'])).toBe('foo bar');
	});

	test('handles nested arrays', () => {
		expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
	});
});
