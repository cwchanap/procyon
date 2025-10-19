export type GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';

export interface GamePosition {
    row: number;
    col: number;
}

export interface GamePiece {
    type: string;
    color: string;
    [key: string]: any; // Allow for game-specific properties
}

export interface GameMove {
    from: GamePosition | null; // null for drop moves in shogi
    to: GamePosition;
    piece: GamePiece;
    capturedPiece?: GamePiece;
    [key: string]: any; // Allow for game-specific properties
}

export type GameStatus =
    | 'playing'
    | 'check'
    | 'checkmate'
    | 'stalemate'
    | 'draw';

export interface BaseGameState {
    board: (GamePiece | null)[][];
    currentPlayer: string;
    status: GameStatus;
    moveHistory: GameMove[];
    selectedSquare: GamePosition | null;
    possibleMoves: GamePosition[];
    [key: string]: any; // Allow for game-specific properties
}

export interface GameVariantConfig {
    boardSize: { rows: number; cols: number };
    files: string[];
    ranks: string[];
    pieceSymbols: Record<string, Record<string, string>>;
    players: string[];
    initialPlayer: string;
}

export const GAME_CONFIGS: Record<GameVariant, GameVariantConfig> = {
    chess: {
        boardSize: { rows: 8, cols: 8 },
        files: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        ranks: ['8', '7', '6', '5', '4', '3', '2', '1'],
        pieceSymbols: {
            white: {
                king: '♔',
                queen: '♕',
                rook: '♖',
                bishop: '♗',
                knight: '♘',
                pawn: '♙',
            },
            black: {
                king: '♚',
                queen: '♛',
                rook: '♜',
                bishop: '♝',
                knight: '♞',
                pawn: '♟',
            },
        },
        players: ['white', 'black'],
        initialPlayer: 'white',
    },
    xiangqi: {
        boardSize: { rows: 10, cols: 9 },
        files: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
        ranks: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
        pieceSymbols: {
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
        },
        players: ['red', 'black'],
        initialPlayer: 'red',
    },
    shogi: {
        boardSize: { rows: 9, cols: 9 },
        files: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
        ranks: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
        pieceSymbols: {
            sente: {
                king: '玉',
                rook: '飛',
                bishop: '角',
                gold: '金',
                silver: '銀',
                knight: '桂',
                lance: '香',
                pawn: '歩',
                dragon: '龍',
                horse: '馬',
                promoted_silver: '成銀',
                promoted_knight: '成桂',
                promoted_lance: '成香',
                promoted_pawn: 'と',
            },
            gote: {
                king: '王',
                rook: '飛',
                bishop: '角',
                gold: '金',
                silver: '銀',
                knight: '桂',
                lance: '香',
                pawn: '歩',
                dragon: '龍',
                horse: '馬',
                promoted_silver: '成銀',
                promoted_knight: '成桂',
                promoted_lance: '成香',
                promoted_pawn: 'と',
            },
        },
        players: ['sente', 'gote'],
        initialPlayer: 'sente',
    },
    jungle: {
        boardSize: { rows: 9, cols: 7 },
        files: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        ranks: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
        pieceSymbols: {
            red: {
                elephant: '象',
                lion: '獅',
                tiger: '虎',
                leopard: '豹',
                dog: '狗',
                wolf: '狼',
                cat: '貓',
                rat: '鼠',
            },
            blue: {
                elephant: '象',
                lion: '獅',
                tiger: '虎',
                leopard: '豹',
                dog: '狗',
                wolf: '狼',
                cat: '貓',
                rat: '鼠',
            },
        },
        players: ['red', 'blue'],
        initialPlayer: 'red',
    },
};
