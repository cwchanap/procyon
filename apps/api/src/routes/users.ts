import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import { authMiddleware, getUser } from '../auth/middleware';
import { users } from '../db/schema';

const app = new Hono();

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_REGEX = /^[a-z0-9_-]+$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDb(c: Context): any {
	const db = c.get('db');
	if (!db) {
		throw new Error('DB not bound to context');
	}
	return db;
}

function isUsernameUniqueError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const m = err.message.toLowerCase();
	// Cover both bun:sqlite ("UNIQUE constraint failed: users.username") and D1 ("constraint failed... users.username UNIQUE")
	return (
		m.includes('users.username') &&
		(m.includes('unique constraint') || m.includes('constraint failed'))
	);
}

// Get current user profile (protected route)
app.get('/me', authMiddleware, async c => {
	try {
		const user = getUser(c);
		const db = getDb(c);
		const row = db.select().from(users).where(eq(users.id, user.userId)).get();
		if (!row) {
			return c.json({ error: 'User not found' }, 404);
		}
		return c.json({
			user: {
				id: row.id,
				email: row.email,
				username: row.username,
				name: row.name,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			},
		});
	} catch (err) {
		console.error('GET /users/me error', err);
		return c.json({ error: 'Failed to load profile' }, 500);
	}
});

// Update user profile (protected route)
app.put('/me', authMiddleware, async c => {
	try {
		const user = getUser(c);
		const db = getDb(c);
		const body = (await c.req.json()) as { username?: unknown };

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
				db.update(users)
					.set({ username: normalized, updatedAt: new Date() })
					.where(eq(users.id, user.userId))
					.run();
			} catch (err) {
				if (isUsernameUniqueError(err)) {
					return c.json(
						{ error: 'Username already taken. Please choose another.' },
						409
					);
				}
				console.error('Error updating user:', err);
				return c.json({ error: 'Failed to update profile' }, 500);
			}
		}

		const row = db.select().from(users).where(eq(users.id, user.userId)).get();
		if (!row) {
			return c.json({ error: 'User not found' }, 404);
		}

		return c.json({
			message: 'Profile updated successfully',
			user: {
				id: row.id,
				email: row.email,
				username: row.username,
				name: row.name,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			},
		});
	} catch (err) {
		console.error('PUT /users/me error', err);
		return c.json({ error: 'Failed to update profile' }, 500);
	}
});

export default app;
