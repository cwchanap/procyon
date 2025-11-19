import { Hono } from 'hono';
import { auth } from '../auth/better-auth';

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

		// Forward to better-auth sign-up endpoint with username support
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
				username,
			}),
		});

		const response = await auth.handler(signUpRequest);

		if (!response.ok) {
			const errorText = await response.text();
			let errorCode: string | undefined;
			try {
				const parsed = JSON.parse(errorText);
				errorCode = parsed?.error?.code;
			} catch (_parseErr) {
				// Ignore JSON parse issues and fall back to raw text
			}

			if (errorCode === 'USERNAME_ALREADY_EXISTS') {
				return c.json({ error: 'Username already taken' }, 409);
			}

			return new Response(errorText, {
				status: response.status,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}

		// Return the successful response (includes auth cookies)
		return response;
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
