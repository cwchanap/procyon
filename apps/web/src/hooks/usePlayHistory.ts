import { useEffect, useRef, useCallback, useState } from 'react';
import { env } from '../lib/env';
import { resolveOpponentLlmId } from '../lib/ai/opponent-llm';
import type { AIConfig } from '../lib/ai/types';
import type { GameVariant, GameStatus } from '../lib/ai/game-variant-types';

export interface UsePlayHistoryOptions {
	gameVariant: GameVariant;
	gameStatus: GameStatus;
	aiPlayer: string | null | undefined;
	aiConfig: AIConfig;
	moveCount: number;
	getWinnerColor: () => string;
	/** True only while an AI game is in progress (gameMode === 'ai' && gameStarted). */
	enabled: boolean;
	/**
	 * Authenticated state from the caller's `useAuth()` snapshot. Passed from
	 * the game component so the hook shares the same auth state that allowed
	 * the game to start, rather than making an independent `useAuth()` call
	 * whose `fetchSession()` can transiently fail and permanently suppress
	 * the terminal save.
	 */
	isAuthenticated: boolean;
	/** When set, bumps window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. */
	debugVariantKey?: string;
}

function isGameOverStatus(status: GameStatus): boolean {
	return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

/**
 * Maximum number of save attempts (including the initial one) before giving
 * up. A failed save (network error or non-2xx response) increments the retry
 * trigger so the auto-save effect re-runs on the next render tick; once the
 * trigger reaches this bound the effect stops retrying, preventing infinite
 * retry loops against a persistently failing endpoint.
 */
const MAX_SAVE_ATTEMPTS = 3;

/**
 * Timeout for the play-history POST request. Prevents the fetch from hanging
 * indefinitely on a stalled connection — the resulting AbortError falls into
 * the catch block and is treated as a network error (no retry, to avoid
 * duplicate records).
 */
const SAVE_TIMEOUT_MS = 10_000;

/**
 * Base delay (ms) for the exponential backoff between 5xx retries. Each
 * retry doubles the delay, capped at {@link RETRY_BACKOFF_MAX_MS}, so a
 * struggling server gets breathing room instead of being hammered on every
 * render tick.
 */
const RETRY_BACKOFF_BASE_MS = 200;
const RETRY_BACKOFF_MAX_MS = 2_000;

/**
 * Auto-saves a play-history record when an AI game ends. Single source of
 * truth for all four game variants. Save guards: enabled (AI game in
 * progress), authenticated-or-DEV, game over, not already saved.
 */
export function usePlayHistory({
	gameVariant,
	gameStatus,
	aiPlayer,
	aiConfig,
	moveCount,
	getWinnerColor,
	enabled,
	isAuthenticated,
	debugVariantKey,
}: UsePlayHistoryOptions): void {
	const savedRef = useRef(false);
	// Tracks the number of save attempts for the current game so we can
	// log a prod-visible error when retries are exhausted.
	const attemptsRef = useRef(0);
	// Monotonic generation token for the current game instance. Incremented
	// when a new game starts (reset effect) so that a 5xx response from a
	// prior game's in-flight fetch can detect it is stale and skip its
	// retry logic — otherwise it would clobber the new game's savedRef
	// (set back to false), consume the new game's retry budget, and
	// schedule a retry that submits an overlapping duplicate record.
	const gameGenerationRef = useRef(0);
	// Snapshot of the terminal save data, captured on the first save
	// attempt and reused across retries so that changes to aiPlayer,
	// provider, or model after game-over don't corrupt the record (e.g.
	// recording the opposite win/loss or a different opponentLlmId).
	// Cleared in the reset effect when a new game starts.
	const saveSnapshotRef = useRef<{
		result: 'win' | 'loss' | 'draw';
		opponentLlmId: string;
		gameVariant: GameVariant;
	} | null>(null);
	// State-based retry trigger: incremented when a save attempt fails so the
	// auto-save effect re-runs (its deps include `retryTrigger`). Bounded by
	// MAX_SAVE_ATTEMPTS to prevent infinite retry loops.
	const [retryTrigger, setRetryTrigger] = useState(0);
	// Pending retry timer — cleared on unmount or when deps change so a
	// stale backoff from a previous render doesn't fire after the hook has
	// moved on (e.g. new game started, or component unmounted).
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Bump the retry trigger so the auto-save effect re-runs, up to the
	// bounded retry count. Stable identity so it doesn't force
	// savePlayHistory to rebuild on every render.
	const bumpRetry = useCallback(
		() => setRetryTrigger(c => (c < MAX_SAVE_ATTEMPTS ? c + 1 : c)),
		[]
	);

	const savePlayHistory = useCallback(async () => {
		if (!enabled || savedRef.current) return;
		if (!(isAuthenticated || import.meta.env.DEV)) return;
		if (!aiPlayer) return;
		if (!isGameOverStatus(gameStatus)) return;

		// Capture the current game generation so that if a reset (new game)
		// happens while the fetch below is in flight, the 5xx retry path can
		// detect it is stale and bail out without clobbering the new game's
		// savedRef / attemptsRef / retry timer.
		const gen = gameGenerationRef.current;

		// Use the snapshotted save data if this is a retry (the snapshot
		// was captured on the first attempt). Otherwise compute and
		// snapshot it so that subsequent retries use the frozen values
		// even if aiPlayer/provider/model changed after game-over.
		let result: 'win' | 'loss' | 'draw';
		let opponentLlmId: string;
		let snapshotGameVariant: GameVariant;
		if (saveSnapshotRef.current) {
			result = saveSnapshotRef.current.result;
			opponentLlmId = saveSnapshotRef.current.opponentLlmId;
			snapshotGameVariant = saveSnapshotRef.current.gameVariant;
		} else {
			if (gameStatus === 'draw' || gameStatus === 'stalemate') {
				result = 'draw';
			} else {
				const winnerColor = getWinnerColor();
				result = winnerColor === aiPlayer ? 'loss' : 'win';
			}
			opponentLlmId = resolveOpponentLlmId(aiConfig.provider, aiConfig.model);
			snapshotGameVariant = gameVariant;
			saveSnapshotRef.current = { result, opponentLlmId, gameVariant };
		}

		savedRef.current = true;

		if (debugVariantKey && typeof window !== 'undefined') {
			const w = window as unknown as Record<string, number | undefined>;
			const key = `__PROCYON_DEBUG_${debugVariantKey}_SAVE_COUNT__`;
			w[key] = (w[key] ?? 0) + 1;
		}

		try {
			const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
				body: JSON.stringify({
					chessId: snapshotGameVariant,
					status: result,
					date: new Date().toISOString(),
					opponentLlmId,
				}),
			});
			if (!response.ok) {
				if (import.meta.env.DEV) {
					// eslint-disable-next-line no-console
					console.warn(
						`Play-history save failed: ${response.status} ${response.statusText}`
					);
				}
				// 4xx errors (auth expiry, bad request, etc.) are non-transient —
				// retrying sends the same rejected request again. Only retry on
				// 5xx (transient server errors). On 4xx keep savedRef=true (the
				// optimistic set above) so the effect doesn't re-trigger.
				if (response.status >= 400 && response.status < 500) {
					// eslint-disable-next-line no-console
					console.error(
						`Play-history save rejected (${response.status} ${response.statusText}); not retrying`
					);
				} else {
					// If a new game started while this fetch was in flight (reset
					// bumped gameGenerationRef), bail out without touching
					// savedRef/attemptsRef - those now belong to the new game.
					// Without this guard, the stale 5xx would set savedRef=false
					// (clobbering the new game optimistic set), increment the
					// new game attemptsRef, and schedule a retry that submits
					// an overlapping duplicate history/rating record.
					if (gen !== gameGenerationRef.current) return;
					savedRef.current = false;
					attemptsRef.current += 1;
					if (attemptsRef.current >= MAX_SAVE_ATTEMPTS) {
						// eslint-disable-next-line no-console
						console.error(
							`Play-history save failed after ${MAX_SAVE_ATTEMPTS} attempts (last status: ${response.status} ${response.statusText})`
						);
					}
					// Schedule the retry after an exponential backoff so a
					// struggling server gets breathing room. Clear any
					// pending timer first to avoid stacking retries from
					// rapid re-fires.
					if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
					const backoff = Math.min(
						RETRY_BACKOFF_BASE_MS * 2 ** (attemptsRef.current - 1),
						RETRY_BACKOFF_MAX_MS
					);
					retryTimerRef.current = setTimeout(() => {
						retryTimerRef.current = null;
						bumpRetry();
					}, backoff);
				}
			}
		} catch (error) {
			// Network error (or AbortSignal.timeout): the request may or may
			// not have reached the server. If it did, the play-history row and
			// rating update were already committed (the API has no idempotency
			// key). Retrying would insert a duplicate row and apply a second
			// rating change. Keep savedRef=true so we don't retry, and log
			// the failure.
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console
				console.warn('Error saving play history:', error);
			}
			// eslint-disable-next-line no-console
			console.error(
				'Play-history save failed (network error); not retrying to avoid duplicate records'
			);
		}
	}, [
		enabled,
		isAuthenticated,
		aiPlayer,
		gameStatus,
		aiConfig.provider,
		aiConfig.model,
		gameVariant,
		getWinnerColor,
		debugVariantKey,
		bumpRetry,
	]); // retryTimerRef is a ref (stable identity), not listed

	useEffect(() => {
		// `retryTrigger` is included in the dep array so a failed save
		// (which increments it) re-triggers this effect. The retryTrigger <
		// MAX_SAVE_ATTEMPTS guard stops retries once the bound is reached.
		if (
			enabled &&
			isGameOverStatus(gameStatus) &&
			!savedRef.current &&
			retryTrigger < MAX_SAVE_ATTEMPTS
		) {
			void savePlayHistory();
		}
	}, [enabled, gameStatus, savePlayHistory, retryTrigger]);

	// Clear any pending retry timer when the component unmounts so a
	// stale backoff doesn't fire after the hook is gone.
	useEffect(() => {
		return () => {
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (gameStatus === 'playing' && moveCount === 0) {
			savedRef.current = false;
			attemptsRef.current = 0;
			saveSnapshotRef.current = null;
			// Bump the game generation so any in-flight savePlayHistory from
			// the previous game detects it is stale (gen mismatch) and skips
			// its 5xx retry path — otherwise it would clobber this reset.
			gameGenerationRef.current += 1;
			// Clear any pending retry timer from the previous game so it
			// doesn't fire and bump the trigger for the new game.
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
			// Reset the retry trigger when a new game starts so a fresh
			// game gets a full retry budget.
			setRetryTrigger(0);
		}
	}, [gameStatus, moveCount]);
}
