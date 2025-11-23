import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';
import { auth } from './better-auth';
import type { User } from '../db/schema';

export interface AuthContext {
	user: User & { userId: string };
}

export async function authMiddleware(c: Context, next: Next) {
	try {
		// Get session from better-auth
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session?.user) {
			throw new HTTPException(401, {
				message: 'Unauthorized: No valid session',
			});
		}

		// Fetch full user data from database
		const db = getDB();
		const users = await db
			.select()
			.from(schema.user)
			.where(eq(schema.user.id, session.user.id))
			.limit(1);

		if (users.length === 0) {
			throw new HTTPException(401, {
				message: 'Unauthorized: User not found',
			});
		}

		const user = users[0]!; // Safe: we checked length above
		c.set('user', { ...user, userId: user.id });
		await next();
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		console.error('authMiddleware unexpected error:', error);
		throw new HTTPException(500, {
			message: 'Internal server error',
		});
	}
}

export function getUser(c: Context): User & { userId: string } {
	return c.get('user') as User & { userId: string };
}
