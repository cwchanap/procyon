import { createAuthClient } from 'better-auth/react';
import { env } from './env';

function resolveApiBaseUrl(): string {
	const baseUrl = env.NEXT_PUBLIC_API_URL;
	if (/^https?:\/\//i.test(baseUrl)) {
		return baseUrl.replace(/\/$/, '');
	}
	if (typeof window !== 'undefined' && window.location) {
		return new URL(baseUrl, window.location.origin)
			.toString()
			.replace(/\/$/, '');
	}
	return 'http://localhost:3501/api';
}

const AUTH_BASE_URL = `${resolveApiBaseUrl()}/auth`;

export const authClient = createAuthClient({
	baseURL: AUTH_BASE_URL,
	fetchOptions: {
		credentials: 'include',
	},
});

export type { Session } from 'better-auth/types';

// Re-export commonly used hooks for convenience
export const { useSession, signIn, signOut, signUp } = authClient;

// Custom hook that maintains the same API as before
export function useAuth() {
	const session = useSession();

	return {
		user: session.data?.user ?? null,
		loading: session.isPending,
		login: async (
			email: string,
			password: string
		): Promise<{ success: boolean; error?: string }> => {
			try {
				const result = await signIn.email({
					email,
					password,
				});

				if (result.error) {
					return {
						success: false,
						error: result.error.message || 'Login failed',
					};
				}

				return { success: true };
			} catch (_error) {
				return {
					success: false,
					error: 'Network error. Please try again.',
				};
			}
		},
		register: async (
			email: string,
			username: string,
			password: string
		): Promise<{ success: boolean; error?: string }> => {
			try {
				const result = await signUp.email({
					email,
					password,
					name: username,
				});

				if (result.error) {
					return {
						success: false,
						error: result.error.message || 'Registration failed',
					};
				}

				return { success: true };
			} catch (_error) {
				return {
					success: false,
					error: 'Network error. Please try again.',
				};
			}
		},
		logout: async () => {
			try {
				await signOut();
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error('Logout failed:', error);
				throw error;
			}
		},
		isAuthenticated: !!session.data?.user,
	};
}
