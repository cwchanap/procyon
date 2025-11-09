import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import { getDB, schema } from '../db';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../auth/password';
import jwt from 'jsonwebtoken';
import { env } from '../env';

const app = new Hono();

// Login endpoint
app.post('/login', async c => {
	try {
		const body = await c.req.json();
		const { email, password } = body;

		if (!email || !password) {
			return c.json({ error: 'Email and password are required' }, 400);
		}

		const db = getDB();
		const users = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);

		if (users.length === 0) {
			return c.json({ error: 'Invalid credentials' }, 401);
		}

		const user = users[0];
		const isValidPassword = await comparePassword(password, user.passwordHash);

		if (!isValidPassword) {
			return c.json({ error: 'Invalid credentials' }, 401);
		}

		// Generate JWT token
		const token = jwt.sign(
			{
				userId: user.id,
				email: user.email,
				username: user.username,
			},
			env.JWT_SECRET,
			{ expiresIn: env.JWT_EXPIRES_IN }
		);

		return c.json({
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
			},
			token,
		});
	} catch (error) {
		console.error('Login error:', error);
		return c.json({ error: 'Login failed' }, 500);
	}
});

// Register endpoint
app.post('/register', async c => {
	try {
		const body = await c.req.json();
		const { email, password, username } = body;

		if (!email || !password || !username) {
			return c.json({ error: 'Email, password, and username are required' }, 400);
		}

		const db = getDB();

		// Check if user already exists
		const existingUsers = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.limit(1);

		if (existingUsers.length > 0) {
			return c.json({ error: 'User already exists' }, 400);
		}

		// Check if username is taken
		const existingUsernames = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.username, username))
			.limit(1);

		if (existingUsernames.length > 0) {
			return c.json({ error: 'Username already taken' }, 400);
		}

		// Hash password and create user
		const passwordHash = await hashPassword(password);

		const newUser = await db
			.insert(schema.users)
			.values({
				email,
				username,
				passwordHash,
			})
			.returning();

		const user = newUser[0];

		// Generate JWT token
		const token = jwt.sign(
			{
				userId: user.id,
				email: user.email,
				username: user.username,
			},
			env.JWT_SECRET,
			{ expiresIn: env.JWT_EXPIRES_IN }
		);

		return c.json({
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
			},
			token,
		});
	} catch (error) {
		console.error('Registration error:', error);
		return c.json({ error: 'Registration failed' }, 500);
	}
});

// Session endpoint
app.get('/session', authMiddleware, async c => {
	const user = getUser(c);
	return c.json({
		user: {
			id: user.id,
			email: user.email,
			username: user.username,
		},
	});
});

export default app;
