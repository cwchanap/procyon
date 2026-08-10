export enum ChessVariantId {
	Shogi = 'shogi',
	Xiangqi = 'xiangqi',
	Chess = 'chess',
	Jungle = 'jungle',
}

/**
 * Strategy game identities accepted by the play-history API.
 *
 * Aeroplane is intentionally excluded until its API/rating support lands in
 * the follow-up task; the web navigation type may still include it.
 */
export enum GameId {
	Chess = 'chess',
	Xiangqi = 'xiangqi',
	Shogi = 'shogi',
	Jungle = 'jungle',
}

export function getRatedVariantId(gameId: GameId): ChessVariantId {
	switch (gameId) {
		case GameId.Chess:
			return ChessVariantId.Chess;
		case GameId.Xiangqi:
			return ChessVariantId.Xiangqi;
		case GameId.Shogi:
			return ChessVariantId.Shogi;
		case GameId.Jungle:
			return ChessVariantId.Jungle;
	}
}

export enum GameResultStatus {
	Win = 'win',
	Loss = 'loss',
	Draw = 'draw',
}

export enum OpponentLlmId {
	Gpt4o = 'gpt-4o',
	Gemini25Flash = 'gemini-2.5-flash',
}

export enum OpponentEngineId {
	Stockfish = 'stockfish',
}

export const ALL_CHESS_VARIANT_IDS = Object.values(ChessVariantId);
export const ALL_GAME_RESULT_STATUSES = Object.values(GameResultStatus);
export const ALL_OPPONENT_LLM_IDS = Object.values(OpponentLlmId);
export const ALL_OPPONENT_ENGINE_IDS = Object.values(OpponentEngineId);
