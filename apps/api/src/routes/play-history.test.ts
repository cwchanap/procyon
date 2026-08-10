import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
	afterEach,
} from 'bun:test';
import { initializeDB, getDB } from '../db';
import { playerRatings, ratingHistory } from '../db/schema';
import { ChessVariantId } from '../constants/game';
import { and, eq } from 'drizzle-orm';
import playHistoryRoutes from './play-history';
import { signAppJwt } from '../auth/jwt';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'user-uuid-1';

const validAeroplaneDetails = {
	rulePreset: 'quick-chill',
	victoryTarget: 2,
	diceMode: 'relaxed',
	humanColor: 'red',
	durationSeconds: 240,
	planesFinished: 2,
	capturesMade: 3,
	capturesSuffered: 1,
	aiPlayers: [
		{ color: 'yellow', personality: 'cautious' },
		{ color: 'blue', personality: 'aggressive' },
		{ color: 'green', personality: 'unpredictable' },
	],
} as const;

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

// CF-style env bindings injected into every request so getSupabaseClientsFromContext
// creates fresh clients and bypasses the module-level singleton.
const CF_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY };

type FetchMockRestore = () => void;

function mockSupabaseFetch(): FetchMockRestore {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();
		if (url.includes('/auth/v1/user')) {
			const headers = new Headers(init?.headers as HeadersInit | undefined);
			const auth = headers.get('authorization') ?? headers.get('Authorization');
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
		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

describe('play-history routes - auth guards', () => {
	let restore: FetchMockRestore = () => {};
	let originalUrl: string | undefined;
	let originalAnonKey: string | undefined;

	beforeEach(() => {
		originalUrl = process.env.SUPABASE_URL;
		originalAnonKey = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = originalUrl;
		process.env.SUPABASE_ANON_KEY = originalAnonKey;
	});

	test('GET / returns 401 without token', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			undefined,
			CF_ENV
		);
		expect(res.status).toBe(401);
	});

	test('POST / returns 401 without token', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(401);
	});
});

describe('play-history routes - validation', () => {
	let restore: FetchMockRestore = () => {};
	let originalUrl: string | undefined;
	let originalAnonKey: string | undefined;

	beforeEach(() => {
		originalUrl = process.env.SUPABASE_URL;
		originalAnonKey = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = originalUrl;
		process.env.SUPABASE_ANON_KEY = originalAnonKey;
	});

	test('POST / returns 400 when no opponent specified', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 when both opponentUserId and opponentLlmId are provided', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentUserId: '00000000-0000-4000-8000-000000000002',
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid gameId', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'invalid-game',
					status: 'win',
					date: new Date().toISOString(),
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / accepts a valid Aeroplane history body', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'aeroplane',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'aeroplane-trio-v1',
					details: validAeroplaneDetails,
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(201);
	});

	test('POST / returns 400 for invalid status', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'invalid-status',
					date: new Date().toISOString(),
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid date format', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: 'not-a-date',
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / returns 400 for invalid opponentUserId format', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentUserId: 'not-a-uuid-or-numeric',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / returns 403 for PvP match submission (UUID opponent)', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentUserId: '00000000-0000-4000-8000-000000000002',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('PvP');
	});

	test('POST / returns 400 for invalid opponentLlmId', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentLlmId: 'unknown-llm',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});
});

describe('play-history routes - GET and POST success', () => {
	let restore: FetchMockRestore = () => {};
	let originalUrl: string | undefined;
	let originalAnonKey: string | undefined;

	beforeEach(() => {
		originalUrl = process.env.SUPABASE_URL;
		originalAnonKey = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = originalUrl;
		process.env.SUPABASE_ANON_KEY = originalAnonKey;
	});

	test('GET / returns empty play history for new user', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { playHistory: unknown[] };
		expect(body).toHaveProperty('playHistory');
		expect(Array.isArray(body.playHistory)).toBe(true);
		expect(body.playHistory).toHaveLength(0);
	});

	test('LLM chess remains rated after gameId rename', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date,
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			message: string;
			playHistory: { userId: string; gameId: string; status: string };
			ratingUpdate: {
				oldRating: number;
				newRating: number;
				ratingChange: number;
			} | null;
		};
		expect(body.message).toBe('Play history saved');
		expect(body.playHistory.userId).toBe(TEST_USER_ID);
		expect(body.playHistory.gameId).toBe('chess');
		expect(body.playHistory.status).toBe('win');
		expect(body.ratingUpdate).not.toBeNull();
		expect(typeof body.ratingUpdate!.ratingChange).toBe('number');
	});

	test('POST / win increases rating', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date,
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			ratingUpdate: { ratingChange: number };
		};
		expect(body.ratingUpdate.ratingChange).toBeGreaterThan(0);
	});

	test('POST / loss decreases rating', async () => {
		const date = new Date().toISOString();
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'loss',
					date,
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			ratingUpdate: { ratingChange: number };
		};
		expect(body.ratingUpdate.ratingChange).toBeLessThan(0);
	});

	test('POST / creates record and GET / returns it', async () => {
		const date = new Date().toISOString();
		await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'shogi',
					status: 'draw',
					date,
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);

		const getRes = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as {
			playHistory: Array<{ gameId: string; status: string }>;
		};
		expect(body.playHistory).toHaveLength(1);
		expect(body.playHistory[0]?.gameId).toBe('shogi');
		expect(body.playHistory[0]?.status).toBe('draw');
	});
});

describe('play-history routes - engine (unrated) games', () => {
	let restore: FetchMockRestore = () => {};
	let originalUrl: string | undefined;
	let originalAnonKey: string | undefined;

	beforeEach(() => {
		originalUrl = process.env.SUPABASE_URL;
		originalAnonKey = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = originalUrl;
		process.env.SUPABASE_ANON_KEY = originalAnonKey;
	});

	test('Stockfish remains unrated after gameId rename', async () => {
		const response = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'stockfish',
				}),
			},
			CF_ENV
		);
		expect(response.status).toBe(201);
		const body = (await response.json()) as {
			ratingUpdate: { ratingChange: number } | null;
		};
		expect(body.ratingUpdate).toBeNull();
	});

	test.each(['win', 'loss', 'draw'] as const)(
		'POST / engine game (%s) leaves rating unchanged with no rating_history',
		async status => {
			const db = getDB();

			// 1. Establish a known rating via one rated LLM game.
			await playHistoryRoutes.request(
				`${BASE_URL}/`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
					body: JSON.stringify({
						gameId: 'chess',
						status: 'win',
						date: new Date().toISOString(),
						opponentLlmId: 'gemini-2.5-flash',
					}),
				},
				CF_ENV
			);

			const [before] = await db
				.select()
				.from(playerRatings)
				.where(
					and(
						eq(playerRatings.userId, TEST_USER_ID),
						eq(playerRatings.variantId, ChessVariantId.Chess)
					)
				);
			expect(before).toBeDefined();

			// Regression guard: the rated LLM game in step 1 must produce a
			// rating_history row, so the engine game's "no new rating_history"
			// check below is meaningful (the LLM row exists, the engine row does not).
			const [llmHistory] = await db
				.select()
				.from(ratingHistory)
				.where(
					and(
						eq(ratingHistory.userId, TEST_USER_ID),
						eq(ratingHistory.variantId, ChessVariantId.Chess)
					)
				);
			expect(llmHistory).toBeDefined();

			// 2. Submit the engine game.
			const res = await playHistoryRoutes.request(
				`${BASE_URL}/`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
					body: JSON.stringify({
						gameId: 'chess',
						status,
						date: new Date().toISOString(),
						opponentEngineId: 'stockfish',
					}),
				},
				CF_ENV
			);
			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				playHistory: {
					id: number;
					opponentUserId: string | number | null;
					opponentEngineId: string | null;
					opponentLlmId: string | null;
				};
				ratingUpdate: { ratingChange: number } | null;
			};
			expect(body.ratingUpdate).toBeNull();
			expect(body.playHistory.opponentEngineId).toBe('stockfish');
			expect(body.playHistory.opponentLlmId).toBeNull();
			expect(body.playHistory.opponentUserId).toBeNull();

			// 3. Rating row is byte-for-byte unchanged.
			const [after] = await db
				.select()
				.from(playerRatings)
				.where(
					and(
						eq(playerRatings.userId, TEST_USER_ID),
						eq(playerRatings.variantId, ChessVariantId.Chess)
					)
				);
			expect(after).toBeDefined();
			expect(after).toEqual(before!);

			// 4. No rating_history row for the engine game.
			const engineHistory = await db
				.select()
				.from(ratingHistory)
				.where(
					and(
						eq(ratingHistory.userId, TEST_USER_ID),
						eq(ratingHistory.playHistoryId, body.playHistory.id)
					)
				);
			expect(engineHistory).toHaveLength(0);
		}
	);

	test('POST / rejects engine + llm combination with 400', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'stockfish',
					opponentLlmId: 'gemini-2.5-flash',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('POST / rejects engine + user combination with 400', async () => {
		const res = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'stockfish',
					opponentUserId: '00000000-0000-4000-8000-000000000002',
				}),
			},
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('GET / returns engine row with opponentEngineId and null ratingChange', async () => {
		await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'chess',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'stockfish',
				}),
			},
			CF_ENV
		);

		const getRes = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as {
			playHistory: Array<{
				opponentEngineId: string | null;
				ratingChange: number | null;
				newRating: number | null;
			}>;
		};
		expect(body.playHistory).toHaveLength(1);
		expect(body.playHistory[0]?.opponentEngineId).toBe('stockfish');
		expect(body.playHistory[0]?.ratingChange).toBeNull();
		expect(body.playHistory[0]?.newRating).toBeNull();
	});
});

describe('play-history routes - Aeroplane (unrated) games', () => {
	let restore: FetchMockRestore = () => {};
	let originalUrl: string | undefined;
	let originalAnonKey: string | undefined;

	beforeEach(() => {
		originalUrl = process.env.SUPABASE_URL;
		originalAnonKey = process.env.SUPABASE_ANON_KEY;
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(() => {
		restore();
		process.env.SUPABASE_URL = originalUrl;
		process.env.SUPABASE_ANON_KEY = originalAnonKey;
	});

	async function postAeroplane(
		overrides: Record<string, unknown> = {}
	): Promise<Response> {
		return playHistoryRoutes.request(
			`${BASE_URL}/`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
				body: JSON.stringify({
					gameId: 'aeroplane',
					status: 'win',
					date: new Date().toISOString(),
					opponentEngineId: 'aeroplane-trio-v1',
					details: validAeroplaneDetails,
					...overrides,
				}),
			},
			CF_ENV
		);
	}

	test('valid Aeroplane trio insert is unrated and creates no rating rows', async () => {
		const res = await postAeroplane();
		expect(res.status).toBe(201);

		const body = (await res.json()) as {
			ratingUpdate: unknown;
			playHistory: { details: unknown };
		};
		expect(body.ratingUpdate).toBeNull();
		expect(body.playHistory.details).toEqual(validAeroplaneDetails);

		const db = getDB();
		expect(await db.select().from(playerRatings)).toHaveLength(0);
		expect(await db.select().from(ratingHistory)).toHaveLength(0);
	});

	test.each([
		[
			'Aeroplane + LLM',
			{ opponentEngineId: undefined, opponentLlmId: 'gemini-2.5-flash' },
		],
		['Aeroplane + Stockfish', { opponentEngineId: 'stockfish' }],
	] as const)('%s is rejected', async (_label, overrides) => {
		const res = await postAeroplane(overrides);
		expect(res.status).toBe(400);
	});

	test('chess + Aeroplane trio id is rejected', async () => {
		const res = await postAeroplane({ gameId: 'chess' });
		expect(res.status).toBe(400);
	});

	test('Aeroplane draw is rejected', async () => {
		const res = await postAeroplane({ status: 'draw' });
		expect(res.status).toBe(400);
	});

	test('Aeroplane requires details', async () => {
		const res = await postAeroplane({ details: undefined });
		expect(res.status).toBe(400);
	});

	test.each([
		['negative duration', { durationSeconds: -1 }],
		['non-integer finished planes', { planesFinished: 1.5 }],
	] as const)('Aeroplane rejects %s counters', async (_label, counter) => {
		const res = await postAeroplane({
			details: { ...validAeroplaneDetails, ...counter },
		});
		expect(res.status).toBe(400);
	});

	test.each([
		['two', validAeroplaneDetails.aiPlayers.slice(0, 2)],
		[
			'four',
			[
				...validAeroplaneDetails.aiPlayers,
				{ color: 'red', personality: 'cautious' },
			],
		],
	] as const)(
		'Aeroplane rejects %s AI seat entries',
		async (_label, aiPlayers) => {
			const res = await postAeroplane({
				details: { ...validAeroplaneDetails, aiPlayers },
			});
			expect(res.status).toBe(400);
		}
	);

	test('Aeroplane rejects invalid enum values', async () => {
		const res = await postAeroplane({
			details: { ...validAeroplaneDetails, diceMode: 'loaded' },
		});
		expect(res.status).toBe(400);
	});

	test('GET / returns the exact stored Aeroplane details object', async () => {
		const postRes = await postAeroplane();
		expect(postRes.status).toBe(201);

		const getRes = await playHistoryRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as {
			playHistory: Array<{ details: unknown }>;
		};
		expect(body.playHistory).toHaveLength(1);
		expect(body.playHistory[0]?.details).toEqual(validAeroplaneDetails);
	});
});
