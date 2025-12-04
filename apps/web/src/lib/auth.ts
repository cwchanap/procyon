import { createAuthClient } from 'better-auth/react';

import { env } from './env';

function resolveApiBaseUrl(): string {
	const baseUrl = env.PUBLIC_API_URL;

	// Server-side (SSR) and client: prefer absolute URLs when provided
	if (/^https?:\/\//i.test(baseUrl)) {
		return baseUrl.replace(/\/$/, '');
	}

	// Client-side: resolve relative paths (like /api) against the current origin
	if (typeof window !== 'undefined' && window.location) {
		return new URL(baseUrl, window.location.origin)
			.toString()
			.replace(/\/$/, '');
	}

	// SSR/build fallback: use the configured path as-is (e.g. /api)
	return baseUrl || '/api';
}

const AUTH_BASE_URL = import.meta.env.SSR
	? (() => {
			const apiBase = env.PUBLIC_API_URL;
			if (/^https?:\/\//i.test(apiBase)) {
				return `${apiBase.replace(/\/$/, '')}/auth`;
			}
			return 'http://localhost:3501/api/auth';
		})()
	: `${resolveApiBaseUrl()}/auth`;

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
				type SignUpEmailInput = Parameters<(typeof signUp)['email']>[0] & {
					username: string;
				};
				const payload: SignUpEmailInput = {
					email,
					password,
					name: username,
					username,
				};
				const result = await signUp.email(payload);
				if (result.error) {
					const normalizedError = result.error as {
						message?: string;
						code?: string;
					};
					let message = normalizedError.message || 'Registration failed';
					if (normalizedError.code === 'USERNAME_ALREADY_EXISTS') {
						message = 'Username already taken';
					} else if (normalizedError.code === 'EMAIL_ALREADY_EXISTS') {
						message = 'Email already in use';
					}
					return {
						success: false,
						error: message,
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
