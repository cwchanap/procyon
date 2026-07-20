import type { GridBoard } from './board';
import type { Dims, Position } from './types';

export function findPiece<TPiece>(
	board: GridBoard<TPiece>,
	predicate: (p: TPiece) => boolean,
	dims: Dims
): Position | null {
	for (let row = 0; row < dims.rows; row++) {
		for (let col = 0; col < dims.cols; col++) {
			const piece = board[row]?.[col];
			if (piece && predicate(piece)) {
				return { row, col };
			}
		}
	}
	return null;
}

export function isSquareAttacked<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	targetPos: Position,
	attackerColor: string,
	getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
	dims: Dims
): boolean {
	for (let row = 0; row < dims.rows; row++) {
		for (let col = 0; col < dims.cols; col++) {
			const piece = board[row]?.[col];
			if (piece && piece.color === attackerColor) {
				const moves = getMovesForPiece(board, { row, col });
				for (const move of moves) {
					if (move.row === targetPos.row && move.col === targetPos.col) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export function isInCheck<TPiece>(
	board: GridBoard<TPiece>,
	kingPos: Position,
	isAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean
): boolean {
	return isAttacked(board, kingPos);
}

export function forEachOwnPieceMove<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	color: string,
	getMovesForPiece: (board: GridBoard<TPiece>, from: Position) => Position[],
	visit: (from: Position, to: Position) => boolean,
	dims: Dims
): void {
	for (let row = 0; row < dims.rows; row++) {
		for (let col = 0; col < dims.cols; col++) {
			const piece = board[row]?.[col];
			if (piece && piece.color === color) {
				const from = { row, col };
				const moves = getMovesForPiece(board, from);
				for (const to of moves) {
					if (!visit(from, to)) return;
				}
			}
		}
	}
}
