import {
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	type GridBoard,
} from './board';
import type { Direction, Dims, Position } from './types';

export function slidingMoves<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	from: Position,
	color: string,
	directions: Direction[],
	maxRange: number,
	dims: Dims
): Position[] {
	const moves: Position[] = [];
	for (const dir of directions) {
		for (let i = 1; i <= maxRange; i++) {
			const pos = {
				row: from.row + dir.row * i,
				col: from.col + dir.col * i,
			};
			if (!isInBounds(pos, dims)) break;
			if (isSquareEmpty(board, pos, dims)) {
				moves.push(pos);
			} else if (isSquareOccupiedByOpponent(board, pos, color, dims)) {
				moves.push(pos);
				break;
			} else {
				break;
			}
		}
	}
	return moves;
}

export function steppingMoves<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	from: Position,
	color: string,
	offsets: Direction[],
	dims: Dims
): Position[] {
	const moves: Position[] = [];
	for (const offset of offsets) {
		const pos = {
			row: from.row + offset.row,
			col: from.col + offset.col,
		};
		if (!isInBounds(pos, dims)) continue;
		if (isSquareEmpty(board, pos, dims)) {
			moves.push(pos);
		} else if (isSquareOccupiedByOpponent(board, pos, color, dims)) {
			moves.push(pos);
		}
	}
	return moves;
}

export function moveLeavesKingInCheck<TPiece>(
	board: GridBoard<TPiece>,
	from: Position,
	to: Position,
	findOwnKing: (board: GridBoard<TPiece>) => Position | null,
	isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
	onMissingKing: () => boolean
): boolean {
	const next = copyBoardAsPossible(board);
	const piece = next[from.row]?.[from.col] ?? null;
	if (piece === null) return onMissingKing(); // malformed input
	setCell(next, from, null);
	setCell(next, to, piece);
	return isOwnKingInCheckOnBoard(
		next,
		findOwnKing,
		isOwnKingAttacked,
		onMissingKing
	);
}

export function isOwnKingInCheckOnBoard<TPiece>(
	board: GridBoard<TPiece>,
	findOwnKing: (board: GridBoard<TPiece>) => Position | null,
	isOwnKingAttacked: (board: GridBoard<TPiece>, pos: Position) => boolean,
	onMissingKing: () => boolean
): boolean {
	const kingPos = findOwnKing(board);
	if (kingPos === null) return onMissingKing();
	return isOwnKingAttacked(board, kingPos);
}

function isInBounds(pos: Position, dims: Dims): boolean {
	return (
		pos.row >= 0 && pos.row < dims.rows && pos.col >= 0 && pos.col < dims.cols
	);
}

// moveLeavesKingInCheck applies the move on a mutable clone. The clone uses
// copyBoard when TPiece satisfies { color: string }; for the rare case where
// a caller passes a non-colored TPiece (not currently used by any variant),
// fall back to a shallow row clone. This keeps moveLeavesKingInCheck usable
// without forcing the color constraint at the signature level.
function copyBoardAsPossible<TPiece>(
	board: GridBoard<TPiece>
): GridBoard<TPiece> {
	// Shallow clone — moveLeavesKingInCheck only reassigns cells, never mutates
	// piece objects in place, so a row-clone suffices for the apply step.
	return board.map(row => [...row]);
}

function setCell<TPiece>(
	board: GridBoard<TPiece>,
	pos: Position,
	piece: TPiece | null
): void {
	const row = board[pos.row];
	if (row) {
		row[pos.col] = piece;
	}
}
