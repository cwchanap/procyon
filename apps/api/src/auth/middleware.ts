import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getSupabaseClientsFromContext } from './supabase';

interface AuthUser {
	userId: string;
	email?: string;
}

export async function authMiddleware(c: Context, next: Next) {
	try {
		const authHeader = c.req.header('authorization') || '';
		const token = extractBearerToken(authHeader);

		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		const { supabaseAdmin: adminClient } = getSupabaseClientsFromContext({
			env: c.env as Record<string, string | undefined>,
		});

		const { data, error } = await adminClient.auth.getUser(token);

		if (error || !data?.user) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Invalid or expired token',
			});
		}

		const user = data.user;
		c.set('user', {
			userId: user.id,
			email: user.email ?? undefined,
		});
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

export function getUser(c: Context): AuthUser {
	return c.get('user') as AuthUser;
}

function extractBearerToken(header: string): string | null {
	const [scheme, value] = header.split(' ');
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return value;
}
