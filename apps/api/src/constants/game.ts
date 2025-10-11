export enum ChessVariantId {
    Shogi = 'shogi',
    Xiangqi = 'xiangqi',
    Chess = 'chess',
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

export const ALL_CHESS_VARIANT_IDS = Object.values(ChessVariantId);
export const ALL_GAME_RESULT_STATUSES = Object.values(GameResultStatus);
export const ALL_OPPONENT_LLM_IDS = Object.values(OpponentLlmId);
