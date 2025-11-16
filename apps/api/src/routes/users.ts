import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';

const app = new Hono();

// Get current user profile (protected route)
app.get('/me', authMiddleware, async c => {
	const user = getUser(c);
	const db = getDB();

	const userProfile = await db
		.select({
			id: schema.user.id,
			email: schema.user.email,
			username: schema.user.username,
			name: schema.user.name,
			createdAt: schema.user.createdAt,
			updatedAt: schema.user.updatedAt,
		})
		.from(schema.user)
		.where(eq(schema.user.id, user.userId))
		.get();

	if (!userProfile) {
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({ user: userProfile });
});

// Update user profile (protected route)
app.put('/me', authMiddleware, async c => {
	const user = getUser(c);
	const body = await c.req.json();
	const db = getDB();

	// Only allow updating username for now
	const { username } = body;

	if (username) {
		try {
			await db
				.update(schema.user)
				.set({ username, updatedAt: new Date() })
				.where(eq(schema.user.id, user.userId));
		} catch (e: unknown) {
			const msg = (() => {
				if (e && typeof e === 'object' && 'message' in e) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return String((e as { message?: any }).message ?? '');
				}
				return '';
			})();
			if (msg.includes('UNIQUE') && msg.includes('username')) {
				return c.json({ error: 'Username already taken' }, 409);
			}
			throw e;
		}
	}

	const updatedUser = await db
		.select({
			id: schema.user.id,
			email: schema.user.email,
			username: schema.user.username,
			name: schema.user.name,
			createdAt: schema.user.createdAt,
			updatedAt: schema.user.updatedAt,
		})
		.from(schema.user)
		.where(eq(schema.user.id, user.userId))
		.get();

	return c.json({
		message: 'Profile updated successfully',
		user: updatedUser,
	});
});

export default app;
