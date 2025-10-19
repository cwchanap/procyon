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
			id: schema.users.id,
			email: schema.users.email,
			username: schema.users.username,
			createdAt: schema.users.createdAt,
			updatedAt: schema.users.updatedAt,
		})
		.from(schema.users)
		.where(eq(schema.users.id, user.userId))
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
		// Check if username is already taken by another user
		const existingUser = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.username, username))
			.get();

		if (existingUser && existingUser.id !== user.userId) {
			return c.json({ error: 'Username already taken' }, 409);
		}

		await db
			.update(schema.users)
			.set({ username, updatedAt: new Date().toISOString() })
			.where(eq(schema.users.id, user.userId));
	}

	const updatedUser = await db
		.select({
			id: schema.users.id,
			email: schema.users.email,
			username: schema.users.username,
			createdAt: schema.users.createdAt,
			updatedAt: schema.users.updatedAt,
		})
		.from(schema.users)
		.where(eq(schema.users.id, user.userId))
		.get();

	return c.json({
		message: 'Profile updated successfully',
		user: updatedUser,
	});
});

export default app;
