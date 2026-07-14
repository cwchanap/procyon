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
	/**
	 * The authenticated user's id from the caller's `useAuth()` snapshot
	 * (`user?.id`). Captured into the save snapshot on the first attempt so
	 * that a 401-retry can detect an account switch: if the user id changed
	 * between the original save and the retry (e.g. account A's cookie
	 * expired, user logged in as B before the retry timer fired), the retry
	 * is abandoned — sending A's frozen result with B's cookie would record
	 * A's game under B's history and rating. `null`/`undefined` covers the
	 * DEV-mode unauthenticated case (the snapshot stores `null` and a
	 * subsequent login to a real user id abandons the DEV save).
	 */
	userId: string | null | undefined;
	/** When set, bumps window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. */
	debugVariantKey?: string;
}

function isGameOverStatus(status: GameStatus): boolean {
	return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

/**
 * Timeout for the play-history POST request. Prevents the fetch from hanging
 * indefinitely on a stalled connection — the resulting AbortError falls into
 * the catch block and is treated as a network error (no retry, to avoid
 * duplicate records).
 */
const SAVE_TIMEOUT_MS = 10_000;

/**
 * Maximum number of delayed retries after a 401 response. A 401 means the
 * session cookie expired while the game was in progress. The client's
 * `isAuthenticated` may still be true (it doesn't periodically re-verify
 * the session), so clearing `savedRef` alone doesn't trigger a re-render
 * or effect re-run. We schedule a bounded number of delayed retries to
 * give the user time to reauthenticate; if the session is still invalid
 * after all retries, the save is abandoned.
 */
const MAX_401_RETRIES = 3;
const RETRY_401_DELAY_MS = 5_000;

/**
 * Auto-saves a play-history record when an AI game ends. Single source of
 * truth for all four game variants. Save guards: enabled (AI game in
 * progress), authenticated-or-DEV, game over, not already saved.
 *
 * The POST /play-history endpoint is non-idempotent: it inserts a new
 * play_history row and applies a rating update in a single transaction,
 * with no idempotency key or deduplication. A 5xx response does NOT
 * guarantee the transaction was not committed (the server may have
 * committed before the error occurred, or an upstream proxy may return
 * 5xx after a successful commit). Retrying on 5xx would therefore risk
 * inserting a duplicate history row and applying a second rating change.
 * The same risk applies to network errors — the request may have reached
 * the server and been committed before the connection dropped. For both
 * 5xx and network errors we keep savedRef=true and do NOT retry.
 *
 * The only retry path is 401 (auth expiry): savedRef is cleared so the
 * save re-fires when `isAuthenticated` changes (the user reauthenticates).
 * This retry is safe because a 401 is returned before the transaction
 * runs (auth middleware rejects before the route handler).
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
	userId,
	debugVariantKey,
}: UsePlayHistoryOptions): void {
	const savedRef = useRef(false);
	// Monotonic generation token for the current game instance. Incremented
	// when a new game starts (reset effect) so that a 401 response from a
	// prior game's in-flight fetch can detect it is stale and skip clearing
	// savedRef — otherwise it would clobber the new game's savedRef (set
	// back to false), and the next auth dep change would fire a save for a
	// game that already ended.
	const gameGenerationRef = useRef(0);
	// Snapshot of the terminal save data, captured on the first save
	// attempt and reused across 401 auth-recovery retries so that changes
	// to aiPlayer, provider, or model after game-over don't corrupt the
	// record (e.g. recording the opposite win/loss or a different
	// opponentLlmId). Cleared in the reset effect when a new game starts.
	const saveSnapshotRef = useRef<{
		result: 'win' | 'loss' | 'draw';
		opponentLlmId: string;
		gameVariant: GameVariant;
		userId: string | null | undefined;
	} | null>(null);

	// State-based retry trigger for 401 auth-expiry recovery. Incrementing
	// this causes a re-render and effect re-run, which retries the save.
	// Without this, clearing savedRef on 401 is a no-op when
	// isAuthenticated stays true (no dep change → no effect re-run).
	const [retryTrigger, setRetryTrigger] = useState(0);
	const retry401CountRef = useRef(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const savePlayHistory = useCallback(async () => {
		if (!enabled || savedRef.current) return;
		// Enforce the 401 retry budget at save entry, not just at timer
		// scheduling. Without this, a provider/model dep change after the
		// budget is exhausted (savedRef is false, no timer scheduled) would
		// rerun the effect and fire an unbounded stream of POSTs — one per
		// dep change — bypassing MAX_401_RETRIES entirely.
		if (retry401CountRef.current > MAX_401_RETRIES) return;
		if (!(isAuthenticated || import.meta.env.DEV)) return;
		if (!aiPlayer) return;
		if (!isGameOverStatus(gameStatus)) return;

		// Capture the current game generation so that if a reset (new game)
		// happens while the fetch below is in flight, the 401 retry path can
		// detect it is stale and bail out without clobbering the new game's
		// savedRef.
		const gen = gameGenerationRef.current;

		// Use the snapshotted save data if this is a 401 auth-recovery retry
		// (the snapshot was captured on the first attempt). Otherwise compute
		// and snapshot it so that a subsequent 401 retry uses the frozen
		// values even if aiPlayer/provider/model changed after game-over.
		// Capture whether this is the first attempt before the snapshot
		// block sets saveSnapshotRef.current — used below to bump the
		// debug save counter only once per terminal game, even when 401
		// auth-recovery re-enters this function.
		const isFirstAttempt = saveSnapshotRef.current === null;
		// Account-switch guard: if this is a 401 auth-recovery retry and the
		// authenticated user id has changed since the snapshot was captured
		// (account A's cookie expired, user logged in as B before the retry
		// timer fired), abandon the save. Sending A's frozen result with B's
		// cookie would record A's game under B's history and rating. Set
		// savedRef=true so the effect doesn't keep re-firing on subsequent
		// dep changes while the user remains B — consistent with the 5xx /
		// network-error philosophy of keeping savedRef=true for non-retryable
		// conditions. A's game is lost in this edge case, but A's session was
		// already expired and the user explicitly switched accounts.
		if (saveSnapshotRef.current && saveSnapshotRef.current.userId !== userId) {
			savedRef.current = true;
			return;
		}
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
			saveSnapshotRef.current = {
				result,
				opponentLlmId,
				gameVariant,
				userId,
			};
		}

		savedRef.current = true;

		if (isFirstAttempt && debugVariantKey && typeof window !== 'undefined') {
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
				// 4xx errors (bad request, forbidden, etc.) are non-transient —
				// retrying sends the same rejected request again. Keep
				// savedRef=true (the optimistic set above) so the effect
				// doesn't re-trigger.
				// Exception: 401 (auth expiry). If the session cookie expired
				// as the game ended, the user may reauthenticate while the
				// terminal game is still mounted. When isAuthenticated
				// changes, the effect reruns — but if savedRef is still true,
				// the guard suppresses the retry and no history/rating row is
				// recorded. Clear savedRef for 401 so the save fires again
				// after auth recovery. A 401 is returned by authMiddleware
				// before the route handler runs, so no transaction was
				// committed and the retry is safe (no duplicate risk).
				if (response.status === 401) {
					// If a new game started while this fetch was in flight,
					// don't touch savedRef — it now belongs to the new game.
					if (gen !== gameGenerationRef.current) return;
					savedRef.current = false;
					// Count this 401 response toward the retry budget. The
					// budget is enforced at save entry (above) so that dep
					// changes (provider/model) after exhaustion can't bypass
					// it. Increment here — after the response, before the
					// scheduling decision — so the guard at entry sees the
					// total 401s received, not just timers scheduled.
					retry401CountRef.current++;
					// Schedule a delayed retry. Clearing savedRef alone
					// doesn't cause a re-render or effect re-run when
					// isAuthenticated stays true (the client doesn't know
					// the cookie expired). The state bump forces a re-render,
					// and retryTrigger in the effect deps re-fires the save.
					// Bounded by MAX_401_RETRIES to avoid hammering the
					// server if the session is truly expired.
					if (retry401CountRef.current <= MAX_401_RETRIES) {
						// Cancel any pending retry timer before scheduling a
						// new one. Without this, a dep-change-triggered save
						// that also gets 401 would overwrite the timer handle,
						// orphaning the previous timer — it would still fire
						// and cause an extra retry beyond the budget.
						if (retryTimerRef.current) {
							clearTimeout(retryTimerRef.current);
							retryTimerRef.current = null;
						}
						retryTimerRef.current = setTimeout(() => {
							if (gen === gameGenerationRef.current) {
								setRetryTrigger(c => c + 1);
							}
						}, RETRY_401_DELAY_MS);
					}
				}
				// 5xx (transient server errors): the transaction may have
				// been committed before the error was returned (the API has
				// no idempotency key). Retrying would insert a duplicate
				// history row and apply a second rating change. Keep
				// savedRef=true so we don't retry — same rationale as the
				// network-error catch block below.
				// eslint-disable-next-line no-console
				console.error(
					`Play-history save rejected (${response.status} ${response.statusText}); not retrying to avoid duplicate records`
				);
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
		userId,
		aiPlayer,
		gameStatus,
		aiConfig.provider,
		aiConfig.model,
		gameVariant,
		getWinnerColor,
		debugVariantKey,
	]);

	useEffect(() => {
		if (enabled && isGameOverStatus(gameStatus) && !savedRef.current) {
			void savePlayHistory();
		}
	}, [enabled, gameStatus, savePlayHistory, retryTrigger]);

	useEffect(() => {
		if (gameStatus === 'playing' && moveCount === 0) {
			savedRef.current = false;
			saveSnapshotRef.current = null;
			retry401CountRef.current = 0;
			// Bump the game generation so any in-flight savePlayHistory from
			// the previous game detects it is stale (gen mismatch) and skips
			// its 401 retry path — otherwise it would clobber this reset.
			gameGenerationRef.current += 1;
		}
	}, [gameStatus, moveCount]);

	// Clear any pending 401 retry timer on unmount to prevent a setState
	// call after the component is gone.
	useEffect(() => {
		return () => {
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, []);
}
