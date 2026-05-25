import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { extractBearerToken, extractCookieToken } from './utils';
import { verifyAppJwt } from './jwt';

interface AuthUser {
	userId: string;
	email?: string;
	username?: string;
}

export async function authMiddleware(c: Context, next: Next) {
	try {
		const authHeader = c.req.header('authorization') || '';
		const cookieHeader = c.req.header('cookie') || '';
		const token =
			extractBearerToken(authHeader) ?? extractCookieToken(cookieHeader);

		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		const jwtSecret = (c.get('jwtSecret') as string) || undefined;

		let payload;
		try {
			payload = await verifyAppJwt(token, { secret: jwtSecret });
		} catch {
			throw new HTTPException(401, {
				message: 'Unauthorized: Invalid or expired token',
			});
		}

		c.set('user', {
			userId: payload.sub,
			email: payload.email,
			username: payload.username,
		});
		await next();
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		console.error('authMiddleware unexpected error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
}

export function getUser(c: Context): AuthUser {
	return c.get('user') as AuthUser;
}
