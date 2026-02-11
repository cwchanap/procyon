import type { ShogiPiece, ShogiPosition } from './types';
import { SHOGI_BOARD_SIZE } from './types';
import {
	isValidPosition,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	isSquareOccupiedByAlly,
	getDirection,
	getPieceAt,
} from './board';

export function getPossibleMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	switch (piece.type) {
		case 'pawn':
			return getPawnMoves(board, piece, from);
		case 'lance':
			return getLanceMoves(board, piece, from);
		case 'knight':
			return getKnightMoves(board, piece, from);
		case 'silver':
			return getSilverMoves(board, piece, from);
		case 'gold':
		case 'promoted_pawn':
		case 'promoted_lance':
		case 'promoted_knight':
		case 'promoted_silver':
			return getGoldMoves(board, piece, from);
		case 'bishop':
			return getBishopMoves(board, piece, from);
		case 'rook':
			return getRookMoves(board, piece, from);
		case 'horse': // Promoted bishop
			return getHorseMoves(board, piece, from);
		case 'dragon': // Promoted rook
			return getDragonMoves(board, piece, from);
		case 'king':
			return getKingMoves(board, piece, from);
		default:
			return [];
	}
}

function getPawnMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const direction = getDirection(piece.color);
	const forward = { row: from.row + direction, col: from.col };

	if (
		isValidPosition(forward) &&
		!isSquareOccupiedByAlly(board, forward, piece.color)
	) {
		moves.push(forward);
	}

	return moves;
}

function getLanceMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const direction = getDirection(piece.color);

	// Lance moves forward until blocked
	for (let i = 1; i < SHOGI_BOARD_SIZE; i++) {
		const pos = { row: from.row + direction * i, col: from.col };

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

	return moves;
}

function getKnightMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const direction = getDirection(piece.color);

	// Shogi knight only moves forward in an L-shape
	const knightMoves = [
		{ row: direction * 2, col: -1 },
		{ row: direction * 2, col: 1 },
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

function getSilverMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const direction = getDirection(piece.color);

	// Silver general moves: forward 3 squares + diagonal back 2 squares
	const silverMoves = [
		{ row: direction, col: -1 }, // Forward-left
		{ row: direction, col: 0 }, // Forward
		{ row: direction, col: 1 }, // Forward-right
		{ row: -direction, col: -1 }, // Backward-left diagonal
		{ row: -direction, col: 1 }, // Backward-right diagonal
	];

	for (const move of silverMoves) {
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

function getGoldMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const direction = getDirection(piece.color);

	// Gold general moves: 6 directions (not diagonal backward)
	const goldMoves = [
		{ row: direction, col: -1 }, // Forward-left
		{ row: direction, col: 0 }, // Forward
		{ row: direction, col: 1 }, // Forward-right
		{ row: 0, col: -1 }, // Left
		{ row: 0, col: 1 }, // Right
		{ row: -direction, col: 0 }, // Backward
	];

	for (const move of goldMoves) {
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

function getBishopMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const directions = [
		{ row: 1, col: 1 },
		{ row: 1, col: -1 },
		{ row: -1, col: 1 },
		{ row: -1, col: -1 },
	];

	for (const dir of directions) {
		for (let i = 1; i < SHOGI_BOARD_SIZE; i++) {
			const pos = { row: from.row + dir.row * i, col: from.col + dir.col * i };

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

function getRookMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
	const directions = [
		{ row: 0, col: 1 },
		{ row: 0, col: -1 },
		{ row: 1, col: 0 },
		{ row: -1, col: 0 },
	];

	for (const dir of directions) {
		for (let i = 1; i < SHOGI_BOARD_SIZE; i++) {
			const pos = { row: from.row + dir.row * i, col: from.col + dir.col * i };

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

function getHorseMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	// Horse (promoted bishop) = Bishop + King's orthogonal moves
	const moves = getBishopMoves(board, piece, from);

	// Add king's orthogonal moves
	const orthogonalMoves = [
		{ row: 0, col: 1 },
		{ row: 0, col: -1 },
		{ row: 1, col: 0 },
		{ row: -1, col: 0 },
	];

	for (const move of orthogonalMoves) {
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

function getDragonMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	// Dragon (promoted rook) = Rook + King's diagonal moves
	const moves = getRookMoves(board, piece, from);

	// Add king's diagonal moves
	const diagonalMoves = [
		{ row: 1, col: 1 },
		{ row: 1, col: -1 },
		{ row: -1, col: 1 },
		{ row: -1, col: -1 },
	];

	for (const move of diagonalMoves) {
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

function getKingMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const moves: ShogiPosition[] = [];
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

export function isMoveValid(
	board: (ShogiPiece | null)[][],
	from: ShogiPosition,
	to: ShogiPosition,
	piece: ShogiPiece
): boolean {
	const possibleMoves = getPossibleMoves(board, piece, from);
	return possibleMoves.some(move => move.row === to.row && move.col === to.col);
}

/**
 * Get all valid drop positions for a piece
 */
export function getDropPositions(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece
): ShogiPosition[] {
	const positions: ShogiPosition[] = [];

	for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
		for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
			if (canDropAt(board, piece, { row, col })) {
				positions.push({ row, col });
			}
		}
	}

	return positions;
}

/**
 * Check if a piece can be dropped at a specific position
 */
export function canDropAt(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	pos: ShogiPosition
): boolean {
	// Position must be within board bounds
	if (!isValidPosition(pos)) {
		return false;
	}

	// Cannot drop on occupied square
	if (!isSquareEmpty(board, pos)) {
		return false;
	}

	// Pawn restrictions
	if (piece.type === 'pawn') {
		// Cannot drop pawn on last rank
		if (piece.color === 'sente' && pos.row === 0) return false;
		if (piece.color === 'gote' && pos.row === 8) return false;

		// Cannot drop pawn on file with existing unpromoted pawn (nifu)
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			const existingPiece = getPieceAt(board, { row, col: pos.col });
			if (
				existingPiece &&
				existingPiece.type === 'pawn' &&
				existingPiece.color === piece.color &&
				!existingPiece.isPromoted
			) {
				return false;
			}
		}
	}

	// Lance cannot be dropped on last rank
	if (piece.type === 'lance') {
		if (piece.color === 'sente' && pos.row === 0) return false;
		if (piece.color === 'gote' && pos.row === 8) return false;
	}

	// Knight cannot be dropped on last two ranks
	if (piece.type === 'knight') {
		if (piece.color === 'sente' && pos.row <= 1) return false;
		if (piece.color === 'gote' && pos.row >= 7) return false;
	}

	return true;
}
