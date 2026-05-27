import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getSupabaseClientsFromContext } from '../auth/supabase';
import { verifyGoogleIdToken } from '../auth/google';
import { upsertGoogleUser } from '../auth/users';
import { signAppJwt, verifyAppJwt } from '../auth/jwt';
import {
	AUTH_COOKIE_NAME,
	extractBearerToken,
	extractCookieToken,
} from '../auth/utils';
import { getDB } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../env';
import { logger } from '../logger';
import type { SupabaseClient } from '@supabase/supabase-js';

type Bindings = {
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
	GOOGLE_CLIENT_ID?: string;
	JWT_SECRET?: string;
};

type Variables = {
	jwtSecret?: string;
	googleClientId?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const registerSchema = z.object({
	email: z.string().email(),
	username: z
		.string()
		.min(3)
		.max(30)
		.regex(/^[a-z0-9_-]+$/i)
		.optional(),
	password: z.string().min(8),
});

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

function getSupabaseAnonOrThrow(
	c: { env: Bindings },
	context: string
): SupabaseClient {
	try {
		const { supabaseAnon } = getSupabaseClientsFromContext({
			env: c.env,
		});
		if (!supabaseAnon) {
			throw new Error('Supabase anon client unavailable');
		}
		return supabaseAnon;
	} catch (error) {
		logger.error('Supabase client initialization failed', { context, error });
		throw new HTTPException(500, {
			message:
				'Supabase configuration is missing or invalid. Please set SUPABASE_URL and SUPABASE_ANON_KEY.',
		});
	}
}

const googleLoginSchema = z.object({
	id_token: z.string().min(1),
});

app.post('/google', zValidator('json', googleLoginSchema), async c => {
	try {
		const { id_token } = c.req.valid('json');

		let claims;
		// Test-mode bypass: accept a JSON-encoded claims object prefixed with
		// "test-claim:" so E2E tests can authenticate without a real Google token.
		if (
			id_token.startsWith('test-claim:') &&
			(env.NODE_ENV === 'development' ||
				env.NODE_ENV === 'e2e' ||
				env.NODE_ENV === 'test')
		) {
			try {
				claims = JSON.parse(id_token.slice('test-claim:'.length)) as Awaited<
					ReturnType<typeof verifyGoogleIdToken>
				>;
			} catch {
				return c.json({ error: 'Invalid test claim payload' }, 400);
			}
		} else {
			const clientId = c.get('googleClientId') || c.env.GOOGLE_CLIENT_ID;
			claims = await verifyGoogleIdToken(id_token, { clientId });
		}

		const db = getDB();
		const user = await upsertGoogleUser(db, {
			sub: claims.sub,
			email: claims.email,
			emailVerified: claims.emailVerified,
			name: claims.name,
			picture: claims.picture,
		});

		const token = await signAppJwt(
			{
				sub: user.id,
				email: user.email,
				username: user.username,
			},
			{ secret: c.get('jwtSecret') || c.env.JWT_SECRET }
		);

		setCookie(c, AUTH_COOKIE_NAME, token, {
			path: '/',
			httpOnly: true,
			secure: new URL(c.req.url).protocol === 'https:',
			sameSite: 'Lax',
			maxAge: 7 * 24 * 60 * 60, // 7 days, matches JWT expiry
		});

		return c.json({
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
		const message = error instanceof Error ? error.message : 'Sign-in failed';
		logger.error('google login error', { error });
		return c.json({ error: message }, 401);
	}
});

app.post('/register', zValidator('json', registerSchema), async c => {
	// Legacy email/password registration — deprecated in favour of Google OAuth.
	// The app JWT middleware requires a local users row (keyed on google_sub),
	// so Supabase-only tokens issued here are rejected by protected routes.
	return c.json(
		{
			error:
				'Email registration is no longer supported. Please use Google Sign-In.',
		},
		410
	);
});

app.post('/login', zValidator('json', loginSchema), async c => {
	// Legacy email/password login — deprecated in favour of Google OAuth.
	// The app JWT middleware requires a local users row (keyed on google_sub),
	// so Supabase-only tokens issued here are rejected by protected routes.
	return c.json(
		{
			error: 'Email login is no longer supported. Please use Google Sign-In.',
		},
		410
	);
});

app.post('/logout', async c => {
	try {
		// Always clear the auth cookie (cookie-only clients)
		deleteCookie(c, AUTH_COOKIE_NAME, { path: '/' });

		// If a Bearer token is also present, revoke the Supabase session
		const token = extractBearerToken(
			c.req.raw.headers.get('authorization') || ''
		);

		if (token) {
			const supabaseEnv = {
				url: c.env.SUPABASE_URL ?? env.SUPABASE_URL,
				anonKey: c.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY,
			};

			if (supabaseEnv.url && supabaseEnv.anonKey) {
				const response = await fetch(`${supabaseEnv.url}/auth/v1/logout`, {
					method: 'POST',
					headers: {
						apikey: supabaseEnv.anonKey,
						Authorization: `Bearer ${token}`,
					},
				});

				if (response.status === 401 || response.status === 403) {
					logger.warn('logout: Supabase rejected Bearer token', {
						status: response.status,
					});
				} else if (!response.ok) {
					logger.error('logout error: unexpected Supabase status', {
						status: response.status,
					});
				}
			}
		}

		return c.json({ message: 'Logged out' });
	} catch (error) {
		if (error instanceof HTTPException) throw error;
		logger.error('logout error', { error });
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.get('/session', async c => {
	try {
		// 1. Try cookie-based app JWT first (cookie-only auth path)
		const cookieHeader = c.req.header('cookie') || '';
		const cookieToken = extractCookieToken(cookieHeader);

		if (cookieToken) {
			try {
				const payload = await verifyAppJwt(cookieToken, {
					secret: c.get('jwtSecret') || c.env.JWT_SECRET,
				});

				// Enrich session with DB fields (createdAt, name, picture)
				let dbUser:
					| {
							name: string | null;
							picture: string | null;
							createdAt: Date;
					  }
					| undefined;
				try {
					const db = getDB();
					dbUser =
						(await db
							.select({
								name: users.name,
								picture: users.picture,
								createdAt: users.createdAt,
							})
							.from(users)
							.where(eq(users.id, payload.sub))
							.get()) ?? undefined;
				} catch {
					// DB unavailable — return JWT claims only
				}

				return c.json({
					user: {
						id: payload.sub,
						email: payload.email,
						username: payload.username,
						name: dbUser?.name ?? null,
						picture: dbUser?.picture ?? null,
						createdAt: dbUser?.createdAt?.toISOString() ?? null,
					},
				});
			} catch {
				// Invalid/expired cookie token — fall through to Bearer
			}
		}

		// 2. Fall back to Bearer token via Supabase (legacy path)
		const token = extractBearerToken(
			c.req.raw.headers.get('authorization') || ''
		);
		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.session');

		const { data, error } = await supabaseAnon.auth.getUser(token);
		if (error || !data?.user) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Invalid or expired token',
			});
		}

		return c.json({
			user: {
				id: data.user.id,
				email: data.user.email,
				user_metadata: data.user.user_metadata,
			},
		});
	} catch (error) {
		if (error instanceof HTTPException) throw error;
		logger.error('session error', { error });
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

export default app;
