import { Hono } from 'hono';
import { getAuth } from '../auth/better-auth';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';

const app = new Hono();

// Custom registration endpoint that handles username field
app.post('/sign-up/email', async c => {
	try {
		const body = await c.req.json();
		const { email, password, name } = body;

		if (!email || !password || !name) {
			return c.json({ error: 'Missing required fields' }, 400);
		}

		// Use better-auth to create the user
		const auth = getAuth();
		let result;
		try {
			result = await auth.api.signUpEmail({
				body: { email, password, name },
			});
		} catch (error: any) {
			console.error('SignUpEmail API error:', error);
			// Handle duplicate email or other validation errors
			if (
				error.message?.includes('email') ||
				error.message?.includes('unique') ||
				error.message?.includes('already exists') ||
				error.message?.includes('duplicate')
			) {
				return c.json({ error: 'User already exists' }, 400);
			}
			// Handle other validation errors
			if (
				error.message?.includes('password') ||
				error.message?.includes('validation')
			) {
				return c.json({ error: 'Invalid input data' }, 400);
			}
			// For other API errors, return 500
			return c.json({ error: 'Registration failed due to server error' }, 500);
		}

		// Fallback check - should not happen if onAPIError: { throw: true } is working
		if (!result.user) {
			console.error('SignUpEmail succeeded but no user returned');
			return c.json({ error: 'Failed to create user' }, 500);
		}

		// Update username field to match name
		const db = getDB();
		try {
			await db
				.update(schema.user)
				.set({ username: name })
				.where(eq(schema.user.id, result.user.id))
				.execute();
		} catch (updateError) {
			console.error('Failed to update username:', updateError);
			// User was created but username update failed - could delete user or handle gracefully
			// For now, return success but log the issue
		}

		return c.json({
			user: {
				...result.user,
				username: name,
			},
		});
	} catch (error) {
		console.error('Registration error:', error);
		return c.json({ error: 'Registration failed' }, 500);
	}
});

// Custom session endpoint that matches our existing API pattern
app.get('/session', authMiddleware, async c => {
	const user = getUser(c);
	return c.json({
		user: {
			id: user.id,
			email: user.email,
			username: user.username || user.name,
			name: user.name,
			emailVerified: user.emailVerified,
		},
	});
});

// Mount better-auth handlers for other endpoints
app.on(['POST', 'GET'], '*', async c => {
	return getAuth().handler(c.req.raw);
});

export default app;
