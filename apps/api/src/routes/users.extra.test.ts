import { describe, test, expect, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Hono } from 'hono';
import usersRoutes from './users';
import { users as usersTable } from '../db/schema';
import { signAppJwt } from '../auth/jwt';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

beforeAll(() => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
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
