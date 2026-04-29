import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initializeDB, getDB } from '../db';
import {
	playerRatings,
	ratingHistory,
	playHistory,
	aiOpponentRatings,
} from '../db/schema';
import { sql } from 'drizzle-orm';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';
import { updatePlayerRating } from '../services/rating-service';
import ratingsRoutes from './ratings';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };
const TEST_USER_ID = 'ratings-test-user';

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

async function cleanDB() {
	const db = getDB();
	await db.delete(ratingHistory).where(sql`1=1`);
	await db.delete(playerRatings).where(sql`1=1`);
	await db.delete(aiOpponentRatings).where(sql`1=1`);
	await db.delete(playHistory).where(sql`1=1`);
}

async function insertPlayHistoryRecord(
	userId: string,
	variantId: ChessVariantId,
	status: GameResultStatus
): Promise<number> {
	const db = getDB();
	const [record] = await db
		.insert(playHistory)
		.values({
			userId,
			chessId: variantId,
			date: new Date().toISOString(),
			status,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		})
		.returning();
	if (!record) throw new Error('Failed to insert play history');
	return record.id;
}

describe('ratings routes - GET / returns all ratings', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(async () => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
	});

	afterEach(() => {
		restore();
	});

	test('GET / returns empty ratings list for new user', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ratings: unknown[] };
		expect(Array.isArray(body.ratings)).toBe(true);
		expect(body.ratings).toHaveLength(0);
	});

	test('GET / returns ratings with tier info after playing games', async () => {
		// Create ratings for user by making a move
		const ph = await insertPlayHistoryRecord(
			TEST_USER_ID,
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		await updatePlayerRating({
			userId: TEST_USER_ID,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const res = await ratingsRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ratings: Array<{
				variantId: string;
				rating: number;
				tier: { tier: string };
			}>;
		};
		expect(body.ratings).toHaveLength(1);
		expect(body.ratings[0]!.variantId).toBe(ChessVariantId.Chess);
		expect(body.ratings[0]!.tier).toBeDefined();
		expect(typeof body.ratings[0]!.tier.tier).toBe('string');
	});

	test('GET / returns ratings for multiple variants', async () => {
		for (const variant of [
			ChessVariantId.Chess,
			ChessVariantId.Shogi,
			ChessVariantId.Xiangqi,
		]) {
			const ph = await insertPlayHistoryRecord(
				TEST_USER_ID,
				variant,
				GameResultStatus.Win
			);
			await updatePlayerRating({
				userId: TEST_USER_ID,
				variantId: variant,
				playHistoryId: ph,
				gameResult: GameResultStatus.Win,
				opponentLlmId: OpponentLlmId.Gemini25Flash,
			});
		}

		const res = await ratingsRoutes.request(
			`${BASE_URL}/`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		const body = (await res.json()) as { ratings: unknown[] };
		expect(body.ratings).toHaveLength(3);
	});
});

describe('ratings routes - GET /history/:variant', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(async () => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
	});

	afterEach(() => {
		restore();
	});

	test('GET /history/chess returns history records after games', async () => {
		const ph = await insertPlayHistoryRecord(
			TEST_USER_ID,
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		await updatePlayerRating({
			userId: TEST_USER_ID,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/chess`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			history: Array<{
				variantId: string;
				ratingChange: number;
				gameResult: string;
			}>;
		};
		expect(body.history).toHaveLength(1);
		expect(body.history[0]!.variantId).toBe(ChessVariantId.Chess);
		expect(body.history[0]!.ratingChange).toBeGreaterThan(0);
		expect(body.history[0]!.gameResult).toBe(GameResultStatus.Win);
	});

	test('GET /history/shogi returns variant-filtered history', async () => {
		// Add chess and shogi history
		const ph1 = await insertPlayHistoryRecord(
			TEST_USER_ID,
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		const ph2 = await insertPlayHistoryRecord(
			TEST_USER_ID,
			ChessVariantId.Shogi,
			GameResultStatus.Loss
		);
		await updatePlayerRating({
			userId: TEST_USER_ID,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph1,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});
		await updatePlayerRating({
			userId: TEST_USER_ID,
			variantId: ChessVariantId.Shogi,
			playHistoryId: ph2,
			gameResult: GameResultStatus.Loss,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/shogi`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		const body = (await res.json()) as {
			history: Array<{ variantId: string }>;
		};
		expect(body.history).toHaveLength(1);
		expect(body.history[0]!.variantId).toBe(ChessVariantId.Shogi);
	});

	test('GET /history/invalid-variant returns 400', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/invalid-game`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(400);
	});
});

describe('ratings routes - GET /:variant', () => {
	let restore: FetchMockRestore = () => {};

	beforeEach(async () => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		restore = mockSupabaseFetch();
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
	});

	afterEach(() => {
		restore();
	});

	test('GET /chess returns rating with tier for existing user', async () => {
		const ph = await insertPlayHistoryRecord(
			TEST_USER_ID,
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		await updatePlayerRating({
			userId: TEST_USER_ID,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const res = await ratingsRoutes.request(
			`${BASE_URL}/chess`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: {
				rating: number;
				variantId: string;
				tier: { tier: string; color: string };
			};
		};
		expect(body.rating.variantId).toBe(ChessVariantId.Chess);
		expect(body.rating.rating).toBeGreaterThan(1200);
		expect(body.rating.tier).toBeDefined();
		expect(typeof body.rating.tier.tier).toBe('string');
		expect(typeof body.rating.tier.color).toBe('string');
	});

	test('GET /xiangqi returns 1200 default for new user', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/xiangqi`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rating: { rating: number } };
		expect(body.rating.rating).toBe(1200);
	});

	test('GET /invalid-variant returns 400', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/invalid`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(400);
	});

	test('GET /jungle returns rating with tier info', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/jungle`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rating: { tier: unknown } };
		expect(body.rating.tier).toBeDefined();
	});
});
