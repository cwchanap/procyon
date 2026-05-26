import { describe, expect, test } from 'bun:test';
import authRoutes from './auth';
import { recordLoginAttempt, resetLoginAttempts } from '../auth/rate-limit';

describe('POST /api/auth/register rate limiting', () => {
	test('returns 429 after too many attempts for the same email', async () => {
		const email = `rate-limit-register-${Date.now()}@example.com`;
		resetLoginAttempts(email);

		let status = null as null | ReturnType<typeof recordLoginAttempt>;
		for (let i = 0; i < 20; i++) {
			status = recordLoginAttempt(email);
			if (!status.allowed) {
				break;
			}
		}

		expect(status).not.toBeNull();
		expect(status?.allowed).toBe(false);

		const res = await authRoutes.request('http://localhost/register', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				email,
				password: 'password123',
				username: 'ratelimit_user',
			}),
		});

		expect(res.status).toBe(429);

		const body = (await res.json()) as {
			error?: unknown;
			retryAfterMs?: unknown;
		};

		expect(typeof body.error).toBe('string');
		expect(typeof body.retryAfterMs).toBe('number');

		resetLoginAttempts(email);
	});
});
