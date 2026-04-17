import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { startRateLimitCleanup, stopRateLimitCleanup, recordLoginAttempt } from './rate-limit';

describe('startRateLimitCleanup', () => {
	test('returns a function (the cleanup function)', () => {
		const cleanup = startRateLimitCleanup();
		expect(typeof cleanup).toBe('function');
	});

	test('calling it multiple times does not throw', () => {
		expect(() => {
			const c1 = startRateLimitCleanup();
			const c2 = startRateLimitCleanup();
			c1();
			c2();
		}).not.toThrow();
	});

	test('returned cleanup function does not throw when called', () => {
		const cleanup = startRateLimitCleanup();
		expect(() => cleanup()).not.toThrow();
	});
});

describe('stopRateLimitCleanup', () => {
	test('does not throw when called', () => {
		expect(() => stopRateLimitCleanup()).not.toThrow();
	});

	test('can be called multiple times without error', () => {
		expect(() => {
			stopRateLimitCleanup();
			stopRateLimitCleanup();
			stopRateLimitCleanup();
		}).not.toThrow();
	});

	test('returned value from startRateLimitCleanup is the same as stopRateLimitCleanup', () => {
		const cleanup = startRateLimitCleanup();
		expect(cleanup).toBe(stopRateLimitCleanup);
	});
});

describe('rate limit cleanup interaction', () => {
	let savedDisableRateLimit: string | undefined;

	beforeEach(() => {
		savedDisableRateLimit = process.env.DISABLE_RATE_LIMIT;
		delete process.env.DISABLE_RATE_LIMIT;
	});

	afterEach(() => {
		if (savedDisableRateLimit === undefined) {
			delete process.env.DISABLE_RATE_LIMIT;
		} else {
			process.env.DISABLE_RATE_LIMIT = savedDisableRateLimit;
		}
	});

	test('rate limiting still works after startRateLimitCleanup is called', () => {
		startRateLimitCleanup();
		const email = `cleanup-test-${Math.random().toString(36).slice(2)}@example.com`;

		const result = recordLoginAttempt(email);
		expect(result.allowed).toBe(true);
	});

	test('cleanup function does not break the rate limiter', () => {
		const cleanup = startRateLimitCleanup();
		const email = `cleanup-test2-${Math.random().toString(36).slice(2)}@example.com`;

		recordLoginAttempt(email);
		cleanup();

		const result = recordLoginAttempt(email);
		expect(result.allowed).toBe(true);
	});
});
