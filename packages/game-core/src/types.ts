export interface Position {
	row: number;
	col: number;
}

export type GameStatus =
	| 'playing'
	| 'check'
	| 'checkmate'
	| 'stalemate'
	| 'draw';

export interface BaseMove<TPiece> {
	from: Position | null;
	to: Position;
	piece: TPiece;
	capturedPiece?: TPiece;
}

export interface BaseGameState<TPiece> {
	board: (TPiece | null)[][];
	currentPlayer: string;
	status: GameStatus;
	moveHistory: BaseMove<TPiece>[];
	selectedSquare: Position | null;
	possibleMoves: Position[];
}

export interface Direction {
	row: number;
	col: number;
}

export interface Dims {
	rows: number;
	cols: number;
}

export function positionsEqual(a: Position, b: Position): boolean {
	return a.row === b.row && a.col === b.col;
}

export function containsPosition(list: Position[], pos: Position): boolean {
	return list.some(p => p.row === pos.row && p.col === pos.col);
}
