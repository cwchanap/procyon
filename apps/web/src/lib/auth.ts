import { useCallback, useEffect, useState } from 'react';
import { env } from './env';
import {
	resolveApiBaseUrl,
	parseGoogleLoginBody,
	type AuthUser,
	type GoogleLoginResult,
} from './auth-helpers';

const API_BASE_URL = resolveApiBaseUrl(env.PUBLIC_API_URL);

declare global {
	interface Window {
		__PROCYON_INITIAL_AUTH_USER__?: AuthUser | null;
	}
}

/**
 * Custom event name used to synchronise auth state across independent React
 * islands in Astro's island architecture.  Each `useAuth()` hook instance
 * dispatches this event on login/logout and listens for it so that all
 * mounted islands stay in sync without a shared React context.
 */
export const AUTH_CHANGE_EVENT = 'procyon-auth-change';

interface AuthChangeDetail {
	user: AuthUser | null;
}

function dispatchAuthChange(user: AuthUser | null): void {
	try {
		globalThis.dispatchEvent(
			new CustomEvent<AuthChangeDetail>(AUTH_CHANGE_EVENT, { detail: { user } })
		);
	} catch {
		// ignore (SSR / test environments without DOM)
	}
}

/**
 * Returns auth headers for API requests.
 * In the cookie-only auth model, auth is handled by HttpOnly cookies
 * sent automatically with `credentials: 'include'`. This function
 * returns empty headers for backward compatibility with existing callers.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
	return {};
}

async function fetchSession(): Promise<AuthUser | null> {
	try {
		const res = await fetch(`${API_BASE_URL}/auth/session`, {
			credentials: 'include',
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { user: AuthUser };
		return data.user;
	} catch {
		return null;
	}
}

async function postGoogleLogin(idToken: string): Promise<GoogleLoginResult> {
	try {
		const res = await fetch(`${API_BASE_URL}/auth/google`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ id_token: idToken }),
		});
		const bodyText = await res.text();
		return parseGoogleLoginBody(res.status, bodyText);
	} catch {
		return { success: false, error: 'Network error. Please try again.' };
	}
}

async function postLogout(): Promise<void> {
	try {
		await fetch(`${API_BASE_URL}/auth/logout`, {
			method: 'POST',
			credentials: 'include',
		});
	} catch {
		// best-effort
	}
}

export interface UseAuthOptions {
	initialUser?: AuthUser | null;
}

interface InitialAuthState {
	user: AuthUser | null;
	hasServerSnapshot: boolean;
}

function getInitialAuthState(options?: UseAuthOptions): InitialAuthState {
	if (options && 'initialUser' in options) {
		return {
			user: options.initialUser ?? null,
			hasServerSnapshot: true,
		};
	}

	if (
		typeof window !== 'undefined' &&
		'__PROCYON_INITIAL_AUTH_USER__' in window
	) {
		return {
			user: window.__PROCYON_INITIAL_AUTH_USER__ ?? null,
			hasServerSnapshot: true,
		};
	}

	return { user: null, hasServerSnapshot: false };
}

export function useAuth(options?: UseAuthOptions) {
	const initialAuthState = getInitialAuthState(options);
	const [user, setUser] = useState<AuthUser | null>(
		() => initialAuthState.user
	);
	const [loading, setLoading] = useState(() => {
		if (initialAuthState.user) return false;
		return true;
	});

	useEffect(() => {
		let mounted = true;

		const shouldFetchSession = !initialAuthState.user;

		if (shouldFetchSession) {
			fetchSession()
				.then(u => {
					if (mounted) setUser(u);
				})
				.finally(() => {
					if (mounted) setLoading(false);
				});
		} else {
			setLoading(false);
		}

		const handleAuthChange = (e: Event) => {
			if (!mounted) return;
			const { user: newUser } = (e as CustomEvent<AuthChangeDetail>).detail;
			setUser(newUser);
			setLoading(false);
		};

		globalThis.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);

		return () => {
			mounted = false;
			globalThis.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
		};
	}, []);

	const signInWithGoogle = useCallback(
		async (idToken: string): Promise<GoogleLoginResult> => {
			const result = await postGoogleLogin(idToken);
			if (result.success) {
				setUser(result.user);
				dispatchAuthChange(result.user);
			}
			return result;
		},
		[]
	);

	const logout = useCallback(async () => {
		await postLogout();
		setUser(null);
		dispatchAuthChange(null);
	}, []);

	return {
		user,
		loading,
		signInWithGoogle,
		logout,
		isAuthenticated: !!user,
	};
}
