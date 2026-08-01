import { useEffect, useRef } from 'react';

export function useGameIdentityReset(options: {
	isAuthenticated: boolean;
	userId: string | null | undefined;
	onReset: () => void;
	/** Called immediately before onReset when auth is lost or identity changes */
	invalidate?: () => void;
	/** When false, skip reset on auth/identity transitions (default true) */
	enabled?: boolean;
}): void {
	const {
		isAuthenticated,
		userId,
		onReset,
		invalidate,
		enabled = true,
	} = options;
	const prevAuthenticatedRef = useRef(isAuthenticated);
	const prevUserIdRef = useRef<string | null | undefined>(userId);
	// Keep latest callbacks without re-subscribing logic via identity of onReset
	const onResetRef = useRef(onReset);
	const invalidateRef = useRef(invalidate);
	onResetRef.current = onReset;
	invalidateRef.current = invalidate;

	useEffect(() => {
		const currentUserId = userId;
		const authLost = prevAuthenticatedRef.current && !isAuthenticated;
		const identityChanged =
			isAuthenticated &&
			prevUserIdRef.current != null &&
			prevUserIdRef.current !== currentUserId;
		if (enabled && (authLost || identityChanged)) {
			// `invalidate` bumps the AI move-generation token so any in-flight
			// makeAIMove callback bails. `onReset` (typically `resetGame`) also
			// calls `invalidate` internally, so the token bumps twice on a
			// reset. This is intentional and harmless: the token is monotonic
			// and `isStale` only cares about inequality, so an extra bump just
			// widens the stale window — it never unschedules a callback that
			// should run.
			invalidateRef.current?.();
			onResetRef.current();
		}
		prevAuthenticatedRef.current = isAuthenticated;
		prevUserIdRef.current = currentUserId;
	}, [isAuthenticated, userId, enabled]);
}
