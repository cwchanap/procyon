import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetLoginAttempts } from '../auth/rate-limit';
import authRoutes from './auth';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';

// Bindings passed to authRoutes.fetch() so c.env is populated (required by logout route)
const envBindings = { SUPABASE_URL, SUPABASE_ANON_KEY };

type FetchMockRestore = () => void;

/**
 * Create a fetch mock that responds to Supabase auth endpoints.
 * handlers maps URL path substrings to response factories.
 */
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
				const isNoContentStatus = [204, 205, 304].includes(response.status);
				return new Response(
					isNoContentStatus ? null : JSON.stringify(response.body),
					isNoContentStatus
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

describe('POST /login', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 400 for missing email', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'password123' }),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
	});

	test('returns 400 for invalid email format', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'not-an-email',
					password: 'password123',
				}),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
	});

	test('returns 400 for empty password', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'user@example.com', password: '' }),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
	});

	test('returns 401 when Supabase signInWithPassword fails', async () => {
		const email = `login-fail-${Math.random()}@example.com`;
		restore = mockFetch({
			'/auth/v1/token': {
				status: 400,
				body: {
					error: 'invalid_grant',
					error_description: 'Invalid login credentials',
				},
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
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Invalid email or password');
	});

	test('returns 200 with tokens on successful login', async () => {
		const email = `login-ok-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/token': {
				status: 200,
				body: {
					access_token: 'access-abc',
					refresh_token: 'refresh-xyz',
					token_type: 'bearer',
					expires_in: 3600,
					user: { id: 'user-1', email },
				},
			},
		});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password: 'correctpassword' }),
			}),
			envBindings
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			access_token: string;
			refresh_token: string;
			user: { id: string; email: string };
		};
		expect(body.access_token).toBe('access-abc');
		expect(body.refresh_token).toBe('refresh-xyz');
	});

	test('returns 429 when login attempts are exhausted', async () => {
		const email = `login-ratelimit-${Math.random()}@example.com`;

		// Exhaust rate limit for this email
		const { recordLoginAttempt } = await import('../auth/rate-limit');
		for (let i = 0; i < 5; i++) recordLoginAttempt(email);

		restore = mockFetch({});

		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password: 'anypass' }),
			}),
			envBindings
		);
		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: string; retryAfterMs: number };
		expect(typeof body.error).toBe('string');
		expect(body.retryAfterMs).toBeGreaterThan(0);
	});
});

describe('POST /logout', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 401 when Authorization header is missing', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/logout`, { method: 'POST' }),
			envBindings
		);
		expect(res.status).toBe(401);
	});

	test('returns 401 when token is rejected by Supabase (401 from Supabase)', async () => {
		restore = mockFetch({
			'/auth/v1/logout': { status: 401, body: { message: 'Unauthorized' } },
		});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/logout`, {
				method: 'POST',
				headers: { Authorization: 'Bearer bad-token' },
			}),
			envBindings
		);
		expect(res.status).toBe(401);
	});

	test('returns 200 on successful logout', async () => {
		restore = mockFetch({
			'/auth/v1/logout': { status: 204, body: {} },
		});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/logout`, {
				method: 'POST',
				headers: { Authorization: 'Bearer valid-token' },
			}),
			envBindings
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { message: string };
		expect(body.message).toBe('Logged out');
	});

	test('returns 500 when Supabase returns unexpected error status', async () => {
		restore = mockFetch({
			'/auth/v1/logout': {
				status: 503,
				body: { error: 'service unavailable' },
			},
		});
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

describe('GET /session', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 401 when Authorization header is missing', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/session`),
			envBindings
		);
		expect(res.status).toBe(401);
	});

	test('returns 401 when token is invalid', async () => {
		restore = mockFetch({
			'/auth/v1/user': { status: 401, body: { message: 'Unauthorized' } },
		});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/session`, {
				headers: { Authorization: 'Bearer bad-token' },
			}),
			envBindings
		);
		expect(res.status).toBe(401);
	});

	test('returns 200 with user data for a valid token', async () => {
		restore = mockFetch({
			'/auth/v1/user': {
				status: 200,
				body: {
					id: 'user-123',
					email: 'user@example.com',
					user_metadata: { username: 'testuser' },
				},
			},
		});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/session`, {
				headers: { Authorization: 'Bearer valid-token' },
			}),
			envBindings
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: {
				id: string;
				email: string;
				user_metadata: Record<string, string>;
			};
		};
		expect(body.user.id).toBe('user-123');
		expect(body.user.email).toBe('user@example.com');
		expect(body.user.user_metadata.username).toBe('testuser');
	});
});

describe('POST /register', () => {
	let restore: FetchMockRestore = () => {};
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
		restore();
	});

	test('returns 400 for missing email', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'password123' }),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
	});

	test('returns 400 for password shorter than 8 characters', async () => {
		restore = mockFetch({});
		const res = await authRoutes.fetch(
			new Request(`${SUPABASE_URL}/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'user@example.com', password: 'short' }),
			}),
			envBindings
		);
		expect(res.status).toBe(400);
	});

	test('returns 201 on successful registration', async () => {
		const email = `register-ok-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/signup': {
				status: 200,
				body: {
					user: { id: 'new-user-id', email },
					session: { access_token: 'access-tok', refresh_token: 'refresh-tok' },
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
					username: 'testuser',
				}),
			}),
			envBindings
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			access_token: string | null;
			user: { id: string; email: string; username: string };
		};
		expect(body.user.id).toBe('new-user-id');
		expect(body.user.username).toBe('testuser'); // normalized lowercase
	});

	test('normalizes username to lowercase', async () => {
		const email = `register-username-${Math.random()}@example.com`;
		resetLoginAttempts(email);

		restore = mockFetch({
			'/auth/v1/signup': {
				status: 200,
				body: {
					user: { id: 'new-user-2', email },
					session: { access_token: 'tok', refresh_token: 'ref' },
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
					username: 'TestUser',
				}),
			}),
			envBindings
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { username: string } };
		expect(body.user.username).toBe('testuser');
	});
});
