import { test, expect, describe } from 'bun:test';
import { makeMove, getGameStatus, createInitialGameState } from './game';
import { setPieceAt, getPieceAt } from './board';
import { getPossibleMoves, isSquareAttacked } from './moves';
import type { GameState, ChessPiece } from './types';

// Helper to create a clean game state with empty board
function createEmptyGameState(): GameState {
	const gameState = createInitialGameState();
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			gameState.board[row][col] = null;
		}
	}
	return gameState;
}

describe('Stalemate Detection', () => {
	test('should detect stalemate - king not in check but no legal moves', () => {
		const gameState = createEmptyGameState();

		// Classic stalemate position:
		// Black king at a8, White king at b6, White queen at c7
		// Black to move - not in check but cannot move
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		); // a8
		setPieceAt(
			gameState.board,
			{ row: 2, col: 1 },
			{ type: 'king', color: 'white' }
		); // b6
		setPieceAt(
			gameState.board,
			{ row: 1, col: 2 },
			{ type: 'queen', color: 'white' }
		); // c7

		gameState.currentPlayer = 'black';

		const status = getGameStatus(gameState);
		expect(status).toBe('stalemate');
	});

	test('should detect stalemate with lone king trapped on edge', () => {
		const gameState = createEmptyGameState();

		// Black king at h8, white queen at g6 (not giving check), white king at f7
		// Queen at g6 controls g7, g8, h6, h7 (diagonally)
		// King at f7 controls g7, g8
		// Black king cannot move anywhere
		setPieceAt(
			gameState.board,
			{ row: 0, col: 7 },
			{ type: 'king', color: 'black' }
		); // h8
		setPieceAt(
			gameState.board,
			{ row: 2, col: 6 },
			{ type: 'queen', color: 'white' }
		); // g6
		setPieceAt(
			gameState.board,
			{ row: 1, col: 5 },
			{ type: 'king', color: 'white' }
		); // f7

		gameState.currentPlayer = 'black';

		const status = getGameStatus(gameState);
		expect(status).toBe('stalemate');
	});

	test('should not be stalemate if legal moves exist', () => {
		const gameState = createEmptyGameState();

		// King with one legal move
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		); // a8
		setPieceAt(
			gameState.board,
			{ row: 7, col: 7 },
			{ type: 'king', color: 'white' }
		); // h1

		gameState.currentPlayer = 'black';

		const status = getGameStatus(gameState);
		expect(status).toBe('playing');
	});
});

describe('Castling', () => {
	describe('Kingside Castling (O-O)', () => {
		test('should allow white kingside castling when conditions are met', () => {
			const gameState = createEmptyGameState();

			// Set up castling position
			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook); // h1
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			); // a8

			gameState.currentPlayer = 'white';

			// Get possible moves for king - should include castling
			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).toContainEqual({ row: 7, col: 6 }); // g1 (kingside castle)

			// Execute castling
			const result = makeMove(
				gameState,
				{ row: 7, col: 4 },
				{ row: 7, col: 6 }
			);

			expect(result).not.toBe(null);
			// King should be at g1
			expect(getPieceAt(result!.board, { row: 7, col: 6 })?.type).toBe('king');
			// Rook should be at f1
			expect(getPieceAt(result!.board, { row: 7, col: 5 })?.type).toBe('rook');
			// Original squares should be empty
			expect(getPieceAt(result!.board, { row: 7, col: 4 })).toBe(null);
			expect(getPieceAt(result!.board, { row: 7, col: 7 })).toBe(null);
		});

		test('should allow black kingside castling when conditions are met', () => {
			const gameState = createEmptyGameState();

			const blackKing: ChessPiece = {
				type: 'king',
				color: 'black',
				hasMoved: false,
			};
			const blackRook: ChessPiece = {
				type: 'rook',
				color: 'black',
				hasMoved: false,
			};

			setPieceAt(gameState.board, { row: 0, col: 4 }, blackKing); // e8
			setPieceAt(gameState.board, { row: 0, col: 7 }, blackRook); // h8
			setPieceAt(
				gameState.board,
				{ row: 7, col: 0 },
				{ type: 'king', color: 'white' }
			); // a1

			gameState.currentPlayer = 'black';

			const result = makeMove(
				gameState,
				{ row: 0, col: 4 },
				{ row: 0, col: 6 }
			);

			expect(result).not.toBe(null);
			expect(getPieceAt(result!.board, { row: 0, col: 6 })?.type).toBe('king');
			expect(getPieceAt(result!.board, { row: 0, col: 5 })?.type).toBe('rook');
		});

		test('should not allow castling if king has moved', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: true,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook);
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 6 });
		});

		test('should not allow castling if rook has moved', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: true,
			};

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook);
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 6 });
		});

		test('should not allow castling if pieces are between king and rook', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};
			const whiteBishop: ChessPiece = { type: 'bishop', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 5 }, whiteBishop); // f1 blocks
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook);
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 6 });
		});

		test('should not allow castling if king is in check', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook);
			setPieceAt(gameState.board, { row: 0, col: 4 }, blackRook); // e8 - gives check on e-file
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 6 });
		});

		test('should not allow castling if king passes through attacked square', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};
			const blackRook: ChessPiece = { type: 'rook', color: 'black' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 7 }, whiteRook);
			setPieceAt(gameState.board, { row: 0, col: 5 }, blackRook); // f8 - attacks f1
			setPieceAt(
				gameState.board,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 6 });
		});
	});

	describe('Queenside Castling (O-O-O)', () => {
		test('should allow white queenside castling when conditions are met', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing); // e1
			setPieceAt(gameState.board, { row: 7, col: 0 }, whiteRook); // a1
			setPieceAt(
				gameState.board,
				{ row: 0, col: 7 },
				{ type: 'king', color: 'black' }
			); // h8

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).toContainEqual({ row: 7, col: 2 }); // c1 (queenside castle)

			const result = makeMove(
				gameState,
				{ row: 7, col: 4 },
				{ row: 7, col: 2 }
			);

			expect(result).not.toBe(null);
			// King should be at c1
			expect(getPieceAt(result!.board, { row: 7, col: 2 })?.type).toBe('king');
			// Rook should be at d1
			expect(getPieceAt(result!.board, { row: 7, col: 3 })?.type).toBe('rook');
		});

		test('should not allow queenside castling if b1 is occupied', () => {
			const gameState = createEmptyGameState();

			const whiteKing: ChessPiece = {
				type: 'king',
				color: 'white',
				hasMoved: false,
			};
			const whiteRook: ChessPiece = {
				type: 'rook',
				color: 'white',
				hasMoved: false,
			};
			const whiteKnight: ChessPiece = { type: 'knight', color: 'white' };

			setPieceAt(gameState.board, { row: 7, col: 4 }, whiteKing);
			setPieceAt(gameState.board, { row: 7, col: 0 }, whiteRook);
			setPieceAt(gameState.board, { row: 7, col: 1 }, whiteKnight); // b1 blocks
			setPieceAt(
				gameState.board,
				{ row: 0, col: 7 },
				{ type: 'king', color: 'black' }
			);

			gameState.currentPlayer = 'white';

			const moves = getPossibleMoves(
				gameState.board,
				whiteKing,
				{ row: 7, col: 4 },
				gameState
			);
			expect(moves).not.toContainEqual({ row: 7, col: 2 });
		});
	});
});

describe('En Passant', () => {
	test('should allow en passant capture after opponent pawn moves two squares', () => {
		const gameState = createEmptyGameState();

		// White pawn at e5, black pawn at d7
		setPieceAt(
			gameState.board,
			{ row: 3, col: 4 },
			{ type: 'pawn', color: 'white' }
		); // e5
		setPieceAt(
			gameState.board,
			{ row: 1, col: 3 },
			{ type: 'pawn', color: 'black' }
		); // d7
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		); // e1
		setPieceAt(
			gameState.board,
			{ row: 0, col: 4 },
			{ type: 'king', color: 'black' }
		); // e8

		gameState.currentPlayer = 'black';

		// Black moves pawn two squares: d7 → d5
		const afterBlackMove = makeMove(
			gameState,
			{ row: 1, col: 3 },
			{ row: 3, col: 3 }
		);
		expect(afterBlackMove).not.toBe(null);

		// En passant target should be set to d6
		expect(afterBlackMove!.enPassantTarget).toEqual({ row: 2, col: 3 });

		// White can now capture en passant: exd6
		const whitePawn = getPieceAt(afterBlackMove!.board, { row: 3, col: 4 });
		const moves = getPossibleMoves(
			afterBlackMove!.board,
			whitePawn!,
			{ row: 3, col: 4 },
			afterBlackMove!
		);
		expect(moves).toContainEqual({ row: 2, col: 3 }); // d6 en passant

		const afterEnPassant = makeMove(
			afterBlackMove!,
			{ row: 3, col: 4 },
			{ row: 2, col: 3 }
		);
		expect(afterEnPassant).not.toBe(null);

		// White pawn should be at d6
		expect(getPieceAt(afterEnPassant!.board, { row: 2, col: 3 })?.type).toBe(
			'pawn'
		);
		expect(getPieceAt(afterEnPassant!.board, { row: 2, col: 3 })?.color).toBe(
			'white'
		);

		// Black pawn at d5 should be captured (removed)
		expect(getPieceAt(afterEnPassant!.board, { row: 3, col: 3 })).toBe(null);

		// Move record should have isEnPassant flag
		const lastMove =
			afterEnPassant!.moveHistory[afterEnPassant!.moveHistory.length - 1];
		expect(lastMove?.isEnPassant).toBe(true);
	});

	test('should clear en passant target after any other move', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 3, col: 4 },
			{ type: 'pawn', color: 'white' }
		); // e5
		setPieceAt(
			gameState.board,
			{ row: 1, col: 3 },
			{ type: 'pawn', color: 'black' }
		); // d7
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		); // e1
		setPieceAt(
			gameState.board,
			{ row: 0, col: 4 },
			{ type: 'king', color: 'black' }
		); // e8
		setPieceAt(
			gameState.board,
			{ row: 7, col: 0 },
			{ type: 'rook', color: 'white' }
		); // a1

		gameState.currentPlayer = 'black';

		// Black moves pawn two squares
		const afterBlackMove = makeMove(
			gameState,
			{ row: 1, col: 3 },
			{ row: 3, col: 3 }
		);
		expect(afterBlackMove!.enPassantTarget).toEqual({ row: 2, col: 3 });

		// White makes a different move (not en passant)
		const afterWhiteMove = makeMove(
			afterBlackMove!,
			{ row: 7, col: 0 },
			{ row: 6, col: 0 }
		);
		expect(afterWhiteMove).not.toBe(null);

		// En passant target should be cleared
		expect(afterWhiteMove!.enPassantTarget).toBeUndefined();
	});

	test('should not allow en passant if it would leave king in check', () => {
		const gameState = createEmptyGameState();

		// Set up a position where en passant would expose king to check
		// White king on e5, white pawn on d5, black pawn just moved to c5
		// Black rook on a5 - en passant would expose king to check
		setPieceAt(
			gameState.board,
			{ row: 3, col: 4 },
			{ type: 'king', color: 'white' }
		); // e5
		setPieceAt(
			gameState.board,
			{ row: 3, col: 3 },
			{ type: 'pawn', color: 'white' }
		); // d5
		setPieceAt(
			gameState.board,
			{ row: 3, col: 2 },
			{ type: 'pawn', color: 'black' }
		); // c5
		setPieceAt(
			gameState.board,
			{ row: 3, col: 0 },
			{ type: 'rook', color: 'black' }
		); // a5
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		); // a8

		// Set en passant target
		gameState.enPassantTarget = { row: 2, col: 2 }; // c6
		gameState.currentPlayer = 'white';

		// En passant would remove black pawn on c5, exposing king to rook on a5
		const result = makeMove(gameState, { row: 3, col: 3 }, { row: 2, col: 2 });
		expect(result).toBe(null); // Should be rejected
	});
});

describe('Pawn Promotion', () => {
	test('should promote white pawn to queen by default when reaching 8th rank', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 1, col: 4 },
			{ type: 'pawn', color: 'white' }
		); // e7
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		); // e1
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		); // a8

		gameState.currentPlayer = 'white';

		const result = makeMove(gameState, { row: 1, col: 4 }, { row: 0, col: 4 });
		expect(result).not.toBe(null);

		// Pawn should be promoted to queen
		const promotedPiece = getPieceAt(result!.board, { row: 0, col: 4 });
		expect(promotedPiece?.type).toBe('queen');
		expect(promotedPiece?.color).toBe('white');

		// Move record should have promotion
		const lastMove = result!.moveHistory[result!.moveHistory.length - 1];
		expect(lastMove?.promotion).toBe('queen');
	});

	test('should promote black pawn when reaching 1st rank', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 6, col: 4 },
			{ type: 'pawn', color: 'black' }
		); // e2
		setPieceAt(
			gameState.board,
			{ row: 7, col: 7 },
			{ type: 'king', color: 'white' }
		); // h1
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		); // a8

		gameState.currentPlayer = 'black';

		const result = makeMove(gameState, { row: 6, col: 4 }, { row: 7, col: 4 });
		expect(result).not.toBe(null);

		const promotedPiece = getPieceAt(result!.board, { row: 7, col: 4 });
		expect(promotedPiece?.type).toBe('queen');
		expect(promotedPiece?.color).toBe('black');
	});

	test('should allow promotion to knight', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 1, col: 4 },
			{ type: 'pawn', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		);

		gameState.currentPlayer = 'white';

		const result = makeMove(
			gameState,
			{ row: 1, col: 4 },
			{ row: 0, col: 4 },
			'knight'
		);
		expect(result).not.toBe(null);

		const promotedPiece = getPieceAt(result!.board, { row: 0, col: 4 });
		expect(promotedPiece?.type).toBe('knight');
	});

	test('should allow promotion to rook', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 1, col: 4 },
			{ type: 'pawn', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		);

		gameState.currentPlayer = 'white';

		const result = makeMove(
			gameState,
			{ row: 1, col: 4 },
			{ row: 0, col: 4 },
			'rook'
		);
		expect(result).not.toBe(null);

		const promotedPiece = getPieceAt(result!.board, { row: 0, col: 4 });
		expect(promotedPiece?.type).toBe('rook');
	});

	test('should allow promotion to bishop', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 1, col: 4 },
			{ type: 'pawn', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		);

		gameState.currentPlayer = 'white';

		const result = makeMove(
			gameState,
			{ row: 1, col: 4 },
			{ row: 0, col: 4 },
			'bishop'
		);
		expect(result).not.toBe(null);

		const promotedPiece = getPieceAt(result!.board, { row: 0, col: 4 });
		expect(promotedPiece?.type).toBe('bishop');
	});

	test('should allow promotion with capture', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 1, col: 4 },
			{ type: 'pawn', color: 'white' }
		); // e7
		setPieceAt(
			gameState.board,
			{ row: 0, col: 5 },
			{ type: 'rook', color: 'black' }
		); // f8
		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		);
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'king', color: 'black' }
		);

		gameState.currentPlayer = 'white';

		const result = makeMove(gameState, { row: 1, col: 4 }, { row: 0, col: 5 }); // exf8=Q
		expect(result).not.toBe(null);

		const promotedPiece = getPieceAt(result!.board, { row: 0, col: 5 });
		expect(promotedPiece?.type).toBe('queen');

		const lastMove = result!.moveHistory[result!.moveHistory.length - 1];
		expect(lastMove?.capturedPiece?.type).toBe('rook');
		expect(lastMove?.promotion).toBe('queen');
	});
});

describe('Double Check', () => {
	test('should only allow king moves in double check', () => {
		const gameState = createEmptyGameState();

		// White king in double check from bishop and rook
		setPieceAt(
			gameState.board,
			{ row: 4, col: 4 },
			{ type: 'king', color: 'white' }
		); // e4
		setPieceAt(
			gameState.board,
			{ row: 0, col: 4 },
			{ type: 'rook', color: 'black' }
		); // e8 - checks on e-file
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'bishop', color: 'black' }
		); // a8 - checks on diagonal
		setPieceAt(
			gameState.board,
			{ row: 4, col: 0 },
			{ type: 'queen', color: 'white' }
		); // a4 - can't block both
		setPieceAt(
			gameState.board,
			{ row: 7, col: 7 },
			{ type: 'king', color: 'black' }
		); // h1

		gameState.currentPlayer = 'white';

		// Queen trying to block - should fail because it can't block both checks
		const queenBlock = makeMove(
			gameState,
			{ row: 4, col: 0 },
			{ row: 2, col: 2 }
		); // c6 blocks bishop
		expect(queenBlock).toBe(null);

		// King escape should work
		const kingEscape = makeMove(
			gameState,
			{ row: 4, col: 4 },
			{ row: 5, col: 3 }
		); // d3
		expect(kingEscape).not.toBe(null);
	});
});

describe('King Cannot Move Adjacent to Opponent King', () => {
	test('should not allow king to move to square adjacent to opponent king', () => {
		const gameState = createEmptyGameState();

		// Kings facing each other with one square between
		setPieceAt(
			gameState.board,
			{ row: 4, col: 4 },
			{ type: 'king', color: 'white' }
		); // e4
		setPieceAt(
			gameState.board,
			{ row: 2, col: 4 },
			{ type: 'king', color: 'black' }
		); // e6

		gameState.currentPlayer = 'white';

		// White king trying to move to e5 (adjacent to black king) - should fail
		const result = makeMove(gameState, { row: 4, col: 4 }, { row: 3, col: 4 });
		expect(result).toBe(null);
	});

	test('kings should not be able to get adjacent to each other', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 4, col: 3 },
			{ type: 'king', color: 'white' }
		); // d4
		setPieceAt(
			gameState.board,
			{ row: 2, col: 4 },
			{ type: 'king', color: 'black' }
		); // e6

		gameState.currentPlayer = 'white';

		// Trying to move white king to d5 (adjacent to black king diagonally)
		const result = makeMove(gameState, { row: 4, col: 3 }, { row: 3, col: 3 });
		expect(result).toBe(null);
	});
});

describe('isSquareAttacked', () => {
	test('should detect square attacked by pawn', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 4, col: 4 },
			{ type: 'pawn', color: 'black' }
		); // e4

		// Black pawn attacks d3 and f3
		expect(isSquareAttacked(gameState.board, { row: 5, col: 3 }, 'white')).toBe(
			true
		); // d3
		expect(isSquareAttacked(gameState.board, { row: 5, col: 5 }, 'white')).toBe(
			true
		); // f3
		// Pawn does not attack e3 (forward)
		expect(isSquareAttacked(gameState.board, { row: 5, col: 4 }, 'white')).toBe(
			false
		);
	});

	test('should detect square attacked by knight', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 4, col: 4 },
			{ type: 'knight', color: 'black' }
		); // e4

		expect(isSquareAttacked(gameState.board, { row: 2, col: 3 }, 'white')).toBe(
			true
		); // d6
		expect(isSquareAttacked(gameState.board, { row: 6, col: 5 }, 'white')).toBe(
			true
		); // f2
		expect(isSquareAttacked(gameState.board, { row: 4, col: 5 }, 'white')).toBe(
			false
		); // f4
	});

	test('should detect square attacked by king', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 4, col: 4 },
			{ type: 'king', color: 'black' }
		); // e4

		expect(isSquareAttacked(gameState.board, { row: 3, col: 4 }, 'white')).toBe(
			true
		); // e5
		expect(isSquareAttacked(gameState.board, { row: 5, col: 5 }, 'white')).toBe(
			true
		); // f3
		expect(isSquareAttacked(gameState.board, { row: 2, col: 4 }, 'white')).toBe(
			false
		); // e6 (two squares away)
	});
});

describe('Game Status Auto-Detection', () => {
	test('should auto-detect check status after move', () => {
		const gameState = createEmptyGameState();

		setPieceAt(
			gameState.board,
			{ row: 7, col: 4 },
			{ type: 'king', color: 'white' }
		); // e1
		setPieceAt(
			gameState.board,
			{ row: 0, col: 4 },
			{ type: 'king', color: 'black' }
		); // e8
		setPieceAt(
			gameState.board,
			{ row: 4, col: 0 },
			{ type: 'rook', color: 'white' }
		); // a4

		gameState.currentPlayer = 'white';

		// Move rook to give check
		const result = makeMove(gameState, { row: 4, col: 0 }, { row: 0, col: 0 }); // Ra8+
		expect(result).not.toBe(null);
		expect(result!.status).toBe('check');
	});

	test('should correctly identify checkmate position', () => {
		const gameState = createEmptyGameState();

		// Back rank mate position (already delivered)
		// Black king at h8, white rook at h1 giving check, white rook at a7 blocking escape
		setPieceAt(
			gameState.board,
			{ row: 0, col: 7 },
			{ type: 'king', color: 'black' }
		); // h8
		setPieceAt(
			gameState.board,
			{ row: 0, col: 0 },
			{ type: 'rook', color: 'white' }
		); // a8 - checking
		setPieceAt(
			gameState.board,
			{ row: 1, col: 0 },
			{ type: 'rook', color: 'white' }
		); // a7 - controls 7th rank
		setPieceAt(
			gameState.board,
			{ row: 7, col: 0 },
			{ type: 'king', color: 'white' }
		); // a1

		gameState.currentPlayer = 'black';

		const status = getGameStatus(gameState);
		expect(status).toBe('checkmate');
	});
});
