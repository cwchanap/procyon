import type {
	JunglePiece,
	JunglePosition,
	JungleMove,
	JungleGameState,
	JungleGameStatus,
	JunglePieceColor,
} from './types';
import { createInitialBoard, getPieceAt, copyGameState } from './board';
import {
	getPossibleMoves,
	makeMove,
	isWinningMove,
	hasValidMoves,
} from './moves';
import { createInitialTerrain } from './types';

/**
 * Create initial game state for Jungle chess
 */
export function createInitialGameState(): JungleGameState {
	return {
		board: createInitialBoard(),
		terrain: createInitialTerrain(),
		currentPlayer: 'red',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
	};
}

/**
 * Select a square and show possible moves
 */
export function selectSquare(
	gameState: JungleGameState,
	position: JunglePosition
): JungleGameState {
	const newState = copyGameState(gameState);
	const piece = getPieceAt(gameState.board, position);

	// If clicking on a piece of the current player, select it
	if (piece && piece.color === gameState.currentPlayer) {
		newState.selectedSquare = position;
		newState.possibleMoves = getPossibleMoves(
			gameState.board,
			gameState.terrain,
			position
		);
		return newState;
	}

	// If a square is already selected, try to make a move
	if (gameState.selectedSquare) {
		const isValidMove = gameState.possibleMoves.some(
			move => move.row === position.row && move.col === position.col
		);

		if (isValidMove) {
			const moveResult = makeMove(
				gameState.board,
				gameState.terrain,
				gameState.selectedSquare,
				position
			);

			if (moveResult) {
				// Apply the move
				newState.board = moveResult.newBoard;

				// Create move record
				const movingPiece = getPieceAt(moveResult.newBoard, position)!;
				const move: JungleMove = {
					from: gameState.selectedSquare,
					to: position,
					piece: movingPiece,
					capturedPiece: moveResult.capturedPiece || undefined,
				};

				// Add to move history
				newState.moveHistory = [...gameState.moveHistory, move];

				// Check for win condition
				if (
					isWinningMove(
						gameState.terrain,
						gameState.selectedSquare,
						position,
						movingPiece
					)
				) {
					newState.status = 'checkmate';
				} else {
					// Check if opponent has any valid moves
					const opponentColor =
						gameState.currentPlayer === 'red' ? 'blue' : 'red';
					if (
						!hasValidMoves(
							moveResult.newBoard,
							gameState.terrain,
							opponentColor
						)
					) {
						newState.status = 'checkmate';
					} else {
						newState.status = 'playing';
					}
				}

				// Switch player
				newState.currentPlayer =
					gameState.currentPlayer === 'red' ? 'blue' : 'red';
			}
		}
	}

	// Clear selection
	newState.selectedSquare = null;
	newState.possibleMoves = [];
	return newState;
}

/**
 * Make a move directly (for AI)
 */
export function makeGameMove(
	gameState: JungleGameState,
	from: JunglePosition,
	to: JunglePosition
): JungleGameState | null {
	const moveResult = makeMove(gameState.board, gameState.terrain, from, to);

	if (!moveResult) {
		return null;
	}

	const newState = copyGameState(gameState);
	newState.board = moveResult.newBoard;

	// Create move record
	const movingPiece = getPieceAt(moveResult.newBoard, to)!;
	const move: JungleMove = {
		from,
		to,
		piece: movingPiece,
		capturedPiece: moveResult.capturedPiece || undefined,
	};

	// Add to move history
	newState.moveHistory = [...gameState.moveHistory, move];

	// Check for win condition
	if (isWinningMove(gameState.terrain, from, to, movingPiece)) {
		newState.status = 'checkmate';
	} else {
		// Check if opponent has any valid moves
		const opponentColor = gameState.currentPlayer === 'red' ? 'blue' : 'red';
		if (!hasValidMoves(moveResult.newBoard, gameState.terrain, opponentColor)) {
			newState.status = 'checkmate';
		} else {
			newState.status = 'playing';
		}
	}

	// Switch player
	newState.currentPlayer = gameState.currentPlayer === 'red' ? 'blue' : 'red';
	newState.selectedSquare = null;
	newState.possibleMoves = [];

	return newState;
}

/**
 * Get the current game status
 */
export function getGameStatus(gameState: JungleGameState): JungleGameStatus {
	// Check if any player has won
	for (const move of gameState.moveHistory) {
		const targetTerrain = gameState.terrain[move.to.row]![move.to.col];
		if (
			targetTerrain &&
			targetTerrain.type === 'den' &&
			targetTerrain.owner !== move.piece.color
		) {
			return 'checkmate';
		}
	}

	// Check if current player has any valid moves
	if (
		!hasValidMoves(gameState.board, gameState.terrain, gameState.currentPlayer)
	) {
		return 'checkmate';
	}

	return 'playing';
}

/**
 * Reset the game to initial state
 */
export function resetGame(): JungleGameState {
	return createInitialGameState();
}

/**
 * Clear selection
 */
export function clearSelection(gameState: JungleGameState): JungleGameState {
	const newState = copyGameState(gameState);
	newState.selectedSquare = null;
	newState.possibleMoves = [];
	return newState;
}

/**
 * Check if a position contains a piece that can be captured
 */
export function getCapturablePiece(
	gameState: JungleGameState,
	position: JunglePosition
): JunglePiece | null {
	const piece = getPieceAt(gameState.board, position);
	if (!piece) {
		return null;
	}

	// Check if piece is in enemy trap
	const terrain = gameState.terrain[position.row]![position.col];
	if (terrain && terrain.type === 'trap' && terrain.owner !== piece.color) {
		return piece; // Pieces in enemy traps can be captured by anyone
	}

	return piece;
}

/**
 * Get all pieces of a specific type
 */
export function getPiecesByType(
	gameState: JungleGameState,
	pieceType: JunglePiece['type']
): JunglePiece[] {
	const pieces: JunglePiece[] = [];
	for (let row = 0; row < 9; row++) {
		for (let col = 0; col < 7; col++) {
			const piece = gameState.board[row]![col];
			if (piece && piece.type === pieceType) {
				pieces.push(piece);
			}
		}
	}
	return pieces;
}

/**
 * Check if a player has won
 */
export function hasPlayerWon(
	gameState: JungleGameState,
	player: JunglePieceColor
): boolean {
	// Check if player has any piece in opponent's den
	const opponentDen =
		player === 'red'
			? { row: 0, col: 3 } // Blue den
			: { row: 8, col: 3 }; // Red den

	const piece = getPieceAt(gameState.board, opponentDen);
	return piece !== null && piece.color === player;
}

/**
 * Get the winner of the game
 */
export function getWinner(gameState: JungleGameState): JunglePieceColor | null {
	if (hasPlayerWon(gameState, 'red')) {
		return 'red';
	}
	if (hasPlayerWon(gameState, 'blue')) {
		return 'blue';
	}
	return null;
}

/**
 * Validate if a move is legal in current game state
 */
export function isLegalMove(
	gameState: JungleGameState,
	from: JunglePosition,
	to: JunglePosition
): boolean {
	const piece = getPieceAt(gameState.board, from);
	if (!piece || piece.color !== gameState.currentPlayer) {
		return false;
	}

	const possibleMoves = getPossibleMoves(
		gameState.board,
		gameState.terrain,
		from
	);

	return possibleMoves.some(move => move.row === to.row && move.col === to.col);
}
