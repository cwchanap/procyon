import {
	bindBoard,
	type CoordinateScheme,
	notationToPos as sharedNotationToPos,
	posToNotation as sharedPosToNotation,
	tryNotationToPos as sharedTryNotationToPos,
} from '@procyon/game-core';
import type { ChessPiece, PieceType, Position } from './types';
import { BOARD_SIZE } from './types';

export { copyBoard } from '@procyon/game-core';

export const CHESS_SCHEME: CoordinateScheme = {
	files: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
	ranks: ['8', '7', '6', '5', '4', '3', '2', '1'],
};

const bound = bindBoard<ChessPiece>({
	rows: BOARD_SIZE,
	cols: BOARD_SIZE,
});
export const isValidPosition = bound.isValidPosition;
export const getPieceAt = bound.getPieceAt;
export const setPieceAt = bound.setPieceAt;
export const isSquareEmpty = bound.isSquareEmpty;
export const isSquareOccupiedByOpponent = bound.isSquareOccupiedByOpponent;
export const isSquareOccupiedByAlly = bound.isSquareOccupiedByAlly;

export function getRow(
	board: (ChessPiece | null)[][],
	row: number
): (ChessPiece | null)[] {
	const r = board[row];
	if (!r) throw new Error(`Chess board row ${row} is missing`);
	return r;
}

export function createInitialBoard(): (ChessPiece | null)[][] {
	const board: (ChessPiece | null)[][] = Array(BOARD_SIZE)
		.fill(null)
		.map(() => Array(BOARD_SIZE).fill(null));

	// Place pawns
	for (let col = 0; col < BOARD_SIZE; col++) {
		getRow(board, 1)[col] = { type: 'pawn', color: 'black' };
		getRow(board, 6)[col] = { type: 'pawn', color: 'white' };
	}

	// Place other pieces
	const pieceOrder: PieceType[] = [
		'rook',
		'knight',
		'bishop',
		'queen',
		'king',
		'bishop',
		'knight',
		'rook',
	];

	for (let col = 0; col < BOARD_SIZE; col++) {
		getRow(board, 0)[col] = { type: pieceOrder[col]!, color: 'black' };
		getRow(board, 7)[col] = { type: pieceOrder[col]!, color: 'white' };
	}

	return board;
}

export function positionToAlgebraic(pos: Position): string {
	return sharedPosToNotation(CHESS_SCHEME, pos);
}

export function algebraicToPosition(algebraic: string): Position {
	return sharedNotationToPos(CHESS_SCHEME, algebraic);
}

export function tryAlgebraicToPosition(algebraic: string): Position | null {
	return sharedTryNotationToPos(CHESS_SCHEME, algebraic);
}
