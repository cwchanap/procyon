import { Hono } from 'hono';
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

app.post('/register', async c => {
	try {
		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.register');

		const { email, username, password } = (await c.req.json()) as {
			email: string;
			username?: string;
			password: string;
		};

		const { data, error } = await supabaseAnon.auth.signUp({
			email,
			password,
			options: {
				data: {
					username,
				},
			},
		});

		if (error || !data.user) {
			throw new HTTPException(400, {
				message: error?.message || 'Registration failed',
			});
		}

		return c.json(
			{
				user: {
					id: data.user.id,
					email: data.user.email,
					username,
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

app.post('/login', async c => {
	try {
		const supabaseAnon = getSupabaseAnonOrThrow(c, 'auth.login');

		const body = (await c.req.json()) as unknown;
		const email =
			typeof body === 'object' && body !== null && 'email' in body
				? (body as { email?: unknown }).email
				: undefined;
		const password =
			typeof body === 'object' && body !== null && 'password' in body
				? (body as { password?: unknown }).password
				: undefined;

		if (typeof email !== 'string' || email.trim().length === 0) {
			throw new HTTPException(400, {
				message: 'Invalid request body: email must be a non-empty string',
			});
		}

		if (typeof password !== 'string' || password.trim().length === 0) {
			throw new HTTPException(400, {
				message: 'Invalid request body: password must be a non-empty string',
			});
		}

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
