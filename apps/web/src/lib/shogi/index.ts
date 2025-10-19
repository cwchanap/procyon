// Export all types
export type ShogiPieceType =
	| 'king'
	| 'rook'
	| 'bishop'
	| 'gold'
	| 'silver'
	| 'knight'
	| 'lance'
	| 'pawn'
	| 'dragon'
	| 'horse'
	| 'promoted_silver'
	| 'promoted_knight'
	| 'promoted_lance'
	| 'promoted_pawn';

export type ShogiPieceColor = 'sente' | 'gote';

export interface ShogiPiece {
	type: ShogiPieceType;
	color: ShogiPieceColor;
	isPromoted?: boolean;
}

export interface ShogiPosition {
	row: number;
	col: number;
}

export interface ShogiMove {
	from: ShogiPosition | null;
	to: ShogiPosition;
	piece: ShogiPiece;
	capturedPiece?: ShogiPiece;
	isPromotion?: boolean;
	isDrop?: boolean;
}

export type ShogiGameStatus = 'playing' | 'check' | 'checkmate' | 'draw';

export interface ShogiGameState {
	board: (ShogiPiece | null)[][];
	currentPlayer: ShogiPieceColor;
	status: ShogiGameStatus;
	moveHistory: ShogiMove[];
	selectedSquare: ShogiPosition | null;
	possibleMoves: ShogiPosition[];
	senteHand: ShogiPiece[];
	goteHand: ShogiPiece[];
	selectedHandPiece: ShogiPiece | null;
}

export const SHOGI_BOARD_SIZE = 9;
export const SHOGI_FILES = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
export const SHOGI_RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

export const PIECE_UNICODE: Record<
	ShogiPieceType,
	{ sente: string; gote: string }
> = {
	king: { sente: '玉', gote: '王' },
	rook: { sente: '飛', gote: '飛' },
	bishop: { sente: '角', gote: '角' },
	gold: { sente: '金', gote: '金' },
	silver: { sente: '銀', gote: '銀' },
	knight: { sente: '桂', gote: '桂' },
	lance: { sente: '香', gote: '香' },
	pawn: { sente: '歩', gote: '歩' },
	dragon: { sente: '龍', gote: '龍' },
	horse: { sente: '馬', gote: '馬' },
	promoted_silver: { sente: '成銀', gote: '成銀' },
	promoted_knight: { sente: '成桂', gote: '成桂' },
	promoted_lance: { sente: '成香', gote: '成香' },
	promoted_pawn: { sente: 'と', gote: 'と' },
};

export const PROMOTABLE_PIECES: ShogiPieceType[] = [
	'pawn',
	'lance',
	'knight',
	'silver',
	'bishop',
	'rook',
];

export const PROMOTION_MAP: Record<ShogiPieceType, ShogiPieceType> = {
	pawn: 'promoted_pawn',
	lance: 'promoted_lance',
	knight: 'promoted_knight',
	silver: 'promoted_silver',
	bishop: 'horse',
	rook: 'dragon',
};

// Export all functions in a simple, working implementation
export function createInitialGameState(): ShogiGameState {
	const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
		.fill(null)
		.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

	// Gote pieces (top side, rows 0-2)
	const goteBackRow: ShogiPieceType[] = [
		'lance',
		'knight',
		'silver',
		'gold',
		'king',
		'gold',
		'silver',
		'knight',
		'lance',
	];

	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[0][col] = { type: goteBackRow[col], color: 'gote' };
	}

	board[1][1] = { type: 'bishop', color: 'gote' };
	board[1][7] = { type: 'rook', color: 'gote' };

	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[2][col] = { type: 'pawn', color: 'gote' };
	}

	// Sente pieces (bottom side, rows 6-8)
	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[6][col] = { type: 'pawn', color: 'sente' };
	}

	board[7][1] = { type: 'rook', color: 'sente' };
	board[7][7] = { type: 'bishop', color: 'sente' };

	const senteBackRow: ShogiPieceType[] = [
		'lance',
		'knight',
		'silver',
		'gold',
		'king',
		'gold',
		'silver',
		'knight',
		'lance',
	];

	for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
		board[8][col] = { type: senteBackRow[col], color: 'sente' };
	}

	return {
		board,
		currentPlayer: 'sente',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		senteHand: [],
		goteHand: [],
		selectedHandPiece: null,
	};
}

// Simple function to select a square and show possible moves
export function selectSquare(
	gameState: ShogiGameState,
	position: ShogiPosition
): ShogiGameState {
	const newState = { ...gameState };
	const piece = gameState.board[position.row]?.[position.col];

	if (piece && piece.color === gameState.currentPlayer) {
		newState.selectedSquare = position;
		// For now, just show a simple pawn move forward
		if (piece.type === 'pawn') {
			const direction = piece.color === 'sente' ? -1 : 1;
			const targetRow = position.row + direction;
			if (
				targetRow >= 0 &&
				targetRow < SHOGI_BOARD_SIZE &&
				!gameState.board[targetRow][position.col]
			) {
				newState.possibleMoves = [{ row: targetRow, col: position.col }];
			} else {
				newState.possibleMoves = [];
			}
		} else {
			newState.possibleMoves = [];
		}
		newState.selectedHandPiece = null;
	} else if (gameState.selectedSquare) {
		// Try to make a move
		const validMove = gameState.possibleMoves.some(
			move => move.row === position.row && move.col === position.col
		);

		if (validMove && gameState.selectedSquare) {
			const selectedPiece =
				gameState.board[gameState.selectedSquare.row][
					gameState.selectedSquare.col
				];
			if (selectedPiece) {
				newState.board = gameState.board.map(row => [...row]);
				newState.board[position.row][position.col] = selectedPiece;
				newState.board[gameState.selectedSquare.row][
					gameState.selectedSquare.col
				] = null;
				newState.currentPlayer =
					gameState.currentPlayer === 'sente' ? 'gote' : 'sente';
			}
		}

		newState.selectedSquare = null;
		newState.possibleMoves = [];
		newState.selectedHandPiece = null;
	} else {
		newState.selectedSquare = null;
		newState.possibleMoves = [];
		newState.selectedHandPiece = null;
	}

	return newState;
}

export function selectHandPiece(
	gameState: ShogiGameState,
	piece: ShogiPiece
): ShogiGameState {
	const newState = { ...gameState };

	if (piece.color === gameState.currentPlayer) {
		newState.selectedHandPiece = piece;
		newState.possibleMoves = []; // For now, no drop moves
		newState.selectedSquare = null;
	}

	return newState;
}

export function clearSelection(gameState: ShogiGameState): ShogiGameState {
	return {
		...gameState,
		selectedSquare: null,
		possibleMoves: [],
		selectedHandPiece: null,
	};
}
