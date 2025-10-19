import { test, expect, describe } from 'bun:test';
import {
	makeMove,
	isKingInCheck,
	getGameStatus,
	makeAIMove,
	algebraicToPosition,
} from './game';
import { createInitialBoard, setPieceAt } from './board';
import type { GameState, ChessPiece } from './types';

describe('Chess Game - Move Validation with Check Handling', () => {
	describe('makeMove function - Check validation', () => {
		test('should reject moves that leave king in check', () => {
			// Create a game state where white king is in check by a black rook
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Set up a simple check scenario
			// Clear the board first
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Place white king at e1 and black rook at e8 (king in check)
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };
			const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
			setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn); // d2

			// Verify king is in check
			expect(isKingInCheck(gameState.board, 'white')).toBe(true);

			// Try to move the pawn (which doesn't help with check) - should be rejected
			const invalidMove = makeMove(
				gameState,
				{ row: 6, col: 3 }, // d2
				{ row: 5, col: 3 } // d3
			);

			expect(invalidMove).toBe(null);
		});

		test('should accept moves that get king out of check', () => {
			// Create a game state where white king is in check
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Place white king at e1, black rook at e8, and white rook at a1
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };
			const whiteRook: ChessPiece = { type: 'rook', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8 (checking king)
			setPieceAt(gameState.board, { row: 7, col: 0 }, whiteRook); // a1

			// Verify king is in check
			expect(isKingInCheck(gameState.board, 'white')).toBe(true);

			// Capture the attacking rook to resolve check
			const validMove = makeMove(
				gameState,
				{ row: 7, col: 0 }, // a1
				{ row: 0, col: 4 } // e8 (capture black rook - requires moving across board)
			);

			// Rook can capture diagonally is invalid - let's just move king
			expect(validMove).toBe(null); // This move is invalid for a rook

			// Instead, king escapes check
			const kingEscape = makeMove(
				gameState,
				{ row: 7, col: 4 }, // e1
				{ row: 7, col: 3 } // d1 (escape)
			);

			expect(kingEscape).not.toBe(null);
			expect(kingEscape?.currentPlayer).toBe('black');
		});

		test('should accept king moves that escape check', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Place white king at e1 and black rook at e8
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8

			// King moves to escape check (Kf1)
			const kingEscape = makeMove(
				gameState,
				{ row: 7, col: 4 }, // e1
				{ row: 7, col: 5 } // f1
			);

			expect(kingEscape).not.toBe(null);
			expect(isKingInCheck(kingEscape!.board, 'white')).toBe(false);
		});

		test('should reject king moves that keep king in check', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Place white king at e1, black rook at e8, and black rook at d8
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook1: ChessPiece = { type: 'rook', color: 'black' };
			const blackRook2: ChessPiece = { type: 'rook', color: 'black' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook1); // e8
			setPieceAt(gameState.board, { row: 0, col: 3 }, blackRook2); // d8

			// Try to move king to d1 (still in check from d8 rook)
			const stillInCheck = makeMove(
				gameState,
				{ row: 7, col: 4 }, // e1
				{ row: 7, col: 3 } // d1
			);

			expect(stillInCheck).toBe(null);
		});
	});

	describe('makeAIMove function', () => {
		test('should reject AI moves that leave king in check', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-ai',
				aiPlayer: 'white',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up check scenario
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };
			const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
			setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn); // d2

			// AI tries to make an invalid move (pawn move that doesn't help check)
			const result = makeAIMove(gameState, 'd2', 'd3');

			expect(result).toBe(null);
		});

		test('should accept AI moves that resolve check', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-ai',
				aiPlayer: 'white',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up scenario where AI can resolve check
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };
			const whiteRook: ChessPiece = { type: 'rook', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
			setPieceAt(gameState.board, { row: 6, col: 4 }, whiteRook); // e2

			// AI captures the attacking rook to resolve check
			const result = makeAIMove(gameState, 'e2', 'e8');

			expect(result).not.toBe(null);
			expect(result?.currentPlayer).toBe('black');
			expect(isKingInCheck(result!.board, 'white')).toBe(false);
		});
	});

	describe('getGameStatus function', () => {
		test('should detect check status', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up check scenario with escape moves available
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8

			const status = getGameStatus(gameState);
			expect(status).toBe('check');
		});

		test('should detect checkmate status', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up a proper checkmate scenario (back rank mate with two rooks)
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook1: ChessPiece = { type: 'rook', color: 'black' };
			const blackRook2: ChessPiece = { type: 'rook', color: 'black' };
			const whitePawn1: ChessPiece = { type: 'pawn', color: 'white' };
			const whitePawn2: ChessPiece = { type: 'pawn', color: 'white' };
			const whitePawn3: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn1); // d2
			setPieceAt(gameState.board, { row: 6, col: 4 }, whitePawn2); // e2
			setPieceAt(gameState.board, { row: 6, col: 5 }, whitePawn3); // f2
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook1); // e8 - checking
			setPieceAt(gameState.board, { row: 7, col: 0 }, blackRook2); // a1 - covering escape squares

			const status = getGameStatus(gameState);
			expect(status).toBe('checkmate');
		});
	});

	describe('algebraicToPosition function', () => {
		test('should convert algebraic notation correctly', () => {
			expect(algebraicToPosition('e1')).toEqual({ row: 7, col: 4 });
			expect(algebraicToPosition('a8')).toEqual({ row: 0, col: 0 });
			expect(algebraicToPosition('h1')).toEqual({ row: 7, col: 7 });
			expect(algebraicToPosition('d4')).toEqual({ row: 4, col: 3 });
		});

		test('should return null for invalid notation', () => {
			expect(algebraicToPosition('z9')).toBe(null);
			expect(algebraicToPosition('i1')).toBe(null);
			expect(algebraicToPosition('a0')).toBe(null);
			expect(algebraicToPosition('')).toBe(null);
		});
	});

	describe('Complex check scenarios', () => {
		test('should handle discovered check correctly', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up discovered check scenario
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackBishop: ChessPiece = { type: 'bishop', color: 'black' };
			const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 5, col: 2 }, blackBishop); // c3
			setPieceAt(gameState.board, { row: 6, col: 3 }, whitePawn); // d2

			// Moving pawn creates discovered check, so it should be rejected
			const discoveredCheck = makeMove(
				gameState,
				{ row: 6, col: 3 }, // d2
				{ row: 5, col: 3 } // d3
			);

			expect(discoveredCheck).toBe(null);
		});

		test('should handle pinned pieces correctly', () => {
			const gameState: GameState = {
				board: createInitialBoard(),
				currentPlayer: 'white',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
				mode: 'human-vs-human',
			};

			// Clear the board
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					gameState.board[row][col] = null;
				}
			}

			// Set up pin scenario
			const whiteKing: ChessPiece = { type: 'king', color: 'white' };
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };
			const whiteQueen: ChessPiece = { type: 'queen', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8
			setPieceAt(gameState.board, { row: 5, col: 4 }, whiteQueen); // e3 (pinned)

			// Try to move pinned queen horizontally (should be rejected)
			const pinnedMove = makeMove(
				gameState,
				{ row: 5, col: 4 }, // e3
				{ row: 5, col: 3 } // d3
			);

			expect(pinnedMove).toBe(null);

			// Move pinned queen along the pin (should be accepted)
			const validPinnedMove = makeMove(
				gameState,
				{ row: 5, col: 4 }, // e3
				{ row: 4, col: 4 } // e4
			);

			expect(validPinnedMove).not.toBe(null);
		});
	});
});
