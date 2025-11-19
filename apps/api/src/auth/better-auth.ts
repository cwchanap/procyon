import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDB } from '../db';
import { env } from '../env';
import * as schema from '../db/schema';

let authInstance: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
	if (!authInstance) {
		authInstance = betterAuth({
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
				requireEmailVerification: env.NODE_ENV === 'production',
			},
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_URL,
			trustedOrigins: (() => {
				const raw = env.BETTER_AUTH_TRUSTED_ORIGINS ?? '';
				const origins = raw
					.split(',')
					.map(o => o.trim())
					.filter(Boolean);
				return origins.length > 0 ? origins : [];
			})(),
			session: {
				cookieCache: {
					enabled: true,
					maxAge: 5 * 60, // 5 minutes
				},
			},
			plugins: [username()],
		});
	}
	return authInstance;
}

// For convenience, export auth that calls getAuth()
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
	get(_target, prop) {
		return getAuth()[prop as keyof ReturnType<typeof betterAuth>];
	},
});

export type Session = ReturnType<typeof getAuth>['$Infer']['Session'];
