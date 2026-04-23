/**
 * Tests specifically targeting the maybeCleanup() body in rate-limit.ts.
 *
 * The cleanup logic only runs when CLEANUP_INTERVAL_MS (5 min) has elapsed
 * since the last cleanup.  We control time via a Date.now spy so the tests
 * remain fast and deterministic.
 *
 * Uncovered lines targeted: 41, 43-45, 47-52, 54-61
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
	recordLoginAttempt,
	startRateLimitCleanup,
} from './rate-limit';

const WINDOW_MS = 15 * 60 * 1000;       // mirrors module constant
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // mirrors module constant

function uniqueEmail(label: string) {
	return `${label}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('maybeCleanup - full body execution', () => {
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

	test('expired entries are removed when cleanup interval elapses', () => {
		const spy = spyOn(Date, 'now');
		const t0 = 1_700_000_000_000; // fixed epoch far in the past

		try {
			// Phase 1: set lastCleanupAt to t0 via startRateLimitCleanup
			spy.mockReturnValue(t0);
			startRateLimitCleanup();

			// Record an attempt at t0 — this entry will expire after WINDOW_MS
			const oldEmail = uniqueEmail('cleanup-old');
			recordLoginAttempt(oldEmail);

			// Phase 2: advance time past WINDOW_MS and CLEANUP_INTERVAL_MS
			// now - lastCleanupAt (t0) = WINDOW_MS + 1000 > CLEANUP_INTERVAL_MS (300 000)
			const future = t0 + WINDOW_MS + 1000;
			spy.mockReturnValue(future);

			// Recording any attempt at "future" triggers maybeCleanup.
			// cutoff = future - WINDOW_MS = t0 + 1000.
			// oldEmail.firstAttemptAt = t0 < t0 + 1000 → expired → deleted.
			const newEmail = uniqueEmail('cleanup-new');
			const result = recordLoginAttempt(newEmail);

			// The new email's first attempt is allowed
			expect(result.allowed).toBe(true);

			// The old email should start fresh (its entry was cleaned up)
			// If not cleaned, 1 attempt already exists; if cleaned, it restarts.
			// We exhaust the limit on old email — if it was reset, we'd need 5 more attempts.
			// Just verify a fresh attempt is allowed (remaining = MAX_ATTEMPTS - 1 = 4).
			const oldAfterClean = recordLoginAttempt(oldEmail);
			expect(oldAfterClean.allowed).toBe(true);
			expect(oldAfterClean.remaining).toBe(4); // started fresh
		} finally {
			spy.mockRestore();
		}
	});

	test('cleanup logs when entries are removed', () => {
		const dateSpy = spyOn(Date, 'now');
		const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
		const t0 = 1_600_000_000_000;

		try {
			dateSpy.mockReturnValue(t0);
			startRateLimitCleanup();

			// Create an entry that will expire
			const expiredEmail = uniqueEmail('log-test');
			recordLoginAttempt(expiredEmail);

			// Advance past both window and cleanup interval
			dateSpy.mockReturnValue(t0 + WINDOW_MS + CLEANUP_INTERVAL_MS + 1000);

			// Trigger cleanup by making any attempt
			recordLoginAttempt(uniqueEmail('log-trigger'));

			// The logger.info call (inside cleanup) outputs to console.log
			expect(consoleSpy).toHaveBeenCalled();
			const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1];
			const logged = lastCall?.[0];
			// Verify the log line contains cleanup-related info
			expect(logged).toContain('cleanup');
		} finally {
			dateSpy.mockRestore();
			consoleSpy.mockRestore();
		}
	});
});
