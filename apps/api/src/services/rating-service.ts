import { eq, and, sql } from 'drizzle-orm';
import { getDB } from '../db';
import {
	playerRatings,
	ratingHistory,
	aiOpponentRatings,
	type PlayerRating,
	type RatingHistory,
} from '../db/schema';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';

// =============================================================================
// RATING SYSTEM CONFIGURATION
// =============================================================================

/**
 * ELO Rating System Configuration
 *
 * This configuration defines all constants used in the ELO rating calculations.
 * The ELO system measures relative skill levels between players.
 *
 * Formula: New Rating = Old Rating + K × (Actual Score - Expected Score)
 * Where Expected Score = 1 / (1 + 10^((Opponent Rating - Player Rating) / scaleFactor))
 */
export const RATING_CONFIG = {
	/** Starting rating for new players */
	defaultPlayerRating: 1200,

	/** Fallback rating for AI opponents not configured in the database */
	defaultAiRating: 1400,

	/** Minimum possible rating (floor) to prevent negative ratings */
	floorRating: 100,

	/** Scale factor for expected score calculation (standard ELO uses 400) */
	scaleFactor: 400,

	/**
	 * K-factor configuration - determines how much ratings change per game
	 * Higher K = faster rating changes, Lower K = more stable ratings
	 */
	kFactor: {
		/** Players with fewer than this many games get provisional K-factor */
		provisionalThreshold: 30,
		/** K-factor for provisional players (fast calibration) */
		provisionalValue: 40,

		/** Players with fewer than this many games (but >= provisional) get settling K-factor */
		settlingThreshold: 100,
		/** K-factor for settling players */
		settlingValue: 24,

		/** K-factor for established players (stable ratings) */
		establishedValue: 16,
	},

	/** Default AI ratings by model (used if not configured in database) */
	defaultAiRatings: {
		[OpponentLlmId.Gemini25Flash]: 1500,
		[OpponentLlmId.Gpt4o]: 1400,
	} as Partial<Record<OpponentLlmId, number>>,
} as const;

/**
 * K-factor decreases as players play more games (more stable ratings)
 */
export function getKFactor(gamesPlayed: number): number {
	const { kFactor } = RATING_CONFIG;
	if (gamesPlayed < kFactor.provisionalThreshold)
		return kFactor.provisionalValue;
	if (gamesPlayed < kFactor.settlingThreshold) return kFactor.settlingValue;
	return kFactor.establishedValue;
}

// =============================================================================
// RANK TIER CONFIGURATION
// =============================================================================

/**
 * Rank tier definitions
 * IMPORTANT: RANK_TIERS must be sorted descending by minRating
 * getRankTier() returns the first matching tier, so order matters
 */
export interface RankTier {
	tier: string;
	color: string;
	minRating: number;
}

export const RANK_TIERS: RankTier[] = [
	{ tier: 'Master', color: 'gold', minRating: 2000 },
	{ tier: 'Expert', color: 'purple', minRating: 1600 },
	{
		tier: 'Advanced',
		color: 'blue',
		minRating: RATING_CONFIG.defaultPlayerRating,
	},
	{ tier: 'Intermediate', color: 'green', minRating: 800 },
	{ tier: 'Beginner', color: 'gray', minRating: 0 },
];

/**
 * Detect if an error is a unique constraint violation
 * Supports multiple database drivers (SQLite, PostgreSQL)
 */
function isUniqueConstraintError(error: unknown): boolean {
	const err = error as { code?: string; message?: string };

	// SQLite error codes
	if (err.code === 'SQLITE_CONSTRAINT') {
		return true;
	}

	// PostgreSQL error code for unique constraint violation
	if (err.code === '23505') {
		return true;
	}

	// Fallback: check error message for unique constraint mentions
	if (err.message) {
		return (
			err.message.includes('UNIQUE constraint failed') ||
			err.message.includes('unique constraint') ||
			err.message.includes('duplicate key')
		);
	}

	return false;
}

// Runtime validation at module initialization
(() => {
	for (let i = 1; i < RANK_TIERS.length; i++) {
		const current = RANK_TIERS[i];
		const previous = RANK_TIERS[i - 1];
		if (current && previous && current.minRating >= previous.minRating) {
			throw new Error(
				`RANK_TIERS must be sorted descending by minRating. ` +
					`Found ${current.minRating} at index ${i} >= ` +
					`${previous.minRating} at index ${i - 1}`
			);
		}
	}
})();

export interface RatingCalculationResult {
	newRating: number;
	ratingChange: number;
	expectedScore: number;
}

export interface UpdateRatingParams {
	userId: string;
	variantId: ChessVariantId;
	playHistoryId: number;
	gameResult: GameResultStatus;
	opponentLlmId?: OpponentLlmId | null;
	opponentUserId?: string | null;
}

export interface PlayerRatingWithTier extends PlayerRating {
	tier: RankTier;
}

/**
 * Calculate expected score using ELO formula
 * EA = 1 / (1 + 10^((RB - RA) / scaleFactor))
 */
export function calculateExpectedScore(
	playerRating: number,
	opponentRating: number
): number {
	return (
		1 /
		(1 +
			Math.pow(10, (opponentRating - playerRating) / RATING_CONFIG.scaleFactor))
	);
}

/**
 * Convert game result to numeric score
 * Win = 1.0, Draw = 0.5, Loss = 0.0
 */
export function getActualScore(result: GameResultStatus): number {
	switch (result) {
		case GameResultStatus.Win:
			return 1.0;
		case GameResultStatus.Draw:
			return 0.5;
		case GameResultStatus.Loss:
			return 0.0;
		default: {
			// Exhaustive check for type safety
			const exhaustiveCheck: never = result;
			throw new Error(`Unhandled GameResultStatus: ${exhaustiveCheck}`);
		}
	}
}

/**
 * Calculate new ELO rating
 * New Rating = Old Rating + K × (Actual Score - Expected Score)
 */
export function calculateNewRating(
	currentRating: number,
	opponentRating: number,
	gameResult: GameResultStatus,
	gamesPlayed: number
): RatingCalculationResult {
	const expectedScore = calculateExpectedScore(currentRating, opponentRating);
	const actualScore = getActualScore(gameResult);
	const kFactor = getKFactor(gamesPlayed);
	const tentativeRatingChange = Math.round(
		kFactor * (actualScore - expectedScore)
	);
	const tentativeNewRating = currentRating + tentativeRatingChange;
	const newRating = Math.max(RATING_CONFIG.floorRating, tentativeNewRating);
	const ratingChange = newRating - currentRating;

	return {
		newRating,
		ratingChange,
		expectedScore,
	};
}

/**
 * Get rank tier for a given rating
 */
export function getRankTier(rating: number): RankTier {
	for (const tier of RANK_TIERS) {
		if (rating >= tier.minRating) {
			return tier;
		}
	}
	// Return the lowest tier (Beginner) as fallback
	const lowestTier = RANK_TIERS[RANK_TIERS.length - 1];
	if (!lowestTier) {
		throw new Error('RANK_TIERS array is empty');
	}
	return lowestTier;
}

/**
 * Get or create player rating for a variant with race condition handling
 */
export async function getOrCreatePlayerRating(
	userId: string,
	variantId: ChessVariantId
): Promise<PlayerRating> {
	const db = getDB();

	try {
		// Try to find existing rating first
		const existing = await db
			.select()
			.from(playerRatings)
			.where(
				and(
					eq(playerRatings.userId, userId),
					eq(playerRatings.variantId, variantId)
				)
			)
			.limit(1);

		if (existing.length > 0 && existing[0]) {
			return existing[0];
		}

		// Create new rating entry
		const [newRating] = await db
			.insert(playerRatings)
			.values({
				userId,
				variantId,
				rating: RATING_CONFIG.defaultPlayerRating,
				gamesPlayed: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				peakRating: RATING_CONFIG.defaultPlayerRating,
			})
			.returning();

		if (!newRating) {
			throw new Error('Failed to create player rating');
		}

		return newRating;
	} catch (error: unknown) {
		// Handle race condition: if unique constraint violated, retry fetch
		if (isUniqueConstraintError(error)) {
			const existing = await db
				.select()
				.from(playerRatings)
				.where(
					and(
						eq(playerRatings.userId, userId),
						eq(playerRatings.variantId, variantId)
					)
				)
				.limit(1);

			if (existing.length > 0 && existing[0]) {
				return existing[0];
			}
		}

		// Re-throw unexpected errors
		throw error;
	}
}

/**
 * Get player rating from within a transaction, creating if it doesn't exist
 * This is used when we need to ensure rating rows exist before performing updates
 * in the same transaction.
 */
async function getOrCreateRatingInTransaction(
	tx: unknown, // Drizzle transaction - using unknown for type compatibility across drivers
	userId: string,
	variantId: ChessVariantId
): Promise<PlayerRating> {
	// Type assertion - Drizzle transactions have same interface as db
	const dbTx = tx as ReturnType<typeof getDB>;

	try {
		// Try to find existing rating first
		const existing = await dbTx
			.select()
			.from(playerRatings)
			.where(
				and(
					eq(playerRatings.userId, userId),
					eq(playerRatings.variantId, variantId)
				)
			)
			.limit(1);

		if (existing.length > 0 && existing[0]) {
			return existing[0];
		}

		// Create new rating entry
		const [newRating] = await dbTx
			.insert(playerRatings)
			.values({
				userId,
				variantId,
				rating: RATING_CONFIG.defaultPlayerRating,
				gamesPlayed: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				peakRating: RATING_CONFIG.defaultPlayerRating,
			})
			.returning();

		if (!newRating) {
			throw new Error('Failed to create player rating in transaction');
		}

		return newRating;
	} catch (error: unknown) {
		// Handle race condition: if unique constraint violated, retry fetch
		if (isUniqueConstraintError(error)) {
			const existing = await dbTx
				.select()
				.from(playerRatings)
				.where(
					and(
						eq(playerRatings.userId, userId),
						eq(playerRatings.variantId, variantId)
					)
				)
				.limit(1);

			if (existing.length > 0 && existing[0]) {
				return existing[0];
			}
		}

		// Re-throw unexpected errors
		throw error;
	}
}

/**
 * Get AI opponent rating for a variant
 */
export async function getAiOpponentRating(
	opponentLlmId: OpponentLlmId,
	variantId: ChessVariantId
): Promise<number> {
	const db = getDB();

	const existing = await db
		.select()
		.from(aiOpponentRatings)
		.where(
			and(
				eq(aiOpponentRatings.opponentLlmId, opponentLlmId),
				eq(aiOpponentRatings.variantId, variantId)
			)
		)
		.limit(1);

	if (existing.length > 0 && existing[0]) {
		return existing[0].rating;
	}

	// Return default if not configured in database
	return (
		RATING_CONFIG.defaultAiRatings[opponentLlmId] ??
		RATING_CONFIG.defaultAiRating
	);
}

/**
 * Update both players' ratings after a PvP game (without creating rating history records)
 * Used when play history records need to be created first
 */
export async function updatePvpRatingsOnly(
	userId1: string,
	userId2: string,
	variantId: ChessVariantId,
	user1Result: GameResultStatus
): Promise<{
	rating1: number;
	rating2: number;
	ratingChange1: number;
	ratingChange2: number;
}> {
	const db = getDB();

	// Validate: prevent self-play
	if (userId1 === userId2) {
		throw new Error('Cannot play against yourself');
	}

	// Validate: ensure user1Result is a valid game result status
	const validResults: GameResultStatus[] = [
		GameResultStatus.Win,
		GameResultStatus.Loss,
		GameResultStatus.Draw,
	];
	if (!validResults.includes(user1Result)) {
		throw new Error(
			`Invalid game result status: ${user1Result}. Must be Win, Loss, or Draw.`
		);
	}

	// Determine user2's result (inverse of user1)
	let user2Result: GameResultStatus;
	if (user1Result === GameResultStatus.Win) {
		user2Result = GameResultStatus.Loss;
	} else if (user1Result === GameResultStatus.Loss) {
		user2Result = GameResultStatus.Win;
	} else {
		user2Result = GameResultStatus.Draw;
	}

	// Perform all operations in a single transaction to prevent race conditions
	return await db.transaction(async tx => {
		// Get or create both players' ratings (P1 fix: create if they don't exist)
		const [currentRating1, currentRating2] = await Promise.all([
			getOrCreateRatingInTransaction(tx, userId1, variantId),
			getOrCreateRatingInTransaction(tx, userId2, variantId),
		]);

		// Calculate new ratings
		const calculation1 = calculateNewRating(
			currentRating1.rating,
			currentRating2.rating,
			user1Result,
			currentRating1.gamesPlayed
		);

		const calculation2 = calculateNewRating(
			currentRating2.rating,
			currentRating1.rating,
			user2Result,
			currentRating2.gamesPlayed
		);

		const user1WinsInc = user1Result === GameResultStatus.Win ? 1 : 0;
		const user1LossesInc = user1Result === GameResultStatus.Loss ? 1 : 0;
		const user1DrawsInc = user1Result === GameResultStatus.Draw ? 1 : 0;
		const user2WinsInc = user2Result === GameResultStatus.Win ? 1 : 0;
		const user2LossesInc = user2Result === GameResultStatus.Loss ? 1 : 0;
		const user2DrawsInc = user2Result === GameResultStatus.Draw ? 1 : 0;

		// Update player 1 using SQL expressions for atomic increments
		await tx
			.update(playerRatings)
			.set({
				rating: calculation1.newRating,
				gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
				wins: sql`${playerRatings.wins} + ${user1WinsInc}`,
				losses: sql`${playerRatings.losses} + ${user1LossesInc}`,
				draws: sql`${playerRatings.draws} + ${user1DrawsInc}`,
				peakRating: sql`CASE
					WHEN ${playerRatings.peakRating} > ${calculation1.newRating}
						THEN ${playerRatings.peakRating}
						ELSE ${calculation1.newRating}
				END`,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(playerRatings.id, currentRating1.id));

		// Update player 2 using SQL expressions for atomic increments
		await tx
			.update(playerRatings)
			.set({
				rating: calculation2.newRating,
				gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
				wins: sql`${playerRatings.wins} + ${user2WinsInc}`,
				losses: sql`${playerRatings.losses} + ${user2LossesInc}`,
				draws: sql`${playerRatings.draws} + ${user2DrawsInc}`,
				peakRating: sql`CASE
					WHEN ${playerRatings.peakRating} > ${calculation2.newRating}
						THEN ${playerRatings.peakRating}
						ELSE ${calculation2.newRating}
				END`,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(playerRatings.id, currentRating2.id));

		return {
			rating1: calculation1.newRating,
			rating2: calculation2.newRating,
			ratingChange1: calculation1.ratingChange,
			ratingChange2: calculation2.ratingChange,
		};
	});
}

/**
 * Update both players' ratings after a PvP game using an existing transaction
 * This version accepts a transaction parameter to ensure all operations happen
 * in the same transaction (P2 fix)
 */
export async function updatePvpRatingsOnlyInTx(
	tx: unknown, // Drizzle transaction - using unknown for type compatibility across drivers
	userId1: string,
	userId2: string,
	variantId: ChessVariantId,
	user1Result: GameResultStatus
): Promise<{
	rating1: number;
	rating2: number;
	ratingChange1: number;
	ratingChange2: number;
}> {
	// Type assertion - Drizzle transactions have same interface as db
	const dbTx = tx as ReturnType<typeof getDB>;

	// Validate: prevent self-play
	if (userId1 === userId2) {
		throw new Error('Cannot play against yourself');
	}

	// Validate: ensure user1Result is a valid game result status
	const validResults: GameResultStatus[] = [
		GameResultStatus.Win,
		GameResultStatus.Loss,
		GameResultStatus.Draw,
	];
	if (!validResults.includes(user1Result)) {
		throw new Error(
			`Invalid game result status: ${user1Result}. Must be Win, Loss, or Draw.`
		);
	}

	// Determine user2's result (inverse of user1)
	let user2Result: GameResultStatus;
	if (user1Result === GameResultStatus.Win) {
		user2Result = GameResultStatus.Loss;
	} else if (user1Result === GameResultStatus.Loss) {
		user2Result = GameResultStatus.Win;
	} else {
		user2Result = GameResultStatus.Draw;
	}

	// Get or create both players' ratings (P1 fix: create if they don't exist)
	const [currentRating1, currentRating2] = await Promise.all([
		getOrCreateRatingInTransaction(tx, userId1, variantId),
		getOrCreateRatingInTransaction(tx, userId2, variantId),
	]);

	// Calculate new ratings
	const calculation1 = calculateNewRating(
		currentRating1.rating,
		currentRating2.rating,
		user1Result,
		currentRating1.gamesPlayed
	);

	const calculation2 = calculateNewRating(
		currentRating2.rating,
		currentRating1.rating,
		user2Result,
		currentRating2.gamesPlayed
	);

	const user1WinsInc = user1Result === GameResultStatus.Win ? 1 : 0;
	const user1LossesInc = user1Result === GameResultStatus.Loss ? 1 : 0;
	const user1DrawsInc = user1Result === GameResultStatus.Draw ? 1 : 0;
	const user2WinsInc = user2Result === GameResultStatus.Win ? 1 : 0;
	const user2LossesInc = user2Result === GameResultStatus.Loss ? 1 : 0;
	const user2DrawsInc = user2Result === GameResultStatus.Draw ? 1 : 0;

	// Update player 1 using SQL expressions for atomic increments
	await dbTx
		.update(playerRatings)
		.set({
			rating: calculation1.newRating,
			gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
			wins: sql`${playerRatings.wins} + ${user1WinsInc}`,
			losses: sql`${playerRatings.losses} + ${user1LossesInc}`,
			draws: sql`${playerRatings.draws} + ${user1DrawsInc}`,
			peakRating: sql`CASE
				WHEN ${playerRatings.peakRating} > ${calculation1.newRating}
					THEN ${playerRatings.peakRating}
					ELSE ${calculation1.newRating}
			END`,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(playerRatings.id, currentRating1.id));

	// Update player 2 using SQL expressions for atomic increments
	await dbTx
		.update(playerRatings)
		.set({
			rating: calculation2.newRating,
			gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
			wins: sql`${playerRatings.wins} + ${user2WinsInc}`,
			losses: sql`${playerRatings.losses} + ${user2LossesInc}`,
			draws: sql`${playerRatings.draws} + ${user2DrawsInc}`,
			peakRating: sql`CASE
				WHEN ${playerRatings.peakRating} > ${calculation2.newRating}
					THEN ${playerRatings.peakRating}
					ELSE ${calculation2.newRating}
			END`,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(playerRatings.id, currentRating2.id));

	return {
		rating1: calculation1.newRating,
		rating2: calculation2.newRating,
		ratingChange1: calculation1.ratingChange,
		ratingChange2: calculation2.ratingChange,
	};
}

/**
 * Update both players' ratings after a PvP game and create rating history records
 * This function is idempotent - calling it multiple times with the same playHistoryId
 * will skip the rating updates and return existing rating history records.
 */
export async function updatePvpRatings(
	userId1: string,
	userId2: string,
	variantId: ChessVariantId,
	playHistoryId: number,
	user1Result: GameResultStatus
): Promise<{ ratingHistory1: RatingHistory; ratingHistory2: RatingHistory }> {
	const db = getDB();

	// Validate: prevent self-play
	if (userId1 === userId2) {
		throw new Error('Cannot play against yourself');
	}

	// Validate: ensure user1Result is a valid game result status
	const validResults: GameResultStatus[] = [
		GameResultStatus.Win,
		GameResultStatus.Loss,
		GameResultStatus.Draw,
	];
	if (!validResults.includes(user1Result)) {
		throw new Error(
			`Invalid game result status: ${user1Result}. Must be Win, Loss, or Draw.`
		);
	}

	// Determine user2's result (inverse of user1)
	let user2Result: GameResultStatus;
	if (user1Result === GameResultStatus.Win) {
		user2Result = GameResultStatus.Loss;
	} else if (user1Result === GameResultStatus.Loss) {
		user2Result = GameResultStatus.Win;
	} else {
		user2Result = GameResultStatus.Draw;
	}

	// Atomic transaction to ensure idempotency
	return await db.transaction(async tx => {
		// First, try to insert rating history records.
		// If they already exist (unique constraint violation), skip rating updates.
		const [_record1] = await tx
			.insert(ratingHistory)
			.values({
				userId: userId1,
				variantId,
				playHistoryId,
				oldRating: 0, // Placeholder, will be updated if needed
				newRating: 0, // Placeholder, will be updated if needed
				ratingChange: 0, // Placeholder, will be updated if needed
				opponentRating: 0, // Placeholder, will be updated if needed
				gameResult: user1Result,
			})
			.onConflictDoNothing()
			.returning();

		const [_record2] = await tx
			.insert(ratingHistory)
			.values({
				userId: userId2,
				variantId,
				playHistoryId,
				oldRating: 0, // Placeholder
				newRating: 0, // Placeholder
				ratingChange: 0, // Placeholder
				opponentRating: 0, // Placeholder
				gameResult: user2Result,
			})
			.onConflictDoNothing()
			.returning();

		const [existingRecord1, existingRecord2] = await Promise.all([
			tx
				.select()
				.from(ratingHistory)
				.where(
					and(
						eq(ratingHistory.userId, userId1),
						eq(ratingHistory.playHistoryId, playHistoryId)
					)
				)
				.limit(1),
			tx
				.select()
				.from(ratingHistory)
				.where(
					and(
						eq(ratingHistory.userId, userId2),
						eq(ratingHistory.playHistoryId, playHistoryId)
					)
				)
				.limit(1),
		]);

		const currentHistory1 = existingRecord1[0];
		const currentHistory2 = existingRecord2[0];
		if (!currentHistory1 || !currentHistory2) {
			throw new Error('Failed to fetch rating history records');
		}

		const isPlaceholder1 =
			currentHistory1.oldRating === 0 &&
			currentHistory1.newRating === 0 &&
			currentHistory1.opponentRating === 0;
		const isPlaceholder2 =
			currentHistory2.oldRating === 0 &&
			currentHistory2.newRating === 0 &&
			currentHistory2.opponentRating === 0;

		if (!isPlaceholder1 && !isPlaceholder2) {
			return {
				ratingHistory1: currentHistory1,
				ratingHistory2: currentHistory2,
			};
		}

		if (isPlaceholder1 && isPlaceholder2) {
			const [currentRating1, currentRating2] = await Promise.all([
				getOrCreateRatingInTransaction(tx, userId1, variantId),
				getOrCreateRatingInTransaction(tx, userId2, variantId),
			]);

			const calculation1 = calculateNewRating(
				currentRating1.rating,
				currentRating2.rating,
				user1Result,
				currentRating1.gamesPlayed
			);
			const calculation2 = calculateNewRating(
				currentRating2.rating,
				currentRating1.rating,
				user2Result,
				currentRating2.gamesPlayed
			);

			const user1WinsInc = user1Result === GameResultStatus.Win ? 1 : 0;
			const user1LossesInc = user1Result === GameResultStatus.Loss ? 1 : 0;
			const user1DrawsInc = user1Result === GameResultStatus.Draw ? 1 : 0;
			const user2WinsInc = user2Result === GameResultStatus.Win ? 1 : 0;
			const user2LossesInc = user2Result === GameResultStatus.Loss ? 1 : 0;
			const user2DrawsInc = user2Result === GameResultStatus.Draw ? 1 : 0;

			await tx
				.update(playerRatings)
				.set({
					rating: calculation1.newRating,
					gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
					wins: sql`${playerRatings.wins} + ${user1WinsInc}`,
					losses: sql`${playerRatings.losses} + ${user1LossesInc}`,
					draws: sql`${playerRatings.draws} + ${user1DrawsInc}`,
					peakRating: sql`CASE
						WHEN ${playerRatings.peakRating} > ${calculation1.newRating}
							THEN ${playerRatings.peakRating}
							ELSE ${calculation1.newRating}
					END`,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(playerRatings.id, currentRating1.id));

			await tx
				.update(playerRatings)
				.set({
					rating: calculation2.newRating,
					gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
					wins: sql`${playerRatings.wins} + ${user2WinsInc}`,
					losses: sql`${playerRatings.losses} + ${user2LossesInc}`,
					draws: sql`${playerRatings.draws} + ${user2DrawsInc}`,
					peakRating: sql`CASE
						WHEN ${playerRatings.peakRating} > ${calculation2.newRating}
							THEN ${playerRatings.peakRating}
							ELSE ${calculation2.newRating}
					END`,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(playerRatings.id, currentRating2.id));

			const [updatedRecord1] = await tx
				.update(ratingHistory)
				.set({
					oldRating: currentRating1.rating,
					newRating: calculation1.newRating,
					ratingChange: calculation1.ratingChange,
					opponentRating: currentRating2.rating,
				})
				.where(eq(ratingHistory.id, currentHistory1.id))
				.returning();

			const [updatedRecord2] = await tx
				.update(ratingHistory)
				.set({
					oldRating: currentRating2.rating,
					newRating: calculation2.newRating,
					ratingChange: calculation2.ratingChange,
					opponentRating: currentRating1.rating,
				})
				.where(eq(ratingHistory.id, currentHistory2.id))
				.returning();

			if (!updatedRecord1 || !updatedRecord2) {
				throw new Error('Failed to update rating history records');
			}

			return {
				ratingHistory1: updatedRecord1,
				ratingHistory2: updatedRecord2,
			};
		}

		throw new Error('Inconsistent rating history placeholder state');
	});
}

/**
 * Update player rating after a game.
 *
 * NOTE: This function is NOT idempotent. Calling it twice with the same
 * playHistoryId will fail due to the unique constraint on rating_history.
 * Callers should ensure they don't retry with the same playHistoryId.
 */
export async function updatePlayerRating(
	params: UpdateRatingParams,
	tx?: unknown
): Promise<RatingHistory> {
	const {
		userId,
		variantId,
		playHistoryId,
		gameResult,
		opponentLlmId,
		opponentUserId,
	} = params;

	const db = getDB();

	// Validate input before any database queries
	if (!opponentLlmId && !opponentUserId) {
		throw new Error('Either opponentLlmId or opponentUserId must be provided');
	}

	const applyUpdate = async (dbTx: unknown) => {
		const typedTx = dbTx as unknown as ReturnType<typeof getDB>;

		// Fetch current player rating inside transaction to avoid stale data
		const currentRating = await getOrCreateRatingInTransaction(
			typedTx,
			userId,
			variantId
		);

		// Determine opponent rating
		let opponentRating: number;
		if (opponentLlmId) {
			opponentRating = await getAiOpponentRating(opponentLlmId, variantId);
		} else if (opponentUserId) {
			const opponentRatingData = await getOrCreateRatingInTransaction(
				typedTx,
				opponentUserId,
				variantId
			);
			opponentRating = opponentRatingData.rating;
		} else {
			// This should never happen due to validation above
			throw new Error(
				'Either opponentLlmId or opponentUserId must be provided'
			);
		}

		// Calculate new rating with up-to-date gamesPlayed
		const calculation = calculateNewRating(
			currentRating.rating,
			opponentRating,
			gameResult,
			currentRating.gamesPlayed
		);

		const winsInc = gameResult === GameResultStatus.Win ? 1 : 0;
		const lossesInc = gameResult === GameResultStatus.Loss ? 1 : 0;
		const drawsInc = gameResult === GameResultStatus.Draw ? 1 : 0;

		await typedTx
			.update(playerRatings)
			.set({
				rating: calculation.newRating,
				gamesPlayed: sql`${playerRatings.gamesPlayed} + 1`,
				wins: sql`${playerRatings.wins} + ${winsInc}`,
				losses: sql`${playerRatings.losses} + ${lossesInc}`,
				draws: sql`${playerRatings.draws} + ${drawsInc}`,
				peakRating: sql`CASE
					WHEN ${playerRatings.peakRating} > ${calculation.newRating}
						THEN ${playerRatings.peakRating}
						ELSE ${calculation.newRating}
				END`,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(playerRatings.id, currentRating.id));

		const [record] = await typedTx
			.insert(ratingHistory)
			.values({
				userId,
				variantId,
				playHistoryId,
				oldRating: currentRating.rating,
				newRating: calculation.newRating,
				ratingChange: calculation.ratingChange,
				opponentRating,
				gameResult,
			})
			.returning();

		if (!record) {
			throw new Error('Failed to create rating history record');
		}

		return record;
	};

	if (tx) {
		return applyUpdate(tx);
	}

	return db.transaction(async innerTx => applyUpdate(innerTx));
}

/**
 * Get all player ratings with tier information
 */

/**
 * Get all player ratings with tier information
 */
export async function getPlayerRatings(
	userId: string
): Promise<PlayerRatingWithTier[]> {
	const db = getDB();
	const ratings = await db
		.select()
		.from(playerRatings)
		.where(eq(playerRatings.userId, userId));

	return ratings.map(rating => ({
		...rating,
		tier: getRankTier(rating.rating),
	}));
}

/**
 * Get rating history for a player
 */
export async function getRatingHistoryForUser(
	userId: string,
	variantId?: ChessVariantId
): Promise<RatingHistory[]> {
	const db = getDB();

	if (variantId) {
		return db
			.select()
			.from(ratingHistory)
			.where(
				and(
					eq(ratingHistory.userId, userId),
					eq(ratingHistory.variantId, variantId)
				)
			);
	}

	return db
		.select()
		.from(ratingHistory)
		.where(eq(ratingHistory.userId, userId));
}
