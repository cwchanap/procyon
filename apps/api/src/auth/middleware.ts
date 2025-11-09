import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import type { User } from '../db/schema';

export interface AuthContext {
	user: User;
}

export async function authMiddleware(c: Context, next: Next) {
	try {
		const authHeader = c.req.header('Authorization');

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new HTTPException(401, {
				message: 'Unauthorized: No token provided',
			});
		}

		const token = authHeader.substring(7); // Remove 'Bearer ' prefix

		// Verify JWT token
		const decoded = jwt.verify(token, env.JWT_SECRET) as {
			userId: number;
			email: string;
			username: string;
		};

		// Verify user exists in database
		const db = getDB();
		const users = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, decoded.userId))
			.limit(1);

		if (users.length === 0) {
			throw new HTTPException(401, {
				message: 'Unauthorized: User not found',
			});
		}

		const user = users[0];
		c.set('user', { ...user, userId: user.id });
		await next();
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		if (error instanceof jwt.TokenExpiredError) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Token expired',
			});
		}
		if (error instanceof jwt.JsonWebTokenError) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Invalid token',
			});
		}
		throw new HTTPException(401, {
			message: 'Unauthorized',
		});
	}
}

export function getUser(c: Context): User {
	return c.get('user') as User;
}
