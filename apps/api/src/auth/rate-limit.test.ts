import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { recordLoginAttempt, resetLoginAttempts } from './rate-limit';

const WINDOW_MS = 15 * 60 * 1000; // mirrors module constant
const MAX_ATTEMPTS = 5;

// Generate unique email per test to avoid shared Map state contamination
function uniqueEmail(label: string) {
	return `${label}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('recordLoginAttempt - basic counting', () => {
	test('first attempt is allowed with MAX_ATTEMPTS-1 remaining', () => {
		const email = uniqueEmail('first');
		const result = recordLoginAttempt(email);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(MAX_ATTEMPTS - 1);
		expect(result.retryAfterMs).toBe(0);
	});

	test('consecutive attempts decrement remaining', () => {
		const email = uniqueEmail('decrement');
		recordLoginAttempt(email); // 1
		recordLoginAttempt(email); // 2
		const third = recordLoginAttempt(email); // 3
		expect(third.allowed).toBe(true);
		expect(third.remaining).toBe(MAX_ATTEMPTS - 3);
	});

	test(`${MAX_ATTEMPTS}th attempt is still allowed with 0 remaining`, () => {
		const email = uniqueEmail('boundary');
		for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordLoginAttempt(email);
		const fifth = recordLoginAttempt(email);
		expect(fifth.allowed).toBe(true);
		expect(fifth.remaining).toBe(0);
	});

	test(`${MAX_ATTEMPTS + 1}th attempt is blocked`, () => {
		const email = uniqueEmail('blocked');
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(email);
		const blocked = recordLoginAttempt(email);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.retryAfterMs).toBeGreaterThan(0);
	});

	test('retryAfterMs is positive and within window when blocked', () => {
		const email = uniqueEmail('retry-ms');
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(email);
		const blocked = recordLoginAttempt(email);
		expect(blocked.retryAfterMs).toBeGreaterThan(0);
		expect(blocked.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
	});

	test('email is normalized to lowercase', () => {
		const base = uniqueEmail('case');
		const upper = base.toUpperCase();
		// Record against lowercase
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(base);
		// Attempt against uppercase — should hit same bucket
		const result = recordLoginAttempt(upper);
		expect(result.allowed).toBe(false);
	});
});

describe('recordLoginAttempt - window expiry', () => {
	test('attempt after window expiry resets counter and is allowed', () => {
		const email = uniqueEmail('expiry');
		const baseTime = 1_700_000_000_000; // fixed large epoch (Nov 2023)

		const spy = spyOn(Date, 'now');
		try {
			spy.mockReturnValue(baseTime);

			// Exhaust limit at baseTime
			for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(email);
			const exhausted = recordLoginAttempt(email);
			expect(exhausted.allowed).toBe(false);

			// Advance past the window
			spy.mockReturnValue(baseTime + WINDOW_MS + 1000);

			const afterExpiry = recordLoginAttempt(email);
			expect(afterExpiry.allowed).toBe(true);
			expect(afterExpiry.remaining).toBe(MAX_ATTEMPTS - 1);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('resetLoginAttempts', () => {
	test('clears a blocked email so the next attempt is allowed', () => {
		const email = uniqueEmail('reset');
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(email);
		expect(recordLoginAttempt(email).allowed).toBe(false);

		resetLoginAttempts(email);

		const afterReset = recordLoginAttempt(email);
		expect(afterReset.allowed).toBe(true);
		expect(afterReset.remaining).toBe(MAX_ATTEMPTS - 1);
	});

	test('is case-insensitive (clears lowercase-normalised key)', () => {
		const email = uniqueEmail('reset-case');
		for (let i = 0; i < MAX_ATTEMPTS; i++) recordLoginAttempt(email);

		resetLoginAttempts(email.toUpperCase()); // reset with uppercase

		const afterReset = recordLoginAttempt(email);
		expect(afterReset.allowed).toBe(true);
	});

	test('no-op for an email that was never rate-limited', () => {
		const email = uniqueEmail('reset-noop');
		expect(() => resetLoginAttempts(email)).not.toThrow();
	});
});

describe('rate limit bypass via environment variables', () => {
	let savedDisableRateLimit: string | undefined;
	let savedNodeEnv: string | undefined;

	beforeEach(() => {
		savedDisableRateLimit = process.env.DISABLE_RATE_LIMIT;
		savedNodeEnv = process.env.NODE_ENV;
	});

	afterEach(() => {
		if (savedDisableRateLimit === undefined) {
			delete process.env.DISABLE_RATE_LIMIT;
		} else {
			process.env.DISABLE_RATE_LIMIT = savedDisableRateLimit;
		}
		if (savedNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = savedNodeEnv;
		}
	});

	test('DISABLE_RATE_LIMIT=true always returns allowed with MAX_ATTEMPTS remaining', () => {
		process.env.DISABLE_RATE_LIMIT = 'true';
		const email = uniqueEmail('bypass-flag');

		// Simulate many attempts — should always be allowed
		for (let i = 0; i < MAX_ATTEMPTS + 5; i++) {
			const result = recordLoginAttempt(email);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(MAX_ATTEMPTS);
			expect(result.retryAfterMs).toBe(0);
		}
	});

	test('NODE_ENV=e2e bypasses rate limiting', () => {
		process.env.NODE_ENV = 'e2e';
		const email = uniqueEmail('bypass-e2e');

		for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
			const result = recordLoginAttempt(email);
			expect(result.allowed).toBe(true);
		}
	});

	test('resetLoginAttempts is a no-op when rate limiting is disabled', () => {
		process.env.DISABLE_RATE_LIMIT = 'true';
		const email = uniqueEmail('reset-disabled');
		// Should not throw even if map is empty
		expect(() => resetLoginAttempts(email)).not.toThrow();
	});
});
