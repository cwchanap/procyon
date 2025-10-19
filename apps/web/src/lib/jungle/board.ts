import type {
	JunglePiece,
	JunglePosition,
	JungleTerrain,
	JungleGameState,
} from './types';
import { JUNGLE_ROWS, JUNGLE_COLS, PIECE_RANKS } from './types';

/**
 * Create the initial board setup for Jungle chess
 */
export function createInitialBoard(): (JunglePiece | null)[][] {
	const board: (JunglePiece | null)[][] = Array(JUNGLE_ROWS)
		.fill(null)
		.map(() => Array(JUNGLE_COLS).fill(null));

	// Red pieces (bottom)
	board[8]![0] = { type: 'lion', color: 'red', rank: PIECE_RANKS.lion };
	board[8]![6] = { type: 'tiger', color: 'red', rank: PIECE_RANKS.tiger };
	board[7]![1] = { type: 'dog', color: 'red', rank: PIECE_RANKS.dog };
	board[7]![5] = { type: 'cat', color: 'red', rank: PIECE_RANKS.cat };
	board[6]![0] = {
		type: 'elephant',
		color: 'red',
		rank: PIECE_RANKS.elephant,
	};
	board[6]![2] = { type: 'wolf', color: 'red', rank: PIECE_RANKS.wolf };
	board[6]![4] = { type: 'leopard', color: 'red', rank: PIECE_RANKS.leopard };
	board[6]![6] = { type: 'rat', color: 'red', rank: PIECE_RANKS.rat };

	// Blue pieces (top)
	board[0]![6] = { type: 'lion', color: 'blue', rank: PIECE_RANKS.lion };
	board[0]![0] = { type: 'tiger', color: 'blue', rank: PIECE_RANKS.tiger };
	board[1]![5] = { type: 'dog', color: 'blue', rank: PIECE_RANKS.dog };
	board[1]![1] = { type: 'cat', color: 'blue', rank: PIECE_RANKS.cat };
	board[2]![6] = {
		type: 'elephant',
		color: 'blue',
		rank: PIECE_RANKS.elephant,
	};
	board[2]![4] = { type: 'wolf', color: 'blue', rank: PIECE_RANKS.wolf };
	board[2]![2] = {
		type: 'leopard',
		color: 'blue',
		rank: PIECE_RANKS.leopard,
	};
	board[2]![0] = { type: 'rat', color: 'blue', rank: PIECE_RANKS.rat };

	return board;
}

/**
 * Get the piece at a specific position
 */
export function getPieceAt(
	board: (JunglePiece | null)[][],
	position: JunglePosition
): JunglePiece | null {
	if (
		position.row < 0 ||
		position.row >= JUNGLE_ROWS ||
		position.col < 0 ||
		position.col >= JUNGLE_COLS
	) {
		return null;
	}
	return board[position.row]![position.col] || null;
}

/**
 * Set a piece at a specific position
 */
export function setPieceAt(
	board: (JunglePiece | null)[][],
	position: JunglePosition,
	piece: JunglePiece | null
): void {
	if (
		position.row < 0 ||
		position.row >= JUNGLE_ROWS ||
		position.col < 0 ||
		position.col >= JUNGLE_COLS
	) {
		return;
	}
	board[position.row]![position.col] = piece;
}

/**
 * Get the terrain at a specific position
 */
export function getTerrainAt(
	terrain: JungleTerrain[][],
	position: JunglePosition
): JungleTerrain {
	if (
		position.row < 0 ||
		position.row >= JUNGLE_ROWS ||
		position.col < 0 ||
		position.col >= JUNGLE_COLS
	) {
		return { type: 'normal' };
	}
	return terrain[position.row]![position.col] || { type: 'normal' };
}

/**
 * Check if a position is within the board bounds
 */
export function isValidPosition(position: JunglePosition): boolean {
	return (
		position.row >= 0 &&
		position.row < JUNGLE_ROWS &&
		position.col >= 0 &&
		position.col < JUNGLE_COLS
	);
}

/**
 * Check if two positions are the same
 */
export function positionsEqual(
	pos1: JunglePosition,
	pos2: JunglePosition
): boolean {
	return pos1.row === pos2.row && pos1.col === pos2.col;
}

/**
 * Get all pieces of a specific color
 */
export function getPiecesByColor(
	board: (JunglePiece | null)[][],
	color: 'red' | 'blue'
): JunglePiece[] {
	const pieces: JunglePiece[] = [];
	for (let row = 0; row < JUNGLE_ROWS; row++) {
		for (let col = 0; col < JUNGLE_COLS; col++) {
			const piece = board[row]![col];
			if (piece && piece.color === color) {
				pieces.push(piece);
			}
		}
	}
	return pieces;
}

/**
 * Find the position of a specific piece
 */
export function findPiecePosition(
	board: (JunglePiece | null)[][],
	piece: JunglePiece
): JunglePosition | null {
	for (let row = 0; row < JUNGLE_ROWS; row++) {
		for (let col = 0; col < JUNGLE_COLS; col++) {
			const boardPiece = board[row]![col];
			if (
				boardPiece &&
				boardPiece.type === piece.type &&
				boardPiece.color === piece.color
			) {
				return { row, col };
			}
		}
	}
	return null;
}

/**
 * Create a deep copy of the board
 */
export function copyBoard(
	board: (JunglePiece | null)[][]
): (JunglePiece | null)[][] {
	return board.map(row => [...row]);
}

/**
 * Create a deep copy of the terrain
 */
export function copyTerrain(terrain: JungleTerrain[][]): JungleTerrain[][] {
	return terrain.map(row => [...row]);
}

/**
 * Create a deep copy of the game state
 */
export function copyGameState(gameState: JungleGameState): JungleGameState {
	return {
		board: copyBoard(gameState.board),
		terrain: copyTerrain(gameState.terrain),
		currentPlayer: gameState.currentPlayer,
		status: gameState.status,
		moveHistory: [...gameState.moveHistory],
		selectedSquare: gameState.selectedSquare
			? { ...gameState.selectedSquare }
			: null,
		possibleMoves: gameState.possibleMoves.map(pos => ({ ...pos })),
	};
}

/**
 * Check if a position contains water
 */
export function isWaterPosition(
	terrain: JungleTerrain[][],
	position: JunglePosition
): boolean {
	const terrainAtPos = getTerrainAt(terrain, position);
	return terrainAtPos.type === 'water';
}

/**
 * Check if a position is a trap
 */
export function isTrapPosition(
	terrain: JungleTerrain[][],
	position: JunglePosition
): boolean {
	const terrainAtPos = getTerrainAt(terrain, position);
	return terrainAtPos.type === 'trap';
}

/**
 * Check if a position is a den
 */
export function isDenPosition(
	terrain: JungleTerrain[][],
	position: JunglePosition
): boolean {
	const terrainAtPos = getTerrainAt(terrain, position);
	return terrainAtPos.type === 'den';
}

/**
 * Get the owner of a trap or den at a position
 */
export function getTerrainOwner(
	terrain: JungleTerrain[][],
	position: JunglePosition
): 'red' | 'blue' | null {
	const terrainAtPos = getTerrainAt(terrain, position);
	return terrainAtPos.owner || null;
}
