import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { authMiddleware, getUser } from './middleware';

const SUPABASE_URL = 'http://localhost:54321';

function setupEnv() {
	process.env.SUPABASE_URL = SUPABASE_URL;
	process.env.SUPABASE_ANON_KEY = 'test-anon-key';
}

type FetchMockRestore = () => void;

function mockSupabaseFetch(userResponse: {
	status: number;
	body: Record<string, unknown>;
}): FetchMockRestore {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();
		if (url.includes('/auth/v1/user')) {
			return new Response(JSON.stringify(userResponse.body), {
				status: userResponse.status,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

function mockSupabaseFetchServerError(): FetchMockRestore {
	const original = globalThis.fetch;
	globalThis.fetch = (async (_input: RequestInfo | URL) => {
		return new Response(JSON.stringify({ error: 'internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

function createTestApp() {
	const app = new Hono();
	app.get('/protected', authMiddleware, c => {
		const user = getUser(c);
		return c.json({ userId: user.userId, email: user.email ?? null });
	});
	return app;
}

describe('authMiddleware', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		setupEnv();
	});

	afterEach(() => {
		restore();
	});

	test('returns 401 when Authorization header is missing', async () => {
		restore = mockSupabaseFetch({
			status: 200,
			body: { id: 'u1', email: 'a@b.com' },
		});
		const app = createTestApp();
		const res = await app.request('http://localhost/protected');
		expect(res.status).toBe(401);
	});

	test('returns 401 when Authorization header has wrong scheme', async () => {
		restore = mockSupabaseFetch({
			status: 200,
			body: { id: 'u1', email: 'a@b.com' },
		});
		const app = createTestApp();
		const res = await app.request('http://localhost/protected', {
			headers: { Authorization: 'Basic dXNlcjpwYXNz' },
		});
		expect(res.status).toBe(401);
	});

	test('returns 401 when Authorization header is just "Bearer" with no token', async () => {
		restore = mockSupabaseFetch({
			status: 200,
			body: { id: 'u1', email: 'a@b.com' },
		});
		const app = createTestApp();
		const res = await app.request('http://localhost/protected', {
			headers: { Authorization: 'Bearer' },
		});
		expect(res.status).toBe(401);
	});

	test('returns 401 when Supabase rejects the token', async () => {
		restore = mockSupabaseFetch({
			status: 401,
			body: { message: 'Unauthorized' },
		});
		const app = createTestApp();
		const res = await app.request('http://localhost/protected', {
			headers: { Authorization: 'Bearer invalid-token' },
		});
		expect(res.status).toBe(401);
	});

	test('returns 200 and sets user context for a valid token', async () => {
		restore = mockSupabaseFetch({
			status: 200,
			body: { id: 'user-uuid-1', email: 'valid@example.com' },
		});
		const app = createTestApp();
		const res = await app.request('http://localhost/protected', {
			headers: { Authorization: 'Bearer test-token' },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; email: string | null };
		expect(body.userId).toBe('user-uuid-1');
		expect(body.email).toBe('valid@example.com');
	});

	test('returns 401 when Supabase returns a server error (client returns error, not throw)', async () => {
		// The Supabase client converts HTTP error responses into { data: null, error }
		// so the middleware treats it as an invalid token (401).
		restore = mockSupabaseFetchServerError();
		const app = createTestApp();
		const res = await app.request('http://localhost/protected', {
			headers: { Authorization: 'Bearer test-token' },
		});
		expect(res.status).toBe(401);
	});
});
