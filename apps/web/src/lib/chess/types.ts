export type PieceType =
    | 'king'
    | 'queen'
    | 'rook'
    | 'bishop'
    | 'knight'
    | 'pawn';
export type PieceColor = 'white' | 'black';

export interface ChessPiece {
    type: PieceType;
    color: PieceColor;
    hasMoved?: boolean;
}

export interface Position {
    row: number;
    col: number;
}

export interface Move {
    from: Position;
    to: Position;
    piece: ChessPiece;
    capturedPiece?: ChessPiece;
    isEnPassant?: boolean;
    isCastling?: boolean;
    promotion?: PieceType;
}

export type GameStatus =
    | 'playing'
    | 'check'
    | 'checkmate'
    | 'stalemate'
    | 'draw';

export type GameMode = 'human-vs-human' | 'human-vs-ai';

export interface GameState {
    board: (ChessPiece | null)[][];
    currentPlayer: PieceColor;
    status: GameStatus;
    moveHistory: Move[];
    selectedSquare: Position | null;
    possibleMoves: Position[];
    mode: GameMode;
    aiPlayer?: PieceColor;
    isAiThinking?: boolean;
}

export const BOARD_SIZE = 8;
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
