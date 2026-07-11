import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '../lib/auth';
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
	debugVariantKey,
}: UsePlayHistoryOptions): void {
	const { isAuthenticated } = useAuth();
	const savedRef = useRef(false);
	// Tracks the number of save attempts for the current game so we can
	// log a prod-visible error when retries are exhausted.
	const attemptsRef = useRef(0);
	// State-based retry trigger: incremented when a save attempt fails so the
	// auto-save effect re-runs (its deps include `retryTrigger`). Bounded by
	// MAX_SAVE_ATTEMPTS to prevent infinite retry loops.
	const [retryTrigger, setRetryTrigger] = useState(0);

	const savePlayHistory = useCallback(async () => {
		if (!enabled || savedRef.current) return;
		if (!(isAuthenticated || import.meta.env.DEV)) return;
		if (!aiPlayer) return;
		if (!isGameOverStatus(gameStatus)) return;

		let result: 'win' | 'loss' | 'draw';
		if (gameStatus === 'draw' || gameStatus === 'stalemate') {
			result = 'draw';
		} else {
			const winnerColor = getWinnerColor();
			result = winnerColor === aiPlayer ? 'loss' : 'win';
		}

		savedRef.current = true;

		if (debugVariantKey && typeof window !== 'undefined') {
			const w = window as unknown as Record<string, number | undefined>;
			const key = `__PROCYON_DEBUG_${debugVariantKey}_SAVE_COUNT__`;
			w[key] = (w[key] ?? 0) + 1;
		}

		// Bump the retry trigger so the auto-save effect re-runs,
		// up to the bounded retry count.
		const bumpRetry = () =>
			setRetryTrigger(c => (c < MAX_SAVE_ATTEMPTS ? c + 1 : c));

		try {
			const opponentLlmId = resolveOpponentLlmId(
				aiConfig.provider,
				aiConfig.model
			);
			const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					chessId: gameVariant,
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
				savedRef.current = false;
				attemptsRef.current += 1;
				if (attemptsRef.current >= MAX_SAVE_ATTEMPTS) {
					// eslint-disable-next-line no-console
					console.error(
						`Play-history save failed after ${MAX_SAVE_ATTEMPTS} attempts (last status: ${response.status} ${response.statusText})`
					);
				}
				bumpRetry();
			}
		} catch (error) {
			savedRef.current = false;
			// eslint-disable-next-line no-console
			console.error('Error saving play history:', error);
			bumpRetry();
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
	]);

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

	useEffect(() => {
		if (gameStatus === 'playing' && moveCount === 0) {
			savedRef.current = false;
			attemptsRef.current = 0;
			// Reset the retry trigger when a new game starts so a fresh
			// game gets a full retry budget.
			setRetryTrigger(0);
		}
	}, [gameStatus, moveCount]);
}
