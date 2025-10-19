import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { getDB, schema } from '../db';
import { hashPassword, comparePassword } from '../auth/password';
import { generateToken } from '../auth/jwt';
import { registerSchema, loginSchema } from '../auth/validation';

const app = new Hono();

app.post('/register', async c => {
	try {
		const body = await c.req.json();
		const { email, username, password } = registerSchema.parse(body);

		const db = getDB();

		// Check if user already exists
		const existingUser = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.get();

		if (existingUser) {
			throw new HTTPException(409, {
				message: 'User with this email already exists',
			});
		}

		// Check if username already exists
		const existingUsername = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.username, username))
			.get();

		if (existingUsername) {
			throw new HTTPException(409, { message: 'Username already taken' });
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
			.returning()
			.get();

		// Generate JWT token
		const token = generateToken({
			userId: newUser.id,
			email: newUser.email,
			username: newUser.username,
		});

		return c.json(
			{
				message: 'User registered successfully',
				token,
				user: {
					id: newUser.id,
					email: newUser.email,
					username: newUser.username,
					createdAt: newUser.createdAt,
				},
			},
			201
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}

		// Handle validation errors
		if (error instanceof Error && error.name === 'ZodError') {
			throw new HTTPException(400, { message: 'Invalid input data' });
		}

		console.error('Registration error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

app.post('/login', async c => {
	try {
		const body = await c.req.json();
		const { email, password } = loginSchema.parse(body);

		const db = getDB();

		// Find user by email
		const user = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, email))
			.get();

		if (!user) {
			throw new HTTPException(401, {
				message: 'Invalid email or password',
			});
		}

		// Verify password
		const isPasswordValid = await comparePassword(password, user.passwordHash);
		if (!isPasswordValid) {
			throw new HTTPException(401, {
				message: 'Invalid email or password',
			});
		}

		// Generate JWT token
		const token = generateToken({
			userId: user.id,
			email: user.email,
			username: user.username,
		});

		return c.json({
			message: 'Login successful',
			token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				createdAt: user.createdAt,
			},
		});
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}

		// Handle validation errors
		if (error instanceof Error && error.name === 'ZodError') {
			throw new HTTPException(400, { message: 'Invalid input data' });
		}

		console.error('Login error:', error);
		throw new HTTPException(500, { message: 'Internal server error' });
	}
});

export default app;
