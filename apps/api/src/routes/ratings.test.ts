import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initializeDB } from '../db';
import ratingsRoutes from './ratings';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };
const TEST_USER_ID = 'user-uuid-1';

type FetchMockRestore = () => void;

function mockSupabaseFetch(): FetchMockRestore {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();
		if (url.includes('/auth/v1/user')) {
			const auth =
				(init?.headers as Record<string, string> | undefined)?.Authorization ??
				(init?.headers as Record<string, string> | undefined)?.authorization;
			if (auth === 'Bearer test-token') {
				return new Response(
					JSON.stringify({ id: TEST_USER_ID, email: 'test@example.com' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(JSON.stringify({ message: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

describe('ratings routes - auth guards', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		process.env.SUPABASE_URL ??= SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
	});

	afterEach(() => restore());

	test('GET / returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/`);
		expect(res.status).toBe(401);
	});

	test('GET /:variant returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`);
		expect(res.status).toBe(401);
	});

	test('GET /history/:variant returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/history/chess`);
		expect(res.status).toBe(401);
	});
});

describe('ratings routes - variant validation', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		process.env.SUPABASE_URL ??= SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => restore());

	test('GET /:variant returns 400 for invalid variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/invalid-variant`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Invalid variant');
	});

	test('GET /history/:variant returns 400 for invalid variant', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/invalid-variant`,
			{ headers: AUTH_HEADER }
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Invalid variant');
	});
});

describe('ratings routes - success paths', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		process.env.SUPABASE_URL ??= SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => restore());

	test('GET / returns ratings object for authenticated user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ratings: unknown };
		expect(body).toHaveProperty('ratings');
	});

	test('GET /chess returns rating for chess variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: {
				userId: string;
				variantId: string;
				rating: number;
				tier: string;
			};
		};
		expect(body.rating).toBeDefined();
		expect(body.rating.userId).toBe(TEST_USER_ID);
		expect(body.rating.variantId).toBe('chess');
		expect(typeof body.rating.rating).toBe('number');
		expect(typeof body.rating.tier).toBe('object');
	});

	test('GET /shogi returns rating for shogi variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/shogi`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('shogi');
	});

	test('GET /xiangqi returns rating for xiangqi variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/xiangqi`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('xiangqi');
	});

	test('GET /jungle returns rating for jungle variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/jungle`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('jungle');
	});

	test('GET /history/chess returns empty history for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/history/chess`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { history: unknown[] };
		expect(body).toHaveProperty('history');
		expect(Array.isArray(body.history)).toBe(true);
	});

	test('GET /chess returns default rating of 1200 for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { rating: number };
		};
		expect(body.rating.rating).toBe(1200);
	});
});
