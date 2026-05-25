import { useCallback, useEffect, useState } from 'react';
import { env } from './env';
import {
	resolveApiBaseUrl,
	parseGoogleLoginBody,
	ACCESS_TOKEN_KEY,
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

function getStoredToken(): string | null {
	try {
		return globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? null;
	} catch {
		return null;
	}
}

function setStoredToken(token: string | null): void {
	try {
		if (token) {
			globalThis.localStorage?.setItem(ACCESS_TOKEN_KEY, token);
		} else {
			globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
		}
	} catch {
		// ignore storage errors
	}
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
	const token = getStoredToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchSession(): Promise<AuthUser | null> {
	const headers = await getAuthHeaders();
	try {
		const res = await fetch(`${API_BASE_URL}/auth/session`, {
			headers,
			credentials: 'include',
		});
		if (!res.ok) {
			if (res.status === 401) setStoredToken(null);
			return null;
		}
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
		const headers = await getAuthHeaders();
		await fetch(`${API_BASE_URL}/auth/logout`, {
			method: 'POST',
			headers,
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
		if (!initialAuthState.hasServerSnapshot) return true;
		return !!getStoredToken();
	});

	useEffect(() => {
		let mounted = true;

		const shouldFetchSession =
			!initialAuthState.user &&
			(!initialAuthState.hasServerSnapshot || !!getStoredToken());

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

		// Listen for auth state changes from other React island instances
		// so that login/logout in one island updates all mounted islands.
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
				setStoredToken(result.accessToken);
				setUser(result.user);
				dispatchAuthChange(result.user);
			}
			return result;
		},
		[]
	);

	const logout = useCallback(async () => {
		await postLogout();
		setStoredToken(null);
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
