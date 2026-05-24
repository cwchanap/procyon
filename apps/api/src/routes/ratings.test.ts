import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
import { initializeDB } from '../db';
import { signAppJwt } from '../auth/jwt';
import ratingsRoutes from './ratings';

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

describe('ratings routes - auth guards', () => {
	test('GET / returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/`);
		expect(res.status).toBe(401);
	});

	test('GET /:variant returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`);
		expect(res.status).toBe(401);
	});

	test('GET /history/:variant returns 401 without token', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/history/chess`);
		expect(res.status).toBe(401);
	});
});

describe('ratings routes - variant validation', () => {
	beforeEach(() => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	test('GET /:variant returns 400 for invalid variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/invalid-variant`, {
			headers: authHeader,
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Invalid variant');
	});

	test('GET /history/:variant returns 400 for invalid variant', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/invalid-variant`,
			{ headers: authHeader }
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe('Invalid variant');
	});
});

describe('ratings routes - success paths', () => {
	beforeEach(() => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	test('GET / returns ratings object for authenticated user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ratings: unknown };
		expect(body).toHaveProperty('ratings');
	});

	test('GET /chess returns rating for chess variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: {
				userId: string;
				variantId: string;
				rating: number;
				tier: Record<string, unknown>;
			};
		};
		expect(body.rating).toBeDefined();
		expect(body.rating.userId).toBe(TEST_USER_ID);
		expect(body.rating.variantId).toBe('chess');
		expect(typeof body.rating.rating).toBe('number');
		expect(typeof body.rating.tier).toBe('object');
	});

	test('GET /shogi returns rating for shogi variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/shogi`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('shogi');
	});

	test('GET /xiangqi returns rating for xiangqi variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/xiangqi`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('xiangqi');
	});

	test('GET /jungle returns rating for jungle variant', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/jungle`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { variantId: string };
		};
		expect(body.rating.variantId).toBe('jungle');
	});

	test('GET /history/chess returns empty history for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/history/chess`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { history: unknown[] };
		expect(body).toHaveProperty('history');
		expect(Array.isArray(body.history)).toBe(true);
	});

	test('GET /chess returns default rating of 1200 for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/chess`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: { rating: number };
		};
		expect(body.rating.rating).toBe(1200);
	});
});
