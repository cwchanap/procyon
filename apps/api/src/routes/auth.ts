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

		// Check if username already exists
		const db = getDB();
		const existingUser = await db
			.select()
			.from(schema.user)
			.where(eq(schema.user.email, email))
			.get();

		if (existingUser) {
			return c.json({ error: 'User already exists' }, 400);
		}

		// Use better-auth to create the user
		const auth = getAuth();
		const result = await auth.api.signUpEmail({
			body: { email, password, name },
		});

		if (!result.user) {
			return c.json({ error: 'Failed to create user' }, 500);
		}

		// Update username field to match name
		await db
			.update(schema.user)
			.set({ username: name })
			.where(eq(schema.user.id, result.user.id))
			.execute();

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

// Mount better-auth handlers for other endpoints
app.on(['POST', 'GET'], '*', async c => {
	return getAuth().handler(c.req.raw);
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

export default app;
