import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import { supabaseAdmin } from '../auth/supabase';

const app = new Hono();

// Get current user profile (protected route)
// User data is now stored in Supabase, not D1
app.get('/me', authMiddleware, async c => {
	const user = getUser(c);

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
	const body = await c.req.json();

	// Only allow updating username for now
	const { username } = body;

	if (username) {
		const { error } = await supabaseAdmin.auth.admin.updateUserById(
			user.userId,
			{
				user_metadata: { username },
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
