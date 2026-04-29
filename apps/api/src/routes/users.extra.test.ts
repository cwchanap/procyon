import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import usersRoutes from './users';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

const CF_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
const CF_ENV_NO_SERVICE_ROLE = { SUPABASE_URL, SUPABASE_ANON_KEY };

type FetchMockRestore = () => void;

interface MockUser {
	id: string;
	email: string;
	user_metadata: { username?: string; name?: string };
	created_at: string;
	updated_at: string;
}

function mockSupabaseFetch(
	options: {
		userNotFound?: boolean;
		updateFails?: boolean;
		updateConflict?: boolean;
	} = {}
): FetchMockRestore {
	const original = globalThis.fetch;
	const mockUser: MockUser = {
		id: TEST_USER_ID,
		email: 'test@example.com',
		user_metadata: { username: 'testuser', name: 'Test User' },
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
	};

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();

		const method =
			input instanceof Request ? input.method : (init?.method ?? 'GET');
		const headers =
			input instanceof Request
				? new Headers(input.headers)
				: new Headers(init?.headers as HeadersInit | undefined);
		const auth =
			headers.get('authorization') ?? headers.get('Authorization') ?? '';

		// Supabase anon auth (middleware check)
		if (url.includes('/auth/v1/user') && !url.includes('/admin/')) {
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

		// Supabase admin - update user
		if (
			url.includes(`/auth/v1/admin/users/${TEST_USER_ID}`) &&
			method === 'PUT'
		) {
			if (options.updateConflict) {
				return new Response(
					JSON.stringify({
						message:
							'duplicate key value violates unique constraint "auth_users_username_unique"',
					}),
					{ status: 422, headers: { 'Content-Type': 'application/json' } }
				);
			}
			if (options.updateFails) {
				return new Response(
					JSON.stringify({ message: 'Internal server error' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({
					user: { ...mockUser, user_metadata: { username: 'updated' } },
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Supabase admin - get user by ID
		if (
			url.includes(`/auth/v1/admin/users/${TEST_USER_ID}`) &&
			method === 'GET'
		) {
			if (options.userNotFound) {
				return new Response(JSON.stringify({ error: 'User not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response(JSON.stringify({ user: mockUser }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;

	return () => {
		globalThis.fetch = original;
	};
}

describe('users routes - GET /me missing service role key', () => {
	let restore: FetchMockRestore = () => {};
	let origUrl: string | undefined;
	let origAnon: string | undefined;

	beforeEach(() => {
		origUrl = process.env.SUPABASE_URL;
		origAnon = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = origUrl;
		process.env.SUPABASE_ANON_KEY = origAnon;
	});

	test('GET /me returns 500 when supabaseAdmin is unavailable (no service role key)', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{ headers: AUTH_HEADER },
			CF_ENV_NO_SERVICE_ROLE
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('Supabase admin client unavailable');
	});

	test('PUT /me returns 500 when supabaseAdmin is unavailable (no service role key)', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'newname' }),
			},
			CF_ENV_NO_SERVICE_ROLE
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('Supabase admin client unavailable');
	});
});

describe('users routes - GET /me user not found in Supabase', () => {
	let restore: FetchMockRestore = () => {};
	let origUrl: string | undefined;
	let origAnon: string | undefined;
	let origSrk: string | undefined;

	beforeEach(() => {
		origUrl = process.env.SUPABASE_URL;
		origAnon = process.env.SUPABASE_ANON_KEY;
		origSrk = process.env.SUPABASE_SERVICE_ROLE_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
		restore = mockSupabaseFetch({ userNotFound: true });
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = origUrl;
		process.env.SUPABASE_ANON_KEY = origAnon;
		process.env.SUPABASE_SERVICE_ROLE_KEY = origSrk;
	});

	test('GET /me returns 404 when user not found in admin DB', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('not found');
	});
});

describe('users routes - PUT /me error paths', () => {
	let restore: FetchMockRestore = () => {};
	let origUrl: string | undefined;
	let origAnon: string | undefined;
	let origSrk: string | undefined;

	beforeEach(() => {
		origUrl = process.env.SUPABASE_URL;
		origAnon = process.env.SUPABASE_ANON_KEY;
		origSrk = process.env.SUPABASE_SERVICE_ROLE_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = origUrl;
		process.env.SUPABASE_ANON_KEY = origAnon;
		process.env.SUPABASE_SERVICE_ROLE_KEY = origSrk;
	});

	test('PUT /me returns 409 when username is already taken (unique constraint)', async () => {
		restore = mockSupabaseFetch({ updateConflict: true });
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'takenuser' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('already taken');
	});

	test('PUT /me returns 500 when update fails unexpectedly', async () => {
		restore = mockSupabaseFetch({ updateFails: true });
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'validuser' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('Failed to update');
	});

	test('PUT /me returns 400 when username is whitespace only', async () => {
		restore = mockSupabaseFetch();
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: '   ' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('empty');
	});
});
