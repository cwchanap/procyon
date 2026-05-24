import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { signAppJwt } from '../auth/jwt';

// Pre-import the real modules so the mocks can delegate when no override is set.
const realGoogle = await import('../auth/google');
const realUsers = await import('../auth/users');

let nextGoogleClaims: Awaited<
	ReturnType<typeof realGoogle.verifyGoogleIdToken>
> | null = null;
let nextGoogleError: Error | null = null;
let nextUpsertUser: Awaited<
	ReturnType<typeof realUsers.upsertGoogleUser>
> | null = null;
let nextUpsertError: Error | null = null;

mock.module('../auth/google', () => ({
	...realGoogle,
	verifyGoogleIdToken: async (...args: unknown[]) => {
		if (nextGoogleError) throw nextGoogleError;
		if (nextGoogleClaims) return nextGoogleClaims;
		// @ts-expect-error passthrough delegate
		return realGoogle.verifyGoogleIdToken(...args);
	},
}));

mock.module('../auth/users', () => ({
	...realUsers,
	upsertGoogleUser: async (...args: unknown[]) => {
		if (nextUpsertError) throw nextUpsertError;
		if (nextUpsertUser) return nextUpsertUser;
		// @ts-expect-error passthrough delegate
		return realUsers.upsertGoogleUser(...args);
	},
}));

const { default: authRoutes } = await import('./auth');

beforeAll(() => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	process.env.GOOGLE_CLIENT_ID =
		'test-google-client-id.apps.googleusercontent.com';
});

beforeEach(() => {
	nextGoogleClaims = null;
	nextGoogleError = null;
	nextUpsertUser = null;
	nextUpsertError = null;
});

function mountAuth() {
	const app = new Hono();
	app.route('/auth', authRoutes);
	return app;
}

describe('POST /auth/google', () => {
	test('returns access_token for valid google id token', async () => {
		nextGoogleClaims = {
			sub: 'google-1',
			email: 'alice@example.com',
			emailVerified: true,
			name: 'Alice',
			picture: 'https://example.com/a.png',
		};
		nextUpsertUser = {
			id: 'user-uuid-1',
			googleSub: 'google-1',
			email: 'alice@example.com',
			username: 'alice',
			name: 'Alice',
			picture: 'https://example.com/a.png',
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const app = mountAuth();
		const res = await app.request('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id_token: 'fake-google-token' }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			access_token: string;
			user: { id: string; email: string; username: string };
		};
		expect(typeof body.access_token).toBe('string');
		expect(body.user.username).toBe('alice');
		expect(body.user.email).toBe('alice@example.com');
	});

	test('returns 401 on invalid google token', async () => {
		nextGoogleError = new Error('Invalid token audience');
		const app = mountAuth();
		const res = await app.request('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id_token: 'bad-token-value' }),
		});
		expect(res.status).toBe(401);
	});

	test('returns 500 on configuration errors (e.g. missing client ID)', async () => {
		nextGoogleError = new Error('GOOGLE_CLIENT_ID is not configured');
		const app = mountAuth();
		const res = await app.request('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id_token: 'some-token' }),
		});
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Internal server error');
	});

	test('returns 401 for email not verified error', async () => {
		nextGoogleError = new Error('Email not verified with Google');
		const app = mountAuth();
		const res = await app.request('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id_token: 'some-token' }),
		});
		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Email not verified with Google');
	});

	test('returns 400 when id_token missing', async () => {
		const app = mountAuth();
		const res = await app.request('/auth/google', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});
});

describe('GET /auth/session', () => {
	test('returns user for valid token', async () => {
		const token = await signAppJwt({
			sub: 'user-uuid-1',
			email: 'alice@example.com',
			username: 'alice',
		});
		const app = mountAuth();
		const res = await app.request('/auth/session', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { id: string; email: string; username: string };
		};
		expect(body.user.id).toBe('user-uuid-1');
		expect(body.user.username).toBe('alice');
	});

	test('returns 401 for missing token', async () => {
		const app = mountAuth();
		const res = await app.request('/auth/session');
		expect(res.status).toBe(401);
	});
});

describe('POST /auth/logout', () => {
	test('returns 200 even without token (stateless)', async () => {
		const app = mountAuth();
		const res = await app.request('/auth/logout', { method: 'POST' });
		expect(res.status).toBe(200);
	});
});
