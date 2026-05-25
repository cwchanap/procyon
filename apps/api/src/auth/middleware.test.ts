import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { authMiddleware, getUser } from './middleware';
import { signAppJwt } from './jwt';

const originalJwtSecret = process.env.JWT_SECRET;

beforeAll(() => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
});

afterAll(() => {
	if (originalJwtSecret === undefined) {
		delete process.env.JWT_SECRET;
	} else {
		process.env.JWT_SECRET = originalJwtSecret;
	}
});

function makeApp() {
	const app = new Hono();
	app.use('*', authMiddleware);
	app.get('/me', c => {
		const u = getUser(c);
		return c.json(u);
	});
	return app;
}

describe('authMiddleware', () => {
	test('rejects missing header', async () => {
		const app = makeApp();
		const res = await app.request('/me');
		expect(res.status).toBe(401);
	});

	test('rejects malformed header', async () => {
		const app = makeApp();
		const res = await app.request('/me', {
			headers: { authorization: 'NotBearer foo' },
		});
		expect(res.status).toBe(401);
	});

	test('rejects garbage token', async () => {
		const app = makeApp();
		const res = await app.request('/me', {
			headers: { authorization: 'Bearer not-a-jwt' },
		});
		expect(res.status).toBe(401);
	});

	test('accepts a valid app JWT', async () => {
		const token = await signAppJwt({
			sub: 'user-uuid-1',
			email: 'valid@example.com',
			username: 'valid',
		});
		const app = makeApp();
		const res = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.userId).toBe('user-uuid-1');
		expect(body.email).toBe('valid@example.com');
	});

	test('accepts a valid app JWT from the auth cookie', async () => {
		const token = await signAppJwt({
			sub: 'cookie-user-1',
			email: 'cookie@example.com',
			username: 'cookie_user',
		});
		const app = makeApp();
		const res = await app.request('/me', {
			headers: { cookie: `procyon_access_token=${token}` },
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.userId).toBe('cookie-user-1');
		expect(body.email).toBe('cookie@example.com');
	});

	test('rejects a token signed with the wrong secret', async () => {
		const token = await signAppJwt(
			{ sub: 'u', email: 'x@example.com', username: 'x' },
			{ secret: 'different-secret-32-chars-aaaaaaaa' }
		);
		const app = makeApp();
		const res = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(401);
	});
});
