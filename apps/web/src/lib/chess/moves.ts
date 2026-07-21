import { slidingMoves, steppingMoves } from '@procyon/game-core';
import type { ChessPiece, Position } from './types';
import { BOARD_SIZE } from './types';
import {
	isValidPosition,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
} from './board';

const CHESS_DIMS = { rows: BOARD_SIZE, cols: BOARD_SIZE } as const;

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
	return slidingMoves(
		board,
		from,
		piece.color,
		[
			{ row: 0, col: 1 },
			{ row: 0, col: -1 },
			{ row: 1, col: 0 },
			{ row: -1, col: 0 },
		],
		8,
		CHESS_DIMS
	);
}

function getBishopMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	return slidingMoves(
		board,
		from,
		piece.color,
		[
			{ row: 1, col: 1 },
			{ row: 1, col: -1 },
			{ row: -1, col: 1 },
			{ row: -1, col: -1 },
		],
		8,
		CHESS_DIMS
	);
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
	return steppingMoves(
		board,
		from,
		piece.color,
		[
			{ row: -1, col: -1 },
			{ row: -1, col: 0 },
			{ row: -1, col: 1 },
			{ row: 0, col: -1 },
			{ row: 0, col: 1 },
			{ row: 1, col: -1 },
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
		],
		CHESS_DIMS
	);
}

function getKnightMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position
): Position[] {
	return steppingMoves(
		board,
		from,
		piece.color,
		[
			{ row: -2, col: -1 },
			{ row: -2, col: 1 },
			{ row: -1, col: -2 },
			{ row: -1, col: 2 },
			{ row: 1, col: -2 },
			{ row: 1, col: 2 },
			{ row: 2, col: -1 },
			{ row: 2, col: 1 },
		],
		CHESS_DIMS
	);
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
