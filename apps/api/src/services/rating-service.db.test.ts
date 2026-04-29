import { describe, test, expect, beforeEach } from 'bun:test';
import { initializeDB, getDB } from '../db';
import {
	playerRatings,
	ratingHistory,
	aiOpponentRatings,
	playHistory,
} from '../db/schema';
import { sql } from 'drizzle-orm';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';
import {
	getOrCreatePlayerRating,
	getAiOpponentRating,
	updatePlayerRating,
	updatePvpRatingsOnly,
	updatePvpRatings,
	updatePvpRatingsOnlyInTx,
	getPlayerRatings,
	getRatingHistoryForUser,
	RATING_CONFIG,
} from './rating-service';

function setupDB() {
	initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
}

async function cleanDB() {
	const db = getDB();
	await db.delete(ratingHistory).where(sql`1=1`);
	await db.delete(playerRatings).where(sql`1=1`);
	await db.delete(aiOpponentRatings).where(sql`1=1`);
	await db.delete(playHistory).where(sql`1=1`);
}

async function insertPlayHistory(
	userId: string,
	variantId: ChessVariantId,
	status: GameResultStatus,
	opponentLlmId?: OpponentLlmId
): Promise<number> {
	const db = getDB();
	const [record] = await db
		.insert(playHistory)
		.values({
			userId,
			chessId: variantId,
			date: new Date().toISOString(),
			status,
			opponentLlmId: opponentLlmId ?? null,
		})
		.returning();
	if (!record) throw new Error('Failed to insert play history');
	return record.id;
}

describe('rating-service - getOrCreatePlayerRating', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('creates a new rating entry for a new user+variant', async () => {
		const rating = await getOrCreatePlayerRating(
			'user-1',
			ChessVariantId.Chess
		);
		expect(rating.userId).toBe('user-1');
		expect(rating.variantId).toBe(ChessVariantId.Chess);
		expect(rating.rating).toBe(RATING_CONFIG.defaultPlayerRating);
		expect(rating.gamesPlayed).toBe(0);
		expect(rating.wins).toBe(0);
		expect(rating.losses).toBe(0);
		expect(rating.draws).toBe(0);
	});

	test('returns existing rating for same user+variant', async () => {
		const first = await getOrCreatePlayerRating('user-2', ChessVariantId.Chess);
		const second = await getOrCreatePlayerRating(
			'user-2',
			ChessVariantId.Chess
		);
		expect(second.id).toBe(first.id);
		expect(second.rating).toBe(first.rating);
	});

	test('creates separate ratings per variant', async () => {
		const chess = await getOrCreatePlayerRating('user-3', ChessVariantId.Chess);
		const shogi = await getOrCreatePlayerRating('user-3', ChessVariantId.Shogi);
		expect(chess.id).not.toBe(shogi.id);
		expect(chess.variantId).toBe(ChessVariantId.Chess);
		expect(shogi.variantId).toBe(ChessVariantId.Shogi);
	});

	test('creates separate ratings per user', async () => {
		const u1 = await getOrCreatePlayerRating('user-a', ChessVariantId.Chess);
		const u2 = await getOrCreatePlayerRating('user-b', ChessVariantId.Chess);
		expect(u1.id).not.toBe(u2.id);
	});

	test('creates rating for all supported variants', async () => {
		const variants = [
			ChessVariantId.Chess,
			ChessVariantId.Xiangqi,
			ChessVariantId.Shogi,
			ChessVariantId.Jungle,
		];
		for (const variant of variants) {
			const rating = await getOrCreatePlayerRating('user-multi', variant);
			expect(rating.variantId).toBe(variant);
			expect(rating.rating).toBe(RATING_CONFIG.defaultPlayerRating);
		}
	});
});

describe('rating-service - getAiOpponentRating', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('returns configured rating from DB when available', async () => {
		const db = getDB();
		await db.insert(aiOpponentRatings).values({
			opponentLlmId: OpponentLlmId.Gemini25Flash,
			variantId: ChessVariantId.Chess,
			rating: 1600,
		});

		const rating = await getAiOpponentRating(
			OpponentLlmId.Gemini25Flash,
			ChessVariantId.Chess
		);
		expect(rating).toBe(1600);
	});

	test('returns default AI rating when not in DB', async () => {
		const rating = await getAiOpponentRating(
			OpponentLlmId.Gemini25Flash,
			ChessVariantId.Shogi
		);
		const expectedDefault =
			RATING_CONFIG.defaultAiRatings[OpponentLlmId.Gemini25Flash] ??
			RATING_CONFIG.defaultAiRating;
		expect(rating).toBe(expectedDefault);
	});

	test('returns per-variant ratings from DB', async () => {
		const db = getDB();
		await db.insert(aiOpponentRatings).values([
			{
				opponentLlmId: OpponentLlmId.Gemini25Flash,
				variantId: ChessVariantId.Chess,
				rating: 1500,
			},
			{
				opponentLlmId: OpponentLlmId.Gemini25Flash,
				variantId: ChessVariantId.Xiangqi,
				rating: 1700,
			},
		]);

		const chess = await getAiOpponentRating(
			OpponentLlmId.Gemini25Flash,
			ChessVariantId.Chess
		);
		const xiangqi = await getAiOpponentRating(
			OpponentLlmId.Gemini25Flash,
			ChessVariantId.Xiangqi
		);
		expect(chess).toBe(1500);
		expect(xiangqi).toBe(1700);
	});
});

describe('rating-service - updatePlayerRating', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('increases rating after a win against AI opponent', async () => {
		const userId = 'player-win';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		const before = await getOrCreatePlayerRating(userId, variantId);
		expect(before.rating).toBe(RATING_CONFIG.defaultPlayerRating);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		expect(record.ratingChange).toBeGreaterThan(0);
		expect(record.newRating).toBeGreaterThan(RATING_CONFIG.defaultPlayerRating);
		expect(record.oldRating).toBe(RATING_CONFIG.defaultPlayerRating);
		expect(record.gameResult).toBe(GameResultStatus.Win);
	});

	test('decreases rating after a loss against AI opponent', async () => {
		const userId = 'player-loss';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Loss,
			OpponentLlmId.Gemini25Flash
		);

		await getOrCreatePlayerRating(userId, variantId);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Loss,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		expect(record.ratingChange).toBeLessThan(0);
		expect(record.newRating).toBeLessThan(RATING_CONFIG.defaultPlayerRating);
	});

	test('minimal change after a draw against equal-rated AI opponent', async () => {
		const userId = 'player-draw';
		const variantId = ChessVariantId.Chess;

		const db = getDB();
		await db.insert(aiOpponentRatings).values({
			opponentLlmId: OpponentLlmId.Gemini25Flash,
			variantId,
			rating: RATING_CONFIG.defaultPlayerRating,
		});

		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Draw,
			OpponentLlmId.Gemini25Flash
		);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Draw,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		expect(Math.abs(record.ratingChange)).toBeLessThanOrEqual(1);
	});

	test('persists updated rating in playerRatings table', async () => {
		const userId = 'player-persist';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const updated = await getOrCreatePlayerRating(userId, variantId);
		expect(updated.gamesPlayed).toBe(1);
		expect(updated.wins).toBe(1);
		expect(updated.losses).toBe(0);
		expect(updated.draws).toBe(0);
	});

	test('increments losses counter after a loss', async () => {
		const userId = 'player-losses-count';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Loss,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Loss,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const updated = await getOrCreatePlayerRating(userId, variantId);
		expect(updated.losses).toBe(1);
		expect(updated.wins).toBe(0);
	});

	test('increments draws counter after a draw', async () => {
		const userId = 'player-draws-count';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Draw,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Draw,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const updated = await getOrCreatePlayerRating(userId, variantId);
		expect(updated.draws).toBe(1);
		expect(updated.wins).toBe(0);
		expect(updated.losses).toBe(0);
	});

	test('updates rating using opponentUserId for PvP', async () => {
		const userId = 'pvp-user-1';
		const opponentUserId = 'pvp-user-2';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win
		);

		await getOrCreatePlayerRating(opponentUserId, variantId);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Win,
			opponentUserId,
		});

		expect(record.newRating).toBeGreaterThan(record.oldRating);
	});

	test('throws when neither opponentLlmId nor opponentUserId is provided', async () => {
		const userId = 'player-no-opp';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win
		);

		await expect(
			updatePlayerRating({
				userId,
				variantId,
				playHistoryId,
				gameResult: GameResultStatus.Win,
			})
		).rejects.toThrow(
			'Either opponentLlmId or opponentUserId must be provided'
		);
	});

	test('stores correct opponentRating in rating history', async () => {
		const userId = 'player-opp-rating';
		const variantId = ChessVariantId.Chess;

		const db = getDB();
		await db.insert(aiOpponentRatings).values({
			opponentLlmId: OpponentLlmId.Gemini25Flash,
			variantId,
			rating: 1800,
		});

		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		expect(record.opponentRating).toBe(1800);
	});

	test('creates ratingHistory record with correct fields', async () => {
		const userId = 'player-history-fields';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		const record = await updatePlayerRating({
			userId,
			variantId,
			playHistoryId,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		expect(record.userId).toBe(userId);
		expect(record.variantId).toBe(variantId);
		expect(record.playHistoryId).toBe(playHistoryId);
		expect(typeof record.id).toBe('number');
	});
});

describe('rating-service - updatePvpRatings (with rating history)', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('creates rating history records for both players on win', async () => {
		const user1 = 'pvp-full-u1';
		const user2 = 'pvp-full-u2';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Win
		);

		const result = await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Win
		);

		expect(result.ratingHistory1).toBeDefined();
		expect(result.ratingHistory2).toBeDefined();
		expect(result.ratingHistory1.userId).toBe(user1);
		expect(result.ratingHistory2.userId).toBe(user2);
		expect(result.ratingHistory1.gameResult).toBe(GameResultStatus.Win);
		expect(result.ratingHistory2.gameResult).toBe(GameResultStatus.Loss);
	});

	test('winner gains rating and loser loses rating', async () => {
		const user1 = 'pvp-full-u3';
		const user2 = 'pvp-full-u4';
		const variantId = ChessVariantId.Shogi;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Win
		);

		const result = await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Win
		);

		expect(result.ratingHistory1.ratingChange).toBeGreaterThan(0);
		expect(result.ratingHistory2.ratingChange).toBeLessThan(0);
	});

	test('draw results in minimal rating changes', async () => {
		const user1 = 'pvp-draw-u1';
		const user2 = 'pvp-draw-u2';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Draw
		);

		const result = await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Draw
		);

		expect(result.ratingHistory1.gameResult).toBe(GameResultStatus.Draw);
		expect(result.ratingHistory2.gameResult).toBe(GameResultStatus.Draw);
		expect(Math.abs(result.ratingHistory1.ratingChange)).toBeLessThanOrEqual(1);
	});

	test('throws when user plays against themselves', async () => {
		const playHistoryId = await insertPlayHistory(
			'self',
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		await expect(
			updatePvpRatings(
				'self',
				'self',
				ChessVariantId.Chess,
				playHistoryId,
				GameResultStatus.Win
			)
		).rejects.toThrow('Cannot play against yourself');
	});

	test('throws when user1Result is not a valid GameResultStatus', async () => {
		const playHistoryId = await insertPlayHistory(
			'invalid-u1',
			ChessVariantId.Chess,
			GameResultStatus.Win
		);
		await expect(
			updatePvpRatings(
				'invalid-u1',
				'invalid-u2',
				ChessVariantId.Chess,
				playHistoryId,
				'invalid' as GameResultStatus
			)
		).rejects.toThrow('Invalid game result status');
	});

	test('is idempotent - second call with same playHistoryId is a no-op', async () => {
		const user1 = 'pvp-idem-u1';
		const user2 = 'pvp-idem-u2';
		const variantId = ChessVariantId.Chess;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Win
		);

		await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Win
		);
		const r1After = await getOrCreatePlayerRating(user1, variantId);

		// Second call with same playHistoryId should not change ratings
		await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Win
		);
		const r1AfterSecond = await getOrCreatePlayerRating(user1, variantId);

		expect(r1AfterSecond.rating).toBe(r1After.rating);
		expect(r1AfterSecond.gamesPlayed).toBe(r1After.gamesPlayed);
	});

	test('loser on loss has negative rating change', async () => {
		const user1 = 'pvp-loss-u1';
		const user2 = 'pvp-loss-u2';
		const variantId = ChessVariantId.Xiangqi;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Loss
		);

		const result = await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Loss
		);

		expect(result.ratingHistory1.ratingChange).toBeLessThan(0);
		expect(result.ratingHistory2.ratingChange).toBeGreaterThan(0);
		expect(result.ratingHistory1.gameResult).toBe(GameResultStatus.Loss);
		expect(result.ratingHistory2.gameResult).toBe(GameResultStatus.Win);
	});

	test('updates playerRatings table for both users after PvP', async () => {
		const user1 = 'pvp-persist-full-u1';
		const user2 = 'pvp-persist-full-u2';
		const variantId = ChessVariantId.Jungle;
		const playHistoryId = await insertPlayHistory(
			user1,
			variantId,
			GameResultStatus.Win
		);

		await updatePvpRatings(
			user1,
			user2,
			variantId,
			playHistoryId,
			GameResultStatus.Win
		);

		const r1 = await getOrCreatePlayerRating(user1, variantId);
		const r2 = await getOrCreatePlayerRating(user2, variantId);

		expect(r1.gamesPlayed).toBe(1);
		expect(r1.wins).toBe(1);
		expect(r2.gamesPlayed).toBe(1);
		expect(r2.losses).toBe(1);
	});
});

describe('rating-service - updatePvpRatingsOnly', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('updates both players after a win', async () => {
		const user1 = 'pvp-only-u1';
		const user2 = 'pvp-only-u2';
		const variantId = ChessVariantId.Chess;

		const result = await updatePvpRatingsOnly(
			user1,
			user2,
			variantId,
			GameResultStatus.Win
		);

		expect(result.ratingChange1).toBeGreaterThan(0);
		expect(result.ratingChange2).toBeLessThan(0);
		expect(result.rating1).toBeGreaterThan(RATING_CONFIG.defaultPlayerRating);
		expect(result.rating2).toBeLessThan(RATING_CONFIG.defaultPlayerRating);
	});

	test('updates both players after a loss', async () => {
		const user1 = 'pvp-only-u3';
		const user2 = 'pvp-only-u4';
		const variantId = ChessVariantId.Chess;

		const result = await updatePvpRatingsOnly(
			user1,
			user2,
			variantId,
			GameResultStatus.Loss
		);

		expect(result.ratingChange1).toBeLessThan(0);
		expect(result.ratingChange2).toBeGreaterThan(0);
	});

	test('draw results in minimal changes for equal players', async () => {
		const user1 = 'pvp-only-u5';
		const user2 = 'pvp-only-u6';
		const variantId = ChessVariantId.Chess;

		const result = await updatePvpRatingsOnly(
			user1,
			user2,
			variantId,
			GameResultStatus.Draw
		);

		expect(Math.abs(result.ratingChange1)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.ratingChange2)).toBeLessThanOrEqual(1);
	});

	test('throws when user plays against themselves', async () => {
		await expect(
			updatePvpRatingsOnly(
				'same-user',
				'same-user',
				ChessVariantId.Chess,
				GameResultStatus.Win
			)
		).rejects.toThrow('Cannot play against yourself');
	});

	test('throws when user1Result is not a valid GameResultStatus', async () => {
		await expect(
			updatePvpRatingsOnly(
				'u-a',
				'u-b',
				ChessVariantId.Chess,
				'invalid' as GameResultStatus
			)
		).rejects.toThrow('Invalid game result status');
	});

	test('persists updated ratings to DB after PvP win', async () => {
		const user1 = 'pvp-persist-u1';
		const user2 = 'pvp-persist-u2';
		const variantId = ChessVariantId.Xiangqi;

		await updatePvpRatingsOnly(user1, user2, variantId, GameResultStatus.Win);

		const r1 = await getOrCreatePlayerRating(user1, variantId);
		const r2 = await getOrCreatePlayerRating(user2, variantId);

		expect(r1.gamesPlayed).toBe(1);
		expect(r1.wins).toBe(1);
		expect(r2.gamesPlayed).toBe(1);
		expect(r2.losses).toBe(1);
	});
});

describe('rating-service - getPlayerRatings', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('returns empty array for user with no ratings', async () => {
		const ratings = await getPlayerRatings('unknown-user');
		expect(ratings).toHaveLength(0);
	});

	test('returns all ratings for a user with tier info', async () => {
		const userId = 'multi-variant-user';
		await getOrCreatePlayerRating(userId, ChessVariantId.Chess);
		await getOrCreatePlayerRating(userId, ChessVariantId.Shogi);

		const ratings = await getPlayerRatings(userId);
		expect(ratings).toHaveLength(2);
		for (const r of ratings) {
			expect(r.tier).toBeDefined();
			expect(typeof r.tier.tier).toBe('string');
			expect(typeof r.tier.color).toBe('string');
		}
	});

	test('only returns ratings for the requested user', async () => {
		const userId = 'my-user';
		const otherId = 'other-user';
		await getOrCreatePlayerRating(userId, ChessVariantId.Chess);
		await getOrCreatePlayerRating(otherId, ChessVariantId.Chess);

		const ratings = await getPlayerRatings(userId);
		expect(ratings.every(r => r.userId === userId)).toBe(true);
	});

	test('returns correct tier for default rating (Beginner or Intermediate)', async () => {
		const userId = 'tier-check-user';
		await getOrCreatePlayerRating(userId, ChessVariantId.Chess);

		const ratings = await getPlayerRatings(userId);
		expect(ratings).toHaveLength(1);
		expect(ratings[0]!.tier).toBeDefined();
	});
});

describe('rating-service - getRatingHistoryForUser', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('returns empty array for user with no history', async () => {
		const history = await getRatingHistoryForUser('no-history-user');
		expect(history).toHaveLength(0);
	});

	test('returns all history without variant filter', async () => {
		const userId = 'history-user-all';
		const ph1 = await insertPlayHistory(
			userId,
			ChessVariantId.Chess,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);
		const ph2 = await insertPlayHistory(
			userId,
			ChessVariantId.Shogi,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph1,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});
		await updatePlayerRating({
			userId,
			variantId: ChessVariantId.Shogi,
			playHistoryId: ph2,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const history = await getRatingHistoryForUser(userId);
		expect(history).toHaveLength(2);
	});

	test('filters history by variant when variantId provided', async () => {
		const userId = 'history-user-filtered';
		const ph1 = await insertPlayHistory(
			userId,
			ChessVariantId.Chess,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);
		const ph2 = await insertPlayHistory(
			userId,
			ChessVariantId.Shogi,
			GameResultStatus.Loss,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId: ChessVariantId.Chess,
			playHistoryId: ph1,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});
		await updatePlayerRating({
			userId,
			variantId: ChessVariantId.Shogi,
			playHistoryId: ph2,
			gameResult: GameResultStatus.Loss,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const chessHistory = await getRatingHistoryForUser(
			userId,
			ChessVariantId.Chess
		);
		expect(chessHistory).toHaveLength(1);
		expect(chessHistory[0]!.variantId).toBe(ChessVariantId.Chess);
	});

	test('history records contain correct fields', async () => {
		const userId = 'history-fields-user';
		const variantId = ChessVariantId.Chess;
		const ph = await insertPlayHistory(
			userId,
			variantId,
			GameResultStatus.Win,
			OpponentLlmId.Gemini25Flash
		);

		await updatePlayerRating({
			userId,
			variantId,
			playHistoryId: ph,
			gameResult: GameResultStatus.Win,
			opponentLlmId: OpponentLlmId.Gemini25Flash,
		});

		const history = await getRatingHistoryForUser(userId, variantId);
		expect(history).toHaveLength(1);
		const record = history[0]!;
		expect(record.userId).toBe(userId);
		expect(record.variantId).toBe(variantId);
		expect(record.playHistoryId).toBe(ph);
		expect(typeof record.oldRating).toBe('number');
		expect(typeof record.newRating).toBe('number');
		expect(typeof record.ratingChange).toBe('number');
		expect(typeof record.opponentRating).toBe('number');
		expect(record.gameResult).toBe(GameResultStatus.Win);
	});
});

describe('rating-service - updatePvpRatingsOnlyInTx (in-transaction variant)', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('updates both player ratings inside a transaction on win', async () => {
		const user1 = 'tx-u1';
		const user2 = 'tx-u2';
		const variantId = ChessVariantId.Chess;
		const db = getDB();

		const result = await db.transaction(async tx => {
			return updatePvpRatingsOnlyInTx(
				tx,
				user1,
				user2,
				variantId,
				GameResultStatus.Win
			);
		});

		expect(result.ratingChange1).toBeGreaterThan(0);
		expect(result.ratingChange2).toBeLessThan(0);
		expect(result.rating1).toBeGreaterThan(RATING_CONFIG.defaultPlayerRating);
		expect(result.rating2).toBeLessThan(RATING_CONFIG.defaultPlayerRating);
	});

	test('updates both player ratings on loss', async () => {
		const user1 = 'tx-u3';
		const user2 = 'tx-u4';
		const variantId = ChessVariantId.Shogi;
		const db = getDB();

		const result = await db.transaction(async tx => {
			return updatePvpRatingsOnlyInTx(
				tx,
				user1,
				user2,
				variantId,
				GameResultStatus.Loss
			);
		});

		expect(result.ratingChange1).toBeLessThan(0);
		expect(result.ratingChange2).toBeGreaterThan(0);
	});

	test('draw results in minimal changes inside a transaction', async () => {
		const user1 = 'tx-draw-u1';
		const user2 = 'tx-draw-u2';
		const variantId = ChessVariantId.Chess;
		const db = getDB();

		const result = await db.transaction(async tx => {
			return updatePvpRatingsOnlyInTx(
				tx,
				user1,
				user2,
				variantId,
				GameResultStatus.Draw
			);
		});

		expect(Math.abs(result.ratingChange1)).toBeLessThanOrEqual(1);
		expect(Math.abs(result.ratingChange2)).toBeLessThanOrEqual(1);
	});

	test('throws when userId1 === userId2 inside transaction', async () => {
		const db = getDB();
		await expect(
			db.transaction(async tx => {
				return updatePvpRatingsOnlyInTx(
					tx,
					'same',
					'same',
					ChessVariantId.Chess,
					GameResultStatus.Win
				);
			})
		).rejects.toThrow('Cannot play against yourself');
	});

	test('throws when user1Result is invalid inside transaction', async () => {
		const db = getDB();
		await expect(
			db.transaction(async tx => {
				return updatePvpRatingsOnlyInTx(
					tx,
					'tx-u1',
					'tx-u2',
					ChessVariantId.Chess,
					'invalid' as GameResultStatus
				);
			})
		).rejects.toThrow('Invalid game result status');
	});

	test('persists ratings to DB after transaction commits', async () => {
		const user1 = 'tx-persist-u1';
		const user2 = 'tx-persist-u2';
		const variantId = ChessVariantId.Jungle;
		const db = getDB();

		await db.transaction(async tx => {
			return updatePvpRatingsOnlyInTx(
				tx,
				user1,
				user2,
				variantId,
				GameResultStatus.Win
			);
		});

		const r1 = await getOrCreatePlayerRating(user1, variantId);
		const r2 = await getOrCreatePlayerRating(user2, variantId);
		expect(r1.wins).toBe(1);
		expect(r2.losses).toBe(1);
	});
});

describe('rating-service - getOrCreatePlayerRating unique constraint race condition', () => {
	beforeEach(async () => {
		setupDB();
		await cleanDB();
	});

	test('handles concurrent creation by returning existing record (unique constraint retry)', async () => {
		const userId = 'race-user';
		const variantId = ChessVariantId.Chess;

		// Simulate race condition: create the record first, then try to create again
		const first = await getOrCreatePlayerRating(userId, variantId);

		// Try inserting manually to trigger the unique constraint
		const db = getDB();
		try {
			await db.insert(playerRatings).values({
				userId,
				variantId,
				rating: 1200,
				gamesPlayed: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				peakRating: 1200,
			});
		} catch {
			// Expected: unique constraint violation
		}

		// getOrCreatePlayerRating should still return the existing record
		const second = await getOrCreatePlayerRating(userId, variantId);
		expect(second.id).toBe(first.id);
	});
});
