import { useEffect } from 'react';
import type { AIConfig } from '../lib/ai/types';
import {
	hydrate as hydrateAIConfig,
	useAIConfig,
} from '../lib/ai/ai-config-store';

export interface UseAIConfigHydrationOptions {
	/**
	 * Authenticated state from the caller's `useAuth()` snapshot. Passed
	 * from the game component so the hook shares the same auth state that
	 * allowed the game to start, rather than making an independent
	 * `useAuth()` call whose `fetchSession()` can transiently fail and
	 * permanently suppress hydration.
	 */
	isAuthenticated: boolean;
	/** Loading state from the caller's `useAuth()` snapshot. */
	loading: boolean;
	/**
	 * Whether the caller's `useAuth()` snapshot has been confirmed by a
	 * server-side check (SSR snapshot, successful `fetchSession()`, login,
	 * or sibling AUTH_CHANGE_EVENT) rather than merely adopted from the
	 * per-tab `sharedAuthUser` snapshot. The snapshot goes stale on
	 * cross-tab sign-out or passive cookie expiry; without this gate the
	 * hook would reuse an already-hydrated AI config store and let the
	 * game send the previous user's raw API key to an AI provider before
	 * the background `fetchSession()` returns 401 and resets the store.
	 * Hydration and the Start/AI-move gates stay blocked until
	 * revalidation confirms the session.
	 */
	revalidated: boolean;
	/** Whether the game is in AI mode (gates `aiStarting`). */
	isAiMode: boolean;
}

export interface UseAIConfigHydrationResult {
	/** Current AI config from the store. */
	config: AIConfig;
	/** Whether the config store has been hydrated. */
	hydrated: boolean;
	/** Whether the last hydration attempt failed. */
	hydrateError: boolean;
	/** True while a `rehydrate()` fetch is in flight (Retry button). */
	isRehydrating: boolean;
	/**
	 * True when the AI move trigger effect should defer — auth is still
	 * loading, or the user is authenticated but the config store hasn't
	 * hydrated yet (or hydration failed). When this is true, the first AI
	 * move would fire with the default empty config (no apiKey) and stall.
	 */
	configPending: boolean;
	/**
	 * True when the Start button should be disabled in AI mode — the user
	 * is authenticated but the config store hasn't hydrated yet (or
	 * hydration failed). Anonymous visitors never hydrate (the call is
	 * gated in AppShell) and are not blocked. We deliberately do NOT
	 * include `loading` here: blocking on authLoading would stall
	 * anonymous startup if /auth/session is slow or unavailable. Instead,
	 * the AI move trigger effect itself defers via `configPending` so that
	 * even if a signed-in user starts during a slow /auth/session request
	 * with AI playing first, the AI move waits for hydration rather than
	 * firing with the empty default config. A failed hydrate
	 * (`hydrateError`) still blocks Start for authenticated users — the
	 * default config has no API key, so the AI turn would stall.
	 */
	aiStarting: boolean;
}

/**
 * Trigger AI config store hydration when the user is authenticated, and
 * derive the gating flags (`configPending`, `aiStarting`) that game
 * components use to defer AI moves and disable the Start button until
 * the config store is ready.
 *
 * Safe to call from multiple components — `hydrate()` short-circuits if
 * already hydrated or in-flight. The caller passes its own auth snapshot
 * so the hook doesn't start a second independent `useAuth()` request: in
 * Astro's island architecture each `useAuth()` call makes its own
 * `/auth/session` request, and `fetchSession()` success in one instance
 * doesn't propagate to others (only login/logout dispatches the sync
 * event). If this hook's independent request failed while the game
 * component's succeeded, hydration was never attempted, `hydrateError`
 * stayed false, and the Start control stayed disabled with no retry UI.
 *
 * The hook also subscribes to the AI config store via `useAIConfig()`,
 * so callers don't need a separate `useAIConfig()` call to access
 * `config`, `hydrated`, or `hydrateError`.
 */
export function useAIConfigHydration({
	isAuthenticated,
	loading,
	revalidated,
	isAiMode,
}: UseAIConfigHydrationOptions): UseAIConfigHydrationResult {
	const { config, hydrated, hydrateError, isRehydrating } = useAIConfig();

	// Gate hydration on `revalidated` as well as `isAuthenticated`: a
	// stale `sharedAuthUser` snapshot can mark the hook authenticated with
	// loading=false before the background `fetchSession()` confirms the
	// session. Without this gate, `hydrate()` would short-circuit on an
	// already-hydrated store (from the prior session in this tab) and
	// leave the previous user's raw API key in place for the game to send
	// to an AI provider before the 401 lands and resets the store.
	useEffect(() => {
		if (loading || !isAuthenticated || !revalidated) return;
		void hydrateAIConfig();
	}, [loading, isAuthenticated, revalidated]);

	// `configPending`/`aiStarting` also require `revalidated`: even when
	// the store is already hydrated, a stale snapshot must not authorize
	// AI key use. This blocks the AI move trigger effect (which gates on
	// `!configPending`) and disables Start (`aiStarting`) until
	// revalidation confirms the session.
	const configPending =
		loading || (isAuthenticated && (!revalidated || !hydrated || hydrateError));
	const aiStarting =
		isAiMode && isAuthenticated && (!revalidated || !hydrated || hydrateError);

	return {
		config,
		hydrated,
		hydrateError,
		isRehydrating,
		configPending,
		aiStarting,
	};
}
