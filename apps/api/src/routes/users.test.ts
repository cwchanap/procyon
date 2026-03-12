import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import usersRoutes from './users';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

// CF-style env bindings injected into every request so getSupabaseClientsFromContext
// creates fresh clients and bypasses the module-level singleton.
const CF_ENV = {
	SUPABASE_URL,
	SUPABASE_ANON_KEY,
	SUPABASE_SERVICE_ROLE_KEY,
};

type FetchMockRestore = () => void;

interface MockUser {
	id: string;
	email: string;
	user_metadata: { username?: string; name?: string };
	created_at: string;
	updated_at: string;
}

function mockSupabaseFetch(user?: Partial<MockUser>): FetchMockRestore {
	const original = globalThis.fetch;
	const mockUser: MockUser = {
		id: TEST_USER_ID,
		email: 'test@example.com',
		user_metadata: { username: 'testuser', name: 'Test User' },
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		...user,
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

		// Supabase admin - update user by ID (check PUT before GET)
		if (
			url.includes(`/auth/v1/admin/users/${TEST_USER_ID}`) &&
			method === 'PUT'
		) {
			if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
				return new Response(JSON.stringify({ message: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			const body = JSON.parse((init.body as string) ?? '{}') as {
				user_metadata?: { username?: string };
			};
			// Mutate in place so subsequent GET reflects the update
			mockUser.user_metadata = {
				...mockUser.user_metadata,
				...body.user_metadata,
			};
			return new Response(JSON.stringify({ user: { ...mockUser } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Supabase admin - get user by ID
		if (url.includes(`/auth/v1/admin/users/${TEST_USER_ID}`)) {
			if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
				return new Response(JSON.stringify({ message: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response(JSON.stringify({ user: { ...mockUser } }), {
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

describe('users routes - auth guards', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		restore = mockSupabaseFetch();
	});

	afterEach(() => restore());

	test('GET /me returns 401 without token', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {}, CF_ENV);
		expect(res.status).toBe(401);
	});

	test('PUT /me returns 401 without token', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: 'newname' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(401);
	});
});

describe('users routes - GET /me', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		restore = mockSupabaseFetch();
	});

	afterEach(() => restore());

	test('GET /me returns user profile for authenticated user', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { id: string; email: string; username: string };
		};
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe(TEST_USER_ID);
		expect(body.user.email).toBe('test@example.com');
		expect(body.user.username).toBe('testuser');
	});
});

describe('users routes - PUT /me validation', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(() => {
		restore = mockSupabaseFetch();
	});

	afterEach(() => restore());

	test('PUT /me returns 400 when username is not a string', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 123 }),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('string');
	});

	test('PUT /me returns 400 when username is empty string', async () => {
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

	test('PUT /me returns 400 when username is too short', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'ab' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('PUT /me returns 400 when username is too long', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'a'.repeat(31) }),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('PUT /me returns 400 when username has invalid characters', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'invalid user!' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('letters');
	});

	test('PUT /me successfully updates username', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'newusername' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			message: string;
			user: { username: string };
		};
		expect(body.message).toBe('Profile updated successfully');
		expect(body.user.username).toBe('newusername');
	});

	test('PUT /me normalizes username to lowercase', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({ username: 'NewUser123' }),
			},
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { username: string };
		};
		expect(body.user.username).toBe('newuser123');
	});

	test('PUT /me returns 200 with current user when no fields to update', async () => {
		const res = await usersRoutes.request(
			`${BASE_URL}/me`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({}),
			},
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			message: string;
			user: { id: string; email: string; username: string };
		};
		expect(body.message).toBe('Profile updated successfully');
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe(TEST_USER_ID);
		expect(body.user.email).toBe('test@example.com');
	});
});
