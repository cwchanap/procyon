/**
 * Simple in-memory rate limiter for login attempts.
 * Limits to MAX_ATTEMPTS per WINDOW_MS per email.
 *
 * NOTE: This implementation uses in-memory storage and lazy cleanup.
 * For production deployments with multiple instances, consider using:
 * - Redis with atomic operations (recommended for multi-instance setups)
 * - A dedicated rate-limiting service (e.g., Cloudflare Rate Limiting)
 * - Database-backed rate limiting with proper indexing
 */
import { logger } from '../logger';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type AttemptInfo = {
	count: number;
	firstAttemptAt: number;
};

const attempts = new Map<string, AttemptInfo>();

let lastCleanupAt = 0;

function maybeCleanup(now: number): void {
	if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
	lastCleanupAt = now;

	const cutoff = now - WINDOW_MS;
	const cutoffIso = new Date(cutoff).toISOString();
	let cleaned = 0;

	for (const [email, attempt] of attempts.entries()) {
		if (attempt.firstAttemptAt < cutoff) {
			attempts.delete(email);
			cleaned++;
		}
	}

	if (cleaned > 0) {
		logger.info('Rate limit cleanup', {
			cleaned,
			cutoff,
			cutoffIso,
			windowMs: WINDOW_MS,
			intervalMs: CLEANUP_INTERVAL_MS,
		});
	}
}

/**
 * Start the periodic cleanup task. Call this during application startup.
 */
export function startRateLimitCleanup(): () => void {
	lastCleanupAt = Date.now();
	return stopRateLimitCleanup;
}

/**
 * Stop the periodic cleanup task. Call this during graceful shutdown.
 */
export function stopRateLimitCleanup(): void {
	return;
}

export interface RateLimitStatus {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
}

/**
 * Record a failed attempt and return rate limit status.
 */
export function recordLoginAttempt(email: string): RateLimitStatus {
	const now = Date.now();
	maybeCleanup(now);
	const normalized = email.toLowerCase();
	const entry = attempts.get(normalized);

	if (entry) {
		// Check if window expired
		if (now - entry.firstAttemptAt > WINDOW_MS) {
			// Reset window
			attempts.set(normalized, { count: 1, firstAttemptAt: now });
			return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
		}

		const nextCount = entry.count + 1;
		entry.count = nextCount;
		attempts.set(normalized, entry);

		const allowed = nextCount <= MAX_ATTEMPTS;
		const remaining = Math.max(MAX_ATTEMPTS - nextCount, 0);
		const retryAfterMs = allowed
			? 0
			: remainingWindowMs(entry.firstAttemptAt, now);
		return { allowed, remaining, retryAfterMs };
	}

	attempts.set(normalized, { count: 1, firstAttemptAt: now });
	return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
}

/**
 * Clear attempts for a user after successful login.
 */
export function resetLoginAttempts(email: string): void {
	maybeCleanup(Date.now());
	attempts.delete(email.toLowerCase());
}

function remainingWindowMs(firstAttemptAt: number, now: number): number {
	const elapsed = now - firstAttemptAt;
	const remaining = WINDOW_MS - elapsed;
	return remaining > 0 ? remaining : 0;
}
