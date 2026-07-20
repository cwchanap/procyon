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

export interface Move extends BaseMove<ChessPiece> {
	from: Position;
	to: Position;
	isEnPassant?: boolean;
	isCastling?: boolean;
	promotion?: PieceType;
}

export type GameMode = 'human-vs-human' | 'human-vs-ai';

export interface GameState extends BaseGameState<ChessPiece> {
	status: GameStatus;
	currentPlayer: PieceColor;
	moveHistory: Move[];
	mode: GameMode;
	aiPlayer?: PieceColor;
	isAiThinking?: boolean;
}

export const BOARD_SIZE = 8;
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
