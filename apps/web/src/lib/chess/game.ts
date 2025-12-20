/* eslint-disable no-console */
import type {
	GameState,
	Position,
	Move,
	PieceColor,
	ChessPiece,
	GameMode,
	PieceType,
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

	// Select the piece and show possible moves (pass gameState for en passant and castling)
	const possibleMoves = getPossibleMoves(
		gameState.board,
		piece,
		position,
		gameState
	);

	return {
		...gameState,
		selectedSquare: position,
		possibleMoves,
	};
}

export function makeMove(
	gameState: GameState,
	from: Position,
	to: Position,
	promotionPiece?: PieceType
): GameState | null {
	const piece = getPieceAt(gameState.board, from);

	if (!piece || piece.color !== gameState.currentPlayer) {
		return null;
	}

	if (!isMoveValid(gameState.board, from, to, piece, gameState)) {
		return null;
	}

	// Create new board state
	const newBoard = copyBoard(gameState.board);
	let capturedPiece = getPieceAt(newBoard, to);
	let isEnPassant = false;
	let isCastling = false;
	let promotion: PieceType | undefined;
	let enPassantTarget: Position | undefined;

	// Handle en passant capture
	if (
		piece.type === 'pawn' &&
		gameState.enPassantTarget &&
		to.row === gameState.enPassantTarget.row &&
		to.col === gameState.enPassantTarget.col
	) {
		isEnPassant = true;
		// The captured pawn is on the same column as destination but on the same row as the moving pawn
		const capturedPawnPos = { row: from.row, col: to.col };
		capturedPiece = getPieceAt(newBoard, capturedPawnPos);
		setPieceAt(newBoard, capturedPawnPos, null);
	}

	// Handle castling
	if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
		isCastling = true;
		const row = from.row;

		if (to.col === 6) {
			// Kingside castling - move rook from h to f
			const rook = getPieceAt(newBoard, { row, col: 7 });
			setPieceAt(newBoard, { row, col: 7 }, null);
			setPieceAt(newBoard, { row, col: 5 }, { ...rook!, hasMoved: true });
		} else if (to.col === 2) {
			// Queenside castling - move rook from a to d
			const rook = getPieceAt(newBoard, { row, col: 0 });
			setPieceAt(newBoard, { row, col: 0 }, null);
			setPieceAt(newBoard, { row, col: 3 }, { ...rook!, hasMoved: true });
		}
	}

	// Handle pawn promotion
	if (piece.type === 'pawn') {
		const promotionRow = piece.color === 'white' ? 0 : 7;
		if (to.row === promotionRow) {
			promotion = promotionPiece || 'queen'; // Default to queen if not specified
		}
	}

	// Set en passant target if pawn moved two squares
	if (piece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
		const direction = piece.color === 'white' ? -1 : 1;
		enPassantTarget = { row: from.row + direction, col: from.col };
	}

	// Move the piece (with promotion if applicable)
	setPieceAt(newBoard, from, null);
	const movedPiece: ChessPiece = promotion
		? { type: promotion, color: piece.color, hasMoved: true }
		: { ...piece, hasMoved: true };
	setPieceAt(newBoard, to, movedPiece);

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
		isEnPassant: isEnPassant || undefined,
		isCastling: isCastling || undefined,
		promotion,
	};

	// Switch player
	const nextPlayer: PieceColor =
		gameState.currentPlayer === 'white' ? 'black' : 'white';

	// Create new game state
	const newGameState: GameState = {
		...gameState,
		board: newBoard,
		currentPlayer: nextPlayer,
		moveHistory: [...gameState.moveHistory, move],
		selectedSquare: null,
		possibleMoves: [],
		status: 'playing',
		enPassantTarget,
	};

	// Auto-detect game status
	newGameState.status = getGameStatus(newGameState);

	return newGameState;
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
				const moves = getPossibleMoves(
					gameState.board,
					piece,
					{ row, col },
					gameState
				);
				for (const move of moves) {
					// Check if this move would leave the king in check
					const testBoard = copyBoard(gameState.board);
					setPieceAt(testBoard, { row, col }, null);
					setPieceAt(testBoard, move, piece);

					// Handle en passant capture for legality check
					if (
						piece.type === 'pawn' &&
						gameState.enPassantTarget &&
						move.row === gameState.enPassantTarget.row &&
						move.col === gameState.enPassantTarget.col
					) {
						const capturedPawnPos = { row, col: move.col };
						setPieceAt(testBoard, capturedPawnPos, null);
					}

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
		console.error(`❌ Position conversion failed: ${from} → ${to}`);
		return null;
	}

	const result = makeMove(gameState, fromPos, toPos);

	if (!result) {
		console.error(`❌ makeMove failed for ${from} → ${to}`);
	}

	return result;
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
