import { useEffect } from 'react';
import { hydrate as hydrateAIConfig } from '../lib/ai/ai-config-store';

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
}

/**
 * Trigger AI config store hydration when the user is authenticated.
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
 */
export function useAIConfigHydration({
	isAuthenticated,
	loading,
}: UseAIConfigHydrationOptions): void {
	useEffect(() => {
		if (loading || !isAuthenticated) return;
		void hydrateAIConfig();
	}, [loading, isAuthenticated]);
}
