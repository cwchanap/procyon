import type {
	BaseGameState,
	BaseMove,
	GameStatus as SharedGameStatus,
	Position as GameCorePosition,
} from '@procyon/game-core';

export type Position = GameCorePosition;
export type GameStatus = SharedGameStatus;

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

export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';
export type ChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type ChessRank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type ChessSquare = `${ChessFile}${ChessRank}`;

export type ChessTerminationReason =
	| 'checkmate'
	| 'stalemate'
	| 'threefold-repetition'
	| 'fifty-move'
	| 'insufficient-material';

export interface PendingPromotion {
	from: Position;
	to: Position;
	color: PieceColor;
	choices: PromotionPiece[];
}

export interface ChessMoveRequest {
	from: ChessSquare;
	to: ChessSquare;
	promotion?: PromotionPiece;
}

export interface Move extends BaseMove<ChessPiece> {
	from: Position;
	to: Position;
	promotion?: PromotionPiece;
	isEnPassant?: boolean;
	isCastling?: boolean;
	san: string;
	lan: string;
	beforeFen: string;
	afterFen: string;
}

export type GameMode = 'human-vs-human' | 'human-vs-ai';

export interface GameState extends BaseGameState<ChessPiece> {
	status: GameStatus;
	currentPlayer: PieceColor;
	moveHistory: Move[];
	mode: GameMode;
	aiPlayer?: PieceColor;
	isAiThinking?: boolean;
	initialFen: string;
	fen: string;
	pendingPromotion: PendingPromotion | null;
	terminationReason: ChessTerminationReason | null;
}

export interface LegalChessMove {
	from: Position;
	to: Position;
	piece: ChessPiece;
	capturedPiece?: ChessPiece;
	promotion?: PromotionPiece;
	isEnPassant: boolean;
	isCastling: boolean;
	san: string;
	lan: string;
}

export type MoveRejectionReason =
	| 'terminal'
	| 'invalid-coordinate'
	| 'wrong-side'
	| 'illegal-move'
	| 'invalid-promotion'
	| 'state-inconsistent';

export interface AttackQuery {
	square: Position;
	attacker: PieceColor;
}

export interface AttackResult extends AttackQuery {
	attacked: boolean;
	attackers: Position[];
}

export type MoveAttempt =
	| { kind: 'applied'; state: GameState; move: Move }
	| {
			kind: 'promotion-required';
			from: Position;
			to: Position;
			color: PieceColor;
			choices: PromotionPiece[];
	  }
	| {
			kind: 'rejected';
			reason: MoveRejectionReason;
	  };

export const BOARD_SIZE = 8;
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
