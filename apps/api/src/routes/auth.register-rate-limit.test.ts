import { describe, expect, test } from 'bun:test';
import authRoutes from './auth';

describe('POST /api/auth/register (deprecated)', () => {
	test('returns 410 — email registration is deprecated', async () => {
		const res = await authRoutes.request('http://localhost/register', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				email: 'deprecated@example.com',
				password: 'password123',
				username: 'deprecated_user',
			}),
		});

		expect(res.status).toBe(410);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('no longer supported');
	});
});
