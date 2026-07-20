import {
	containsPosition,
	positionsEqual,
	type Dims,
	type Position,
} from './types';

export type GridBoard<TPiece> = (TPiece | null)[][];

export function createEmptyBoard<TPiece>(
	rows: number,
	cols: number
): GridBoard<TPiece> {
	return Array(rows)
		.fill(null)
		.map(() => Array(cols).fill(null));
}

export function isValidPosition(pos: Position, dims: Dims): boolean {
	return (
		pos.row >= 0 && pos.row < dims.rows && pos.col >= 0 && pos.col < dims.cols
	);
}

export function getPieceAt<TPiece>(
	board: GridBoard<TPiece>,
	pos: Position,
	dims: Dims
): TPiece | null {
	if (!isValidPosition(pos, dims)) return null;
	return board[pos.row]?.[pos.col] ?? null;
}

export function setPieceAt<TPiece>(
	board: GridBoard<TPiece>,
	pos: Position,
	piece: TPiece | null,
	dims: Dims
): void {
	if (!isValidPosition(pos, dims)) return;
	const row = board[pos.row];
	if (row) {
		row[pos.col] = piece;
	}
}

export function copyBoard<TPiece extends { color: string }>(
	board: GridBoard<TPiece>
): GridBoard<TPiece> {
	return board.map(row =>
		row.map(piece => (piece === null ? null : { ...piece }))
	);
}

export function isSquareEmpty<TPiece>(
	board: GridBoard<TPiece>,
	pos: Position,
	dims: Dims
): boolean {
	return getPieceAt(board, pos, dims) === null;
}

export function isSquareOccupiedByOpponent<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	pos: Position,
	color: string,
	dims: Dims
): boolean {
	const piece = getPieceAt(board, pos, dims);
	return piece !== null && piece.color !== color;
}

export function isSquareOccupiedByAlly<TPiece extends { color: string }>(
	board: GridBoard<TPiece>,
	pos: Position,
	color: string,
	dims: Dims
): boolean {
	const piece = getPieceAt(board, pos, dims);
	return piece !== null && piece.color === color;
}

// Dimension-binding helper. Implementation returns an object literal with
// arrow-function properties (NOT method shorthand) — matches the declared
// return type exactly and avoids method-vs-property this-binding divergences.
export function bindBoard<TPiece extends { color: string }>(
	dims: Dims
): {
	isValidPosition: (pos: Position) => boolean;
	getPieceAt: (board: GridBoard<TPiece>, pos: Position) => TPiece | null;
	setPieceAt: (
		board: GridBoard<TPiece>,
		pos: Position,
		piece: TPiece | null
	) => void;
	isSquareEmpty: (board: GridBoard<TPiece>, pos: Position) => boolean;
	isSquareOccupiedByOpponent: (
		board: GridBoard<TPiece>,
		pos: Position,
		color: string
	) => boolean;
	isSquareOccupiedByAlly: (
		board: GridBoard<TPiece>,
		pos: Position,
		color: string
	) => boolean;
} {
	return {
		isValidPosition: pos => isValidPosition(pos, dims),
		getPieceAt: (board, pos) => getPieceAt(board, pos, dims),
		setPieceAt: (board, pos, piece) => setPieceAt(board, pos, piece, dims),
		isSquareEmpty: (board, pos) => isSquareEmpty(board, pos, dims),
		isSquareOccupiedByOpponent: (board, pos, color) =>
			isSquareOccupiedByOpponent(board, pos, color, dims),
		isSquareOccupiedByAlly: (board, pos, color) =>
			isSquareOccupiedByAlly(board, pos, color, dims),
	};
}

// Re-export position helpers for consumers importing from board.ts.
export { containsPosition, positionsEqual };
