import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { initializeDB } from '../db';
import { aiConfigurations } from '../db/schema';
import { sql } from 'drizzle-orm';
import { signAppJwt } from '../auth/jwt';
import aiConfigRoutes from './ai-config';

const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'user-uuid-1';
const TEST_USER_ID_2 = 'user-uuid-2';

let authHeader: Record<string, string> = {};
let authHeaderUser2: Record<string, string> = {};

beforeAll(async () => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	const token = await signAppJwt({
		sub: TEST_USER_ID,
		email: 'test@example.com',
		username: 'testuser',
	});
	authHeader = { Authorization: `Bearer ${token}` };

	const token2 = await signAppJwt({
		sub: TEST_USER_ID_2,
		email: 'test2@example.com',
		username: 'testuser2',
	});
	authHeaderUser2 = { Authorization: `Bearer ${token2}` };
});

describe('ai-config routes - full CRUD operations', () => {
	beforeEach(async () => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		const { getDB } = await import('../db');
		await getDB()
			.delete(aiConfigurations)
			.where(sql`1=1`);
	});

	test('POST / creates a new config (no existing record)', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openai',
				modelName: 'gpt-4o',
				apiKey: 'test-key-5678',
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			message: string;
			configuration: {
				id: number;
				provider: string;
				modelName: string;
				isActive: boolean;
			};
		};
		expect(body.message).toContain('saved');
		expect(body.configuration.provider).toBe('openai');
		expect(body.configuration.modelName).toBe('gpt-4o');
		expect(typeof body.configuration.id).toBe('number');
	});

	test('POST / updates existing config (same provider+model)', async () => {
		// Create initial config
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'old-key',
			}),
		});

		// Update with new API key
		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'new-key',
			}),
		});
		expect(res.status).toBe(200);

		// Verify only one config exists (update, not duplicate)
		const listRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		const listBody = (await listRes.json()) as { configurations: unknown[] };
		expect(listBody.configurations).toHaveLength(1);
	});

	test('POST / with isActive=true deactivates other configs', async () => {
		// Create first config as active
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'key1',
				isActive: true,
			}),
		});

		// Create second config as active
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openai',
				modelName: 'gpt-4o',
				apiKey: 'key2',
				isActive: true,
			}),
		});

		// List configs and verify only one is active
		const listRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		const listBody = (await listRes.json()) as {
			configurations: Array<{ provider: string; isActive: boolean }>;
		};
		expect(listBody.configurations).toHaveLength(2);
		const activeConfigs = listBody.configurations.filter(c => c.isActive);
		expect(activeConfigs).toHaveLength(1);
		expect(activeConfigs[0]!.provider).toBe('openai');
	});

	test('GET /:id/full returns full config including API key', async () => {
		const createRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openrouter',
				modelName: 'llama-3',
				apiKey: 'or-test-key-9999',
			}),
		});
		const createBody = (await createRes.json()) as {
			configuration: { id: number };
		};
		const configId = createBody.configuration.id;

		const fullRes = await aiConfigRoutes.request(
			`${BASE_URL}/${configId}/full`,
			{
				headers: authHeader,
			}
		);
		expect(fullRes.status).toBe(200);
		const fullBody = (await fullRes.json()) as {
			id: number;
			provider: string;
			modelName: string;
			apiKey: string;
			isActive: boolean;
		};
		expect(fullBody.apiKey).toBe('or-test-key-9999');
		expect(fullBody.provider).toBe('openrouter');
		expect(fullBody.modelName).toBe('llama-3');
	});

	test('GET /:id/full returns 404 for non-existent config', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/99999/full`, {
			headers: authHeader,
		});
		expect(res.status).toBe(404);
	});

	test('GET /:id/full returns 400 for non-numeric id', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/not-a-number/full`, {
			headers: authHeader,
		});
		expect(res.status).toBe(400);
	});

	test('DELETE /:id removes the config', async () => {
		const createRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'chutes',
				modelName: 'deepseek-r1',
				apiKey: 'ch-key',
			}),
		});
		const createBody = (await createRes.json()) as {
			configuration: { id: number };
		};
		const configId = createBody.configuration.id;

		const deleteRes = await aiConfigRoutes.request(`${BASE_URL}/${configId}`, {
			method: 'DELETE',
			headers: authHeader,
		});
		expect(deleteRes.status).toBe(200);
		const deleteBody = (await deleteRes.json()) as { message: string };
		expect(deleteBody.message).toContain('deleted');

		// Verify config is gone
		const listRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		const listBody = (await listRes.json()) as { configurations: unknown[] };
		expect(listBody.configurations).toHaveLength(0);
	});

	test('DELETE /:id returns 404 for non-existent config', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/99999`, {
			method: 'DELETE',
			headers: authHeader,
		});
		expect(res.status).toBe(404);
	});

	test('DELETE /:id returns 400 for non-numeric id', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/abc`, {
			method: 'DELETE',
			headers: authHeader,
		});
		expect(res.status).toBe(400);
	});

	test('POST /set-active activates specified config', async () => {
		// Create two configs
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'key1',
				isActive: false,
			}),
		});
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openai',
				modelName: 'gpt-4o',
				apiKey: 'key2',
				isActive: false,
			}),
		});

		// Set gemini as active
		const res = await aiConfigRoutes.request(`${BASE_URL}/set-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({ provider: 'gemini', modelName: 'gemini-pro' }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			configuration: { provider: string; isActive: boolean };
		};
		expect(body.configuration.provider).toBe('gemini');
		expect(body.configuration.isActive).toBe(true);
	});

	test('POST /set-active returns 404 when config not found', async () => {
		const res = await aiConfigRoutes.request(`${BASE_URL}/set-active`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openai',
				modelName: 'nonexistent-model',
			}),
		});
		expect(res.status).toBe(404);
	});

	test('GET / returns all configs with masked API keys', async () => {
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-1',
				apiKey: 'gemini-key-abcd',
			}),
		});
		await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'openai',
				modelName: 'gpt-4o',
				apiKey: 'openai-key-efgh',
			}),
		});

		const res = await aiConfigRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			configurations: Array<{ apiKey: string; hasApiKey: boolean }>;
		};
		expect(body.configurations).toHaveLength(2);
		// Masking format: "***" + last 4 chars of apiKey
		const geminiConfig = body.configurations.find(c => c.apiKey === '***abcd');
		const openaiConfig = body.configurations.find(c => c.apiKey === '***efgh');
		expect(geminiConfig).toBeDefined();
		expect(openaiConfig).toBeDefined();
		expect(geminiConfig!.hasApiKey).toBe(true);
		expect(openaiConfig!.hasApiKey).toBe(true);
	});

	test('GET /:id/full returns 404 for config belonging to different user', async () => {
		// Create a config as user-1
		const createRes = await aiConfigRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				provider: 'gemini',
				modelName: 'gemini-pro',
				apiKey: 'some-key',
			}),
		});
		const createBody = (await createRes.json()) as {
			configuration: { id: number };
		};
		const configId = createBody.configuration.id;

		// Request as user-2 — middleware passes, ownership check returns 404
		const res = await aiConfigRoutes.request(`${BASE_URL}/${configId}/full`, {
			headers: authHeaderUser2,
		});
		expect(res.status).toBe(404);
	});
});
