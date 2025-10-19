import type { XiangqiPiece, XiangqiPosition, XiangqiMove } from './types';
import { XIANGQI_ROWS, XIANGQI_COLS } from './types';
import {
	isValidPosition,
	isInPalace,
	isOnSameSideOfRiver,
	hasCrossedRiver,
	getPieceAt,
	copyBoard,
	findKing,
} from './board';

export function isValidMove(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	if (!isValidPosition(from) || !isValidPosition(to)) {
		return false;
	}

	const piece = getPieceAt(board, from);
	if (!piece) {
		return false;
	}

	const targetPiece = getPieceAt(board, to);
	if (targetPiece && targetPiece.color === piece.color) {
		return false;
	}

	return isValidPieceMove(board, piece, from, to);
}

function isValidPieceMove(
	board: (XiangqiPiece | null)[][],
	piece: XiangqiPiece,
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	switch (piece.type) {
		case 'king':
			return isValidKingMove(board, piece, from, to);
		case 'advisor':
			return isValidAdvisorMove(piece, from, to);
		case 'elephant':
			return isValidElephantMove(board, piece, from, to);
		case 'horse':
			return isValidHorseMove(board, from, to);
		case 'chariot':
			return isValidChariotMove(board, from, to);
		case 'cannon':
			return isValidCannonMove(board, from, to);
		case 'soldier':
			return isValidSoldierMove(piece, from, to);
		default:
			return false;
	}
}

function isValidKingMove(
	board: (XiangqiPiece | null)[][],
	piece: XiangqiPiece,
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	// King can only move within palace
	if (!isInPalace(to, piece.color)) return false;

	// King can only move one step orthogonally
	const rowDiff = Math.abs(to.row - from.row);
	const colDiff = Math.abs(to.col - from.col);

	if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
		// Check for flying king (kings facing each other)
		const opponentColor = piece.color === 'red' ? 'black' : 'red';
		const opponentKingPos = findKing(board, opponentColor);
		if (opponentKingPos && to.col === opponentKingPos.col) {
			// Check if there are any pieces between the kings
			const startRow = Math.min(to.row, opponentKingPos.row);
			const endRow = Math.max(to.row, opponentKingPos.row);
			for (let row = startRow + 1; row < endRow; row++) {
				if (board[row][to.col] !== null) {
					return true; // There's a piece blocking, move is valid
				}
			}
			return false; // Kings would be facing each other directly
		}
		return true;
	}
	return false;
}

function isValidAdvisorMove(
	piece: XiangqiPiece,
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	// Advisor can only move within palace
	if (!isInPalace(to, piece.color)) return false;

	// Advisor can only move one step diagonally
	const rowDiff = Math.abs(to.row - from.row);
	const colDiff = Math.abs(to.col - from.col);
	return rowDiff === 1 && colDiff === 1;
}

function isValidElephantMove(
	board: (XiangqiPiece | null)[][],
	piece: XiangqiPiece,
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	// Elephant cannot cross the river
	if (!isOnSameSideOfRiver(to, piece.color)) return false;

	// Elephant moves exactly 2 points diagonally
	const rowDiff = to.row - from.row;
	const colDiff = to.col - from.col;

	if (Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 2) {
		// Check if the path is blocked (elephant eye)
		const blockRow = from.row + rowDiff / 2;
		const blockCol = from.col + colDiff / 2;
		return board[blockRow][blockCol] === null;
	}
	return false;
}

function isValidHorseMove(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	const rowDiff = to.row - from.row;
	const colDiff = to.col - from.col;

	// Horse moves in L-shape: 2 in one direction, 1 in perpendicular
	if (
		(Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 1) ||
		(Math.abs(rowDiff) === 1 && Math.abs(colDiff) === 2)
	) {
		// Check for blocking piece (horse leg)
		let blockRow: number, blockCol: number;

		if (Math.abs(rowDiff) === 2) {
			// Moving primarily in row direction
			blockRow = from.row + (rowDiff > 0 ? 1 : -1);
			blockCol = from.col;
		} else {
			// Moving primarily in column direction
			blockRow = from.row;
			blockCol = from.col + (colDiff > 0 ? 1 : -1);
		}

		return board[blockRow][blockCol] === null;
	}
	return false;
}

function isValidChariotMove(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	// Chariot moves orthogonally
	if (from.row !== to.row && from.col !== to.col) return false;

	// Check path is clear
	return isPathClear(board, from, to);
}

function isValidCannonMove(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	// Cannon moves orthogonally
	if (from.row !== to.row && from.col !== to.col) return false;

	const targetPiece = getPieceAt(board, to);

	if (targetPiece) {
		// Capturing: exactly one piece between cannon and target
		return countPiecesInPath(board, from, to) === 1;
	} else {
		// Moving: no pieces in path
		return countPiecesInPath(board, from, to) === 0;
	}
}

function isValidSoldierMove(
	piece: XiangqiPiece,
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	const rowDiff = to.row - from.row;
	const colDiff = to.col - from.col;

	// Can only move one step
	if (Math.abs(rowDiff) + Math.abs(colDiff) !== 1) return false;

	const crossedRiver = hasCrossedRiver(from, piece.color);

	if (piece.color === 'red') {
		if (crossedRiver) {
			// Can move forward or sideways, but not backward
			return rowDiff <= 0;
		} else {
			// Can only move forward (up the board, decreasing row number)
			return rowDiff === -1 && colDiff === 0;
		}
	} else {
		if (crossedRiver) {
			// Can move forward or sideways, but not backward
			return rowDiff >= 0;
		} else {
			// Can only move forward (down the board, increasing row number)
			return rowDiff === 1 && colDiff === 0;
		}
	}
}

function isPathClear(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): boolean {
	const rowStep = from.row === to.row ? 0 : to.row > from.row ? 1 : -1;
	const colStep = from.col === to.col ? 0 : to.col > from.col ? 1 : -1;

	let currentRow = from.row + rowStep;
	let currentCol = from.col + colStep;

	while (currentRow !== to.row || currentCol !== to.col) {
		if (board[currentRow][currentCol] !== null) {
			return false;
		}
		currentRow += rowStep;
		currentCol += colStep;
	}
	return true;
}

function countPiecesInPath(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition,
	to: XiangqiPosition
): number {
	const rowStep = from.row === to.row ? 0 : to.row > from.row ? 1 : -1;
	const colStep = from.col === to.col ? 0 : to.col > from.col ? 1 : -1;

	let count = 0;
	let currentRow = from.row + rowStep;
	let currentCol = from.col + colStep;

	while (currentRow !== to.row || currentCol !== to.col) {
		if (board[currentRow][currentCol] !== null) {
			count++;
		}
		currentRow += rowStep;
		currentCol += colStep;
	}
	return count;
}

export function getPossibleMoves(
	board: (XiangqiPiece | null)[][],
	from: XiangqiPosition
): XiangqiPosition[] {
	const moves: XiangqiPosition[] = [];

	for (let row = 0; row < XIANGQI_ROWS; row++) {
		for (let col = 0; col < XIANGQI_COLS; col++) {
			const to = { row, col };
			if (isValidMove(board, from, to)) {
				moves.push(to);
			}
		}
	}

	return moves;
}

export function makeMove(
	board: (XiangqiPiece | null)[][],
	move: XiangqiMove
): (XiangqiPiece | null)[][] {
	const newBoard = copyBoard(board);

	// Move the piece
	newBoard[move.to.row][move.to.col] = move.piece;
	newBoard[move.from.row][move.from.col] = null;

	// Update soldier crossing river status
	if (
		move.piece.type === 'soldier' &&
		hasCrossedRiver(move.to, move.piece.color)
	) {
		const piece = newBoard[move.to.row][move.to.col];
		if (piece) {
			piece.hasCrossedRiver = true;
		}
	}

	return newBoard;
}
