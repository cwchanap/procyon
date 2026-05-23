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

function makeDb() {
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
			name: 'Test User',
			picture: null,
			createdAt: now,
			updatedAt: now,
		})
		.run();
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

async function signToken(userId: string = TEST_USER_ID) {
	return signAppJwt({
		sub: userId,
		email: 'test@example.com',
		username: 'testuser',
	});
}

describe('users routes - auth guards', () => {
	test('GET /me returns 401 without token', async () => {
		const app = mountApp(makeDb());
		const res = await app.request('/me');
		expect(res.status).toBe(401);
	});

	test('PUT /me returns 401 without token', async () => {
		const app = mountApp(makeDb());
		const res = await app.request('/me', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ username: 'newname' }),
		});
		expect(res.status).toBe(401);
	});
});

describe('users routes - GET /me', () => {
	test('returns the seeded user', async () => {
		const app = mountApp(makeDb());
		const token = await signToken();
		const res = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { id: string; email: string; username: string; name: string };
		};
		expect(body.user.id).toBe(TEST_USER_ID);
		expect(body.user.email).toBe('test@example.com');
		expect(body.user.username).toBe('testuser');
		expect(body.user.name).toBe('Test User');
	});

	test('returns 404 when the user row is absent', async () => {
		const app = mountApp(makeDb());
		const token = await signAppJwt({
			sub: 'missing-user-id',
			email: 'x@example.com',
			username: 'x',
		});
		const res = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('not found');
	});
});

describe('users routes - PUT /me validation', () => {
	async function req(token: string, body: unknown) {
		return mountApp(makeDb()).request('/me', {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});
	}

	test('400 when username is not a string', async () => {
		const token = await signToken();
		const res = await req(token, { username: 123 });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('string');
	});

	test('400 when username is whitespace only', async () => {
		const token = await signToken();
		const res = await req(token, { username: '   ' });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('empty');
	});

	test('400 when username is too short', async () => {
		const token = await signToken();
		const res = await req(token, { username: 'ab' });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('400 when username is too long', async () => {
		const token = await signToken();
		const res = await req(token, { username: 'a'.repeat(31) });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('400 when username has invalid characters', async () => {
		const token = await signToken();
		const res = await req(token, { username: 'invalid user!' });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('letters');
	});
});

describe('users routes - PUT /me happy paths', () => {
	test('updates username successfully', async () => {
		const db = makeDb();
		const app = mountApp(db);
		const token = await signToken();
		const res = await app.request('/me', {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ username: 'newusername' }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			message: string;
			user: { username: string };
		};
		expect(body.message).toBe('Profile updated successfully');
		expect(body.user.username).toBe('newusername');
	});

	test('normalizes to lowercase', async () => {
		const db = makeDb();
		const app = mountApp(db);
		const token = await signToken();
		const res = await app.request('/me', {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ username: 'NewUser123' }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { username: string } };
		expect(body.user.username).toBe('newuser123');
	});

	test('returns 200 with current user when no fields to update', async () => {
		const app = mountApp(makeDb());
		const token = await signToken();
		const res = await app.request('/me', {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			message: string;
			user: { id: string; email: string; username: string };
		};
		expect(body.message).toBe('Profile updated successfully');
		expect(body.user.id).toBe(TEST_USER_ID);
		expect(body.user.email).toBe('test@example.com');
		expect(body.user.username).toBe('testuser');
	});
});
