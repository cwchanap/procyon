import { Hono } from 'hono';
import { auth } from '../auth/better-auth';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';

const app = new Hono();

// Custom registration endpoint to handle username
// MUST come before wildcard route
app.post('/register', async c => {
	try {
		const body = await c.req.json();
		const { email, password, username } = body;

		if (!email || !password || !username) {
			return c.json(
				{ error: 'Email, password, and username are required' },
				400
			);
		}

		const db = getDB();

		// Forward to better-auth sign-up endpoint with username as name
		const signUpUrl = new URL(c.req.raw.url);
		signUpUrl.pathname = signUpUrl.pathname.replace(
			/\/register$/,
			'/sign-up/email'
		);
		const signUpRequest = new Request(signUpUrl.toString(), {
			method: 'POST',
			headers: c.req.raw.headers,
			body: JSON.stringify({
				email,
				password,
				name: username,
			}),
		});

		const response = await auth.handler(signUpRequest);

		if (!response.ok) {
			const errorText = await response.text();
			return new Response(errorText, {
				status: response.status,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}

		try {
			const updatedUsers = await db
				.update(schema.user)
				.set({ username })
				.where(eq(schema.user.email, email))
				.returning({ id: schema.user.id });

			if (updatedUsers.length !== 1) {
				try {
					await db.delete(schema.user).where(eq(schema.user.email, email));
				} catch (cleanupErr) {
					void cleanupErr;
				}
				return c.json({ error: 'Registration failed' }, 500);
			}
		} catch (e: unknown) {
			const msg = (() => {
				if (e && typeof e === 'object' && 'message' in e) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return String((e as { message?: any }).message ?? '');
				}
				return '';
			})();
			if (msg.includes('UNIQUE') && msg.includes('username')) {
				try {
					await db.delete(schema.user).where(eq(schema.user.email, email));
				} catch (cleanupErr) {
					void cleanupErr;
				}
				return c.json({ error: 'Username already taken' }, 400);
			}
			try {
				await db.delete(schema.user).where(eq(schema.user.email, email));
			} catch (cleanupErr) {
				void cleanupErr;
			}
			return c.json({ error: 'Registration failed' }, 500);
		}

		// Return the response with cookies
		return new Response(await response.text(), {
			status: response.status,
			headers: response.headers,
		});
	} catch (error) {
		console.error('Registration error:', error);
		return c.json({ error: 'Registration failed' }, 500);
	}
});

// Mount better-auth handlers for all remaining auth endpoints
// This provides: /sign-in/email, /sign-up/email, /sign-out, /session, etc.
app.all('/*', async c => {
	return auth.handler(c.req.raw);
});

export default app;
