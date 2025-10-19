import type {
	XiangqiGameState,
	XiangqiPosition,
	XiangqiMove,
	XiangqiPieceColor,
	XiangqiGameStatus,
} from './types';
import { XIANGQI_ROWS, XIANGQI_COLS } from './types';
import {
	createInitialXiangqiBoard,
	getPieceAt,
	findKing,
	copyBoard,
} from './board';
import { isValidMove, getPossibleMoves, makeMove } from './moves';

export function createInitialXiangqiGameState(): XiangqiGameState {
	return {
		board: createInitialXiangqiBoard(),
		currentPlayer: 'red', // Red moves first in Xiangqi
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
	};
}

export function selectSquare(
	gameState: XiangqiGameState,
	position: XiangqiPosition
): XiangqiGameState {
	const piece = getPieceAt(gameState.board, position);

	if (gameState.selectedSquare) {
		// A square is already selected
		if (
			gameState.selectedSquare.row === position.row &&
			gameState.selectedSquare.col === position.col
		) {
			// Deselect if clicking the same square
			return {
				...gameState,
				selectedSquare: null,
				possibleMoves: [],
			};
		}

		// Try to make a move
		if (isValidMove(gameState.board, gameState.selectedSquare, position)) {
			return makeXiangqiMove(gameState, gameState.selectedSquare, position);
		}

		// Select new piece if it belongs to current player
		if (piece && piece.color === gameState.currentPlayer) {
			return {
				...gameState,
				selectedSquare: position,
				possibleMoves: getPossibleMoves(gameState.board, position),
			};
		}

		// Deselect if invalid move or opponent's piece
		return {
			...gameState,
			selectedSquare: null,
			possibleMoves: [],
		};
	} else {
		// No square selected, select if it's current player's piece
		if (piece && piece.color === gameState.currentPlayer) {
			return {
				...gameState,
				selectedSquare: position,
				possibleMoves: getPossibleMoves(gameState.board, position),
			};
		}
		return gameState;
	}
}

function makeXiangqiMove(
	gameState: XiangqiGameState,
	from: XiangqiPosition,
	to: XiangqiPosition
): XiangqiGameState {
	const piece = getPieceAt(gameState.board, from);
	const capturedPiece = getPieceAt(gameState.board, to);

	if (!piece) return gameState;

	const move: XiangqiMove = {
		from,
		to,
		piece,
		capturedPiece: capturedPiece || undefined,
	};

	const newBoard = makeMove(gameState.board, move);
	const newPlayer = gameState.currentPlayer === 'red' ? 'black' : 'red';
	const newStatus = calculateGameStatus(newBoard, newPlayer);

	return {
		board: newBoard,
		currentPlayer: newPlayer,
		status: newStatus,
		moveHistory: [...gameState.moveHistory, move],
		selectedSquare: null,
		possibleMoves: [],
	};
}

function calculateGameStatus(
	board: XiangqiGameState['board'],
	currentPlayer: XiangqiPieceColor
): XiangqiGameStatus {
	const kingPosition = findKing(board, currentPlayer);

	if (!kingPosition) {
		return 'checkmate'; // King captured
	}

	const inCheck = isKingInCheck(board, currentPlayer);
	const hasValidMoves = playerHasValidMoves(board, currentPlayer);

	if (inCheck) {
		if (!hasValidMoves) {
			return 'checkmate';
		}
		return 'check';
	} else {
		if (!hasValidMoves) {
			return 'stalemate';
		}
		return 'playing';
	}
}

export function isKingInCheck(
	board: XiangqiGameState['board'],
	kingColor: XiangqiPieceColor
): boolean {
	const kingPosition = findKing(board, kingColor);
	if (!kingPosition) return false;

	const opponentColor = kingColor === 'red' ? 'black' : 'red';

	// Check if any opponent piece can attack the king
	for (let row = 0; row < XIANGQI_ROWS; row++) {
		for (let col = 0; col < XIANGQI_COLS; col++) {
			const piece = board[row][col];
			if (piece && piece.color === opponentColor) {
				const from = { row, col };
				if (isValidMove(board, from, kingPosition)) {
					return true;
				}
			}
		}
	}
	return false;
}

function playerHasValidMoves(
	board: XiangqiGameState['board'],
	playerColor: XiangqiPieceColor
): boolean {
	for (let row = 0; row < XIANGQI_ROWS; row++) {
		for (let col = 0; col < XIANGQI_COLS; col++) {
			const piece = board[row][col];
			if (piece && piece.color === playerColor) {
				const from = { row, col };
				const moves = getPossibleMoves(board, from);

				// Check if any move leaves the king safe
				for (const moveTo of moves) {
					const testMove: XiangqiMove = {
						from,
						to: moveTo,
						piece,
						capturedPiece: getPieceAt(board, moveTo) || undefined,
					};

					const testBoard = makeMove(board, testMove);
					if (!isKingInCheck(testBoard, playerColor)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export function undoMove(gameState: XiangqiGameState): XiangqiGameState {
	if (gameState.moveHistory.length === 0) return gameState;

	const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
	const newBoard = copyBoard(gameState.board);

	// Restore the piece to its original position
	newBoard[lastMove.from.row][lastMove.from.col] = lastMove.piece;

	// Restore captured piece if any
	if (lastMove.capturedPiece) {
		newBoard[lastMove.to.row][lastMove.to.col] = lastMove.capturedPiece;
	} else {
		newBoard[lastMove.to.row][lastMove.to.col] = null;
	}

	const previousPlayer = gameState.currentPlayer === 'red' ? 'black' : 'red';
	const newStatus = calculateGameStatus(newBoard, previousPlayer);

	return {
		board: newBoard,
		currentPlayer: previousPlayer,
		status: newStatus,
		moveHistory: gameState.moveHistory.slice(0, -1),
		selectedSquare: null,
		possibleMoves: [],
	};
}

export function resetGame(): XiangqiGameState {
	return createInitialXiangqiGameState();
}
