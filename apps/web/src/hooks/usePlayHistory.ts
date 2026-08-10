import { useCallback } from 'react';
import {
	resolveOpponentLlmId,
	type OpponentLlmId,
	type OpponentEngineId,
} from '../lib/ai/opponent';
import type { AIConfig } from '../lib/ai/types';
import type { GameVariant, GameStatus } from '../lib/ai/game-variant-types';
import { useTerminalHistorySave } from './useTerminalHistorySave';

type UsePlayHistoryBaseOptions = {
	gameVariant: GameVariant;
	gameStatus: GameStatus;
	/**
	 * The non-human player's color (LLM or engine). Mandatory — the hook guards
	 * `if (!aiPlayer) return`, so an engine caller passing null silently gets
	 * no save. (The name is historical; engine games pass the engine's color.)
	 */
	aiPlayer: string | null | undefined;
	/**
	 * Kept in the public options for existing callers. Terminal save policy is
	 * owned by `useTerminalHistorySave` and does not depend on move counts.
	 */
	moveCount: number;
	getWinnerColor: () => string;
	/**
	 * True only while a saveable game is in progress. Set by the caller for
	 * both AI and engine modes — this hook must not assume LLM-only.
	 */
	enabled: boolean;
	/**
	 * Authenticated state from the caller's `useAuth()` snapshot. Passed from
	 * the game component so the hook shares the same auth state that allowed
	 * the game to start, rather than making an independent `useAuth()` call
	 * whose `fetchSession()` can transiently fail and permanently suppress the
	 * terminal save.
	 */
	isAuthenticated: boolean;
	/**
	 * The authenticated user's id from the caller's `useAuth()` snapshot
	 * (`user?.id`). The shared save policy freezes it with the first payload so
	 * a 401 retry can detect an account switch.
	 */
	userId: string | null | undefined;
	/** When set, bumps window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. */
	debugVariantKey?: string;
};

/**
 * LLM games pass `aiConfig` (and may omit `opponentDescriptor`). Engine games
 * pass `opponentDescriptor: { kind: 'engine', ... }` and omit `aiConfig`.
 */
export type UsePlayHistoryOptions = UsePlayHistoryBaseOptions &
	(
		| {
				opponentDescriptor?: { kind: 'llm'; id: OpponentLlmId };
				aiConfig: AIConfig;
		  }
		| {
				opponentDescriptor: { kind: 'engine'; id: OpponentEngineId };
				aiConfig?: AIConfig;
		  }
	);

function isGameOverStatus(status: GameStatus): boolean {
	return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

/**
 * Derive the strategy-specific payload, then delegate terminal save/retry
 * policy to the shared hook. The payload callback is only evaluated for the
 * first attempt; the shared hook freezes its result for 401 retries.
 */
export function usePlayHistory(options: UsePlayHistoryOptions): void {
	const {
		gameVariant,
		gameStatus,
		aiPlayer,
		aiConfig,
		opponentDescriptor,
		getWinnerColor,
		enabled,
		isAuthenticated,
		userId,
		debugVariantKey,
	} = options;

	const isTerminal = isGameOverStatus(gameStatus);
	const buildPayload = useCallback(() => {
		if (!aiPlayer || !isTerminal) return null;

		const result: 'win' | 'loss' | 'draw' =
			gameStatus === 'draw' || gameStatus === 'stalemate'
				? 'draw'
				: getWinnerColor() === aiPlayer
					? 'loss'
					: 'win';
		const base = {
			gameId: gameVariant,
			status: result,
			date: new Date().toISOString(),
		};

		if (opponentDescriptor?.kind === 'engine') {
			return {
				...base,
				opponentEngineId: opponentDescriptor.id,
			};
		}

		// The union guarantees aiConfig for LLM call sites, but the
		// destructured options shape cannot preserve that correlation here.
		if (!aiConfig) {
			if (import.meta.env.DEV) {
				// eslint-disable-next-line no-console
				console.error(
					'[usePlayHistory] LLM save attempted without aiConfig; skipping.'
				);
			}
			return null;
		}

		return {
			...base,
			opponentLlmId: resolveOpponentLlmId(aiConfig.provider, aiConfig.model),
		};
	}, [
		aiConfig?.model,
		aiConfig?.provider,
		aiPlayer,
		gameStatus,
		gameVariant,
		getWinnerColor,
		isTerminal,
		opponentDescriptor?.id,
		opponentDescriptor?.kind,
	]);

	useTerminalHistorySave({
		// Preserve the strategy hook's historical `!aiPlayer` guard: a player
		// color that becomes available after terminal state should still allow a
		// later save attempt rather than being treated as a completed save.
		enabled: enabled && Boolean(aiPlayer),
		isTerminal,
		isAuthenticated,
		userId,
		buildPayload,
		debugKey: debugVariantKey,
	});
}
