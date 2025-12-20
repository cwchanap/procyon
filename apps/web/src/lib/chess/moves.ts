import type { ChessPiece, Position, GameState } from './types';
import {
	isValidPosition,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	isSquareOccupiedByAlly,
	getPieceAt,
} from './board';

export function getPossibleMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position,
	gameState?: GameState
): Position[] {
	switch (piece.type) {
		case 'pawn':
			return getPawnMoves(board, piece, from, gameState?.enPassantTarget);
		case 'rook':
			return getRookMoves(board, piece, from);
		case 'bishop':
			return getBishopMoves(board, piece, from);
		case 'queen':
			return getQueenMoves(board, piece, from);
		case 'king':
			return getKingMoves(board, piece, from, gameState);
		case 'knight':
			return getKnightMoves(board, piece, from);
		default:
			return [];
	}
}

function getPawnMoves(
	board: (ChessPiece | null)[][],
	piece: ChessPiece,
	from: Position,
	enPassantTarget?: Position
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

	// En passant captures
	if (enPassantTarget) {
		if (
			captureLeft.row === enPassantTarget.row &&
			captureLeft.col === enPassantTarget.col
		) {
			moves.push(captureLeft);
		}
		if (
			captureRight.row === enPassantTarget.row &&
			captureRight.col === enPassantTarget.col
		) {
			moves.push(captureRight);
		}
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
	from: Position,
	gameState?: GameState
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

	// Castling
	if (gameState && !piece.hasMoved) {
		const row = piece.color === 'white' ? 7 : 0;

		// Only check castling if king is on starting square
		if (from.row === row && from.col === 4) {
			// Check if king is currently in check
			if (!isSquareAttacked(board, from, piece.color)) {
				// Kingside castling (O-O)
				const kingsideRook = getPieceAt(board, { row, col: 7 });
				if (
					kingsideRook?.type === 'rook' &&
					kingsideRook.color === piece.color &&
					!kingsideRook.hasMoved
				) {
					// Check if squares between king and rook are empty
					const f = { row, col: 5 };
					const g = { row, col: 6 };
					if (
						isSquareEmpty(board, f) &&
						isSquareEmpty(board, g) &&
						!isSquareAttacked(board, f, piece.color) &&
						!isSquareAttacked(board, g, piece.color)
					) {
						moves.push(g); // King moves to g1/g8
					}
				}

				// Queenside castling (O-O-O)
				const queensideRook = getPieceAt(board, { row, col: 0 });
				if (
					queensideRook?.type === 'rook' &&
					queensideRook.color === piece.color &&
					!queensideRook.hasMoved
				) {
					// Check if squares between king and rook are empty
					const b = { row, col: 1 };
					const c = { row, col: 2 };
					const d = { row, col: 3 };
					if (
						isSquareEmpty(board, b) &&
						isSquareEmpty(board, c) &&
						isSquareEmpty(board, d) &&
						!isSquareAttacked(board, c, piece.color) &&
						!isSquareAttacked(board, d, piece.color)
					) {
						moves.push(c); // King moves to c1/c8
					}
				}
			}
		}
	}

	return moves;
}

// Helper function to check if a square is attacked by opponent pieces
export function isSquareAttacked(
	board: (ChessPiece | null)[][],
	pos: Position,
	defendingColor: 'white' | 'black'
): boolean {
	const attackingColor = defendingColor === 'white' ? 'black' : 'white';

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const piece = board[row]?.[col];
			if (piece && piece.color === attackingColor) {
				// For pawns, only check diagonal attacks (not forward moves)
				if (piece.type === 'pawn') {
					const direction = piece.color === 'white' ? -1 : 1;
					const attackLeft = { row: row + direction, col: col - 1 };
					const attackRight = { row: row + direction, col: col + 1 };
					if (
						(attackLeft.row === pos.row && attackLeft.col === pos.col) ||
						(attackRight.row === pos.row && attackRight.col === pos.col)
					) {
						return true;
					}
				} else if (piece.type === 'king') {
					// For king, check if within one square (avoid recursion)
					const rowDiff = Math.abs(row - pos.row);
					const colDiff = Math.abs(col - pos.col);
					if (rowDiff <= 1 && colDiff <= 1 && (rowDiff > 0 || colDiff > 0)) {
						return true;
					}
				} else {
					// For other pieces, use standard move generation (without gameState to avoid castling recursion)
					const moves = getPossibleMoves(board, piece, { row, col });
					if (moves.some(m => m.row === pos.row && m.col === pos.col)) {
						return true;
					}
				}
			}
		}
	}
	return false;
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
	piece: ChessPiece,
	gameState?: GameState
): boolean {
	const possibleMoves = getPossibleMoves(board, piece, from, gameState);
	return possibleMoves.some(move => move.row === to.row && move.col === to.col);
}
