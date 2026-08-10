import { env } from './env';
import type { GameId } from './game-id';
import type { OpponentEngineId, OpponentLlmId } from './ai/opponent';

export interface SubmitPlayHistoryInput {
	gameId: GameId;
	status: 'win' | 'loss' | 'draw';
	date: string;
	opponentLlmId?: OpponentLlmId;
	opponentEngineId?: OpponentEngineId;
	details?: unknown;
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
