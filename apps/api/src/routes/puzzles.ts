import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { puzzles, userPuzzleProgress } from '../db/schema';

const app = new Hono();

// GET /api/puzzles - public, returns list without board/solution data
app.get('/', async c => {
	const db = getDB();
	try {
		const list = await db
			.select({
				id: puzzles.id,
				slug: puzzles.slug,
				title: puzzles.title,
				description: puzzles.description,
				difficulty: puzzles.difficulty,
				playerColor: puzzles.playerColor,
			})
			.from(puzzles)
			.orderBy(puzzles.id);
		return c.json({ puzzles: list });
	} catch (error) {
		console.error('Error fetching puzzles:', error);
		return c.json({ error: 'Failed to fetch puzzles' }, 500);
	}
});

// GET /api/puzzles/progress - auth required, returns all user progress
app.get('/progress', authMiddleware, async c => {
	const db = getDB();
	const user = getUser(c);
	try {
		const progress = await db
			.select()
			.from(userPuzzleProgress)
			.where(eq(userPuzzleProgress.userId, user.userId));
		return c.json({ progress });
	} catch (error) {
		console.error('Error fetching puzzle progress:', error);
		return c.json({ error: 'Failed to fetch progress' }, 500);
	}
});

// GET /api/puzzles/:id - public, returns full puzzle data
app.get('/:id', async c => {
	const db = getDB();
	const id = parseInt(c.req.param('id'), 10);
	if (isNaN(id)) {
		return c.json({ error: 'Invalid puzzle id' }, 400);
	}
	try {
		const [puzzle] = await db.select().from(puzzles).where(eq(puzzles.id, id));
		if (!puzzle) {
			return c.json({ error: 'Puzzle not found' }, 404);
		}
		return c.json({
			puzzle: {
				...puzzle,
				initialBoard: JSON.parse(puzzle.initialBoard) as unknown,
				solution: JSON.parse(puzzle.solution) as unknown,
				hint: JSON.parse(puzzle.hint) as unknown,
			},
		});
	} catch (error) {
		console.error('Error fetching puzzle:', error);
		return c.json({ error: 'Failed to fetch puzzle' }, 500);
	}
});

const progressSchema = z.object({
	solved: z.boolean(),
	failedAttempts: z.number().int().min(0),
	solvedAt: z.string().optional(),
});

// POST /api/puzzles/:id/progress - auth required
app.post(
	'/:id/progress',
	authMiddleware,
	zValidator('json', progressSchema),
	async c => {
		const db = getDB();
		const user = getUser(c);
		const puzzleId = parseInt(c.req.param('id'), 10);
		if (isNaN(puzzleId)) {
			return c.json({ error: 'Invalid puzzle id' }, 400);
		}
		const body = c.req.valid('json');

		try {
			const [puzzle] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(eq(puzzles.id, puzzleId));
			if (!puzzle) {
				return c.json({ error: 'Puzzle not found' }, 404);
			}

			const updatedAt = new Date().toISOString();

			// Atomic upsert: merge logic runs inside SQLite, not from a stale pre-read.
			// - solved: monotonically increases (once true, stays true)
			// - solvedAt: preserves the earliest recorded timestamp
			// - failedAttempts: takes the max of stored vs incoming, capped at 3
			await db
				.insert(userPuzzleProgress)
				.values({
					userId: user.userId,
					puzzleId,
					solved: body.solved,
					failedAttempts: Math.min(body.failedAttempts, 3),
					solvedAt: body.solvedAt ?? null,
					updatedAt,
				})
				.onConflictDoUpdate({
					target: [userPuzzleProgress.userId, userPuzzleProgress.puzzleId],
					set: {
						solved: sql`CASE WHEN ${userPuzzleProgress.solved} = 1 THEN 1 ELSE excluded.solved END`,
						solvedAt: sql`COALESCE(${userPuzzleProgress.solvedAt}, excluded.solved_at)`,
						failedAttempts: sql`MIN(MAX(${userPuzzleProgress.failedAttempts}, excluded.failed_attempts), 3)`,
						updatedAt,
					},
				});

			return c.json({ message: 'Progress saved' }, 200);
		} catch (error) {
			console.error('Error saving puzzle progress:', error);
			return c.json({ error: 'Failed to save progress' }, 500);
		}
	}
);

export default app;
