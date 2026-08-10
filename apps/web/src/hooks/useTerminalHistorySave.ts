import { useCallback, useEffect, useRef, useState } from 'react';
import {
	submitPlayHistory,
	type SubmitPlayHistoryInput,
} from '../lib/play-history';

export interface UseTerminalHistorySaveOptions {
	enabled: boolean;
	isTerminal: boolean;
	isAuthenticated: boolean;
	userId: string | null | undefined;
	buildPayload: () => SubmitPlayHistoryInput | null;
	debugKey?: string;
	/** Clear or mark any restorable terminal snapshot before first transport. */
	onBeforeFirstAttempt?: () => void;
	onFailure?: (reason: 'rejected' | 'network') => void;
	onSuccess?: () => void;
}

const MAX_401_RETRIES = 3;
const RETRY_401_DELAY_MS = 5_000;

interface SaveSnapshot {
	payload: SubmitPlayHistoryInput;
	userId: string | null | undefined;
}

/**
 * Save one terminal play-history payload and own its non-idempotent retry
 * policy. The first payload and authenticated user are frozen for the life
 * of a terminal game. Only a 401 response is retried; every other rejection
 * or a network error is treated as final because the POST may have committed.
 */
export function useTerminalHistorySave({
	enabled,
	isTerminal,
	isAuthenticated,
	userId,
	buildPayload,
	debugKey,
	onBeforeFirstAttempt,
	onFailure,
	onSuccess,
}: UseTerminalHistorySaveOptions): void {
	const savedRef = useRef(false);
	const generationRef = useRef(0);
	const saveSnapshotRef = useRef<SaveSnapshot | null>(null);
	const previousUserIdRef = useRef<string | null | undefined>(userId);
	const previousTerminalRef = useRef(isTerminal);
	const retry401CountRef = useRef(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryPendingRef = useRef(false);
	const activeRef = useRef(true);
	const [retryTrigger, setRetryTrigger] = useState(0);

	const clearRetryTimer = useCallback(() => {
		if (retryTimerRef.current !== null) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
		retryPendingRef.current = false;
	}, []);

	const save = useCallback(async () => {
		if (!activeRef.current || !enabled || savedRef.current) return;
		// Keep the entry guard as well as the scheduling guard. Dependency
		// changes can rerun this effect after the timer budget is exhausted.
		if (retry401CountRef.current > MAX_401_RETRIES) return;
		// A 401 has already cleared the optimistic save guard, but the retry
		// must remain delayed until its one timer fires. This blocks provider or
		// callback dependency churn from issuing an immediate duplicate POST.
		if (retryPendingRef.current) return;
		if (!(isAuthenticated || import.meta.env.DEV)) return;

		const generation = generationRef.current;
		const isFirstAttempt = saveSnapshotRef.current === null;

		// A retry must never send a payload captured for account A with account
		// B's credentials. Mark the terminal game abandoned so subsequent
		// dependency changes cannot re-fire it.
		if (saveSnapshotRef.current && saveSnapshotRef.current.userId !== userId) {
			savedRef.current = true;
			return;
		}

		const payload = saveSnapshotRef.current?.payload ?? buildPayload();
		if (!payload) {
			// A strategy that cannot produce a payload has no save to retry. This
			// mirrors the old hook's missing-config guard and prevents an effect
			// dependency change from repeatedly attempting an impossible save.
			savedRef.current = true;
			return;
		}

		if (!saveSnapshotRef.current) {
			saveSnapshotRef.current = { payload, userId };
		}

		savedRef.current = true;
		if (isFirstAttempt) onBeforeFirstAttempt?.();

		if (isFirstAttempt && debugKey && typeof window !== 'undefined') {
			const w = window as unknown as Record<string, number | undefined>;
			const key = `__PROCYON_DEBUG_${debugKey}_SAVE_COUNT__`;
			w[key] = (w[key] ?? 0) + 1;
		}

		try {
			const response = await submitPlayHistory(payload);
			if (!activeRef.current) return;
			if (response.ok) {
				if (generation === generationRef.current) onSuccess?.();
				return;
			}
			if (!response.ok) {
				if (import.meta.env.DEV) {
					// eslint-disable-next-line no-console
					console.warn(
						`Play-history save failed: ${response.status} ${response.statusText}`
					);
				}

				if (response.status === 401) {
					// A reset starts a new generation. An old in-flight response must
					// not clear the replacement game's optimistic saved state.
					if (generation !== generationRef.current) return;

					savedRef.current = false;
					retry401CountRef.current++;
					if (retry401CountRef.current <= MAX_401_RETRIES) {
						clearRetryTimer();
						retryPendingRef.current = true;
						retryTimerRef.current = setTimeout(() => {
							retryPendingRef.current = false;
							retryTimerRef.current = null;
							if (activeRef.current && generation === generationRef.current) {
								setRetryTrigger(value => value + 1);
							}
						}, RETRY_401_DELAY_MS);
					}
				}

				onFailure?.('rejected');
				// eslint-disable-next-line no-console
				console.error(
					`Play-history save rejected (${response.status} ${response.statusText}); not retrying to avoid duplicate records`
				);
			}
		} catch (error) {
			if (!activeRef.current) return;
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console
				console.warn('Error saving play history:', error);
			}
			onFailure?.('network');
			// eslint-disable-next-line no-console
			console.error(
				'Play-history save failed (network error); not retrying to avoid duplicate records'
			);
		}
	}, [
		enabled,
		isAuthenticated,
		userId,
		buildPayload,
		debugKey,
		onBeforeFirstAttempt,
		onFailure,
		onSuccess,
		clearRetryTimer,
	]);

	useEffect(() => {
		if (enabled && isTerminal && !savedRef.current) {
			// The save effect can run before a caller's identity-reset effect.
			// Abandon a terminal result if the user changed since the previous
			// render rather than recording it under the new account.
			if (previousUserIdRef.current !== userId) {
				savedRef.current = true;
				previousUserIdRef.current = userId;
				return;
			}
			void save();
		}
		previousUserIdRef.current = userId;
	}, [enabled, isTerminal, userId, retryTrigger, save]);

	useEffect(() => {
		const wasTerminal = previousTerminalRef.current;
		if (wasTerminal && !isTerminal) {
			savedRef.current = false;
			saveSnapshotRef.current = null;
			retry401CountRef.current = 0;
			generationRef.current += 1;
			clearRetryTimer();
		}
		previousTerminalRef.current = isTerminal;
	}, [isTerminal, clearRetryTimer]);

	useEffect(() => {
		activeRef.current = true;
		return () => {
			activeRef.current = false;
			clearRetryTimer();
		};
	}, [clearRetryTimer]);
}
