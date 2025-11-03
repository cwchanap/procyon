import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDB } from '../db';
import * as schema from '../db/schema';

export function initializeBetterAuth() {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret || secret.trim() === '') {
		throw new Error(
			'BETTER_AUTH_SECRET environment variable is required and cannot be empty'
		);
	}

	return betterAuth({
		database: drizzleAdapter(getDB(), {
			provider: 'sqlite',
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
			},
		}),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false, // Disable for MVP
		},
		secret: secret,
		baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3501',
		trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',') || [
			'http://localhost:3500',
		],
		session: {
			expiresIn: 60 * 60 * 24 * 7, // 7 days
			updateAge: 60 * 60 * 24, // Update session every 24 hours
			cookieCache: {
				enabled: true,
				maxAge: 60 * 5, // 5 minutes
			},
		},
		onAPIError: {
			throw: true,
		},
	});
}

// Lazy initialization - auth instance created on first access
let authInstance: ReturnType<typeof initializeBetterAuth> | null = null;

export function getAuth() {
	if (!authInstance) {
		authInstance = initializeBetterAuth();
	}
	return authInstance;
}
