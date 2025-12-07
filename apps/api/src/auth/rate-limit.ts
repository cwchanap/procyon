/**
 * Simple in-memory rate limiter for login attempts.
 * Limits to MAX_ATTEMPTS per WINDOW_MS per email.
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

type AttemptInfo = {
	count: number;
	firstAttemptAt: number;
};

const attempts = new Map<string, AttemptInfo>();

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
	attempts.delete(email.toLowerCase());
}

function remainingWindowMs(firstAttemptAt: number, now: number): number {
	const elapsed = now - firstAttemptAt;
	const remaining = WINDOW_MS - elapsed;
	return remaining > 0 ? remaining : 0;
}
