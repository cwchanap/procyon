import { Hono } from 'hono';
import { authMiddleware, getUser } from '../auth/middleware';
import { getSupabaseClientsFromContext } from '../auth/supabase';

const app = new Hono();

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_REGEX = /^[a-z0-9_-]+$/;

function isUsernameUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const maybeError = error as {
		message?: unknown;
		code?: unknown;
		details?: unknown;
		detail?: unknown;
		constraint?: unknown;
		status?: unknown;
	};

	const rawMessage =
		typeof maybeError.message === 'string' ? maybeError.message : '';
	const message = rawMessage.toLowerCase();
	const code = typeof maybeError.code === 'string' ? maybeError.code : '';
	const rawDetails =
		typeof maybeError.details === 'string'
			? maybeError.details
			: typeof maybeError.detail === 'string'
				? maybeError.detail
				: '';
	const details = rawDetails.toLowerCase();
	const constraint =
		typeof maybeError.constraint === 'string' ? maybeError.constraint : '';
	const status =
		typeof maybeError.status === 'number' ? maybeError.status : null;
	void status;

	const usernameConstraintNames = new Set(['auth_users_username_unique']);

	const looksLikeUniqueViolation =
		code === '23505' ||
		message.includes('23505') ||
		message.includes('duplicate key value violates unique constraint');
	if (!looksLikeUniqueViolation) {
		return false;
	}

	if (constraint && usernameConstraintNames.has(constraint)) {
		return true;
	}

	const constraintMatch = rawMessage.match(/unique constraint\s+"([^"]+)"/i);
	const matchedConstraintName = constraintMatch?.[1];
	if (
		typeof matchedConstraintName === 'string' &&
		usernameConstraintNames.has(matchedConstraintName)
	) {
		return true;
	}

	if (
		message.includes('auth_users_username_unique') ||
		details.includes('auth_users_username_unique')
	) {
		return true;
	}

	const usernameKeyPattern = /key \(.*username.*\)=/i;
	if (
		usernameKeyPattern.test(rawDetails) ||
		usernameKeyPattern.test(rawMessage)
	) {
		return true;
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
	if (!supabaseAdmin) {
		return c.json(
			{
				error:
					'Supabase admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY for admin operations.',
			},
			500
		);
	}
	const adminClient = supabaseAdmin;

	// The user is already authenticated via middleware, so we can return user data
	// from the JWT claims. For more detailed data, we query Supabase.
	const { data, error } = await adminClient.auth.admin.getUserById(user.userId);

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
	if (!supabaseAdmin) {
		return c.json(
			{
				error:
					'Supabase admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY for admin operations.',
			},
			500
		);
	}
	const adminClient = supabaseAdmin;
	const body = await c.req.json();
	let updatedUsername: string | undefined;

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

		let updateError: unknown;
		try {
			const result = await adminClient.auth.admin.updateUserById(user.userId, {
				user_metadata: { username: normalized },
			});
			updateError = result.error;
		} catch (error) {
			updateError = error;
		}

		if (updateError) {
			if (isUsernameUniqueConstraintError(updateError)) {
				return c.json(
					{ error: 'Username already taken. Please choose another.' },
					409
				);
			}

			console.error('Error updating user metadata:', updateError);
			return c.json({ error: 'Failed to update profile' }, 500);
		}

		updatedUsername = normalized;
	}

	// Fetch updated user data
	const { data, error } = await adminClient.auth.admin.getUserById(user.userId);

	if (error) {
		console.error('Failed to fetch updated user after profile update:', error);
		if (typeof updatedUsername !== 'undefined') {
			return c.json({
				message: 'Profile updated successfully',
				warning:
					'Profile updated but failed to fetch the latest user data. Please refresh.',
				user: {
					id: user.userId,
					email: user.email,
					username: updatedUsername,
				},
			});
		}
		return c.json(
			{ error: 'Failed to fetch updated user profile. Please try again.' },
			500
		);
	}

	if (!data?.user) {
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
