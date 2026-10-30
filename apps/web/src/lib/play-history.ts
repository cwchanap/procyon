import { env } from './env';
import type { GameId } from './game-id';
import type { OpponentEngineId, OpponentLlmId } from './ai/opponent';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	Personality,
} from './aeroplane/types';

/** Aeroplane-specific terminal-match details persisted to play history. */
export interface AeroplanePlayHistoryDetails {
	mode: AeroplaneConfig['mode'];
	/** Terminal four-colour balances; required for Sky Tycoon, absent for Standard. */
	coins?: Record<AeroplaneColor, number>;
	rulePreset: AeroplaneConfig['rulePreset'];
	victoryTarget: AeroplaneConfig['victoryTarget'];
	diceMode: AeroplaneConfig['diceMode'];
	launchRule: AeroplaneConfig['launchRule'];
	finishRule: AeroplaneConfig['finishRule'];
	stacking: AeroplaneConfig['stacking'];
	blockades: AeroplaneConfig['blockades'];
	chatter: AeroplaneConfig['chatter'];
	humanColor: AeroplaneColor;
	durationSeconds: number;
	planesFinished: number;
	capturesMade: number;
	capturesSuffered: number;
	aiPlayers: Array<{
		color: AeroplaneColor;
		personality: Personality;
	}>;
}

export interface SubmitPlayHistoryInput {
	gameId: GameId;
	status: 'win' | 'loss' | 'draw';
	date: string;
	opponentLlmId?: OpponentLlmId;
	opponentEngineId?: OpponentEngineId;
	details?: AeroplanePlayHistoryDetails;
}

/** Submit a play-history record; terminal save/retry policy belongs to the hook. */
export async function submitPlayHistory(
	input: SubmitPlayHistoryInput
): Promise<Response> {
	return fetch(`${env.PUBLIC_API_URL}/play-history`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		signal: AbortSignal.timeout(10_000),
		body: JSON.stringify(input),
	});
}

/** A stored play-history row as returned by the API. */
export interface ServerPlayHistory {
	id: number;
	gameId: GameId;
	date: string;
	status: 'win' | 'loss' | 'draw';
	opponentUserId: string | null;
	opponentLlmId: OpponentLlmId | null;
	opponentEngineId: OpponentEngineId | null;
	details: unknown;
	// Rating fields (populated after rating system was added)
	// Can be null when rating history doesn't exist (e.g., older games)
	ratingChange: number | null | undefined;
	newRating: number | null | undefined;
}

/** Credentialed play-history GET shared by the page and progression hooks. */
export async function fetchPlayHistory(
	signal?: AbortSignal
): Promise<ServerPlayHistory[]> {
	const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		signal,
	});
	if (!response.ok) {
		const data = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			data?.error || 'Unable to load your play history. Please try again.'
		);
	}
	const data = (await response.json()) as {
		playHistory: ServerPlayHistory[];
	};
	return Array.isArray(data.playHistory) ? data.playHistory : [];
}
