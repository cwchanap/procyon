export type ShogiPieceType =
	| 'king'
	| 'rook'
	| 'bishop'
	| 'gold'
	| 'silver'
	| 'knight'
	| 'lance'
	| 'pawn'
	| 'dragon'      // Promoted rook
	| 'horse'       // Promoted bishop
	| 'promoted_silver'
	| 'promoted_knight'
	| 'promoted_lance'
	| 'promoted_pawn';

export type ShogiPieceColor = 'sente' | 'gote';

export interface ShogiPiece {
	type: ShogiPieceType;
	color: ShogiPieceColor;
	isPromoted?: boolean;
}

export interface ShogiPosition {
	row: number;
	col: number;
}

export interface ShogiMove {
	from: ShogiPosition | null; // null for drop moves
	to: ShogiPosition;
	piece: ShogiPiece;
	capturedPiece?: ShogiPiece;
	isPromotion?: boolean;
	isDrop?: boolean;
}

export type ShogiGameStatus = 'playing' | 'check' | 'checkmate' | 'draw';

export interface ShogiGameState {
	board: (ShogiPiece | null)[][];
	currentPlayer: ShogiPieceColor;
	status: ShogiGameStatus;
	moveHistory: ShogiMove[];
	selectedSquare: ShogiPosition | null;
	possibleMoves: ShogiPosition[];
	senteHand: ShogiPiece[];
	goteHand: ShogiPiece[];
	selectedHandPiece: ShogiPiece | null;
}

export const SHOGI_BOARD_SIZE = 9;
export const SHOGI_FILES = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
export const SHOGI_RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

export const PIECE_UNICODE: Record<
	ShogiPieceType,
	{ sente: string; gote: string }
> = {
	king: { sente: '玉', gote: '王' },
	rook: { sente: '飛', gote: '飛' },
	bishop: { sente: '角', gote: '角' },
	gold: { sente: '金', gote: '金' },
	silver: { sente: '銀', gote: '銀' },
	knight: { sente: '桂', gote: '桂' },
	lance: { sente: '香', gote: '香' },
	pawn: { sente: '歩', gote: '歩' },
	dragon: { sente: '龍', gote: '龍' },
	horse: { sente: '馬', gote: '馬' },
	promoted_silver: { sente: '成銀', gote: '成銀' },
	promoted_knight: { sente: '成桂', gote: '成桂' },
	promoted_lance: { sente: '成香', gote: '成香' },
	promoted_pawn: { sente: 'と', gote: 'と' },
};

export const PROMOTABLE_PIECES: ShogiPieceType[] = [
	'pawn',
	'lance',
	'knight',
	'silver',
	'bishop',
	'rook',
];

export const PROMOTION_MAP: Record<ShogiPieceType, ShogiPieceType> = {
	pawn: 'promoted_pawn',
	lance: 'promoted_lance',
	knight: 'promoted_knight',
	silver: 'promoted_silver',
	bishop: 'horse',
	rook: 'dragon',
	// These don't promote further
	gold: 'gold',
	king: 'king',
	dragon: 'dragon',
	horse: 'horse',
	promoted_silver: 'promoted_silver',
	promoted_knight: 'promoted_knight',
	promoted_lance: 'promoted_lance',
	promoted_pawn: 'promoted_pawn',
};
