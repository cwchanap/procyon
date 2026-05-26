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
	isUsernameUniqueConstraintError,
} from '../auth/utils';
import { recordLoginAttempt, resetLoginAttempts } from '../auth/rate-limit';
import { getDB } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import type { SupabaseClient } from '@supabase/supabase-js';

type Bindings = {
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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

		const claims = await verifyGoogleIdToken(id_token);

		const db = getDB();
		const user = await upsertGoogleUser(db, {
			sub: claims.sub,
			email: claims.email,
			emailVerified: claims.emailVerified,
			name: claims.name,
			picture: claims.picture,
		});

		const token = await signAppJwt({
			sub: user.id,
			email: user.email,
			username: user.username,
		});

		setCookie(c, AUTH_COOKIE_NAME, token, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
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
	try {
		const { email, username, password } = c.req.valid('json');

		const status = recordLoginAttempt(email);
		if (!status.allowed) {
			return c.json(
				{
					error: 'Too many registration attempts. Please wait before retrying.',
					retryAfterMs: status.retryAfterMs,
				},
				429
			);
		}

		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.register');
		const normalizedUsername =
			typeof username === 'string' ? username.trim().toLowerCase() : undefined;

		const options = normalizedUsername
			? { data: { username: normalizedUsername } }
			: undefined;
		const { data, error } = await supabaseAnon.auth.signUp({
			email,
			password,
			...(options ? { options } : {}),
		});

		if (error) {
			if (normalizedUsername && isUsernameUniqueConstraintError(error)) {
				return c.json(
					{ error: 'Username already taken. Please choose another.' },
					409
				);
			}
			return c.json({ error: error.message || 'Registration failed' }, 400);
		}

		if (!data.user) {
			return c.json({ error: 'Registration failed' }, 400);
		}

		let session = data.session ?? null;
		if (!session) {
			const signInResult = await supabaseAnon.auth.signInWithPassword({
				email,
				password,
			});
			if (!signInResult.error && signInResult.data.session) {
				session = signInResult.data.session;
			}
		}

		resetLoginAttempts(email);

		return c.json(
			{
				access_token: session?.access_token ?? null,
				refresh_token: session?.refresh_token ?? null,
				user: {
					id: data.user.id,
					email: data.user.email,
					username: normalizedUsername,
				},
			},
			201
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			return c.json({ error: error.message }, error.status);
		}
		logger.error('register error', { error });
		return c.json({ error: 'Internal server error' }, 500);
	}
});

app.post('/login', zValidator('json', loginSchema), async c => {
	try {
		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.login');

		const { email, password } = c.req.valid('json');

		const status = recordLoginAttempt(email);
		if (!status.allowed) {
			return c.json(
				{
					error: 'Too many login attempts. Please wait before retrying.',
					retryAfterMs: status.retryAfterMs,
				},
				429
			);
		}

		const { data, error } = await supabaseAnon.auth.signInWithPassword({
			email,
			password,
		});

		if (error || !data.session) {
			return c.json({ error: 'Invalid email or password' }, 401);
		}

		resetLoginAttempts(email);

		return c.json({
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token,
			user: {
				id: data.user.id,
				email: data.user.email,
			},
		});
	} catch (error) {
		if (error instanceof HTTPException) {
			return c.json({ error: error.message }, error.status);
		}
		logger.error('login error', { error });
		return c.json({ error: 'Internal server error' }, 500);
	}
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
				const payload = await verifyAppJwt(cookieToken);
				return c.json({
					user: {
						id: payload.sub,
						email: payload.email,
						username: payload.username,
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
