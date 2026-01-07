import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import {
	getPlayerRatings,
	getOrCreatePlayerRating,
	getRatingHistoryForUser,
	getRankTier,
} from '../services/rating-service';
import { ChessVariantId, ALL_CHESS_VARIANT_IDS } from '../constants/game';

const app = new Hono();

// GET /api/ratings - Get all player ratings
app.get('/', authMiddleware, async c => {
	const user = getUser(c);

	try {
		const ratings = await getPlayerRatings(user.userId);
		return c.json({ ratings });
	} catch (error) {
		console.error('Error fetching ratings:', error);
		return c.json({ error: 'Failed to fetch ratings' }, 500);
	}
});

// GET /api/ratings/:variant - Get rating for specific variant
app.get('/:variant', authMiddleware, async c => {
	const user = getUser(c);
	const variant = c.req.param('variant') as ChessVariantId;

	// Validate variant
	if (!ALL_CHESS_VARIANT_IDS.includes(variant)) {
		return c.json({ error: 'Invalid variant' }, 400);
	}

	try {
		const rating = await getOrCreatePlayerRating(user.userId, variant);

		return c.json({
			rating: {
				...rating,
				tier: getRankTier(rating.rating),
			},
		});
	} catch (error) {
		console.error('Error fetching rating:', error);
		return c.json({ error: 'Failed to fetch rating' }, 500);
	}
});

// GET /api/ratings/history/:variant - Get rating history for variant
app.get('/history/:variant', authMiddleware, async c => {
	const user = getUser(c);
	const variant = c.req.param('variant') as ChessVariantId;

	// Validate variant
	if (!ALL_CHESS_VARIANT_IDS.includes(variant)) {
		return c.json({ error: 'Invalid variant' }, 400);
	}

	try {
		const history = await getRatingHistoryForUser(user.userId, variant);
		return c.json({ history });
	} catch (error) {
		console.error('Error fetching rating history:', error);
		return c.json({ error: 'Failed to fetch rating history' }, 500);
	}
});

export default app;
