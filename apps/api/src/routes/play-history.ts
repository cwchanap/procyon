import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { playHistory, type PlayHistory } from '../db/schema';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';

const app = new Hono();

const createPlayHistorySchema = z
	.object({
		chessId: z.nativeEnum(ChessVariantId),
		status: z.nativeEnum(GameResultStatus),
		date: z.string().datetime(),
		opponentUserId: z.number().int().positive().optional(),
		opponentLlmId: z.nativeEnum(OpponentLlmId).optional(),
	})
	.superRefine((data, ctx) => {
		const hasUserOpponent = typeof data.opponentUserId === 'number';
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
	});

app.get('/', authMiddleware, async c => {
	const db = getDB();
	const user = getUser(c);

	try {
		const history = await db
			.select()
			.from(playHistory)
			.where(eq(playHistory.userId, user.userId))
			.orderBy(desc(playHistory.date));

		return c.json({ playHistory: history as PlayHistory[] });
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
			opponentUserId: body.opponentUserId ?? null,
			opponentLlmId: body.opponentLlmId ?? null,
		};

		try {
			const [record] = await db
				.insert(playHistory)
				.values(newPlayHistory)
				.returning();

			return c.json(
				{
					message: 'Play history saved',
					playHistory: record as PlayHistory,
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
