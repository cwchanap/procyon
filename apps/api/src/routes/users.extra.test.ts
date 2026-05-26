import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Hono } from 'hono';
import usersRoutes from './users';
import { users as usersTable } from '../db/schema';
import { signAppJwt } from '../auth/jwt';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

let originalJwtSecret: string | undefined;
let originalSupabaseUrl: string | undefined;
let originalSupabaseAnonKey: string | undefined;
let originalSupabaseServiceRoleKey: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
	originalJwtSecret = process.env.JWT_SECRET;
	originalSupabaseUrl = process.env.SUPABASE_URL;
	originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
	originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	process.env.SUPABASE_URL = SUPABASE_URL;
	process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
	process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
});

afterAll(() => {
	if (originalJwtSecret !== undefined)
		process.env.JWT_SECRET = originalJwtSecret;
	else delete process.env.JWT_SECRET;
	if (originalSupabaseUrl !== undefined)
		process.env.SUPABASE_URL = originalSupabaseUrl;
	else delete process.env.SUPABASE_URL;
	if (originalSupabaseAnonKey !== undefined)
		process.env.SUPABASE_ANON_KEY = originalSupabaseAnonKey;
	else delete process.env.SUPABASE_ANON_KEY;
	if (originalSupabaseServiceRoleKey !== undefined)
		process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
	else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (originalFetch) globalThis.fetch = originalFetch;
});

function makeDb(opts: { seedConflict?: boolean } = {}) {
	const sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE users (
			id text PRIMARY KEY NOT NULL,
			google_sub text NOT NULL UNIQUE,
			email text NOT NULL UNIQUE,
			username text NOT NULL UNIQUE,
			name text,
			picture text,
			created_at integer NOT NULL,
			updated_at integer NOT NULL
		);
	`);
	const db = drizzle(sqlite, { schema: { users: usersTable } });
	const now = new Date();
	db.insert(usersTable)
		.values({
			id: TEST_USER_ID,
			googleSub: 'google-sub-1',
			email: 'test@example.com',
			username: 'testuser',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	if (opts.seedConflict) {
		db.insert(usersTable)
			.values({
				id: 'other-user',
				googleSub: 'google-sub-2',
				email: 'other@example.com',
				username: 'othertaken',
				createdAt: now,
				updatedAt: now,
			})
			.run();
	}
	return db;
}

function mockSupabaseFetch() {
	originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();

		if (url.includes(`/auth/v1/admin/users/${TEST_USER_ID}`)) {
			const method =
				input instanceof Request ? input.method : (init?.method ?? 'GET');
			if (method === 'PUT') {
				return new Response(
					JSON.stringify({
						code: '23505',
						message:
							'duplicate key value violates unique constraint "auth_users_username_unique"',
						details: 'Key (username)=(othertaken) already exists.',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({
					user: {
						id: TEST_USER_ID,
						email: 'test@example.com',
						user_metadata: { username: 'testuser' },
						created_at: '2024-01-01T00:00:00Z',
						updated_at: '2024-01-01T00:00:00Z',
					},
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;
}

function mountApp(db: ReturnType<typeof makeDb>) {
	const app = new Hono();
	app.use('*', async (c, next) => {
		c.set('db', db);
		await next();
	});
	app.route('/', usersRoutes);
	return app;
}

describe('users routes - PUT /me error paths', () => {
	test('returns 409 on unique constraint conflict', async () => {
		mockSupabaseFetch();
		const db = makeDb({ seedConflict: true });
		const app = mountApp(db);
		const token = await signAppJwt({
			sub: TEST_USER_ID,
			email: 'test@example.com',
			username: 'testuser',
		});
		const res = await app.request('/me', {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ username: 'othertaken' }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('already taken');
	});
});
