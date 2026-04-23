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
		const dateSpy = spyOn(Date, 'now');
		const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
		const t0 = 1_700_000_000_000; // fixed epoch far in the past

		try {
			// Phase 1: set lastCleanupAt to t0 via startRateLimitCleanup
			dateSpy.mockReturnValue(t0);
			startRateLimitCleanup();

			// Record an attempt at t0 — this entry will expire after WINDOW_MS
			const oldEmail = uniqueEmail('cleanup-old');
			recordLoginAttempt(oldEmail);

			// Phase 2: advance time past WINDOW_MS and CLEANUP_INTERVAL_MS
			// now - lastCleanupAt (t0) = WINDOW_MS + 1000 > CLEANUP_INTERVAL_MS (300 000)
			const future = t0 + WINDOW_MS + 1000;
			dateSpy.mockReturnValue(future);

			// Recording any attempt at "future" triggers maybeCleanup.
			// cutoff = future - WINDOW_MS = t0 + 1000.
			// oldEmail.firstAttemptAt = t0 < t0 + 1000 → expired → deleted.
			const newEmail = uniqueEmail('cleanup-new');
			const result = recordLoginAttempt(newEmail);

			// The new email's first attempt is allowed
			expect(result.allowed).toBe(true);

			// Verify that maybeCleanup actually ran and found entries to delete.
			// The logger.info('Rate limit cleanup', { cleaned, ... }) call proves
			// the deletion loop executed — window-reset alone doesn't emit this log.
			expect(consoleSpy).toHaveBeenCalled();
			const logCalls = consoleSpy.mock.calls.map((c) => c[0] as string);
			const cleanupLog = logCalls.find((l) => l.includes('Rate limit cleanup'));
			expect(cleanupLog).toBeDefined();
			expect(cleanupLog).toContain('"cleaned":1');
		} finally {
			dateSpy.mockRestore();
			consoleSpy.mockRestore();
		}
	});

	test('cleanup log is emitted when entries are removed after a longer time advance', () => {
		const dateSpy = spyOn(Date, 'now');
		const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
		const t0 = 1_600_000_000_000;

		try {
			dateSpy.mockReturnValue(t0);
			startRateLimitCleanup();

			// Create an entry that will expire
			const expiredEmail = uniqueEmail('log-test');
			recordLoginAttempt(expiredEmail);

			// Advance past both window and cleanup interval (larger advance than test 1)
			dateSpy.mockReturnValue(t0 + WINDOW_MS + CLEANUP_INTERVAL_MS + 1000);

			// Trigger cleanup by making any attempt
			recordLoginAttempt(uniqueEmail('log-trigger'));

			// Search all console.log calls for the specific cleanup log entry
			// (avoids fragile dependence on ordering — works regardless of what else logs)
			const logCalls = consoleSpy.mock.calls.map((c) => c[0] as string);
			const cleanupLog = logCalls.find((l) => l.includes('Rate limit cleanup'));
			expect(cleanupLog).toBeDefined();
			expect(cleanupLog).toContain('"cleaned":1');
		} finally {
			dateSpy.mockRestore();
			consoleSpy.mockRestore();
		}
	});
});
