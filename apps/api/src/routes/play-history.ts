import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { playHistory, ratingHistory, type PlayHistory } from '../db/schema';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';
import {
	updatePlayerRating,
	updatePvpRatingsOnlyInTx,
} from '../services/rating-service';

const app = new Hono();

export const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NUMERIC_ID_REGEX = /^\d+$/;

const createPlayHistorySchema = z
	.object({
		chessId: z.nativeEnum(ChessVariantId),
		status: z.nativeEnum(GameResultStatus),
		date: z.string().datetime(),
		// Accept both UUID strings and legacy numeric IDs for backward compatibility
		opponentUserId: z.union([z.string(), z.number()]).optional(),
		opponentLlmId: z.nativeEnum(OpponentLlmId).optional(),
	})
	.superRefine((data, ctx) => {
		const hasUserOpponent =
			typeof data.opponentUserId === 'string' ||
			typeof data.opponentUserId === 'number';
		const hasLlmOpponent = typeof data.opponentLlmId === 'string';

		if (!hasUserOpponent && !hasLlmOpponent) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Provide either opponentUserId or opponentLlmId',
				path: ['opponentUserId'],
			});
		}

		if (hasUserOpponent && hasLlmOpponent) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Specify only one opponent type',
				path: ['opponentUserId'],
			});
		}

		// Validate opponentUserId format (UUID or legacy numeric)
		if (hasUserOpponent && data.opponentUserId != null) {
			const opponentId = String(data.opponentUserId);
			const isUuid = UUID_REGEX.test(opponentId);
			const isNumeric = NUMERIC_ID_REGEX.test(opponentId);

			if (!isUuid && !isNumeric) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'opponentUserId must be a valid UUID string or numeric ID',
					path: ['opponentUserId'],
				});
			}
		}
	});

app.get('/', authMiddleware, async c => {
	const db = getDB();
	const user = getUser(c);

	try {
		const history = await db
			.selectDistinct({
				id: playHistory.id,
				userId: playHistory.userId,
				chessId: playHistory.chessId,
				date: playHistory.date,
				status: playHistory.status,
				opponentUserId: playHistory.opponentUserId,
				opponentLlmId: playHistory.opponentLlmId,
				ratingChange: ratingHistory.ratingChange,
				newRating: ratingHistory.newRating,
			})
			.from(playHistory)
			.leftJoin(
				ratingHistory,
				and(
					eq(playHistory.id, ratingHistory.playHistoryId),
					eq(ratingHistory.userId, user.userId)
				)
			)
			.where(eq(playHistory.userId, user.userId))
			.orderBy(desc(playHistory.date));

		return c.json({ playHistory: history });
	} catch (error) {
		console.error('Error fetching play history:', error);
		return c.json({ error: 'Failed to fetch play history' }, 500);
	}
});

app.post(
	'/',
	authMiddleware,
	zValidator('json', createPlayHistorySchema),
	async c => {
		const db = getDB();
		const user = getUser(c);
		const body = c.req.valid('json');

		try {
			// Validate: prevent self-play
			if (
				body.opponentUserId != null &&
				String(body.opponentUserId) === user.userId
			) {
				return c.json({ error: 'Cannot play against yourself' }, 400);
			}

			// Perform all database operations in a single transaction
			// This prevents partial updates and ensures data consistency
			const result = await db.transaction(async tx => {
				let savedRecord: PlayHistory | null = null;
				let ratingUpdate: {
					oldRating: number;
					newRating: number;
					ratingChange: number;
				} | null = null;

				if (body.opponentUserId != null) {
					// PvP match - update ratings, then create play history records for both players
					// P2 fix: Use transaction-aware function so all updates happen in same transaction
					const pvpResult = await updatePvpRatingsOnlyInTx(
						tx,
						user.userId,
						String(body.opponentUserId),
						body.chessId,
						body.status
					);

					// Calculate old ratings from rating changes
					const oldRating1 = pvpResult.rating1 - pvpResult.ratingChange1;
					const oldRating2 = pvpResult.rating2 - pvpResult.ratingChange2;

					// Create play history record for current user (user1)
					const [user1Record] = await tx
						.insert(playHistory)
						.values({
							userId: user.userId,
							chessId: body.chessId,
							status: body.status,
							date: new Date(body.date).toISOString(),
							opponentUserId: String(body.opponentUserId),
							opponentLlmId: null,
						})
						.returning();

					// Create play history record for opponent (user2)
					// Determine opponent's result (inverse of user1)
					const opponentStatus =
						body.status === GameResultStatus.Win
							? GameResultStatus.Loss
							: body.status === GameResultStatus.Loss
								? GameResultStatus.Win
								: GameResultStatus.Draw;

					const [user2Record] = await tx
						.insert(playHistory)
						.values({
							userId: String(body.opponentUserId),
							chessId: body.chessId,
							status: opponentStatus,
							date: new Date(body.date).toISOString(),
							opponentUserId: user.userId,
							opponentLlmId: null,
						})
						.returning();

					if (!user1Record || !user2Record) {
						throw new Error(
							'Failed to create play history records for both players'
						);
					}

					// Create rating history records for both players
					await tx.insert(ratingHistory).values({
						userId: user.userId,
						variantId: body.chessId,
						playHistoryId: user1Record.id,
						oldRating: oldRating1,
						newRating: pvpResult.rating1,
						ratingChange: pvpResult.ratingChange1,
						opponentRating: oldRating2,
						gameResult: body.status,
					});

					await tx.insert(ratingHistory).values({
						userId: String(body.opponentUserId),
						variantId: body.chessId,
						playHistoryId: user2Record.id,
						oldRating: oldRating2,
						newRating: pvpResult.rating2,
						ratingChange: pvpResult.ratingChange2,
						opponentRating: oldRating1,
						gameResult: opponentStatus,
					});

					savedRecord = user1Record as PlayHistory;
					ratingUpdate = {
						oldRating: oldRating1,
						newRating: pvpResult.rating1,
						ratingChange: pvpResult.ratingChange1,
					};
				} else {
					// PvAI match - create single play history record
					const newPlayHistory: typeof playHistory.$inferInsert = {
						userId: user.userId,
						chessId: body.chessId,
						status: body.status,
						date: new Date(body.date).toISOString(),
						opponentUserId: null,
						opponentLlmId: body.opponentLlmId ?? null,
					};

					const [record] = await tx
						.insert(playHistory)
						.values(newPlayHistory)
						.returning();

					if (!record) {
						throw new Error('Failed to create play history record');
					}

					// Update single-player rating using transaction
					const ratingResult = await updatePlayerRating({
						userId: user.userId,
						variantId: body.chessId,
						playHistoryId: record.id,
						gameResult: body.status,
						opponentLlmId: body.opponentLlmId ?? null,
						opponentUserId: null,
					});

					savedRecord = record as PlayHistory;
					ratingUpdate = {
						oldRating: ratingResult.oldRating,
						newRating: ratingResult.newRating,
						ratingChange: ratingResult.ratingChange,
					};
				}

				return { savedRecord, ratingUpdate };
			});

			console.log('Rating updated', result.ratingUpdate);
			return c.json(
				{
					message: 'Play history saved',
					playHistory: result.savedRecord,
					ratingUpdate: result.ratingUpdate,
				},
				201
			);
		} catch (error) {
			console.error('Error saving play history:', error);
			// Transaction will be automatically rolled back on error
			return c.json({ error: 'Failed to save play history' }, 500);
		}
	}
);

export default app;
