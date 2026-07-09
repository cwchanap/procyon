import { useEffect, useRef, useCallback } from 'react';
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
	getWinnerColor: () => string | null;
	/** True only while an AI game is in progress (gameMode === 'ai' && gameStarted). */
	enabled: boolean;
	/** When set, bumps window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. */
	debugVariantKey?: string;
}

export interface UsePlayHistoryReturn {
	savePlayHistory: () => Promise<void>;
}

function isGameOverStatus(status: GameStatus): boolean {
	return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

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
}: UsePlayHistoryOptions): UsePlayHistoryReturn {
	const { isAuthenticated } = useAuth();
	const savedRef = useRef(false);

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
			if (winnerColor === null) return;
			result = winnerColor === aiPlayer ? 'loss' : 'win';
		}

		savedRef.current = true;

		if (debugVariantKey && typeof window !== 'undefined') {
			const w = window as unknown as Record<string, number | undefined>;
			const key = `__PROCYON_DEBUG_${debugVariantKey}_SAVE_COUNT__`;
			w[key] = (w[key] ?? 0) + 1;
		}

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
				savedRef.current = false;
			}
		} catch (error) {
			savedRef.current = false;
			// eslint-disable-next-line no-console
			console.error('Error saving play history:', error);
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
		if (isGameOverStatus(gameStatus) && !savedRef.current) {
			void savePlayHistory();
		}
	}, [gameStatus, savePlayHistory]);

	useEffect(() => {
		if (gameStatus === 'playing' && moveCount === 0) {
			savedRef.current = false;
		}
	}, [gameStatus, moveCount]);

	return { savePlayHistory };
}
