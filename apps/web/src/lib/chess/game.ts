import type {
	GameState,
	Position,
	Move,
	PieceColor,
	ChessPiece,
	GameMode,
} from './types';
import { createInitialBoard, getPieceAt, setPieceAt, copyBoard } from './board';
import { getPossibleMoves, isMoveValid } from './moves';

export function createInitialGameState(
	mode: GameMode = 'human-vs-human',
	aiPlayer?: PieceColor
): GameState {
	return {
		board: createInitialBoard(),
		currentPlayer: 'white',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		mode,
		aiPlayer,
		isAiThinking: false,
	};
}

export function selectSquare(
	gameState: GameState,
	position: Position
): GameState {
	const piece = getPieceAt(gameState.board, position);

	// If clicking on an empty square or opponent's piece, clear selection
	if (!piece || piece.color !== gameState.currentPlayer) {
		return {
			...gameState,
			selectedSquare: null,
			possibleMoves: [],
		};
	}

	// If clicking on the same square, deselect
	if (
		gameState.selectedSquare?.row === position.row &&
		gameState.selectedSquare?.col === position.col
	) {
		return {
			...gameState,
			selectedSquare: null,
			possibleMoves: [],
		};
	}

	// Select the piece and show possible moves
	const possibleMoves = getPossibleMoves(gameState.board, piece, position);

	return {
		...gameState,
		selectedSquare: position,
		possibleMoves,
	};
}

export function makeMove(
	gameState: GameState,
	from: Position,
	to: Position
): GameState | null {
	const piece = getPieceAt(gameState.board, from);

	if (!piece || piece.color !== gameState.currentPlayer) {
		return null;
	}

	if (!isMoveValid(gameState.board, from, to, piece)) {
		return null;
	}

	// Create new board state
	const newBoard = copyBoard(gameState.board);
	const capturedPiece = getPieceAt(newBoard, to);

	// Move the piece
	setPieceAt(newBoard, from, null);
	setPieceAt(newBoard, to, { ...piece, hasMoved: true });

	// Check if this move would leave the king in check
	if (isKingInCheck(newBoard, gameState.currentPlayer)) {
		return null; // Invalid move - would leave king in check
	}

	// Create move record
	const move: Move = {
		from,
		to,
		piece,
		capturedPiece: capturedPiece || undefined,
	};

	// Switch player
	const nextPlayer: PieceColor =
		gameState.currentPlayer === 'white' ? 'black' : 'white';

	return {
		...gameState,
		board: newBoard,
		currentPlayer: nextPlayer,
		moveHistory: [...gameState.moveHistory, move],
		selectedSquare: null,
		possibleMoves: [],
		status: 'playing', // For now, always keep playing
	};
}

export function isKingInCheck(
	board: (ChessPiece | null)[][],
	kingColor: PieceColor
): boolean {
	// Find the king
	let kingPosition: Position | null = null;

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const piece = board[row]?.[col];
			if (piece?.type === 'king' && piece.color === kingColor) {
				kingPosition = { row, col };
				break;
			}
		}
		if (kingPosition) break;
	}

	if (!kingPosition) return false;

	// Check if any opponent piece can attack the king
	const opponentColor: PieceColor = kingColor === 'white' ? 'black' : 'white';

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const piece = board[row]?.[col];
			if (piece && piece.color === opponentColor) {
				const moves = getPossibleMoves(board, piece, { row, col });
				if (
					moves.some(
						move =>
							move.row === kingPosition!.row && move.col === kingPosition!.col
					)
				) {
					return true;
				}
			}
		}
	}

	return false;
}

export function getGameStatus(gameState: GameState): GameState['status'] {
	const inCheck = isKingInCheck(gameState.board, gameState.currentPlayer);

	if (inCheck) {
		// Check if there are any legal moves
		const hasLegalMoves = hasAnyLegalMoves(gameState);
		return hasLegalMoves ? 'check' : 'checkmate';
	}

	// Check for stalemate
	const hasLegalMoves = hasAnyLegalMoves(gameState);
	return hasLegalMoves ? 'playing' : 'stalemate';
}

function hasAnyLegalMoves(gameState: GameState): boolean {
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const piece = gameState.board[row]?.[col];
			if (piece && piece.color === gameState.currentPlayer) {
				const moves = getPossibleMoves(gameState.board, piece, {
					row,
					col,
				});
				for (const move of moves) {
					// Check if this move would leave the king in check
					const testBoard = copyBoard(gameState.board);
					setPieceAt(testBoard, { row, col }, null);
					setPieceAt(testBoard, move, piece);

					if (!isKingInCheck(testBoard, gameState.currentPlayer)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export function makeAIMove(
	gameState: GameState,
	from: string,
	to: string
): GameState | null {
	// Convert algebraic notation to positions
	const fromPos = algebraicToPosition(from);
	const toPos = algebraicToPosition(to);

	if (!fromPos || !toPos) {
		return null;
	}

	return makeMove(gameState, fromPos, toPos);
}

export function setAIThinking(
	gameState: GameState,
	thinking: boolean
): GameState {
	return {
		...gameState,
		isAiThinking: thinking,
	};
}

export function isAITurn(gameState: GameState): boolean {
	return (
		gameState.mode === 'human-vs-ai' &&
		gameState.currentPlayer === gameState.aiPlayer &&
		(gameState.status === 'playing' || gameState.status === 'check')
	);
}

export function algebraicToPosition(algebraic: string): Position | null {
	if (algebraic.length !== 2) return null;

	const file = algebraic.charAt(0);
	const rank = algebraic.charAt(1);

	const col = file.charCodeAt(0) - 'a'.charCodeAt(0);
	const row = 8 - parseInt(rank);

	if (col < 0 || col > 7 || row < 0 || row > 7) return null;

	return { row, col };
}
