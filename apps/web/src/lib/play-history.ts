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
	rulePreset: AeroplaneConfig['rulePreset'];
	victoryTarget: AeroplaneConfig['victoryTarget'];
	diceMode: AeroplaneConfig['diceMode'];
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
