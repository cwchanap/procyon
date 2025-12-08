import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { supabaseAdmin } from '../auth/supabase';
import { recordLoginAttempt, resetLoginAttempts } from '../auth/rate-limit';

const app = new Hono();

function getBearerToken(req: Request): string | null {
	const authHeader = req.headers.get('authorization') || '';
	const [scheme, value] = authHeader.split(' ');
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return value;
}

app.post('/register', async c => {
	try {
		const { email, username, password } = (await c.req.json()) as {
			email: string;
			username?: string;
			password: string;
		};

		const { data, error } = await supabaseAdmin.auth.signUp({
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
		console.error('register error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.post('/login', async c => {
	try {
		const { email, password } = (await c.req.json()) as {
			email: string;
			password: string;
		};

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

		const { data, error } = await supabaseAdmin.auth.signInWithPassword({
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
		console.error('login error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.post('/logout', async c => {
	try {
		const token = getBearerToken(c.req.raw);
		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		// Supabase signOut is handled client-side; API acknowledges logout
		return c.json({ message: 'Logged out' });
	} catch (error) {
		if (error instanceof HTTPException) throw error;
		console.error('logout error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.get('/session', async c => {
	try {
		const token = getBearerToken(c.req.raw);
		if (!token) {
			throw new HTTPException(401, {
				message: 'Unauthorized: Missing access token',
			});
		}

		const { data, error } = await supabaseAdmin.auth.getUser(token);
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
		console.error('session error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

export default app;
