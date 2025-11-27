import { Hono } from 'hono';
import { auth } from '../auth/better-auth';

const app = new Hono();

// Legacy compatibility endpoint: POST /api/auth/register
// Accepts { email, username, password } and forwards to Better Auth's /api/auth/sign-up/email
app.post('/register', async c => {
	const body = (await c.req.json()) as {
		email: string;
		username?: string;
		password: string;
	};

	const { email, username, password } = body;

	const originalUrl = new URL(c.req.url);
	const signUpUrl = new URL('/api/auth/sign-up/email', originalUrl);
	const headers = new Headers(c.req.raw.headers);
	headers.set('content-type', 'application/json');

	const signUpRequest = new Request(signUpUrl.toString(), {
		method: 'POST',
		headers,
		body: JSON.stringify({
			email,
			password,
			name: username,
			username,
		}),
	});

	return auth.handler(signUpRequest);
});

// Mount better-auth handlers for all remaining auth endpoints
// This provides: /sign-in/email, /sign-up/email, /sign-out, /session, etc.
app.all('/*', async c => {
	return auth.handler(c.req.raw);
});

export default app;
