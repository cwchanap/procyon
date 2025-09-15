export type XiangqiPieceType =
    | 'king' // 将/帅 (General)
    | 'advisor' // 士/仕 (Advisor/Guard)
    | 'elephant' // 象/相 (Elephant/Bishop)
    | 'horse' // 马 (Horse/Knight)
    | 'chariot' // 车 (Chariot/Rook)
    | 'cannon' // 炮 (Cannon)
    | 'soldier'; // 兵/卒 (Soldier/Pawn)

export type XiangqiPieceColor = 'red' | 'black';

export interface XiangqiPiece {
    type: XiangqiPieceType;
    color: XiangqiPieceColor;
    hasCrossedRiver?: boolean; // For soldiers that have crossed the river
}

export interface XiangqiPosition {
    row: number; // 0-9 (10 rows)
    col: number; // 0-8 (9 columns)
}

export interface XiangqiMove {
    from: XiangqiPosition;
    to: XiangqiPosition;
    piece: XiangqiPiece;
    capturedPiece?: XiangqiPiece;
}

export type XiangqiGameStatus =
    | 'playing'
    | 'check'
    | 'checkmate'
    | 'stalemate'
    | 'draw';

export interface XiangqiGameState {
    board: (XiangqiPiece | null)[][];
    currentPlayer: XiangqiPieceColor;
    status: XiangqiGameStatus;
    moveHistory: XiangqiMove[];
    selectedSquare: XiangqiPosition | null;
    possibleMoves: XiangqiPosition[];
}

// Constants for Xiangqi
export const XIANGQI_ROWS = 10;
export const XIANGQI_COLS = 9;

// Palace positions (3x3 area where king and advisors can move)
export const PALACE_ROWS = {
    RED: [7, 8, 9],
    BLACK: [0, 1, 2],
};
export const PALACE_COLS = [3, 4, 5];

// River position (between rows 4 and 5)
export const RIVER_ROW = 4.5;

// Piece symbols for display
export const XIANGQI_SYMBOLS = {
    red: {
        king: '帅',
        advisor: '仕',
        elephant: '相',
        horse: '马',
        chariot: '车',
        cannon: '炮',
        soldier: '兵',
    },
    black: {
        king: '将',
        advisor: '士',
        elephant: '象',
        horse: '马',
        chariot: '车',
        cannon: '炮',
        soldier: '卒',
    },
};

// Board coordinates for display
export const XIANGQI_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
export const XIANGQI_RANKS = [
    '10',
    '9',
    '8',
    '7',
    '6',
    '5',
    '4',
    '3',
    '2',
    '1',
];
