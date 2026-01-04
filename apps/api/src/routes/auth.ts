import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getSupabaseClientsFromContext } from '../auth/supabase';
import {
	extractBearerToken,
	isUsernameUniqueConstraintError,
} from '../auth/utils';
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

		const token = extractBearerToken(
			c.req.raw.headers.get('authorization') || ''
		);
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

		const token = extractBearerToken(
			c.req.raw.headers.get('authorization') || ''
		);
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
