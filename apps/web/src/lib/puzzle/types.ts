import type {
	ChessPiece,
	ChessSquare,
	GameState,
	PieceColor,
	Position,
	PromotionPiece,
} from '../chess/types';

export interface PuzzleMove {
	from: ChessSquare;
	to: ChessSquare;
	promotion?: PromotionPiece;
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
	/** API contract: 8×8 board with exactly one white king and one black king. */
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
	gameState: GameState | null;
	solutionStep: number;
	failedAttempts: number;
	showHint: boolean;
	showSolution: boolean;
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
