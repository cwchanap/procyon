import { test, expect, describe } from 'bun:test';
import {
	getPossibleMoves,
	isMoveValid,
	getDropPositions,
	canDropAt,
} from './moves';
import { createInitialBoard, setPieceAt } from './board';
import type { ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';

function emptyBoard(): (ShogiPiece | null)[][] {
	return Array(SHOGI_BOARD_SIZE)
		.fill(null)
		.map(() => Array(SHOGI_BOARD_SIZE).fill(null));
}

describe('Shogi Move Generation', () => {
	describe('getPossibleMoves - pawn', () => {
		test('sente pawn moves forward (decreasing row)', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);

			const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
			expect(moves).toHaveLength(1);
			expect(moves[0]).toEqual({ row: 3, col: 4 });
		});

		test('gote pawn moves forward (increasing row)', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'gote' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);

			const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
			expect(moves).toHaveLength(1);
			expect(moves[0]).toEqual({ row: 5, col: 4 });
		});

		test('pawn cannot move to square occupied by ally', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			const ally: ShogiPiece = { type: 'gold', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);
			setPieceAt(board, { row: 3, col: 4 }, ally);

			const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
			expect(moves).toHaveLength(0);
		});

		test('pawn can capture opponent ahead', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			const opponent: ShogiPiece = { type: 'pawn', color: 'gote' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);
			setPieceAt(board, { row: 3, col: 4 }, opponent);

			const moves = getPossibleMoves(board, pawn, { row: 4, col: 4 });
			expect(moves).toHaveLength(1);
			expect(moves[0]).toEqual({ row: 3, col: 4 });
		});
	});

	describe('getPossibleMoves - knight', () => {
		test('sente knight jumps forward in L-shape', () => {
			const board = emptyBoard();
			const knight: ShogiPiece = { type: 'knight', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, knight);

			const moves = getPossibleMoves(board, knight, { row: 4, col: 4 });
			expect(moves).toHaveLength(2);
			expect(moves).toContainEqual({ row: 2, col: 3 });
			expect(moves).toContainEqual({ row: 2, col: 5 });
		});

		test('gote knight jumps in opposite direction', () => {
			const board = emptyBoard();
			const knight: ShogiPiece = { type: 'knight', color: 'gote' };
			setPieceAt(board, { row: 4, col: 4 }, knight);

			const moves = getPossibleMoves(board, knight, { row: 4, col: 4 });
			expect(moves).toHaveLength(2);
			expect(moves).toContainEqual({ row: 6, col: 3 });
			expect(moves).toContainEqual({ row: 6, col: 5 });
		});

		test('knight near edge has fewer moves', () => {
			const board = emptyBoard();
			const knight: ShogiPiece = { type: 'knight', color: 'sente' };
			// Place at row 1, col 0 - left edge, near top
			setPieceAt(board, { row: 1, col: 0 }, knight);

			const moves = getPossibleMoves(board, knight, { row: 1, col: 0 });
			// Can only jump to row -1 (invalid) or col -1 (invalid)
			// Row 1 - 2 = -1 (invalid), so no valid moves
			expect(moves).toHaveLength(0);
		});
	});

	describe('getPossibleMoves - silver', () => {
		test('silver general moves diagonally and forward', () => {
			const board = emptyBoard();
			const silver: ShogiPiece = { type: 'silver', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, silver);

			const moves = getPossibleMoves(board, silver, { row: 4, col: 4 });
			expect(moves).toHaveLength(5);
			// Forward-left, forward, forward-right, backward-left diagonal, backward-right diagonal
			expect(moves).toContainEqual({ row: 3, col: 3 }); // forward-left
			expect(moves).toContainEqual({ row: 3, col: 4 }); // forward
			expect(moves).toContainEqual({ row: 3, col: 5 }); // forward-right
			expect(moves).toContainEqual({ row: 5, col: 3 }); // backward-left diagonal
			expect(moves).toContainEqual({ row: 5, col: 5 }); // backward-right diagonal
		});
	});

	describe('getPossibleMoves - gold / promoted pieces', () => {
		test('gold general moves 6 directions', () => {
			const board = emptyBoard();
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, gold);

			const moves = getPossibleMoves(board, gold, { row: 4, col: 4 });
			expect(moves).toHaveLength(6);
			// forward-left, forward, forward-right, left, right, backward
			expect(moves).toContainEqual({ row: 3, col: 3 });
			expect(moves).toContainEqual({ row: 3, col: 4 });
			expect(moves).toContainEqual({ row: 3, col: 5 });
			expect(moves).toContainEqual({ row: 4, col: 3 });
			expect(moves).toContainEqual({ row: 4, col: 5 });
			expect(moves).toContainEqual({ row: 5, col: 4 });
		});

		test('promoted pawn moves same as gold', () => {
			const board = emptyBoard();
			const promotedPawn: ShogiPiece = {
				type: 'promoted_pawn',
				color: 'sente',
			};
			setPieceAt(board, { row: 4, col: 4 }, promotedPawn);

			const moves = getPossibleMoves(board, promotedPawn, { row: 4, col: 4 });
			expect(moves).toHaveLength(6);
		});
	});

	describe('getPossibleMoves - lance', () => {
		test('sente lance moves forward multiple squares', () => {
			const board = emptyBoard();
			const lance: ShogiPiece = { type: 'lance', color: 'sente' };
			setPieceAt(board, { row: 6, col: 4 }, lance);

			const moves = getPossibleMoves(board, lance, { row: 6, col: 4 });
			// Can reach rows 5, 4, 3, 2, 1, 0
			expect(moves).toHaveLength(6);
		});

		test('lance is blocked by own piece', () => {
			const board = emptyBoard();
			const lance: ShogiPiece = { type: 'lance', color: 'sente' };
			const blocker: ShogiPiece = { type: 'pawn', color: 'sente' };
			setPieceAt(board, { row: 6, col: 4 }, lance);
			setPieceAt(board, { row: 4, col: 4 }, blocker);

			const moves = getPossibleMoves(board, lance, { row: 6, col: 4 });
			// Can only reach row 5
			expect(moves).toHaveLength(1);
			expect(moves[0]).toEqual({ row: 5, col: 4 });
		});

		test('lance can capture opponent but stops there', () => {
			const board = emptyBoard();
			const lance: ShogiPiece = { type: 'lance', color: 'sente' };
			const opponent: ShogiPiece = { type: 'pawn', color: 'gote' };
			setPieceAt(board, { row: 6, col: 4 }, lance);
			setPieceAt(board, { row: 4, col: 4 }, opponent);

			const moves = getPossibleMoves(board, lance, { row: 6, col: 4 });
			// Can reach rows 5 and 4 (capturing)
			expect(moves).toHaveLength(2);
			expect(moves).toContainEqual({ row: 4, col: 4 });
		});
	});

	describe('getPossibleMoves - bishop', () => {
		test('bishop moves diagonally', () => {
			const board = emptyBoard();
			const bishop: ShogiPiece = { type: 'bishop', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, bishop);

			const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });
			// In 4 diagonal directions, can reach:
			// up-right: (3,5), (2,6), (1,7), (0,8) = 4
			// up-left: (3,3), (2,2), (1,1), (0,0) = 4
			// down-right: (5,5), (6,6), (7,7), (8,8) = 4
			// down-left: (5,3), (6,2), (7,1), (8,0) = 4
			expect(moves).toHaveLength(16);
		});

		test('bishop is blocked by pieces', () => {
			const board = emptyBoard();
			const bishop: ShogiPiece = { type: 'bishop', color: 'sente' };
			const blocker: ShogiPiece = { type: 'gold', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, bishop);
			setPieceAt(board, { row: 3, col: 5 }, blocker); // block up-right

			const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });
			// up-right is completely blocked (blocker is ally)
			expect(moves).not.toContainEqual({ row: 3, col: 5 });
			expect(moves).not.toContainEqual({ row: 2, col: 6 });
		});
	});

	describe('getPossibleMoves - rook', () => {
		test('rook moves horizontally and vertically', () => {
			const board = emptyBoard();
			const rook: ShogiPiece = { type: 'rook', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, rook);

			const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });
			// 4 directions, 4+4+8 = ... let's count:
			// right: 5,6,7,8 = 4
			// left: 3,2,1,0 = 4
			// up: 3,2,1,0 = 4
			// down: 5,6,7,8 = 4
			expect(moves).toHaveLength(16);
		});
	});

	describe('getPossibleMoves - horse (promoted bishop)', () => {
		test('horse moves diagonally plus one orthogonal', () => {
			const board = emptyBoard();
			const horse: ShogiPiece = { type: 'horse', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, horse);

			const moves = getPossibleMoves(board, horse, { row: 4, col: 4 });
			// All bishop moves + 4 orthogonal = 16 + 4 = 20
			expect(moves).toHaveLength(20);
			// Check orthogonal additions
			expect(moves).toContainEqual({ row: 4, col: 3 });
			expect(moves).toContainEqual({ row: 4, col: 5 });
			expect(moves).toContainEqual({ row: 3, col: 4 });
			expect(moves).toContainEqual({ row: 5, col: 4 });
		});
	});

	describe('getPossibleMoves - dragon (promoted rook)', () => {
		test('dragon moves orthogonally plus one diagonal', () => {
			const board = emptyBoard();
			const dragon: ShogiPiece = { type: 'dragon', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, dragon);

			const moves = getPossibleMoves(board, dragon, { row: 4, col: 4 });
			// All rook moves + 4 diagonal = 16 + 4 = 20
			expect(moves).toHaveLength(20);
			// Check diagonal additions
			expect(moves).toContainEqual({ row: 3, col: 3 });
			expect(moves).toContainEqual({ row: 3, col: 5 });
			expect(moves).toContainEqual({ row: 5, col: 3 });
			expect(moves).toContainEqual({ row: 5, col: 5 });
		});
	});

	describe('getPossibleMoves - king', () => {
		test('king moves one square in any direction', () => {
			const board = emptyBoard();
			const king: ShogiPiece = { type: 'king', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, king);

			const moves = getPossibleMoves(board, king, { row: 4, col: 4 });
			expect(moves).toHaveLength(8);
		});

		test('king cannot move off the board', () => {
			const board = emptyBoard();
			const king: ShogiPiece = { type: 'king', color: 'sente' };
			setPieceAt(board, { row: 0, col: 0 }, king);

			const moves = getPossibleMoves(board, king, { row: 0, col: 0 });
			// Corner: 3 valid squares
			expect(moves).toHaveLength(3);
		});

		test('king cannot move to ally-occupied squares', () => {
			const board = emptyBoard();
			const king: ShogiPiece = { type: 'king', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, king);
			// Surround with allies
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					if (dr === 0 && dc === 0) continue;
					setPieceAt(
						board,
						{ row: 4 + dr, col: 4 + dc },
						{ type: 'gold', color: 'sente' }
					);
				}
			}

			const moves = getPossibleMoves(board, king, { row: 4, col: 4 });
			expect(moves).toHaveLength(0);
		});
	});

	describe('isMoveValid', () => {
		test('returns true for a valid move', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);

			expect(
				isMoveValid(board, { row: 4, col: 4 }, { row: 3, col: 4 }, pawn)
			).toBe(true);
		});

		test('returns false for an invalid move', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, pawn);

			// Pawn cannot move sideways
			expect(
				isMoveValid(board, { row: 4, col: 4 }, { row: 4, col: 5 }, pawn)
			).toBe(false);
		});
	});

	describe('canDropAt', () => {
		test('can drop piece on empty square', () => {
			const board = emptyBoard();
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			expect(canDropAt(board, gold, { row: 4, col: 4 })).toBe(true);
		});

		test('cannot drop piece on occupied square', () => {
			const board = createInitialBoard();
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			expect(canDropAt(board, gold, { row: 0, col: 0 })).toBe(false);
		});

		test('cannot drop sente pawn on row 0', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			expect(canDropAt(board, pawn, { row: 0, col: 4 })).toBe(false);
		});

		test('cannot drop gote pawn on row 8', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'gote' };
			expect(canDropAt(board, pawn, { row: 8, col: 4 })).toBe(false);
		});

		test('cannot drop pawn on file with existing pawn (nifu)', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			// Place existing sente pawn in column 4
			setPieceAt(board, { row: 5, col: 4 }, { type: 'pawn', color: 'sente' });

			// Cannot drop another sente pawn in same column
			expect(canDropAt(board, pawn, { row: 3, col: 4 })).toBe(false);
		});

		test('can drop pawn on file with promoted pawn (not nifu)', () => {
			const board = emptyBoard();
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			// Place existing promoted pawn in column 4
			setPieceAt(
				board,
				{ row: 5, col: 4 },
				{ type: 'pawn', color: 'sente', isPromoted: true }
			);

			// Can drop unpromoted pawn if existing pawn is promoted
			expect(canDropAt(board, pawn, { row: 3, col: 4 })).toBe(true);
		});

		test('cannot drop sente lance on row 0', () => {
			const board = emptyBoard();
			const lance: ShogiPiece = { type: 'lance', color: 'sente' };
			expect(canDropAt(board, lance, { row: 0, col: 4 })).toBe(false);
			expect(canDropAt(board, lance, { row: 1, col: 4 })).toBe(true);
		});

		test('cannot drop sente knight on rows 0 or 1', () => {
			const board = emptyBoard();
			const knight: ShogiPiece = { type: 'knight', color: 'sente' };
			expect(canDropAt(board, knight, { row: 0, col: 4 })).toBe(false);
			expect(canDropAt(board, knight, { row: 1, col: 4 })).toBe(false);
			expect(canDropAt(board, knight, { row: 2, col: 4 })).toBe(true);
		});

		test('cannot drop gote knight on rows 7 or 8', () => {
			const board = emptyBoard();
			const knight: ShogiPiece = { type: 'knight', color: 'gote' };
			expect(canDropAt(board, knight, { row: 8, col: 4 })).toBe(false);
			expect(canDropAt(board, knight, { row: 7, col: 4 })).toBe(false);
			expect(canDropAt(board, knight, { row: 6, col: 4 })).toBe(true);
		});
	});

	describe('getDropPositions', () => {
		test('gold can be dropped on most empty squares', () => {
			const board = emptyBoard();
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			const positions = getDropPositions(board, gold);
			expect(positions.length).toBe(SHOGI_BOARD_SIZE * SHOGI_BOARD_SIZE); // All 81 squares
		});

		test('initial board reduces drop positions', () => {
			const board = createInitialBoard();
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			const positions = getDropPositions(board, gold);
			// 81 total - occupied squares
			expect(positions.length).toBeLessThan(
				SHOGI_BOARD_SIZE * SHOGI_BOARD_SIZE
			);
		});
	});
});
