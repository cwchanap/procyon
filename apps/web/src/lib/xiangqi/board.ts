import { bindBoard } from '@procyon/game-core';
import type { XiangqiPiece, XiangqiPieceColor, XiangqiPosition } from './types';
import {
	XIANGQI_ROWS,
	XIANGQI_COLS,
	PALACE_ROWS,
	PALACE_COLS,
	RIVER_ROW,
} from './types';

export { copyBoard } from '@procyon/game-core';

const bound = bindBoard<XiangqiPiece>({
	rows: XIANGQI_ROWS,
	cols: XIANGQI_COLS,
});
export const isValidPosition = bound.isValidPosition;
export const getPieceAt = bound.getPieceAt;
export const setPieceAt = bound.setPieceAt;
export const isSquareEmpty = bound.isSquareEmpty;
export const isSquareOccupiedByOpponent = bound.isSquareOccupiedByOpponent;
export const isSquareOccupiedByAlly = bound.isSquareOccupiedByAlly;

export function getRow(
	board: (XiangqiPiece | null)[][],
	row: number
): (XiangqiPiece | null)[] {
	const r = board[row];
	if (!r) throw new Error(`Xiangqi board row ${row} is missing`);
	return r;
}

export function createInitialXiangqiBoard(): (XiangqiPiece | null)[][] {
	const board: (XiangqiPiece | null)[][] = Array(XIANGQI_ROWS)
		.fill(null)
		.map(() => Array(XIANGQI_COLS).fill(null));

	// Black pieces (top of board)
	// Chariots
	getRow(board, 0)[0] = { type: 'chariot', color: 'black' };
	getRow(board, 0)[8] = { type: 'chariot', color: 'black' };

	// Horses
	getRow(board, 0)[1] = { type: 'horse', color: 'black' };
	getRow(board, 0)[7] = { type: 'horse', color: 'black' };

	// Elephants
	getRow(board, 0)[2] = { type: 'elephant', color: 'black' };
	getRow(board, 0)[6] = { type: 'elephant', color: 'black' };

	// Advisors
	getRow(board, 0)[3] = { type: 'advisor', color: 'black' };
	getRow(board, 0)[5] = { type: 'advisor', color: 'black' };

	// King
	getRow(board, 0)[4] = { type: 'king', color: 'black' };

	// Cannons
	getRow(board, 2)[1] = { type: 'cannon', color: 'black' };
	getRow(board, 2)[7] = { type: 'cannon', color: 'black' };

	// Soldiers
	for (let col = 0; col < XIANGQI_COLS; col += 2) {
		getRow(board, 3)[col] = { type: 'soldier', color: 'black' };
	}

	// Red pieces (bottom of board)
	// Soldiers
	for (let col = 0; col < XIANGQI_COLS; col += 2) {
		getRow(board, 6)[col] = { type: 'soldier', color: 'red' };
	}

	// Cannons
	getRow(board, 7)[1] = { type: 'cannon', color: 'red' };
	getRow(board, 7)[7] = { type: 'cannon', color: 'red' };

	// Chariots
	getRow(board, 9)[0] = { type: 'chariot', color: 'red' };
	getRow(board, 9)[8] = { type: 'chariot', color: 'red' };

	// Horses
	getRow(board, 9)[1] = { type: 'horse', color: 'red' };
	getRow(board, 9)[7] = { type: 'horse', color: 'red' };

	// Elephants
	getRow(board, 9)[2] = { type: 'elephant', color: 'red' };
	getRow(board, 9)[6] = { type: 'elephant', color: 'red' };

	// Advisors
	getRow(board, 9)[3] = { type: 'advisor', color: 'red' };
	getRow(board, 9)[5] = { type: 'advisor', color: 'red' };

	// King
	getRow(board, 9)[4] = { type: 'king', color: 'red' };

	return board;
}

export function isInPalace(
	pos: XiangqiPosition,
	color: XiangqiPieceColor
): boolean {
	const palaceRows = color === 'red' ? PALACE_ROWS.RED : PALACE_ROWS.BLACK;
	return palaceRows.includes(pos.row) && PALACE_COLS.includes(pos.col);
}

export function isOnSameSideOfRiver(
	pos: XiangqiPosition,
	color: XiangqiPieceColor
): boolean {
	if (color === 'red') {
		return pos.row > RIVER_ROW;
	} else {
		return pos.row < RIVER_ROW;
	}
}

export function hasCrossedRiver(
	pos: XiangqiPosition,
	color: XiangqiPieceColor
): boolean {
	return !isOnSameSideOfRiver(pos, color);
}

export function findKing(
	board: (XiangqiPiece | null)[][],
	color: XiangqiPieceColor
): XiangqiPosition | null {
	for (let row = 0; row < XIANGQI_ROWS; row++) {
		for (let col = 0; col < XIANGQI_COLS; col++) {
			const piece = getRow(board, row)[col];
			if (piece && piece.type === 'king' && piece.color === color) {
				return { row, col };
			}
		}
	}
	return null;
}

export function getPositionString(pos: XiangqiPosition): string {
	const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
	const ranks = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
	return (files[pos.col] ?? '') + (ranks[pos.row] ?? '');
}
