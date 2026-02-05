import type { ShogiPiece, ShogiPosition, ShogiPieceColor, ShogiPieceType } from './types';
import { SHOGI_BOARD_SIZE } from './types';

export function createInitialBoard(): (ShogiPiece | null)[][] {
	const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
		.fill(null)
		.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

	// Gote pieces (top side, rows 0-2)
	const goteBackRow: ShogiPieceType[] = [
		'lance', 'knight', 'silver', 'gold', 'king', 'gold', 'silver', 'knight', 'lance',
	];

	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[0]![col] = { type: goteBackRow[col]!, color: 'gote' };
	}

	// Gote bishop and rook
	board[1]![1] = { type: 'bishop', color: 'gote' };
	board[1]![7] = { type: 'rook', color: 'gote' };

	// Gote pawns
	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[2]![col] = { type: 'pawn', color: 'gote' };
	}

	// Sente pawns
	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[6]![col] = { type: 'pawn', color: 'sente' };
	}

	// Sente bishop and rook
	board[7]![1] = { type: 'rook', color: 'sente' };
	board[7]![7] = { type: 'bishop', color: 'sente' };

	// Sente pieces (bottom side, rows 6-8)
	const senteBackRow: ShogiPieceType[] = [
		'lance', 'knight', 'silver', 'gold', 'king', 'gold', 'silver', 'knight', 'lance',
	];

	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[8]![col] = { type: senteBackRow[col]!, color: 'sente' };
	}

	return board;
}

export function isValidPosition(pos: ShogiPosition): boolean {
	return (
		pos.row >= 0 &&
		pos.row < SHOGI_BOARD_SIZE &&
		pos.col >= 0 &&
		pos.col < SHOGI_BOARD_SIZE
	);
}

export function getPieceAt(
	board: (ShogiPiece | null)[][],
	pos: ShogiPosition
): ShogiPiece | null {
	if (!isValidPosition(pos)) return null;
	return board[pos.row]?.[pos.col] ?? null;
}

export function setPieceAt(
	board: (ShogiPiece | null)[][],
	pos: ShogiPosition,
	piece: ShogiPiece | null
): void {
	if (!isValidPosition(pos)) return;
	if (board[pos.row]) {
		board[pos.row]![pos.col] = piece;
	}
}

export function isSquareEmpty(
	board: (ShogiPiece | null)[][],
	pos: ShogiPosition
): boolean {
	return getPieceAt(board, pos) === null;
}

export function isSquareOccupiedByOpponent(
	board: (ShogiPiece | null)[][],
	pos: ShogiPosition,
	color: ShogiPieceColor
): boolean {
	const piece = getPieceAt(board, pos);
	return piece !== null && piece.color !== color;
}

export function isSquareOccupiedByAlly(
	board: (ShogiPiece | null)[][],
	pos: ShogiPosition,
	color: ShogiPieceColor
): boolean {
	const piece = getPieceAt(board, pos);
	return piece !== null && piece.color === color;
}

export function copyBoard(
	board: (ShogiPiece | null)[][]
): (ShogiPiece | null)[][] {
	return board.map(row => row.map(piece => (piece ? { ...piece } : null)));
}

export function positionToAlgebraic(pos: ShogiPosition): string {
	// Shogi uses files 9-1 (right to left from sente's perspective)
	// and ranks a-i (top to bottom)
	const files = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
	const ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
	return `${files[pos.col]}${ranks[pos.row]}`;
}

export function algebraicToPosition(algebraic: string): ShogiPosition | null {
	if (!algebraic || algebraic.length !== 2) return null;

	const files = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
	const ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

	const file = algebraic[0];
	const rank = algebraic[1]?.toLowerCase();

	if (!file || !rank) return null;

	const col = files.indexOf(file);
	const row = ranks.indexOf(rank);

	if (col === -1 || row === -1) return null;

	return { row, col };
}

/**
 * Get the direction multiplier for piece movement based on color
 * Sente moves up (negative row), Gote moves down (positive row)
 */
export function getDirection(color: ShogiPieceColor): number {
	return color === 'sente' ? -1 : 1;
}

/**
 * Check if a position is in the promotion zone for a given color
 */
export function isInPromotionZone(pos: ShogiPosition, color: ShogiPieceColor): boolean {
	if (color === 'sente') {
		return pos.row <= 2; // Rows 0, 1, 2 for sente
	} else {
		return pos.row >= 6; // Rows 6, 7, 8 for gote
	}
}

/**
 * Check if a piece must promote (pawn/lance at last rank, knight at last two ranks)
 */
export function mustPromote(piece: ShogiPiece, toPos: ShogiPosition): boolean {
	if (piece.isPromoted) return false;

	if (piece.color === 'sente') {
		if (piece.type === 'pawn' || piece.type === 'lance') {
			return toPos.row === 0;
		}
		if (piece.type === 'knight') {
			return toPos.row <= 1;
		}
	} else {
		if (piece.type === 'pawn' || piece.type === 'lance') {
			return toPos.row === 8;
		}
		if (piece.type === 'knight') {
			return toPos.row >= 7;
		}
	}

	return false;
}

/**
 * Check if a piece can promote
 */
export function canPromote(piece: ShogiPiece, fromPos: ShogiPosition, toPos: ShogiPosition): boolean {
	if (piece.isPromoted) return false;

	// Only certain pieces can promote
	const promotablePieces: ShogiPieceType[] = ['pawn', 'lance', 'knight', 'silver', 'bishop', 'rook'];
	if (!promotablePieces.includes(piece.type)) return false;

	// Can promote when entering, leaving, or moving within promotion zone
	return isInPromotionZone(fromPos, piece.color) || isInPromotionZone(toPos, piece.color);
}

/**
 * Get the promoted form of a piece
 */
export function getPromotedType(type: ShogiPieceType): ShogiPieceType {
	const promotionMap: Partial<Record<ShogiPieceType, ShogiPieceType>> = {
		pawn: 'promoted_pawn',
		lance: 'promoted_lance',
		knight: 'promoted_knight',
		silver: 'promoted_silver',
		bishop: 'horse',
		rook: 'dragon',
	};
	return promotionMap[type] || type;
}

/**
 * Get the base (unpromoted) form of a piece for dropping
 */
export function getBaseType(type: ShogiPieceType): ShogiPieceType {
	const baseMap: Partial<Record<ShogiPieceType, ShogiPieceType>> = {
		promoted_pawn: 'pawn',
		promoted_lance: 'lance',
		promoted_knight: 'knight',
		promoted_silver: 'silver',
		horse: 'bishop',
		dragon: 'rook',
	};
	return baseMap[type] || type;
}
