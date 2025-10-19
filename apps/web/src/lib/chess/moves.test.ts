import { test, expect, describe } from 'bun:test';
import { getPossibleMoves, isMoveValid } from './moves';
import { createInitialBoard, setPieceAt } from './board';
import type { ChessPiece } from './types';

describe('Chess Move Generation', () => {
	describe('Pawn moves', () => {
		test('should allow white pawn to move one square forward', () => {
			const board = createInitialBoard();
			const pawn = board[6]?.[4];
			if (!pawn) {
				throw new Error('Expected white pawn at e2');
			}

			const moves = getPossibleMoves(board, pawn, { row: 6, col: 4 });

			expect(moves).toContainEqual({ row: 5, col: 4 }); // e3
		});

		test('should allow white pawn to move two squares from start', () => {
			const board = createInitialBoard();
			const pawn = board[6]?.[4];
			if (!pawn) {
				throw new Error('Expected white pawn at e2');
			}

			const moves = getPossibleMoves(board, pawn, { row: 6, col: 4 });

			expect(moves).toContainEqual({ row: 4, col: 4 }); // e4
		});

		test('should not allow white pawn to move two squares after first move', () => {
			const board = createInitialBoard();
			const pawn: ChessPiece = { type: 'pawn', color: 'white' };

			// Clear board and place pawn at e3
			for (let row = 0; row < 8; row++) {
				for (let col = 0; col < 8; col++) {
					board[row][col] = null;
				}
			}
			setPieceAt(board, { row: 5, col: 4 }, pawn);

			const moves = getPossibleMoves(board, pawn, { row: 5, col: 4 });

			expect(moves).not.toContainEqual({ row: 3, col: 4 }); // Cannot move to e5
			expect(moves).toContainEqual({ row: 4, col: 4 }); // Can move to e4
		});

		test('should allow diagonal capture', () => {
			const board = createInitialBoard();
			const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };
			const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };

			// Clear area and set up capture scenario
			setPieceAt(board, { row: 5, col: 4 }, whitePawn); // e3
			setPieceAt(board, { row: 4, col: 5 }, blackPawn); // f4

			const moves = getPossibleMoves(board, whitePawn, {
				row: 5,
				col: 4,
			});

			expect(moves).toContainEqual({ row: 4, col: 5 }); // Can capture f4
		});

		test('should not move forward if blocked', () => {
			const board = createInitialBoard();
			const whitePawn: ChessPiece = { type: 'pawn', color: 'white' };
			const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };

			setPieceAt(board, { row: 5, col: 4 }, whitePawn); // e3
			setPieceAt(board, { row: 4, col: 4 }, blackPawn); // e4 (blocking)

			const moves = getPossibleMoves(board, whitePawn, {
				row: 5,
				col: 4,
			});

			expect(moves).not.toContainEqual({ row: 4, col: 4 });
		});

		test('black pawn should move in opposite direction', () => {
			const board = createInitialBoard();
			const blackPawn = board[1]?.[4];
			if (!blackPawn) {
				throw new Error('Expected black pawn at e7');
			}

			const moves = getPossibleMoves(board, blackPawn, {
				row: 1,
				col: 4,
			});

			expect(moves).toContainEqual({ row: 2, col: 4 }); // e6
			expect(moves).toContainEqual({ row: 3, col: 4 }); // e5
		});
	});

	describe('Rook moves', () => {
		test('should move horizontally and vertically', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const rook: ChessPiece = { type: 'rook', color: 'white' };
			setPieceAt(board, { row: 4, col: 4 }, rook); // e4

			const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });

			// Should be able to move to all squares in same row and column
			expect(moves.length).toBe(14); // 7 horizontal + 7 vertical
			expect(moves).toContainEqual({ row: 4, col: 0 }); // a4
			expect(moves).toContainEqual({ row: 4, col: 7 }); // h4
			expect(moves).toContainEqual({ row: 0, col: 4 }); // e8
			expect(moves).toContainEqual({ row: 7, col: 4 }); // e1
		});

		test('should be blocked by own pieces', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const rook: ChessPiece = { type: 'rook', color: 'white' };
			const pawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(board, { row: 4, col: 4 }, rook);
			setPieceAt(board, { row: 4, col: 6 }, pawn); // Blocking right

			const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });

			expect(moves).toContainEqual({ row: 4, col: 5 });
			expect(moves).not.toContainEqual({ row: 4, col: 6 }); // Blocked
			expect(moves).not.toContainEqual({ row: 4, col: 7 }); // Beyond block
		});

		test('should capture opponent pieces', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const whiteRook: ChessPiece = { type: 'rook', color: 'white' };
			const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };

			setPieceAt(board, { row: 4, col: 4 }, whiteRook);
			setPieceAt(board, { row: 4, col: 6 }, blackPawn); // Can capture

			const moves = getPossibleMoves(board, whiteRook, {
				row: 4,
				col: 4,
			});

			expect(moves).toContainEqual({ row: 4, col: 6 }); // Can capture
			expect(moves).not.toContainEqual({ row: 4, col: 7 }); // Cannot go beyond
		});
	});

	describe('Bishop moves', () => {
		test('should move diagonally', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const bishop: ChessPiece = { type: 'bishop', color: 'white' };
			setPieceAt(board, { row: 4, col: 4 }, bishop); // e4

			const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });

			expect(moves.length).toBe(13); // All diagonal squares
			expect(moves).toContainEqual({ row: 0, col: 0 }); // a8
			expect(moves).toContainEqual({ row: 7, col: 7 }); // h1
			expect(moves).toContainEqual({ row: 1, col: 7 }); // h7
			expect(moves).toContainEqual({ row: 7, col: 1 }); // b1
		});

		test('should be blocked by pieces', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const bishop: ChessPiece = { type: 'bishop', color: 'white' };
			const pawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(board, { row: 4, col: 4 }, bishop);
			setPieceAt(board, { row: 2, col: 6 }, pawn); // Blocking diagonal

			const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });

			expect(moves).toContainEqual({ row: 3, col: 5 });
			expect(moves).not.toContainEqual({ row: 2, col: 6 }); // Blocked by own piece
		});
	});

	describe('Queen moves', () => {
		test('should combine rook and bishop moves', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const queen: ChessPiece = { type: 'queen', color: 'white' };
			setPieceAt(board, { row: 4, col: 4 }, queen); // e4

			const moves = getPossibleMoves(board, queen, { row: 4, col: 4 });

			expect(moves.length).toBe(27); // 14 (rook) + 13 (bishop)
		});
	});

	describe('King moves', () => {
		test('should move one square in any direction', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const king: ChessPiece = { type: 'king', color: 'white' };
			setPieceAt(board, { row: 4, col: 4 }, king); // e4

			const moves = getPossibleMoves(board, king, { row: 4, col: 4 });

			expect(moves.length).toBe(8);
			expect(moves).toContainEqual({ row: 3, col: 3 }); // d5
			expect(moves).toContainEqual({ row: 3, col: 4 }); // e5
			expect(moves).toContainEqual({ row: 3, col: 5 }); // f5
			expect(moves).toContainEqual({ row: 5, col: 5 }); // f3
		});

		test('should not move to squares occupied by own pieces', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const king: ChessPiece = { type: 'king', color: 'white' };
			const pawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(board, { row: 4, col: 4 }, king);
			setPieceAt(board, { row: 3, col: 4 }, pawn); // Blocking

			const moves = getPossibleMoves(board, king, { row: 4, col: 4 });

			expect(moves).not.toContainEqual({ row: 3, col: 4 });
			expect(moves.length).toBe(7); // 8 - 1 blocked
		});

		test('should move to edge of board', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const king: ChessPiece = { type: 'king', color: 'white' };
			setPieceAt(board, { row: 0, col: 0 }, king); // a8 (corner)

			const moves = getPossibleMoves(board, king, { row: 0, col: 0 });

			expect(moves.length).toBe(3); // Only 3 squares available from corner
		});
	});

	describe('Knight moves', () => {
		test('should move in L-shape', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const knight: ChessPiece = { type: 'knight', color: 'white' };
			setPieceAt(board, { row: 4, col: 4 }, knight); // e4

			const moves = getPossibleMoves(board, knight, { row: 4, col: 4 });

			expect(moves.length).toBe(8);
			expect(moves).toContainEqual({ row: 2, col: 3 }); // d6
			expect(moves).toContainEqual({ row: 2, col: 5 }); // f6
			expect(moves).toContainEqual({ row: 3, col: 2 }); // c5
			expect(moves).toContainEqual({ row: 3, col: 6 }); // g5
			expect(moves).toContainEqual({ row: 5, col: 2 }); // c3
			expect(moves).toContainEqual({ row: 5, col: 6 }); // g3
			expect(moves).toContainEqual({ row: 6, col: 3 }); // d2
			expect(moves).toContainEqual({ row: 6, col: 5 }); // f2
		});

		test('should jump over pieces', () => {
			const board = createInitialBoard();
			const knight = board[7]?.[1];
			if (!knight) {
				throw new Error('Expected white knight at b1');
			}

			// Knight should be able to move even with pawns in front
			const moves = getPossibleMoves(board, knight, { row: 7, col: 1 });

			expect(moves.length).toBe(2); // a3 and c3
			expect(moves).toContainEqual({ row: 5, col: 0 }); // a3
			expect(moves).toContainEqual({ row: 5, col: 2 }); // c3
		});

		test('should not move to own pieces', () => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			const knight: ChessPiece = { type: 'knight', color: 'white' };
			const pawn: ChessPiece = { type: 'pawn', color: 'white' };

			setPieceAt(board, { row: 4, col: 4 }, knight);
			setPieceAt(board, { row: 2, col: 3 }, pawn); // Blocking d6

			const moves = getPossibleMoves(board, knight, { row: 4, col: 4 });

			expect(moves).not.toContainEqual({ row: 2, col: 3 });
			expect(moves.length).toBe(7); // 8 - 1 blocked
		});
	});

	describe('isMoveValid', () => {
		test('should validate correct moves', () => {
			const board = createInitialBoard();
			const pawn = board[6]?.[4];
			if (!pawn) {
				throw new Error('Expected white pawn at e2');
			}

			expect(
				isMoveValid(board, { row: 6, col: 4 }, { row: 5, col: 4 }, pawn)
			).toBe(true);
			expect(
				isMoveValid(board, { row: 6, col: 4 }, { row: 4, col: 4 }, pawn)
			).toBe(true);
		});

		test('should reject invalid moves', () => {
			const board = createInitialBoard();
			const pawn = board[6]?.[4];
			if (!pawn) {
				throw new Error('Expected white pawn at e2');
			}

			expect(
				isMoveValid(board, { row: 6, col: 4 }, { row: 3, col: 4 }, pawn)
			).toBe(false);
			expect(
				isMoveValid(board, { row: 6, col: 4 }, { row: 6, col: 5 }, pawn)
			).toBe(false);
		});
	});
});
