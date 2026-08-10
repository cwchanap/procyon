export enum ChessVariantId {
	Shogi = 'shogi',
	Xiangqi = 'xiangqi',
	Chess = 'chess',
	Jungle = 'jungle',
}

export enum GameId {
	Chess = 'chess',
	Xiangqi = 'xiangqi',
	Shogi = 'shogi',
	Jungle = 'jungle',
	Aeroplane = 'aeroplane',
}

export function getRatedVariantId(gameId: GameId): ChessVariantId | null {
	switch (gameId) {
		case GameId.Chess:
			return ChessVariantId.Chess;
		case GameId.Xiangqi:
			return ChessVariantId.Xiangqi;
		case GameId.Shogi:
			return ChessVariantId.Shogi;
		case GameId.Jungle:
			return ChessVariantId.Jungle;
		case GameId.Aeroplane:
			return null;
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
	AeroplaneTrioV1 = 'aeroplane-trio-v1',
}

export const ALL_CHESS_VARIANT_IDS = Object.values(ChessVariantId);
export const ALL_GAME_RESULT_STATUSES = Object.values(GameResultStatus);
export const ALL_OPPONENT_LLM_IDS = Object.values(OpponentLlmId);
export const ALL_OPPONENT_ENGINE_IDS = Object.values(OpponentEngineId);
