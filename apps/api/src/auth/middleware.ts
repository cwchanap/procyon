import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verifyToken, type JWTPayload } from './jwt';

export interface AuthContext {
	user: JWTPayload;
}

export async function authMiddleware(c: Context, next: Next) {
	const authHeader = c.req.header('Authorization');

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new HTTPException(401, {
			message: 'Missing or invalid authorization header',
		});
	}

	const token = authHeader.substring(7); // Remove 'Bearer ' prefix

	try {
		const payload = verifyToken(token);
		c.set('user', payload);
		await next();
	} catch (_error) {
		throw new HTTPException(401, { message: 'Invalid or expired token' });
	}
}

export function getUser(c: Context): JWTPayload {
	return c.get('user') as JWTPayload;
}
