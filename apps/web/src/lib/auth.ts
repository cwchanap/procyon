import { useCallback, useEffect, useState } from 'react';
import { env } from './env';
import {
	resolveApiBaseUrl,
	parseGoogleLoginBody,
	type AuthUser,
	type GoogleLoginResult,
} from './auth-helpers';
import { clearAIConfig } from './ai/storage';
import { resetAIConfigStore } from './ai/ai-config-store';

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

/**
 * Module-level snapshot of the latest auth user, updated on every
 * {@link dispatchAuthChange}. Late-mounting React islands read this on
 * mount via {@link getSharedAuthUser} to recover auth state from a
 * sibling island whose AUTH_CHANGE_EVENT fired before this island
 * registered its listener — DOM events are not replayable, so without
 * this snapshot a late island whose own fetchSession() transiently
 * fails would never learn the user is authenticated.
 */
let sharedAuthUser: AuthUser | null = null;

export function getSharedAuthUser(): AuthUser | null {
	return sharedAuthUser;
}

/**
 * Resets the shared auth snapshot. Intended only for test isolation —
 * the module-level variable persists across renderHook instances.
 */
export function __resetSharedAuthUserForTests(): void {
	sharedAuthUser = null;
}

function dispatchAuthChange(user: AuthUser | null): void {
	sharedAuthUser = user;
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

/**
 * Outcome of a `/auth/session` revalidation request.
 *
 * - `ok` — the server confirmed an authenticated session and returned the
 *   user.
 * - `unauthenticated` — the server returned 401, confirming the session is
 *   genuinely gone (expired/signed out). Callers may safely sign out local
 *   state and broadcast to sibling islands.
 * - `error` — a transient failure (non-401 non-2xx response, network error,
 *   or unparseable body). The session's true state is unknown, so callers
 *   that hold an optimistic user must preserve it rather than treat this as
 *   a confirmed sign-out.
 */
type SessionResult =
	| { status: 'ok'; user: AuthUser }
	| { status: 'unauthenticated' }
	| { status: 'error' };

async function fetchSession(): Promise<SessionResult> {
	try {
		const res = await fetch(`${API_BASE_URL}/auth/session`, {
			credentials: 'include',
		});
		// 401 is the only status the endpoint uses to signal a confirmed
		// missing/expired session. Any other non-2xx (e.g. 500) is a
		// transient server error — must not be treated as sign-out.
		if (res.status === 401) return { status: 'unauthenticated' };
		if (!res.ok) return { status: 'error' };
		try {
			const data = (await res.json()) as { user: AuthUser };
			return { status: 'ok', user: data.user };
		} catch {
			return { status: 'error' };
		}
	} catch {
		return { status: 'error' };
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

async function postLogout(): Promise<boolean> {
	try {
		const res = await fetch(`${API_BASE_URL}/auth/logout`, {
			method: 'POST',
			credentials: 'include',
		});
		return res.ok;
	} catch {
		return false;
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
		// Tracks whether an AUTH_CHANGE_EVENT from a sibling island arrived
		// before this island's own fetchSession() resolved. If so, the event
		// already set the user, and a late-arriving fetch result (e.g. null
		// from a transient network failure) must not clobber it.
		let eventReceived = false;

		const shouldFetchSession = !initialAuthState.user;

		if (shouldFetchSession) {
			// Check the shared auth snapshot before fetching. A sibling
			// island may have dispatched AUTH_CHANGE_EVENT before this
			// island mounted — the DOM event is not replayable, so read
			// the module-level snapshot to recover. Without this, a late
			// island whose own fetchSession() transiently fails would
			// never learn the user is authenticated, permanently
			// suppressing features like play-history save.
			//
			// The snapshot is an optimization, not a substitute for
			// revalidation: sharedAuthUser is module-level (per-tab), so
			// cross-tab sign-out or session expiry leaves it stale. Apply
			// the snapshot optimistically to avoid a flash of
			// unauthenticated UI, then revalidate via fetchSession() in
			// the background. If revalidation confirms the session is gone
			// (401), clear state, wipe the cached AI config (so a later
			// anonymous/shared-browser session can't reuse the previous
			// user's raw API key), and broadcast so sibling islands also
			// learn. If revalidation fails transiently (network error,
			// 5xx, unparseable body), the session's true state is unknown
			// — preserve the optimistic user and do NOT broadcast, so a
			// temporary /auth/session failure doesn't log out every
			// mounted island. If a sibling AUTH_CHANGE_EVENT arrives during
			// revalidation, trust the event (it may be from a fresher
			// login) and skip the revalidation result.
			const sharedUser = getSharedAuthUser();
			if (sharedUser) {
				setUser(sharedUser);
				setLoading(false);
				fetchSession().then(result => {
					if (!mounted) return;
					if (eventReceived) return;
					if (result.status === 'ok') {
						setUser(result.user);
						dispatchAuthChange(result.user);
					} else if (result.status === 'unauthenticated') {
						setUser(null);
						dispatchAuthChange(null);
						// Mirror logout()'s cleanup: a confirmed passive
						// sign-out must also drop the cached AI config and
						// reset the in-memory store (including the raw API
						// key fetched by hydrate and the `hydrated` flag).
						// Without this, an anonymous game or a subsequent
						// login reuses the previous user's key because
						// hydrate short-circuits on the stale `hydrated`
						// flag.
						clearAIConfig();
						resetAIConfigStore();
					}
					// result.status === 'error': transient failure. The
					// session's true state is unknown — preserve the
					// optimistic sharedUser already in state and do not
					// broadcast, so sibling islands aren't logged out by a
					// temporary /auth/session failure.
				});
			} else {
				fetchSession()
					.then(result => {
						if (mounted && !eventReceived) {
							if (result.status === 'ok') {
								setUser(result.user);
								// Broadcast to sibling islands so an island
								// whose own fetchSession() transiently failed
								// can still learn the user is authenticated.
								// Without this, a transient fetch failure in
								// one island permanently suppresses features
								// (like play-history save) that depend on
								// isAuthenticated. Only dispatch for a
								// confirmed user — dispatching null could
								// clobber a sibling's authenticated state if
								// event ordering is unlucky, and a transient
								// error must not be treated as sign-out.
								dispatchAuthChange(result.user);
							} else if (result.status === 'unauthenticated') {
								// Confirmed 401 on the initial-load path (no
								// prior user to preserve). Mirror logout()'s
								// and the sharedUser branch's cleanup: clear
								// the cached AI config and reset the in-memory
								// store so a subsequent anonymous/shared-browser
								// session can't reuse the previous user's raw
								// API key. Do not broadcast null — there is no
								// optimistic state to protect, and dispatching
								// null could clobber a sibling's authenticated
								// state if event ordering is unlucky.
								setUser(null);
								clearAIConfig();
								resetAIConfigStore();
							} else {
								// Transient error (non-401 non-2xx, network
								// error, unparseable body) on the initial-load
								// path. The session's true state is unknown —
								// set null (there is no optimistic state to
								// protect) but do NOT clear the AI config, since
								// the user may still be authenticated and a
								// transient /auth/session failure should not
								// wipe their saved settings. Do not broadcast.
								setUser(null);
							}
						}
					})
					.finally(() => {
						if (mounted) setLoading(false);
					});
			}
		} else {
			setLoading(false);
		}

		const handleAuthChange = (e: Event) => {
			if (!mounted) return;
			eventReceived = true;
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

	const logout = useCallback(async (): Promise<{ success: boolean }> => {
		const success = await postLogout();
		if (success) {
			setUser(null);
			dispatchAuthChange(null);
			// Wipe any cached AI config so a subsequent anonymous/shared-browser
			// session can't reuse the previous user's provider preferences or
			// a legacy-cached API key. clearAIConfig drops the localStorage
			// cache; resetAIConfigStore also clears the in-memory
			// ai-config-store (which holds the raw API key fetched by hydrate)
			// and resets the `hydrated` flag so a later hydrate for a new user
			// actually re-fetches instead of short-circuiting on stale state.
			clearAIConfig();
			resetAIConfigStore();
		}
		return { success };
	}, []);

	return {
		user,
		loading,
		signInWithGoogle,
		logout,
		isAuthenticated: !!user,
	};
}
