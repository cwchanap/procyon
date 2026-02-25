import type { ChessPiece, PieceColor, Position } from '../chess/types';

export interface PuzzleMove {
	from: string; // algebraic notation e.g. "e2"
	to: string; // algebraic notation e.g. "e4"
}

export interface PuzzleHint {
	pieceSquare: Position;
	targetSquare: Position;
}

export interface PuzzleData {
	id: number;
	slug: string;
	title: string;
	description: string;
	difficulty: 'beginner' | 'intermediate' | 'advanced';
	playerColor: PieceColor;
	initialBoard: (ChessPiece | null)[][];
	solution: PuzzleMove[];
	hint: PuzzleHint;
}

export type PuzzleListItem = Omit<
	PuzzleData,
	'initialBoard' | 'solution' | 'hint'
>;

export type PuzzlePhase =
	| 'idle'
	| 'playing'
	| 'opponent' // opponent auto-move in progress
	| 'solved'
	| 'failed';

export interface PuzzleState {
	phase: PuzzlePhase;
	puzzle: PuzzleData | null;
	board: (ChessPiece | null)[][];
	solutionStep: number;
	failedAttempts: number;
	showHint: boolean;
	showSolution: boolean;
	selectedSquare: Position | null;
	possibleMoves: Position[];
}

// localStorage anonymous progress
export interface LocalPuzzleProgress {
	[puzzleId: number]: {
		solved: boolean;
		failedAttempts: number;
		solvedAt?: string;
	};
}

export interface ServerPuzzleProgress {
	id: number;
	userId: string;
	puzzleId: number;
	solved: boolean;
	failedAttempts: number;
	solvedAt: string | null;
	updatedAt: string;
}
