import type { XiangqiPiece, XiangqiPosition, XiangqiPieceColor } from './types';
import {
	XIANGQI_ROWS,
	XIANGQI_COLS,
	PALACE_ROWS,
	PALACE_COLS,
	RIVER_ROW,
} from './types';

export function createInitialXiangqiBoard(): (XiangqiPiece | null)[][] {
	const board: (XiangqiPiece | null)[][] = Array(XIANGQI_ROWS)
		.fill(null)
		.map(() => Array(XIANGQI_COLS).fill(null));

	// Black pieces (top of board)
	// Chariots
	board[0][0] = { type: 'chariot', color: 'black' };
	board[0][8] = { type: 'chariot', color: 'black' };

	// Horses
	board[0][1] = { type: 'horse', color: 'black' };
	board[0][7] = { type: 'horse', color: 'black' };

	// Elephants
	board[0][2] = { type: 'elephant', color: 'black' };
	board[0][6] = { type: 'elephant', color: 'black' };

	// Advisors
	board[0][3] = { type: 'advisor', color: 'black' };
	board[0][5] = { type: 'advisor', color: 'black' };

	// King
	board[0][4] = { type: 'king', color: 'black' };

	// Cannons
	board[2][1] = { type: 'cannon', color: 'black' };
	board[2][7] = { type: 'cannon', color: 'black' };

	// Soldiers
	for (let col = 0; col < XIANGQI_COLS; col += 2) {
		board[3][col] = { type: 'soldier', color: 'black' };
	}

	// Red pieces (bottom of board)
	// Soldiers
	for (let col = 0; col < XIANGQI_COLS; col += 2) {
		board[6][col] = { type: 'soldier', color: 'red' };
	}

	// Cannons
	board[7][1] = { type: 'cannon', color: 'red' };
	board[7][7] = { type: 'cannon', color: 'red' };

	// Chariots
	board[9][0] = { type: 'chariot', color: 'red' };
	board[9][8] = { type: 'chariot', color: 'red' };

	// Horses
	board[9][1] = { type: 'horse', color: 'red' };
	board[9][7] = { type: 'horse', color: 'red' };

	// Elephants
	board[9][2] = { type: 'elephant', color: 'red' };
	board[9][6] = { type: 'elephant', color: 'red' };

	// Advisors
	board[9][3] = { type: 'advisor', color: 'red' };
	board[9][5] = { type: 'advisor', color: 'red' };

	// King
	board[9][4] = { type: 'king', color: 'red' };

	return board;
}

export function isValidPosition(pos: XiangqiPosition): boolean {
	return (
		pos.row >= 0 &&
		pos.row < XIANGQI_ROWS &&
		pos.col >= 0 &&
		pos.col < XIANGQI_COLS
	);
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

export function getPieceAt(
	board: (XiangqiPiece | null)[][],
	pos: XiangqiPosition
): XiangqiPiece | null {
	if (!isValidPosition(pos)) return null;
	return board[pos.row][pos.col];
}

export function setPieceAt(
	board: (XiangqiPiece | null)[][],
	pos: XiangqiPosition,
	piece: XiangqiPiece | null
): void {
	if (isValidPosition(pos)) {
		board[pos.row][pos.col] = piece;
	}
}

export function copyBoard(
	board: (XiangqiPiece | null)[][]
): (XiangqiPiece | null)[][] {
	return board.map(row => row.map(piece => (piece ? { ...piece } : null)));
}

export function findKing(
	board: (XiangqiPiece | null)[][],
	color: XiangqiPieceColor
): XiangqiPosition | null {
	for (let row = 0; row < XIANGQI_ROWS; row++) {
		for (let col = 0; col < XIANGQI_COLS; col++) {
			const piece = board[row][col];
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
	return files[pos.col] + ranks[pos.row];
}
