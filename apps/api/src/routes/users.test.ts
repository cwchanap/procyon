import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test';
import { initializeDB, getDB } from '../db';
import { users as usersTable } from '../db/schema';
import { signAppJwt } from '../auth/jwt';
import usersRoutes from './users';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const BASE_URL = 'http://localhost';

let originalJwtSecret: string | undefined;
let originalNodeEnv: string | undefined;
let AUTH_HEADER: Record<string, string> = {};

beforeAll(async () => {
	originalJwtSecret = process.env.JWT_SECRET;
	originalNodeEnv = process.env.NODE_ENV;
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	process.env.NODE_ENV = 'test';
	const token = await signAppJwt({
		sub: TEST_USER_ID,
		email: 'test@example.com',
		username: 'testuser',
	});
	AUTH_HEADER = { Authorization: `Bearer ${token}` };
});

afterAll(() => {
	if (originalJwtSecret !== undefined) {
		process.env.JWT_SECRET = originalJwtSecret;
	} else {
		delete process.env.JWT_SECRET;
	}
	if (originalNodeEnv !== undefined) {
		process.env.NODE_ENV = originalNodeEnv;
	} else {
		delete process.env.NODE_ENV;
	}
});

async function seedUser(opts: { seedConflict?: boolean } = {}): Promise<void> {
	initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	const db = getDB();
	const now = new Date();
	await db.insert(usersTable).values({
		id: TEST_USER_ID,
		googleSub: 'google-sub-1',
		email: 'test@example.com',
		username: 'testuser',
		name: 'Test User',
		createdAt: now,
		updatedAt: now,
	});
	if (opts.seedConflict) {
		await db.insert(usersTable).values({
			id: 'other-user',
			googleSub: 'google-sub-2',
			email: 'other@example.com',
			username: 'othertaken',
			createdAt: now,
			updatedAt: now,
		});
	}
}

describe('users routes - auth guards', () => {
	beforeEach(() => seedUser());

	test('GET /me returns 401 without token', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`);
		expect(res.status).toBe(401);
	});

	test('PUT /me returns 401 without token', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: 'newname' }),
		});
		expect(res.status).toBe(401);
	});
});

describe('users routes - GET /me', () => {
	beforeEach(() => seedUser());

	test('GET /me returns user profile for authenticated user', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: {
				id: string;
				email: string;
				username: string;
				name: string | null;
				createdAt: string;
			};
		};
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe(TEST_USER_ID);
		expect(body.user.email).toBe('test@example.com');
		expect(body.user.username).toBe('testuser');
		expect(body.user.name).toBe('Test User');
		expect(typeof body.user.createdAt).toBe('string');
	});

	test('GET /me returns 404 for unknown user', async () => {
		const token = await signAppJwt({
			sub: 'nonexistent-user-id',
			email: 'noone@example.com',
			username: 'ghost',
		});
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(404);
	});
});

describe('users routes - PUT /me validation', () => {
	beforeEach(() => seedUser());

	test('PUT /me returns 400 when username is not a string', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: 123 }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('string');
	});

	test('PUT /me returns 400 when username is empty string', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: '   ' }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('empty');
	});

	test('PUT /me returns 400 when username is too short', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: 'ab' }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('PUT /me returns 400 when username is too long', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: 'a'.repeat(31) }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('between');
	});

	test('PUT /me returns 400 when username has invalid characters', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: 'invalid user!' }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('letters');
	});

	test('PUT /me successfully updates username', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
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

	test('PUT /me normalizes username to lowercase', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({ username: 'NewUser123' }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { username: string };
		};
		expect(body.user.username).toBe('newuser123');
	});

	test('PUT /me returns 200 with current user when no fields to update', async () => {
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
			body: JSON.stringify({}),
		});
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

	test('PUT /me returns 409 on unique constraint conflict', async () => {
		await seedUser({ seedConflict: true });
		const res = await usersRoutes.request(`${BASE_URL}/me`, {
			method: 'PUT',
			headers: {
				'content-type': 'application/json',
				...AUTH_HEADER,
			},
			body: JSON.stringify({ username: 'othertaken' }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('already taken');
	});
});
