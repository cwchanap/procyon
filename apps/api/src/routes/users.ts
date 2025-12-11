import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import { getSupabaseClientsFromContext } from '../auth/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const app = new Hono();

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_REGEX = /^[a-z0-9_-]+$/;

async function isUsernameTaken(
	normalizedUsername: string,
	currentUserId: string,
	supabaseAdmin: SupabaseClient
): Promise<boolean> {
	const perPage = 200;
	let page = 1;

	while (true) {
		const { data, error } = await supabaseAdmin.auth.admin.listUsers({
			page,
			perPage,
		});

		if (error) {
			throw error;
		}

		const users = data?.users ?? [];
		const match = users.find(user => {
			const existingUsername = user.user_metadata?.username;
			if (typeof existingUsername !== 'string') {
				return false;
			}

			return (
				user.id !== currentUserId &&
				existingUsername.toLowerCase() === normalizedUsername
			);
		});

		if (match) {
			return true;
		}

		if (users.length < perPage) {
			break;
		}

		page += 1;
	}

	return false;
}

// Get current user profile (protected route)
// User data is now stored in Supabase, not D1
app.get('/me', authMiddleware, async c => {
	const user = getUser(c);
	const { supabaseAdmin } = getSupabaseClientsFromContext({
		env: c.env as Record<string, string | undefined>,
	});

	// The user is already authenticated via middleware, so we can return user data
	// from the JWT claims. For more detailed data, we query Supabase.
	const { data, error } = await supabaseAdmin.auth.admin.getUserById(
		user.userId
	);

	if (error || !data?.user) {
		return c.json({ error: 'User not found' }, 404);
	}

	const supabaseUser = data.user;
	return c.json({
		user: {
			id: supabaseUser.id,
			email: supabaseUser.email,
			username: supabaseUser.user_metadata?.username,
			name: supabaseUser.user_metadata?.name,
			createdAt: supabaseUser.created_at,
			updatedAt: supabaseUser.updated_at,
		},
	});
});

// Update user profile (protected route)
// Updates user_metadata in Supabase
app.put('/me', authMiddleware, async c => {
	const user = getUser(c);
	const { supabaseAdmin } = getSupabaseClientsFromContext({
		env: c.env as Record<string, string | undefined>,
	});
	const body = await c.req.json();

	// Only allow updating username for now
	const { username } = body;

	if (typeof username !== 'undefined') {
		if (typeof username !== 'string') {
			return c.json({ error: 'Username must be a string' }, 400);
		}

		const trimmed = username.trim();
		if (!trimmed) {
			return c.json({ error: 'Username cannot be empty' }, 400);
		}

		if (
			trimmed.length < USERNAME_MIN_LENGTH ||
			trimmed.length > USERNAME_MAX_LENGTH
		) {
			return c.json(
				{
					error: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`,
				},
				400
			);
		}

		const normalized = trimmed.toLowerCase();
		if (!USERNAME_REGEX.test(normalized)) {
			return c.json(
				{
					error:
						'Username can only include letters, numbers, underscores, or hyphens',
				},
				400
			);
		}

		try {
			const taken = await isUsernameTaken(
				normalized,
				user.userId,
				supabaseAdmin
			);
			if (taken) {
				return c.json(
					{ error: 'Username already taken. Please choose another.' },
					409
				);
			}
		} catch (checkError) {
			console.error('Error verifying username uniqueness:', checkError);
			return c.json(
				{ error: 'Unable to update username at this time. Please try again.' },
				500
			);
		}

		const { error } = await supabaseAdmin.auth.admin.updateUserById(
			user.userId,
			{
				user_metadata: { username: normalized },
			}
		);

		if (error) {
			console.error('Error updating user metadata:', error);
			return c.json({ error: 'Failed to update profile' }, 500);
		}
	}

	// Fetch updated user data
	const { data, error } = await supabaseAdmin.auth.admin.getUserById(
		user.userId
	);

	if (error || !data?.user) {
		return c.json({ error: 'User not found' }, 404);
	}

	const supabaseUser = data.user;
	return c.json({
		message: 'Profile updated successfully',
		user: {
			id: supabaseUser.id,
			email: supabaseUser.email,
			username: supabaseUser.user_metadata?.username,
			name: supabaseUser.user_metadata?.name,
			createdAt: supabaseUser.created_at,
			updatedAt: supabaseUser.updated_at,
		},
	});
});

export default app;
