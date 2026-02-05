import type {
	ShogiGameState,
	ShogiPosition,
	ShogiMove,
	ShogiPieceColor,
	ShogiPiece,
} from './types';
import { SHOGI_BOARD_SIZE } from './types';
import {
	createInitialBoard,
	getPieceAt,
	setPieceAt,
	copyBoard,
	canPromote,
	mustPromote,
	getPromotedType,
	getBaseType,
	algebraicToPosition,
} from './board';
import {
	getPossibleMoves,
	isMoveValid,
	canDropAt,
	getDropPositions,
} from './moves';

export function createInitialGameState(): ShogiGameState {
	return {
		board: createInitialBoard(),
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

export function selectSquare(
	gameState: ShogiGameState,
	position: ShogiPosition
): ShogiGameState {
	const piece = getPieceAt(gameState.board, position);

	// If a hand piece is selected, try to drop it
	if (gameState.selectedHandPiece) {
		if (canDropAt(gameState.board, gameState.selectedHandPiece, position)) {
			// Valid drop position - this will be handled by makeMove
			return {
				...gameState,
				possibleMoves: [position],
			};
		}
		// Invalid drop position, clear selection
		return {
			...gameState,
			selectedHandPiece: null,
			possibleMoves: [],
		};
	}

	// If clicking on own piece, select it
	if (piece && piece.color === gameState.currentPlayer) {
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
			selectedHandPiece: null,
		};
	}

	// If clicking on empty square or opponent's piece with no selection, clear
	if (!gameState.selectedSquare) {
		return {
			...gameState,
			selectedSquare: null,
			possibleMoves: [],
		};
	}

	// Otherwise, the click might be a move destination (handled elsewhere)
	return gameState;
}

export function selectHandPiece(
	gameState: ShogiGameState,
	piece: ShogiPiece
): ShogiGameState {
	if (piece.color !== gameState.currentPlayer) {
		return gameState;
	}

	const dropPositions = getDropPositions(gameState.board, piece);

	return {
		...gameState,
		selectedHandPiece: piece,
		selectedSquare: null,
		possibleMoves: dropPositions,
	};
}

export function clearSelection(gameState: ShogiGameState): ShogiGameState {
	return {
		...gameState,
		selectedSquare: null,
		possibleMoves: [],
		selectedHandPiece: null,
	};
}

export function makeMove(
	gameState: ShogiGameState,
	from: ShogiPosition | null,
	to: ShogiPosition,
	promote: boolean = false
): ShogiGameState | null {
	// Handle drop moves
	if (from === null && gameState.selectedHandPiece) {
		return makeDrop(gameState, to);
	}

	if (!from) return null;

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

	// Determine if piece should promote
	const shouldPromote = promote && canPromote(piece, from, to);
	const forcedPromotion = mustPromote(piece, to);

	// Create the moved piece
	let movedPiece: ShogiPiece = { ...piece };
	if (shouldPromote || forcedPromotion) {
		movedPiece = {
			...piece,
			type: getPromotedType(piece.type),
			isPromoted: true,
		};
	}

	// Move the piece
	setPieceAt(newBoard, from, null);
	setPieceAt(newBoard, to, movedPiece);

	// Check if this move would leave the king in check
	if (isKingInCheck(newBoard, gameState.currentPlayer)) {
		return null; // Invalid move - would leave king in check
	}

	// Handle captured piece - add to hand
	let newSenteHand = [...gameState.senteHand];
	let newGoteHand = [...gameState.goteHand];

	if (capturedPiece) {
		// Convert to base type and change color for drop
		const handPiece: ShogiPiece = {
			type: getBaseType(capturedPiece.type),
			color: gameState.currentPlayer,
			isPromoted: false,
		};

		if (gameState.currentPlayer === 'sente') {
			newSenteHand = [...newSenteHand, handPiece];
		} else {
			newGoteHand = [...newGoteHand, handPiece];
		}
	}

	// Create move record
	const move: ShogiMove = {
		from,
		to,
		piece,
		capturedPiece: capturedPiece || undefined,
		isPromotion: shouldPromote || forcedPromotion,
		isDrop: false,
	};

	// Switch player
	const nextPlayer: ShogiPieceColor =
		gameState.currentPlayer === 'sente' ? 'gote' : 'sente';

	// Calculate new game status
	const newState: ShogiGameState = {
		...gameState,
		board: newBoard,
		currentPlayer: nextPlayer,
		moveHistory: [...gameState.moveHistory, move],
		selectedSquare: null,
		possibleMoves: [],
		selectedHandPiece: null,
		senteHand: newSenteHand,
		goteHand: newGoteHand,
		status: 'playing',
	};

	// Update status based on check/checkmate
	newState.status = getGameStatus(newState);

	return newState;
}

function makeDrop(
	gameState: ShogiGameState,
	to: ShogiPosition
): ShogiGameState | null {
	const piece = gameState.selectedHandPiece;
	if (!piece) return null;

	if (!canDropAt(gameState.board, piece, to)) {
		return null;
	}

	// Create new board state
	const newBoard = copyBoard(gameState.board);

	// Place the piece
	const droppedPiece: ShogiPiece = {
		...piece,
		isPromoted: false,
	};
	setPieceAt(newBoard, to, droppedPiece);

	// Check if this drop would leave the king in check
	if (isKingInCheck(newBoard, gameState.currentPlayer)) {
		return null;
	}

	// TODO: Check for pawn drop checkmate (uchifuzume) - illegal in shogi
	// This is a complex rule that we'll skip for now

	// Remove piece from hand
	let newSenteHand = [...gameState.senteHand];
	let newGoteHand = [...gameState.goteHand];

	if (gameState.currentPlayer === 'sente') {
		const idx = newSenteHand.findIndex(
			p => p.type === piece.type && p.color === piece.color
		);
		if (idx !== -1) {
			newSenteHand = [
				...newSenteHand.slice(0, idx),
				...newSenteHand.slice(idx + 1),
			];
		}
	} else {
		const idx = newGoteHand.findIndex(
			p => p.type === piece.type && p.color === piece.color
		);
		if (idx !== -1) {
			newGoteHand = [
				...newGoteHand.slice(0, idx),
				...newGoteHand.slice(idx + 1),
			];
		}
	}

	// Create move record
	const move: ShogiMove = {
		from: null,
		to,
		piece: droppedPiece,
		isDrop: true,
	};

	// Switch player
	const nextPlayer: ShogiPieceColor =
		gameState.currentPlayer === 'sente' ? 'gote' : 'sente';

	// Calculate new game status
	const newState: ShogiGameState = {
		...gameState,
		board: newBoard,
		currentPlayer: nextPlayer,
		moveHistory: [...gameState.moveHistory, move],
		selectedSquare: null,
		possibleMoves: [],
		selectedHandPiece: null,
		senteHand: newSenteHand,
		goteHand: newGoteHand,
		status: 'playing',
	};

	newState.status = getGameStatus(newState);

	return newState;
}

export function isKingInCheck(
	board: (ShogiPiece | null)[][],
	kingColor: ShogiPieceColor
): boolean {
	// Find the king
	let kingPosition: ShogiPosition | null = null;

	for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
		for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
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
	const opponentColor: ShogiPieceColor =
		kingColor === 'sente' ? 'gote' : 'sente';

	for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
		for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
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

export function getGameStatus(
	gameState: ShogiGameState
): ShogiGameState['status'] {
	const inCheck = isKingInCheck(gameState.board, gameState.currentPlayer);

	// Check if there are any legal moves (including drops)
	const hasLegalMoves = hasAnyLegalMoves(gameState);

	if (inCheck) {
		return hasLegalMoves ? 'check' : 'checkmate';
	}

	// In shogi, stalemate is extremely rare and typically counts as a loss for the stalemated player
	// For simplicity, we'll treat it similar to checkmate
	return hasLegalMoves ? 'playing' : 'checkmate';
}

function hasAnyLegalMoves(gameState: ShogiGameState): boolean {
	// Check board moves
	for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
		for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
			const piece = gameState.board[row]?.[col];
			if (piece && piece.color === gameState.currentPlayer) {
				const moves = getPossibleMoves(gameState.board, piece, { row, col });
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

	// Check drop moves
	const hand =
		gameState.currentPlayer === 'sente'
			? gameState.senteHand
			: gameState.goteHand;
	for (const piece of hand) {
		const dropPositions = getDropPositions(gameState.board, piece);
		for (const pos of dropPositions) {
			const testBoard = copyBoard(gameState.board);
			setPieceAt(testBoard, pos, piece);

			if (!isKingInCheck(testBoard, gameState.currentPlayer)) {
				return true;
			}
		}
	}

	return false;
}

export function makeAIMove(
	gameState: ShogiGameState,
	from: string,
	to: string,
	promote: boolean = false
): ShogiGameState | null {
	// Handle drop moves (from = "*")
	if (from === '*') {
		// For drop moves, we need the selected hand piece to be set
		// This should be handled by the AI adapter setting the right piece
		const toPos = algebraicToPosition(to);
		if (!toPos) return null;

		return makeDrop(gameState, toPos);
	}

	// Convert algebraic notation to positions
	const fromPos = algebraicToPosition(from);
	const toPos = algebraicToPosition(to);

	if (!fromPos || !toPos) {
		return null;
	}

	return makeMove(gameState, fromPos, toPos, promote);
}

export function setAIThinking(
	gameState: ShogiGameState,
	_thinking: boolean
): ShogiGameState {
	return {
		...gameState,
	};
}

export function isAITurn(
	gameState: ShogiGameState,
	aiPlayer?: ShogiPieceColor
): boolean {
	return (
		aiPlayer !== undefined &&
		gameState.currentPlayer === aiPlayer &&
		(gameState.status === 'playing' || gameState.status === 'check')
	);
}
