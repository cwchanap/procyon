import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { initializeDB } from '../db';
import { signAppJwt } from '../auth/jwt';
import playHistoryRoutes from './play-history';

const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'user-uuid-1';

let authHeader: Record<string, string> = {};

beforeAll(async () => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	const token = await signAppJwt({
		sub: TEST_USER_ID,
		email: 'test@example.com',
		username: 'testuser',
	});
	authHeader = { Authorization: `Bearer ${token}` };
});

describe('play-history routes - auth guards', () => {
	test('GET / returns 401 without token', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`);
		expect(res.status).toBe(401);
	});

	test('POST / returns 401 without token', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(401);
	});
});

describe('play-history routes - validation', () => {
	beforeEach(() => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	test('POST / returns 400 when no opponent specified', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 when both opponentUserId and opponentLlmId are provided', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentUserId: '00000000-0000-4000-8000-000000000002',
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid chessId', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'invalid-game',
				status: 'win',
				date: new Date().toISOString(),
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid status', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'invalid-status',
				date: new Date().toISOString(),
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid date format', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: 'not-a-date',
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid opponentUserId format', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentUserId: 'not-a-uuid-or-numeric',
			}),
		});
		expect(res.status).toBe(400);
	});

	test('POST / returns 403 for PvP match submission (UUID opponent)', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentUserId: '00000000-0000-4000-8000-000000000002',
			}),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('PvP');
	});

	test('POST / returns 400 for invalid opponentLlmId', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentLlmId: 'unknown-llm',
			}),
		});
		expect(res.status).toBe(400);
	});
});

describe('play-history routes - GET and POST success', () => {
	beforeEach(() => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	test('GET / returns empty play history for new user', async () => {
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { playHistory: unknown[] };
		expect(body).toHaveProperty('playHistory');
		expect(Array.isArray(body.playHistory)).toBe(true);
		expect(body.playHistory).toHaveLength(0);
	});

	test('POST / creates play history record for PvAI match', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date,
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			message: string;
			playHistory: { userId: string; chessId: string; status: string };
			ratingUpdate: {
				oldRating: number;
				newRating: number;
				ratingChange: number;
			};
		};
		expect(body.message).toBe('Play history saved');
		expect(body.playHistory.userId).toBe(TEST_USER_ID);
		expect(body.playHistory.chessId).toBe('chess');
		expect(body.playHistory.status).toBe('win');
		expect(body.ratingUpdate).toBeDefined();
		expect(typeof body.ratingUpdate.ratingChange).toBe('number');
	});

	test('POST / win increases rating', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date,
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			ratingUpdate: { ratingChange: number };
		};
		expect(body.ratingUpdate.ratingChange).toBeGreaterThan(0);
	});

	test('POST / loss decreases rating', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'chess',
				status: 'loss',
				date,
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			ratingUpdate: { ratingChange: number };
		};
		expect(body.ratingUpdate.ratingChange).toBeLessThan(0);
	});

	test('POST / creates record and GET / returns it', async () => {
		const date = new Date().toISOString();
		await playHistoryRoutes.request(`${BASE_URL}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeader },
			body: JSON.stringify({
				chessId: 'shogi',
				status: 'draw',
				date,
				opponentLlmId: 'gemini-2.5-flash',
			}),
		});

		const getRes = await playHistoryRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as {
			playHistory: Array<{ chessId: string; status: string }>;
		};
		expect(body.playHistory).toHaveLength(1);
		expect(body.playHistory[0]?.chessId).toBe('shogi');
		expect(body.playHistory[0]?.status).toBe('draw');
	});
});
