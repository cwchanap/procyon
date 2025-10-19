import type { ChessPiece, Position } from './types';
import {
	isValidPosition,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	isSquareOccupiedByAlly,
} from './board';

export function getPossibleMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	switch (piece.type) {
		case 'pawn':
			return getPawnMoves(board, piece, from);
		case 'rook':
			return getRookMoves(board, piece, from);
		case 'bishop':
			return getBishopMoves(board, piece, from);
		case 'queen':
			return getQueenMoves(board, piece, from);
		case 'king':
			return getKingMoves(board, piece, from);
		case 'knight':
			return getKnightMoves(board, piece, from);
		default:
			return [];
	}
}

function getPawnMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	const moves: Position[] = [];
	const direction = piece.color === 'white' ? -1 : 1;
	const startRow = piece.color === 'white' ? 6 : 1;

	// Forward move
	const oneStep = { row: from.row + direction, col: from.col };
	if (isValidPosition(oneStep) && isSquareEmpty(board, oneStep)) {
		moves.push(oneStep);

		// Two steps from starting position
		if (from.row === startRow) {
			const twoSteps = { row: from.row + 2 * direction, col: from.col };
			if (isValidPosition(twoSteps) && isSquareEmpty(board, twoSteps)) {
				moves.push(twoSteps);
			}
		}
	}

	// Diagonal captures
	const captureLeft = { row: from.row + direction, col: from.col - 1 };
	const captureRight = { row: from.row + direction, col: from.col + 1 };

	if (
		isValidPosition(captureLeft) &&
		isSquareOccupiedByOpponent(board, captureLeft, piece.color)
	) {
		moves.push(captureLeft);
	}
	if (
		isValidPosition(captureRight) &&
		isSquareOccupiedByOpponent(board, captureRight, piece.color)
	) {
		moves.push(captureRight);
	}

	return moves;
}

function getRookMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	const moves: Position[] = [];
	const directions = [
		{ row: 0, col: 1 }, // right
		{ row: 0, col: -1 }, // left
		{ row: 1, col: 0 }, // down
		{ row: -1, col: 0 }, // up
	];

	for (const dir of directions) {
		for (let i = 1; i < 8; i++) {
			const pos = {
				row: from.row + dir.row * i,
				col: from.col + dir.col * i,
			};

			if (!isValidPosition(pos)) break;

			if (isSquareEmpty(board, pos)) {
				moves.push(pos);
			} else if (isSquareOccupiedByOpponent(board, pos, piece.color)) {
				moves.push(pos);
				break;
			} else {
				break;
			}
		}
	}

	return moves;
}

function getBishopMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	const moves: Position[] = [];
	const directions = [
		{ row: 1, col: 1 }, // down-right
		{ row: 1, col: -1 }, // down-left
		{ row: -1, col: 1 }, // up-right
		{ row: -1, col: -1 }, // up-left
	];

	for (const dir of directions) {
		for (let i = 1; i < 8; i++) {
			const pos = {
				row: from.row + dir.row * i,
				col: from.col + dir.col * i,
			};

			if (!isValidPosition(pos)) break;

			if (isSquareEmpty(board, pos)) {
				moves.push(pos);
			} else if (isSquareOccupiedByOpponent(board, pos, piece.color)) {
				moves.push(pos);
				break;
			} else {
				break;
			}
		}
	}

	return moves;
}

function getQueenMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	return [
		...getRookMoves(board, piece, from),
		...getBishopMoves(board, piece, from),
	];
}

function getKingMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	const moves: Position[] = [];
	const directions = [
		{ row: -1, col: -1 },
		{ row: -1, col: 0 },
		{ row: -1, col: 1 },
		{ row: 0, col: -1 },
		{ row: 0, col: 1 },
		{ row: 1, col: -1 },
		{ row: 1, col: 0 },
		{ row: 1, col: 1 },
	];

	for (const dir of directions) {
		const pos = { row: from.row + dir.row, col: from.col + dir.col };

		if (
			isValidPosition(pos) &&
			!isSquareOccupiedByAlly(board, pos, piece.color)
		) {
			moves.push(pos);
		}
	}

	return moves;
}

function getKnightMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	const moves: Position[] = [];
	const knightMoves = [
		{ row: -2, col: -1 },
		{ row: -2, col: 1 },
		{ row: -1, col: -2 },
		{ row: -1, col: 2 },
		{ row: 1, col: -2 },
		{ row: 1, col: 2 },
		{ row: 2, col: -1 },
		{ row: 2, col: 1 },
	];

	for (const move of knightMoves) {
		const pos = { row: from.row + move.row, col: from.col + move.col };

		if (
			isValidPosition(pos) &&
			!isSquareOccupiedByAlly(board, pos, piece.color)
		) {
			moves.push(pos);
		}
	}

	return moves;
}

export function isMoveValid(
	board: (ChessPiece | null)[][],
	from: Position,
	to: Position,
	piece: ChessPiece
): boolean {
	const possibleMoves = getPossibleMoves(board, piece, from);
	return possibleMoves.some(move => move.row === to.row && move.col === to.col);
}
