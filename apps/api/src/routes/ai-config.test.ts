import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test';
import { initializeDB } from '../db';
import { aiConfigurations } from '../db/schema';
import { sql } from 'drizzle-orm';
import aiConfigRoutes from './ai-config';
import { signAppJwt } from '../auth/jwt';

const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'user-uuid-1';

let AUTH_HEADER: Record<string, string> = {};
let originalJwtSecret: string | undefined;

beforeAll(async () => {
	originalJwtSecret = process.env.JWT_SECRET;
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
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
});

describe('ai-config routes - auth guards (no token)', () => {
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
});

describe('ai-config routes - success path with API key masking', () => {
	beforeEach(async () => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		const db = (await import('../db')).getDB();

		await db
			.delete(aiConfigurations)
			.where(sql`${aiConfigurations.userId} = 'user-uuid-1'`);
	});

	test('POST / creates config and GET / returns masked API key', async () => {
		const originalKey = 'test-key-1234';
		const maskedKey = '***' + originalKey.slice(-4);

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
