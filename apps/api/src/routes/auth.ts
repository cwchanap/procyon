import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import * as googleModule from '../auth/google';
import * as usersModule from '../auth/users';
import { signAppJwt } from '../auth/jwt';
import { authMiddleware, getUser } from '../auth/middleware';
import { AUTH_COOKIE_NAME } from '../auth/utils';
import { users } from '../db/schema';
import { logger } from '../logger';

const app = new Hono();

const googleSchema = z.object({
	id_token: z.string().min(10),
});

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function isHttpsRequest(c: Parameters<typeof setCookie>[0]): boolean {
	const forwardedProto = c.req.header('x-forwarded-proto') || '';
	return (
		forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https' ||
		new URL(c.req.url).protocol === 'https:'
	);
}

function setAuthCookie(
	c: Parameters<typeof setCookie>[0],
	token: string,
	maxAge = AUTH_COOKIE_MAX_AGE_SECONDS
): void {
	setCookie(c, AUTH_COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'Lax',
		path: '/',
		secure: isHttpsRequest(c),
		maxAge,
	});
}

app.post('/google', zValidator('json', googleSchema), async c => {
	try {
		const { id_token } = c.req.valid('json');

		const googleClientId = (c.get('googleClientId') as string) || undefined;
		const jwtSecret = (c.get('jwtSecret') as string) || undefined;

		let claims;
		try {
			claims = await googleModule.verifyGoogleIdToken(id_token, {
				clientId: googleClientId,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Invalid Google token';
			const isConfigError = /GOOGLE_CLIENT_ID.*not configured/i.test(message);
			if (isConfigError) {
				logger.error('Google auth configuration error', { error });
				return c.json({ error: 'Internal server error' }, 500);
			}
			const isEmailUnverified =
				/email/i.test(message) && /verif/i.test(message);
			return c.json(
				{
					error: isEmailUnverified
						? 'Email not verified with Google'
						: 'Invalid Google token',
				},
				401
			);
		}

		const db = (c.get('db') as unknown) ?? null;

		const user = await usersModule.upsertGoogleUser(db, {
			sub: claims.sub,
			email: claims.email,
			emailVerified: claims.emailVerified,
			name: claims.name,
			picture: claims.picture,
		});

		const access_token = await signAppJwt(
			{
				sub: user.id,
				email: user.email,
				username: user.username,
			},
			{ secret: jwtSecret }
		);

		setAuthCookie(c, access_token);

		return c.json({
			access_token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				name: user.name,
				picture: user.picture,
			},
		});
	} catch (error) {
		if (error instanceof HTTPException) throw error;
		logger.error('auth/google error', { error });
		return c.json({ error: 'Internal server error' }, 500);
	}
});

app.post('/logout', async c => {
	// Defense-in-depth: reject cross-origin POSTs (SameSite=Lax allows
	// top-level navigations but we only want same-origin POST here).
	const origin = c.req.header('origin');
	if (origin) {
		try {
			const originHost = new URL(origin).host;
			const reqHost = new URL(c.req.url).host;
			if (originHost !== reqHost) {
				return c.json({ error: 'Forbidden' }, 403);
			}
		} catch {
			return c.json({ error: 'Forbidden' }, 403);
		}
	}

	setAuthCookie(c, '', 0);
	return c.json({ message: 'Logged out' });
});

app.get('/session', authMiddleware, async c => {
	const u = getUser(c);
	const db = c.get('db');

	if (!db) {
		logger.error('Database not available for /session');
		return c.json({ error: 'Service unavailable' }, 503);
	}

	try {
		const row = await db
			.select()
			.from(users)
			.where(eq(users.id, u.userId))
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
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			},
		});
	} catch (error) {
		logger.error('Session lookup failed', { userId: u.userId, error });
		return c.json({ error: 'Internal server error' }, 500);
	}
});

export default app;
