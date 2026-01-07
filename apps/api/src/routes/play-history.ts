import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { playHistory, ratingHistory } from '../db/schema';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';
import { updatePlayerRating } from '../services/rating-service';

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
			.select({
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
			.leftJoin(ratingHistory, eq(playHistory.id, ratingHistory.playHistoryId))
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

		const newPlayHistory: typeof playHistory.$inferInsert = {
			userId: user.userId,
			chessId: body.chessId,
			status: body.status,
			date: new Date(body.date).toISOString(),
			opponentUserId:
				body.opponentUserId !== undefined ? String(body.opponentUserId) : null,
			opponentLlmId: body.opponentLlmId ?? null,
		};

		try {
			console.log('Saving play history', {
				chessId: newPlayHistory.chessId,
				status: newPlayHistory.status,
				date: newPlayHistory.date,
			});
			const [record] = await db
				.insert(playHistory)
				.values(newPlayHistory)
				.returning();

			// Update rating after saving play history
			let ratingUpdate = null;
			try {
				const ratingResult = await updatePlayerRating({
					userId: user.userId,
					variantId: body.chessId,
					playHistoryId: record.id,
					gameResult: body.status,
					opponentLlmId: body.opponentLlmId ?? null,
					opponentUserId: body.opponentUserId
						? String(body.opponentUserId)
						: null,
				});

				ratingUpdate = {
					oldRating: ratingResult.oldRating,
					newRating: ratingResult.newRating,
					ratingChange: ratingResult.ratingChange,
				};

				console.log('Rating updated', ratingUpdate);
			} catch (ratingError) {
				// Log but don't fail the request if rating update fails
				console.error('Error updating rating:', ratingError);
			}

			return c.json(
				{
					message: 'Play history saved',
					playHistory: record as PlayHistory,
					ratingUpdate,
				},
				201
			);
		} catch (error) {
			console.error('Error saving play history:', error);
			return c.json({ error: 'Failed to save play history' }, 500);
		}
	}
);

export default app;
