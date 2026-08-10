import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { playHistory, ratingHistory, type PlayHistory } from '../db/schema';
import {
	GameId,
	GameResultStatus,
	OpponentLlmId,
	OpponentEngineId,
	getRatedVariantId,
} from '../constants/game';
import { updatePlayerRating } from '../services/rating-service';

/**
 * Classify the opponent of a validated POST body. The superRefine guarantees
 * exactly one opponent is present, and opponentUserId direct submission is
 * 403'd before this is reached, so only 'engine' and 'llm' are live arms.
 */
function getOpponentKind(body: {
	opponentUserId?: string | number | null;
	opponentLlmId?: OpponentLlmId | null;
	opponentEngineId?: OpponentEngineId | null;
}): 'engine' | 'llm' {
	return body.opponentEngineId ? 'engine' : 'llm';
}

const app = new Hono();

export const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NUMERIC_ID_REGEX = /^\d+$/;

const createPlayHistorySchema = z
	.object({
		gameId: z.nativeEnum(GameId),
		status: z.nativeEnum(GameResultStatus),
		date: z.string().datetime(),
		// Accept both UUID strings and legacy numeric IDs for backward compatibility
		opponentUserId: z.union([z.string(), z.number()]).optional(),
		opponentLlmId: z.nativeEnum(OpponentLlmId).optional(),
		opponentEngineId: z.nativeEnum(OpponentEngineId).optional(),
	})
	.superRefine((data, ctx) => {
		const hasUserOpponent =
			typeof data.opponentUserId === 'string' ||
			typeof data.opponentUserId === 'number';
		const hasLlmOpponent = typeof data.opponentLlmId === 'string';
		const hasEngineOpponent = typeof data.opponentEngineId === 'string';

		const opponentCount = [
			hasUserOpponent,
			hasLlmOpponent,
			hasEngineOpponent,
		].filter(Boolean).length;

		if (opponentCount === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Provide exactly one of opponentUserId, opponentLlmId, or opponentEngineId',
				path: ['opponentUserId'],
			});
		}

		if (opponentCount > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Specify exactly one opponent type (opponentUserId, opponentLlmId, or opponentEngineId)',
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
				gameId: playHistory.gameId,
				date: playHistory.date,
				status: playHistory.status,
				opponentUserId: playHistory.opponentUserId,
				opponentLlmId: playHistory.opponentLlmId,
				opponentEngineId: playHistory.opponentEngineId,
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
		const user = getUser(c);
		const body = c.req.valid('json');

		try {
			if (body.opponentUserId != null) {
				return c.json(
					{
						error:
							'PvP match results cannot be submitted directly. PvP matches require server-side validation through the match completion endpoint or real-time game server.',
					},
					403
				);
			}

			const kind = getOpponentKind(body);
			const db = getDB();

			// Perform all database operations in a single transaction.
			const result = await db.transaction(async tx => {
				let savedRecord: PlayHistory | null = null;
				let ratingUpdate: {
					oldRating: number;
					newRating: number;
					ratingChange: number;
				} | null = null;

				// Single play-history record. opponentEngineId is set explicitly
				// (null for LLM games) to mirror the existing opponentUserId: null.
				const newPlayHistory: typeof playHistory.$inferInsert = {
					userId: user.userId,
					gameId: body.gameId,
					status: body.status,
					date: new Date(body.date).toISOString(),
					opponentUserId: null,
					opponentLlmId: body.opponentLlmId ?? null,
					opponentEngineId: body.opponentEngineId ?? null,
				};

				const [record] = await tx
					.insert(playHistory)
					.values(newPlayHistory)
					.returning();

				if (!record) {
					throw new Error('Failed to create play history record');
				}

				savedRecord = record as PlayHistory;

				// Engine games are unrated: never touch the rating service.
				// Only the LLM path updates rating (rated ⇔ kind !== 'engine').
				if (kind === 'llm') {
					const ratingResult = await updatePlayerRating(
						{
							userId: user.userId,
							variantId: getRatedVariantId(body.gameId),
							playHistoryId: record.id,
							gameResult: body.status,
							opponentLlmId: body.opponentLlmId ?? null,
							opponentUserId: null,
						},
						tx
					);
					ratingUpdate = {
						oldRating: ratingResult.oldRating,
						newRating: ratingResult.newRating,
						ratingChange: ratingResult.ratingChange,
					};
				}

				return { savedRecord, ratingUpdate };
			});

			if (result.ratingUpdate) {
				console.log('Rating updated', result.ratingUpdate);
			} else {
				console.log('Play history saved (unrated engine game)');
			}

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
			// Only operations performed through the transaction object are rolled back.
			return c.json({ error: 'Failed to save play history' }, 500);
		}
	}
);

export default app;
