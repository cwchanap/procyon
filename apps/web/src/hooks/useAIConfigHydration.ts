import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { hydrate as hydrateAIConfig } from '../lib/ai/ai-config-store';

/**
 * Trigger AI config store hydration when the user is authenticated.
 *
 * Safe to call from multiple components — `hydrate()` short-circuits if
 * already hydrated or in-flight. This ensures the store hydrates even if
 * AppShell's auth request transiently fails while the game island's
 * succeeds: AppShell and each game island are separate React trees in
 * Astro's island architecture, each with an independent `useAuth()` call
 * that makes its own `/auth/session` request. Without this hook, if
 * AppShell's request fails, the store never hydrates and the game's AI
 * Start control stays disabled with no retry path.
 */
export function useAIConfigHydration(): void {
	const { isAuthenticated, loading } = useAuth();
	useEffect(() => {
		if (loading || !isAuthenticated) return;
		void hydrateAIConfig();
	}, [loading, isAuthenticated]);
}
