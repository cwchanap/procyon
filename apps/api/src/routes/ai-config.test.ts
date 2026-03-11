import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initializeDB } from '../db';
import { aiConfigurations } from '../db/schema';
import { sql } from 'drizzle-orm';
import aiConfigRoutes from './ai-config';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';

type FetchMockRestore = () => void;

/**
 * Mock Supabase auth: 'Bearer test-token' succeeds, anything else fails.
 */
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
					JSON.stringify({ id: 'user-uuid-1', email: 'test@example.com' }),
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

const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };

describe('ai-config routes - auth guards (no token)', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
	});

	afterEach(() => {
		restore();
	});

	test('GET / returns 401 without token', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`);
		expect(res.status).toBe(401);
	});

	test('POST / returns 401 without token', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'test-key',
			}),
		});
		expect(res.status).toBe(401);
	});

	test('POST /set-active returns 401 without token', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/set-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: 'gemini', modelName: 'gemini-pro' }),
		});
		expect(res.status).toBe(401);
	});

	test('GET /:id/full returns 401 without token', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/1/full`);
		expect(res.status).toBe(401);
	});

	test('DELETE /:id returns 401 without token', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/1`, {
			method: 'DELETE',
		});
		expect(res.status).toBe(401);
	});
});

describe('ai-config routes - Zod validation (with valid token)', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
	});

	afterEach(() => {
		restore();
	});

	test('POST / returns 400 for invalid provider enum', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({
				provider: 'invalid-provider',
				modelName: 'some-model',
				apiKey: 'test-key',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 when apiKey is empty string', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: '',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 when modelName is empty string', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({
				provider: 'openai',
				modelName: '',
				apiKey: 'test-key',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 when required fields are missing', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ provider: 'gemini' }),
		});
		expect(res.status).toBe(400);
	});

	test('POST /set-active returns 400 for invalid provider enum', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/set-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ provider: 'unknown', modelName: 'model' }),
		});
		expect(res.status).toBe(400);
	});

	test('POST /set-active returns 400 when modelName is missing', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/set-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ provider: 'gemini' }),
		});
		expect(res.status).toBe(400);
	});

	// Note: GET /:id/full and DELETE /:id call getDB() before the parseInt/isNaN check,
	// so non-numeric id validation (400) can only be tested with a live database.
	// Those behaviours are covered by E2E tests.
});

describe('ai-config routes - success path with API key masking', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(async () => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();

		// Initialize test database
		initializeDB();
		const db = (await import('../db')).getDB();

		// Clean up any existing test data
		await db
			.delete(aiConfigurations)
			.where(sql`${aiConfigurations.userId} = 'user-uuid-1'`);
	});

	afterEach(() => {
		restore();
	});

	test('POST / creates config and GET / returns masked API key', async () => {
		const originalKey = 'test-key-1234';
		const maskedKey = '***' + originalKey.slice(-4);

		// Create a configuration
		const createRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: originalKey,
			}),
		});
		expect(createRes.status).toBe(200);
		const createBody = (await createRes.json()) as {
			configuration: { id: number };
		};
		expect(createBody.configuration).toBeDefined();

		// Get all configurations and verify API key is masked
		const getRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			headers: AUTH_HEADER,
		});
		expect(getRes.status).toBe(200);
		const getBody = (await getRes.json()) as {
			configurations: Array<{ apiKey: string }>;
		};
		expect(getBody.configurations).toHaveLength(1);
		expect(getBody.configurations[0]!.apiKey).toBe(maskedKey);
	});
});
