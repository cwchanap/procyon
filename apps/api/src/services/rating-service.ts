import { eq, and } from 'drizzle-orm';
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

// ELO constants
const DEFAULT_PLAYER_RATING = 1200;
const DEFAULT_AI_RATING = 1400;

// K-factor decreases as players play more games (more stable ratings)
export function getKFactor(gamesPlayed: number): number {
	if (gamesPlayed < 30) return 40; // Provisional: fast calibration
	if (gamesPlayed < 100) return 24; // Settling period
	return 16; // Established: stable rating
}

// Default AI ratings by model (used if not configured in database)
const DEFAULT_AI_RATINGS: Record<OpponentLlmId, number> = {
	[OpponentLlmId.Gemini25Flash]: 1500,
	[OpponentLlmId.Gpt4o]: 1400,
};

// Rank tier definitions
export interface RankTier {
	tier: string;
	color: string;
	minRating: number;
}

const RANK_TIERS: RankTier[] = [
	{ tier: 'Master', color: 'gold', minRating: 2000 },
	{ tier: 'Expert', color: 'purple', minRating: 1600 },
	{ tier: 'Advanced', color: 'blue', minRating: 1200 },
	{ tier: 'Intermediate', color: 'green', minRating: 800 },
	{ tier: 'Beginner', color: 'gray', minRating: 0 },
];

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
 * EA = 1 / (1 + 10^((RB - RA) / 400))
 */
export function calculateExpectedScore(
	playerRating: number,
	opponentRating: number
): number {
	return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
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
	const ratingChange = Math.round(kFactor * (actualScore - expectedScore));
	const newRating = Math.max(100, currentRating + ratingChange); // Floor at 100

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
	return RANK_TIERS[RANK_TIERS.length - 1];
}

/**
 * Get or create player rating for a variant
 */
export async function getOrCreatePlayerRating(
	userId: string,
	variantId: ChessVariantId
): Promise<PlayerRating> {
	const db = getDB();

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

	if (existing.length > 0) {
		return existing[0];
	}

	// Create new rating entry
	const [newRating] = await db
		.insert(playerRatings)
		.values({
			userId,
			variantId,
			rating: DEFAULT_PLAYER_RATING,
			gamesPlayed: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			peakRating: DEFAULT_PLAYER_RATING,
		})
		.returning();

	return newRating;
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

	if (existing.length > 0) {
		return existing[0].rating;
	}

	// Return default if not configured in database
	return DEFAULT_AI_RATINGS[opponentLlmId] ?? DEFAULT_AI_RATING;
}

/**
 * Update player rating after a game
 */
export async function updatePlayerRating(
	params: UpdateRatingParams
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

	// Get current player rating
	const currentRating = await getOrCreatePlayerRating(userId, variantId);

	// Determine opponent rating
	let opponentRating: number;
	if (opponentLlmId) {
		opponentRating = await getAiOpponentRating(opponentLlmId, variantId);
	} else if (opponentUserId) {
		const opponentRatingData = await getOrCreatePlayerRating(
			opponentUserId,
			variantId
		);
		opponentRating = opponentRatingData.rating;
	} else {
		throw new Error('Either opponentLlmId or opponentUserId must be provided');
	}

	// Calculate new rating
	const calculation = calculateNewRating(
		currentRating.rating,
		opponentRating,
		gameResult,
		currentRating.gamesPlayed
	);

	// Update player rating
	await db
		.update(playerRatings)
		.set({
			rating: calculation.newRating,
			gamesPlayed: currentRating.gamesPlayed + 1,
			wins:
				gameResult === GameResultStatus.Win
					? currentRating.wins + 1
					: currentRating.wins,
			losses:
				gameResult === GameResultStatus.Loss
					? currentRating.losses + 1
					: currentRating.losses,
			draws:
				gameResult === GameResultStatus.Draw
					? currentRating.draws + 1
					: currentRating.draws,
			peakRating: Math.max(calculation.newRating, currentRating.peakRating),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(playerRatings.id, currentRating.id));

	// Record rating history
	const [historyRecord] = await db
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

	return historyRecord;
}

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
