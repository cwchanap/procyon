import { createGameStateFromFen } from './rules';
import type { GameState, Position } from './types';

export type ChessTutorialId =
	| 'basic-movement'
	| 'knight-moves'
	| 'check-demo'
	| 'castling'
	| 'pawn-promotion';

export interface ChessTutorialDemo {
	id: ChessTutorialId;
	title: string;
	description: string;
	fen: string;
	focusSquare?: Position;
	highlightSquares?: Position[];
	explanation: string;
}

export const CHESS_TUTORIALS: ChessTutorialDemo[] = [
	{
		id: 'basic-movement',
		title: 'Basic Piece Movement',
		description: 'Learn how different chess pieces move across the board',
		fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		explanation:
			'Click on any piece to see its possible moves. Each piece has unique movement patterns that define the strategy of chess.',
	},
	{
		id: 'knight-moves',
		title: 'Knight Movement Pattern',
		description:
			'The knight moves in an L-shape: 2 squares in one direction, then 1 square perpendicular',
		fen: '7k/8/1p6/8/4N3/8/3p4/7K w - - 0 1',
		focusSquare: { row: 4, col: 4 },
		highlightSquares: [
			{ row: 2, col: 3 },
			{ row: 2, col: 5 },
			{ row: 3, col: 2 },
			{ row: 3, col: 6 },
			{ row: 5, col: 2 },
			{ row: 5, col: 6 },
			{ row: 6, col: 3 },
			{ row: 6, col: 5 },
		],
		explanation:
			'The knight is unique - it can jump over other pieces and moves in an L-shape. Notice how it can capture the pawns but also move to empty squares.',
	},
	{
		id: 'check-demo',
		title: 'Check and King Safety',
		description:
			'Understanding when the king is in check and must be protected',
		fen: '4r2k/8/8/8/8/8/8/R3K3 w - - 0 1',
		focusSquare: { row: 7, col: 4 },
		explanation:
			'The white king is in check from the black rook. The king must move to safety, block the attack, or capture the attacking piece.',
	},
	{
		id: 'castling',
		title: 'Castling Rules',
		description: 'A special move involving the king and rook for king safety',
		fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
		focusSquare: { row: 7, col: 4 },
		explanation:
			'Castling allows the king to move 2 squares toward a rook, and the rook moves to the square the king crossed. Both pieces must not have moved, and there must be no pieces between them.',
	},
	{
		id: 'pawn-promotion',
		title: 'Pawn Promotion',
		description:
			'When a pawn reaches the opposite end, it promotes to any piece',
		fen: '7k/3P4/8/8/8/8/8/4K3 w - - 0 1',
		focusSquare: { row: 1, col: 3 },
		explanation:
			'This white pawn is one move away from promoting. When it reaches the 8th rank, it can become a queen, rook, bishop, or knight.',
	},
];

export function createChessTutorialState(id: string): GameState {
	const demo =
		CHESS_TUTORIALS.find(item => item.id === id) ?? CHESS_TUTORIALS[0];
	if (!demo) throw new Error('Chess tutorials must not be empty');
	return createGameStateFromFen(demo.fen);
}
