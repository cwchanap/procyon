import { slidingMoves, steppingMoves } from '@procyon/game-core';
import type { ShogiPiece, ShogiPosition } from './types';
import { SHOGI_BOARD_SIZE } from './types';
import {
	isValidPosition,
	isSquareEmpty,
	isSquareOccupiedByAlly,
	getDirection,
	getPieceAt,
} from './board';

const SHOGI_DIMS = { rows: SHOGI_BOARD_SIZE, cols: SHOGI_BOARD_SIZE } as const;

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
	const direction = getDirection(piece.color);
	return steppingMoves(
		board,
		from,
		piece.color,
		[{ row: direction, col: 0 }],
		SHOGI_DIMS
	);
}

function getLanceMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const direction = getDirection(piece.color);
	return slidingMoves(
		board,
		from,
		piece.color,
		[{ row: direction, col: 0 }],
		SHOGI_BOARD_SIZE,
		SHOGI_DIMS
	);
}

function getKnightMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const direction = getDirection(piece.color);
	// Shogi knight only moves forward in an L-shape
	return steppingMoves(
		board,
		from,
		piece.color,
		[
			{ row: direction * 2, col: -1 },
			{ row: direction * 2, col: 1 },
		],
		SHOGI_DIMS
	);
}

function getSilverMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const direction = getDirection(piece.color);
	// Silver general moves: forward 3 squares + diagonal back 2 squares
	return steppingMoves(
		board,
		from,
		piece.color,
		[
			{ row: direction, col: -1 }, // Forward-left
			{ row: direction, col: 0 }, // Forward
			{ row: direction, col: 1 }, // Forward-right
			{ row: -direction, col: -1 }, // Backward-left diagonal
			{ row: -direction, col: 1 }, // Backward-right diagonal
		],
		SHOGI_DIMS
	);
}

function getGoldMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
	const direction = getDirection(piece.color);
	// Gold general moves: 6 directions (not diagonal backward)
	return steppingMoves(
		board,
		from,
		piece.color,
		[
			{ row: direction, col: -1 }, // Forward-left
			{ row: direction, col: 0 }, // Forward
			{ row: direction, col: 1 }, // Forward-right
			{ row: 0, col: -1 }, // Left
			{ row: 0, col: 1 }, // Right
			{ row: -direction, col: 0 }, // Backward
		],
		SHOGI_DIMS
	);
}

function getBishopMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
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
		SHOGI_BOARD_SIZE,
		SHOGI_DIMS
	);
}

function getRookMoves(
	board: (ShogiPiece | null)[][],
	piece: ShogiPiece,
	from: ShogiPosition
): ShogiPosition[] {
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
		SHOGI_BOARD_SIZE,
		SHOGI_DIMS
	);
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
		SHOGI_DIMS
	);
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

		// TODO: enforce uchifuzume (打ち歩詰め) — illegal pawn-drop mate.
		// A pawn drop that delivers immediate checkmate to the opponent is illegal.
		// Implementation requires: simulate the pawn drop on a copied board, then check
		// if the opponent's king is in checkmate using isKingInCheck and isCheckmate helpers.
		// If the drop results in checkmate, return false to reject the move.
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
