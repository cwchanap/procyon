import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import type { AIConfig } from '../lib/ai/types';
import type { GameVariant, GameStatus } from '../lib/ai/game-variant-types';

const env = {
	PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL || 'http://localhost:3501',
};

export interface UsePlayHistoryOptions {
	gameVariant: GameVariant;
	gameStatus: GameStatus;
	aiPlayer: string | null | undefined;
	aiConfig: AIConfig;
	moveCount: number;
	currentPlayer: string;
	getWinnerColor: () => string | null;
}

export interface UsePlayHistoryReturn {
	savePlayHistory: () => Promise<void>;
}

/**
 * Custom hook for saving play history to the API.
 * Automatically saves when a game ends (checkmate, stalemate, or draw).
 */
export function usePlayHistory({
	gameVariant,
	gameStatus,
	aiPlayer,
	aiConfig,
	moveCount,
	getWinnerColor,
}: UsePlayHistoryOptions): UsePlayHistoryReturn {
	const { isAuthenticated, getAuthHeaders } = useAuth();
	const savedRef = useRef(false);

	const savePlayHistory = useCallback(async () => {
		if (
			!isAuthenticated ||
			!aiPlayer ||
			!aiConfig.enabled ||
			savedRef.current
		) {
			return;
		}

		const isGameOver =
			gameStatus === 'checkmate' ||
			gameStatus === 'stalemate' ||
			gameStatus === 'draw';

		if (!isGameOver) {
			return;
		}

		savedRef.current = true;

		const winnerColor = getWinnerColor();
		let result: 'win' | 'loss' | 'draw';

		if (gameStatus === 'draw' || gameStatus === 'stalemate') {
			result = 'draw';
		} else if (winnerColor === aiPlayer) {
			result = 'loss'; // AI won, player lost
		} else {
			result = 'win'; // Player won
		}

		try {
			const authHeaders = await getAuthHeaders();
			const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...authHeaders,
				},
				body: JSON.stringify({
					gameVariant,
					aiProvider: aiConfig.provider,
					aiModel: aiConfig.model,
					result,
					moveCount,
				}),
			});

			if (!response.ok) {
				// eslint-disable-next-line no-console
				console.error('Failed to save play history:', response.statusText);
			}
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error('Error saving play history:', error);
		}
	}, [
		isAuthenticated,
		aiPlayer,
		aiConfig,
		gameStatus,
		gameVariant,
		moveCount,
		getWinnerColor,
		getAuthHeaders,
	]);

	// Auto-save when game ends
	useEffect(() => {
		const isGameOver =
			gameStatus === 'checkmate' ||
			gameStatus === 'stalemate' ||
			gameStatus === 'draw';

		if (isGameOver && !savedRef.current) {
			savePlayHistory();
		}
	}, [gameStatus, savePlayHistory]);

	// Reset saved flag when starting a new game
	useEffect(() => {
		if (gameStatus === 'playing' && moveCount === 0) {
			savedRef.current = false;
		}
	}, [gameStatus, moveCount]);

	return { savePlayHistory };
}
