import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getSupabaseClientsFromContext } from '../auth/supabase';
import { recordLoginAttempt, resetLoginAttempts } from '../auth/rate-limit';
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

function getBearerToken(req: Request): string | null {
	const authHeader = req.headers.get('authorization') || '';
	const [scheme, value] = authHeader.split(' ');
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return value;
}

function isUsernameUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const maybeError = error as {
		message?: unknown;
		code?: unknown;
	};

	const code = typeof maybeError.code === 'string' ? maybeError.code : '';
	const rawMessage =
		typeof maybeError.message === 'string' ? maybeError.message : '';
	const message = rawMessage.toLowerCase();

	if (code === '23505' || message.includes('23505')) {
		return true;
	}

	if (message.includes('duplicate key') && message.includes('unique')) {
		return true;
	}

	if (message.includes('auth_users_username_unique')) {
		return true;
	}

	return false;
}

app.post('/register', zValidator('json', registerSchema), async c => {
	try {
		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.register');

		const { email, username, password } = c.req.valid('json');
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
				throw new HTTPException(409, {
					message: 'Username already taken. Please choose another.',
				});
			}
			throw new HTTPException(400, {
				message: error.message || 'Registration failed',
			});
		}

		if (!data.user) {
			throw new HTTPException(400, {
				message: 'Registration failed',
			});
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
		if (error instanceof HTTPException) throw error;
		logger.error('register error', { error });
		throw new HTTPException(500, { message: 'Internal server error' });
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
			throw new HTTPException(401, {
				message: error?.message || 'Invalid credentials',
			});
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
		if (error instanceof HTTPException) throw error;
		logger.error('login error', { error });
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.post('/logout', async c => {
	try {
		// logout uses anon key only
		const supabaseEnv = {
			url: c.env.SUPABASE_URL ?? env.SUPABASE_URL,
			anonKey: c.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY,
		};

		if (!supabaseEnv.url || !supabaseEnv.anonKey) {
			logger.error('logout error: supabase env missing', {
				missingUrl: !supabaseEnv.url,
				missingAnonKey: !supabaseEnv.anonKey,
			});
			throw new HTTPException(500, {
				message:
					'Supabase configuration is missing or invalid. Please set SUPABASE_URL and SUPABASE_ANON_KEY.',
			});
		}

		const token = getBearerToken(c.req.raw);
		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		const response = await fetch(`${supabaseEnv.url}/auth/v1/logout`, {
			method: 'POST',
			headers: {
				apikey: supabaseEnv.anonKey,
				Authorization: `Bearer ${token}`,
			},
		});

		if (response.status === 401 || response.status === 403) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Invalid or expired token',
			});
		}

		if (!response.ok) {
			logger.error('logout error: unexpected status', {
				status: response.status,
			});
			throw new HTTPException(500, {
				message: 'Failed to revoke session tokens',
			});
		}

		// Supabase signOut is handled client-side; API acknowledges logout
		return c.json({ message: 'Logged out' });
	} catch (error) {
		if (error instanceof HTTPException) throw error;
		logger.error('logout error', { error });
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.get('/session', async c => {
	try {
		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.session');

		const token = getBearerToken(c.req.raw);
		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

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
