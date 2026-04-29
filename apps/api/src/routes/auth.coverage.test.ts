import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetLoginAttempts } from '../auth/rate-limit';
import authRoutes from './auth';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const envBindings = { SUPABASE_URL, SUPABASE_ANON_KEY };

type FetchMockRestore = () => void;

function mockFetch(
	handlers: Record<string, { status: number; body: unknown }>
): FetchMockRestore {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();
		for (const [pattern, response] of Object.entries(handlers)) {
			if (url.includes(pattern)) {
				const isNoContent = [204, 205, 304].includes(response.status);
				return new Response(
					isNoContent ? null : JSON.stringify(response.body),
					isNoContent
						? { status: response.status }
						: {
								status: response.status,
								headers: { 'Content-Type': 'application/json' },
							}
				);
			}
		}
		return new Response(JSON.stringify({ error: 'mock: unmatched URL' }), {
			status: 404,
		});
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

describe('POST /register - error paths', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 409 when username is already taken (unique constraint error)', async () => {
		const email = `register-conflict-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/signup': {
				status: 422,
				body: {
					code: '23505',
					message:
						'duplicate key value violates unique constraint "auth_users_username_unique"',
				},
			},
		});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password: 'password123',
					username: 'takenuser',
				}),
			}),
			envBindings
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('already taken');
	});

	test('returns 400 when Supabase reports a generic auth error', async () => {
		const email = `register-autherr-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/signup': {
				status: 400,
				body: {
					error: 'email_exists',
					message: 'User already registered',
				},
			},
		});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password: 'password123',
				}),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(typeof body.error).toBe('string');
	});
});

describe('POST /logout - missing env error path', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 500 when SUPABASE_URL and SUPABASE_ANON_KEY are both missing', async () => {
		restore = mockFetch({});
		// Clear process.env vars so the fallback also returns empty
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_ANON_KEY;

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/logout`, {
				method: 'POST',
				headers: { Authorization: 'Bearer test-token' },
			}),
			// Pass empty bindings so c.env has no SUPABASE values either
			{}
		);
		expect(res.status).toBe(500);
	});
});

describe('POST /login - error paths', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 401 when Supabase signInWithPassword fails', async () => {
		const email = `login-fail-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/token': {
				status: 400,
				body: { error: 'invalid_grant', message: 'Invalid login credentials' },
			},
		});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password: 'wrongpassword' }),
			}),
			envBindings
		);
		expect(res.status).toBe(401);
	});
});

describe('POST /register - signIn fallback when no session', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('signs in automatically when signUp returns no session (email confirm required)', async () => {
		const email = `register-nosession-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/signup': {
				status: 200,
				body: {
					user: { id: 'user-123', email },
					session: null, // No session - triggers signInWithPassword
				},
			},
			'/auth/v1/token': {
				status: 200,
				body: {
					access_token: 'fallback-access-token',
					refresh_token: 'fallback-refresh-token',
					token_type: 'bearer',
					user: { id: 'user-123', email },
				},
			},
		});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password: 'password123' }),
			}),
			envBindings
		);
		// Registration succeeds even when session is null initially
		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		expect(body.user.id).toBe('user-123');
	});
});

describe('POST /logout - network error path', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 500 when fetch to Supabase logout throws (network error)', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof Request
						? input.url
						: input.toString();
			if (url.includes('/auth/v1/logout')) {
				throw new Error('Network connection refused');
			}
			return new Response('Not Found', { status: 404 });
		}) as typeof fetch;
		restore = () => {
			globalThis.fetch = original;
		};

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/logout`, {
				method: 'POST',
				headers: { Authorization: 'Bearer valid-token' },
			}),
			envBindings
		);
		expect(res.status).toBe(500);
	});
});
