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
	if (!headers.Authorization) return null;
	try {
		const res = await fetch(`${API_BASE_URL}/auth/session`, { headers });
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
		await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', headers });
	} catch {
		// best-effort
	}
}

export function useAuth() {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		fetchSession()
			.then(u => {
				if (mounted) setUser(u);
			})
			.finally(() => {
				if (mounted) setLoading(false);
			});

		// Listen for auth state changes from other React island instances
		// so that login/logout in one island updates all mounted islands.
		const handleAuthChange = (e: Event) => {
			if (!mounted) return;
			const { user: newUser } = (e as CustomEvent<AuthChangeDetail>).detail;
			setUser(newUser);
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
