import { useEffect, useRef } from 'react';

export function useGameIdentityReset(options: {
	isAuthenticated: boolean;
	userId: string | null | undefined;
	onReset: () => void;
	/** Called immediately before onReset when auth is lost or identity changes */
	invalidate?: () => void;
}): void {
	const { isAuthenticated, userId, onReset, invalidate } = options;
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
		if (authLost || identityChanged) {
			invalidateRef.current?.();
			onResetRef.current();
		}
		prevAuthenticatedRef.current = isAuthenticated;
		prevUserIdRef.current = currentUserId;
	}, [isAuthenticated, userId]);
}
