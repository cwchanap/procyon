import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB } from '../db';
import { users } from '../db/schema';

const app = new Hono();

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_REGEX = /^[a-z0-9_-]+$/;

// Get current user profile (protected route)
app.get('/me', authMiddleware, async c => {
	const user = getUser(c);
	const db = getDB();

	const row = await db
		.select()
		.from(users)
		.where(eq(users.id, user.userId))
		.get();

	if (!row) {
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({
		user: {
			id: row.id,
			email: row.email,
			username: row.username,
			name: row.name,
			picture: row.picture,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
	});
});

// Update user profile (protected route)
app.put('/me', authMiddleware, async c => {
	const user = getUser(c);
	const db = getDB();
	const body = await c.req.json();
	let updatedUsername: string | undefined;

	// Only allow updating username for now
	const { username } = body;

	if (typeof username !== 'undefined') {
		if (typeof username !== 'string') {
			return c.json({ error: 'Username must be a string' }, 400);
		}

		const trimmed = username.trim();
		if (!trimmed) {
			return c.json({ error: 'Username cannot be empty' }, 400);
		}

		if (
			trimmed.length < USERNAME_MIN_LENGTH ||
			trimmed.length > USERNAME_MAX_LENGTH
		) {
			return c.json(
				{
					error: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`,
				},
				400
			);
		}

		const normalized = trimmed.toLowerCase();
		if (!USERNAME_REGEX.test(normalized)) {
			return c.json(
				{
					error:
						'Username can only include letters, numbers, underscores, or hyphens',
				},
				400
			);
		}

		try {
			const updated = await db
				.update(users)
				.set({ username: normalized, updatedAt: new Date() })
				.where(eq(users.id, user.userId))
				.returning()
				.all();

			if (!updated.length) {
				return c.json({ error: 'User not found' }, 404);
			}
			updatedUsername = normalized;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/unique/i.test(msg)) {
				return c.json(
					{ error: 'Username already taken. Please choose another.' },
					409
				);
			}
			console.error('Error updating user:', err);
			return c.json({ error: 'Failed to update profile' }, 500);
		}
	}

	// Fetch updated user data
	const row = await db
		.select()
		.from(users)
		.where(eq(users.id, user.userId))
		.get();

	if (!row) {
		if (typeof updatedUsername !== 'undefined') {
			return c.json({
				message: 'Profile updated successfully',
				warning:
					'Profile updated but failed to fetch the latest user data. Please refresh.',
				user: {
					id: user.userId,
					email: user.email,
					username: updatedUsername,
				},
			});
		}
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({
		message: 'Profile updated successfully',
		user: {
			id: row.id,
			email: row.email,
			username: row.username,
			name: row.name,
			picture: row.picture,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
	});
});

export default app;
