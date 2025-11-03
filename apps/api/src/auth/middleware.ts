import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getAuth } from './better-auth';
import type { BetterAuthUser } from '../db/schema';

export interface AuthContext {
	user: BetterAuthUser;
}

export async function authMiddleware(c: Context, next: Next) {
	try {
		const session = await getAuth().api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session || !session.user) {
			throw new HTTPException(401, {
				message: 'Unauthorized: No valid session',
			});
		}

		c.set('user', session.user);
		await next();
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(401, {
			message: 'Invalid or expired session',
		});
	}
}

export function getUser(c: Context): BetterAuthUser {
	return c.get('user') as BetterAuthUser;
}
