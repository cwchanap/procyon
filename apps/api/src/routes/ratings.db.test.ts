import { describe, test, expect, beforeAll, beforeEach } from 'bun:test';
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
import { updatePlayerRating, RATING_CONFIG } from '../services/rating-service';
import { signAppJwt } from '../auth/jwt';
import ratingsRoutes from './ratings';

const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'ratings-test-user';

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
	beforeEach(async () => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
	});

	test('GET / returns empty ratings list for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
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

		const res = await ratingsRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
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

		const res = await ratingsRoutes.request(`${BASE_URL}/`, {
			headers: authHeader,
		});
		const body = (await res.json()) as { ratings: unknown[] };
		expect(body.ratings).toHaveLength(3);
	});
});

describe('ratings routes - GET /history/:variant', () => {
	beforeEach(async () => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
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

		const res = await ratingsRoutes.request(`${BASE_URL}/history/chess`, {
			headers: authHeader,
		});
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

		const res = await ratingsRoutes.request(`${BASE_URL}/history/shogi`, {
			headers: authHeader,
		});
		const body = (await res.json()) as {
			history: Array<{ variantId: string }>;
		};
		expect(body.history).toHaveLength(1);
		expect(body.history[0]!.variantId).toBe(ChessVariantId.Shogi);
	});

	test('GET /history/invalid-variant returns 400', async () => {
		const res = await ratingsRoutes.request(
			`${BASE_URL}/history/invalid-game`,
			{
				headers: authHeader,
			}
		);
		expect(res.status).toBe(400);
	});
});

describe('ratings routes - GET /:variant', () => {
	beforeEach(async () => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		await cleanDB();
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

		const res = await ratingsRoutes.request(`${BASE_URL}/chess`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rating: {
				rating: number;
				variantId: string;
				tier: { tier: string; color: string };
			};
		};
		expect(body.rating.variantId).toBe(ChessVariantId.Chess);
		expect(body.rating.rating).toBeGreaterThan(
			RATING_CONFIG.defaultPlayerRating
		);
		expect(body.rating.tier).toBeDefined();
		expect(typeof body.rating.tier.tier).toBe('string');
		expect(typeof body.rating.tier.color).toBe('string');
	});

	test('GET /xiangqi returns default rating for new user', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/xiangqi`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rating: { rating: number } };
		expect(body.rating.rating).toBe(RATING_CONFIG.defaultPlayerRating);
	});

	test('GET /invalid-variant returns 400', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/invalid`, {
			headers: authHeader,
		});
		expect(res.status).toBe(400);
	});

	test('GET /jungle returns rating with tier info', async () => {
		const res = await ratingsRoutes.request(`${BASE_URL}/jungle`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rating: { tier: unknown } };
		expect(body.rating.tier).toBeDefined();
	});
});
