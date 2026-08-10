export type OpponentLlmId = 'gpt-4o' | 'gemini-2.5-flash';

export type OpponentEngineId = 'stockfish' | 'aeroplane-trio-v1';

/**
 * The opponent a game was played against. The hook and history layer branch on
 * `kind`; only LLM games are rated.
 */
export type OpponentDescriptor =
	| { kind: 'llm'; id: OpponentLlmId }
	| { kind: 'engine'; id: OpponentEngineId };

/**
 * Bucket the active AI provider/model into one of the two tracked opponent
 * identifiers used by play-history / ratings. Any non-gpt-4o model (gemini,
 * anthropic, openrouter, chutes, …) is bucketed as 'gemini-2.5-flash'.
 */
export function resolveOpponentLlmId(
	provider: string,
	model: string
): OpponentLlmId {
	const providerModel = `${provider}/${model}`.toLowerCase();
	if (providerModel.includes('gpt-4o')) {
		return 'gpt-4o';
	}
	return 'gemini-2.5-flash';
}
