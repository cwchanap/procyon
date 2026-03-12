import { test, expect, describe } from 'bun:test';
import {
	createInitialBoard,
	isValidPosition,
	getPieceAt,
	setPieceAt,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	isSquareOccupiedByAlly,
	copyBoard,
	positionToAlgebraic,
	algebraicToPosition,
	getDirection,
	isInPromotionZone,
	mustPromote,
	canPromote,
	getPromotedType,
	getBaseType,
} from './board';
import type { ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';

describe('Shogi Board Utilities', () => {
	describe('createInitialBoard', () => {
		test('should create a 9x9 board', () => {
			const board = createInitialBoard();
			expect(board.length).toBe(SHOGI_BOARD_SIZE);
			board.forEach(row => expect(row.length).toBe(SHOGI_BOARD_SIZE));
		});

		test('should place gote back row pieces on row 0', () => {
			const board = createInitialBoard();
			const expected = [
				'lance',
				'knight',
				'silver',
				'gold',
				'king',
				'gold',
				'silver',
				'knight',
				'lance',
			];
			expected.forEach((type, col) => {
				expect(board[0]?.[col]?.type).toBe(type);
				expect(board[0]?.[col]?.color).toBe('gote');
			});
		});

		test('should place gote rook and bishop on row 1', () => {
			const board = createInitialBoard();
			expect(board[1]?.[1]?.type).toBe('rook');
			expect(board[1]?.[1]?.color).toBe('gote');
			expect(board[1]?.[7]?.type).toBe('bishop');
			expect(board[1]?.[7]?.color).toBe('gote');
		});

		test('should place gote pawns on row 2', () => {
			const board = createInitialBoard();
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				expect(board[2]?.[col]?.type).toBe('pawn');
				expect(board[2]?.[col]?.color).toBe('gote');
			}
		});

		test('should place sente pawns on row 6', () => {
			const board = createInitialBoard();
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				expect(board[6]?.[col]?.type).toBe('pawn');
				expect(board[6]?.[col]?.color).toBe('sente');
			}
		});

		test('should place sente rook and bishop on row 7', () => {
			const board = createInitialBoard();
			expect(board[7]?.[1]?.type).toBe('bishop');
			expect(board[7]?.[1]?.color).toBe('sente');
			expect(board[7]?.[7]?.type).toBe('rook');
			expect(board[7]?.[7]?.color).toBe('sente');
		});

		test('should place sente back row pieces on row 8', () => {
			const board = createInitialBoard();
			const expected = [
				'lance',
				'knight',
				'silver',
				'gold',
				'king',
				'gold',
				'silver',
				'knight',
				'lance',
			];
			expected.forEach((type, col) => {
				expect(board[8]?.[col]?.type).toBe(type);
				expect(board[8]?.[col]?.color).toBe('sente');
			});
		});

		test('should have empty rows 3, 4, 5', () => {
			const board = createInitialBoard();
			for (let row = 3; row <= 5; row++) {
				for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
					expect(board[row]?.[col]).toBeNull();
				}
			}
		});
	});

	describe('isValidPosition', () => {
		test('should return true for valid positions', () => {
			expect(isValidPosition({ row: 0, col: 0 })).toBe(true);
			expect(isValidPosition({ row: 8, col: 8 })).toBe(true);
			expect(isValidPosition({ row: 4, col: 4 })).toBe(true);
		});

		test('should return false for out-of-bounds positions', () => {
			expect(isValidPosition({ row: -1, col: 0 })).toBe(false);
			expect(isValidPosition({ row: 0, col: -1 })).toBe(false);
			expect(isValidPosition({ row: 9, col: 0 })).toBe(false);
			expect(isValidPosition({ row: 0, col: 9 })).toBe(false);
		});
	});

	describe('getPieceAt', () => {
		test('should return piece at valid position', () => {
			const board = createInitialBoard();
			const piece = getPieceAt(board, { row: 0, col: 4 });
			expect(piece?.type).toBe('king');
			expect(piece?.color).toBe('gote');
		});

		test('should return null for empty square', () => {
			const board = createInitialBoard();
			expect(getPieceAt(board, { row: 4, col: 4 })).toBeNull();
		});

		test('should return null for invalid position', () => {
			const board = createInitialBoard();
			expect(getPieceAt(board, { row: -1, col: 0 })).toBeNull();
			expect(getPieceAt(board, { row: 9, col: 0 })).toBeNull();
		});
	});

	describe('setPieceAt', () => {
		test('should set a piece at a valid position', () => {
			const board = createInitialBoard();
			const piece: ShogiPiece = { type: 'gold', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, piece);
			expect(getPieceAt(board, { row: 4, col: 4 })).toEqual(piece);
		});

		test('should set null to clear a square', () => {
			const board = createInitialBoard();
			setPieceAt(board, { row: 0, col: 0 }, null);
			expect(getPieceAt(board, { row: 0, col: 0 })).toBeNull();
		});

		test('should do nothing for invalid position', () => {
			const board = createInitialBoard();
			const piece: ShogiPiece = { type: 'gold', color: 'sente' };
			// Should not throw
			setPieceAt(board, { row: -1, col: 0 }, piece);
			setPieceAt(board, { row: 9, col: 0 }, piece);
		});
	});

	describe('isSquareEmpty', () => {
		test('should return true for empty square', () => {
			const board = createInitialBoard();
			expect(isSquareEmpty(board, { row: 4, col: 4 })).toBe(true);
		});

		test('should return false for occupied square', () => {
			const board = createInitialBoard();
			expect(isSquareEmpty(board, { row: 0, col: 4 })).toBe(false);
		});
	});

	describe('isSquareOccupiedByOpponent', () => {
		test('should return true if opponent piece is present', () => {
			const board = createInitialBoard();
			// Row 0 is gote pieces, so for sente player, that is an opponent
			expect(
				isSquareOccupiedByOpponent(board, { row: 0, col: 4 }, 'sente')
			).toBe(true);
		});

		test('should return false if ally piece is present', () => {
			const board = createInitialBoard();
			expect(
				isSquareOccupiedByOpponent(board, { row: 8, col: 4 }, 'sente')
			).toBe(false);
		});

		test('should return false for empty square', () => {
			const board = createInitialBoard();
			expect(
				isSquareOccupiedByOpponent(board, { row: 4, col: 4 }, 'sente')
			).toBe(false);
		});
	});

	describe('isSquareOccupiedByAlly', () => {
		test('should return true if ally piece is present', () => {
			const board = createInitialBoard();
			expect(isSquareOccupiedByAlly(board, { row: 8, col: 4 }, 'sente')).toBe(
				true
			);
		});

		test('should return false if opponent piece is present', () => {
			const board = createInitialBoard();
			expect(isSquareOccupiedByAlly(board, { row: 0, col: 4 }, 'sente')).toBe(
				false
			);
		});

		test('should return false for empty square', () => {
			const board = createInitialBoard();
			expect(isSquareOccupiedByAlly(board, { row: 4, col: 4 }, 'sente')).toBe(
				false
			);
		});
	});

	describe('copyBoard', () => {
		test('should create an independent copy', () => {
			const board = createInitialBoard();
			const copy = copyBoard(board);
			// Modify original
			setPieceAt(board, { row: 4, col: 4 }, { type: 'gold', color: 'sente' });
			// Copy should be unchanged
			expect(getPieceAt(copy, { row: 4, col: 4 })).toBeNull();
		});

		test('should have same pieces as original', () => {
			const board = createInitialBoard();
			const copy = copyBoard(board);
			expect(copy[0]?.[4]?.type).toBe('king');
			expect(copy[8]?.[4]?.type).toBe('king');
		});
	});

	describe('positionToAlgebraic', () => {
		test('should convert position to algebraic notation', () => {
			// col 0 = file '9', row 0 = rank 'a'
			expect(positionToAlgebraic({ row: 0, col: 0 })).toBe('9a');
			// col 8 = file '1', row 8 = rank 'i'
			expect(positionToAlgebraic({ row: 8, col: 8 })).toBe('1i');
		});

		test('should throw for out-of-bounds position', () => {
			expect(() => positionToAlgebraic({ row: -1, col: 0 })).toThrow(
				RangeError
			);
			expect(() => positionToAlgebraic({ row: 9, col: 0 })).toThrow(RangeError);
			expect(() => positionToAlgebraic({ row: 0, col: -1 })).toThrow(
				RangeError
			);
			expect(() => positionToAlgebraic({ row: 0, col: 9 })).toThrow(RangeError);
		});
	});

	describe('algebraicToPosition', () => {
		test('should convert algebraic notation to position', () => {
			expect(algebraicToPosition('9a')).toEqual({ row: 0, col: 0 });
			expect(algebraicToPosition('1i')).toEqual({ row: 8, col: 8 });
		});

		test('should return null for invalid notation', () => {
			expect(algebraicToPosition('')).toBeNull();
			expect(algebraicToPosition('x')).toBeNull();
			expect(algebraicToPosition('zz')).toBeNull();
			expect(algebraicToPosition('9z')).toBeNull();
		});
	});

	describe('getDirection', () => {
		test('should return -1 for sente (moves up)', () => {
			expect(getDirection('sente')).toBe(-1);
		});

		test('should return 1 for gote (moves down)', () => {
			expect(getDirection('gote')).toBe(1);
		});
	});

	describe('isInPromotionZone', () => {
		test('sente promotion zone is rows 0, 1, 2', () => {
			expect(isInPromotionZone({ row: 0, col: 0 }, 'sente')).toBe(true);
			expect(isInPromotionZone({ row: 1, col: 0 }, 'sente')).toBe(true);
			expect(isInPromotionZone({ row: 2, col: 0 }, 'sente')).toBe(true);
			expect(isInPromotionZone({ row: 3, col: 0 }, 'sente')).toBe(false);
		});

		test('gote promotion zone is rows 6, 7, 8', () => {
			expect(isInPromotionZone({ row: 6, col: 0 }, 'gote')).toBe(true);
			expect(isInPromotionZone({ row: 7, col: 0 }, 'gote')).toBe(true);
			expect(isInPromotionZone({ row: 8, col: 0 }, 'gote')).toBe(true);
			expect(isInPromotionZone({ row: 5, col: 0 }, 'gote')).toBe(false);
		});
	});

	describe('mustPromote', () => {
		test('sente pawn must promote on row 0', () => {
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			expect(mustPromote(pawn, { row: 0, col: 4 })).toBe(true);
			expect(mustPromote(pawn, { row: 1, col: 4 })).toBe(false);
		});

		test('sente lance must promote on row 0', () => {
			const lance: ShogiPiece = { type: 'lance', color: 'sente' };
			expect(mustPromote(lance, { row: 0, col: 0 })).toBe(true);
			expect(mustPromote(lance, { row: 1, col: 0 })).toBe(false);
		});

		test('sente knight must promote on rows 0 and 1', () => {
			const knight: ShogiPiece = { type: 'knight', color: 'sente' };
			expect(mustPromote(knight, { row: 0, col: 1 })).toBe(true);
			expect(mustPromote(knight, { row: 1, col: 1 })).toBe(true);
			expect(mustPromote(knight, { row: 2, col: 1 })).toBe(false);
		});

		test('gote pawn must promote on row 8', () => {
			const pawn: ShogiPiece = { type: 'pawn', color: 'gote' };
			expect(mustPromote(pawn, { row: 8, col: 4 })).toBe(true);
			expect(mustPromote(pawn, { row: 7, col: 4 })).toBe(false);
		});

		test('gote knight must promote on rows 7 and 8', () => {
			const knight: ShogiPiece = { type: 'knight', color: 'gote' };
			expect(mustPromote(knight, { row: 7, col: 1 })).toBe(true);
			expect(mustPromote(knight, { row: 8, col: 1 })).toBe(true);
			expect(mustPromote(knight, { row: 6, col: 1 })).toBe(false);
		});

		test('already promoted piece does not need to promote again', () => {
			const pawn: ShogiPiece = {
				type: 'pawn',
				color: 'sente',
				isPromoted: true,
			};
			expect(mustPromote(pawn, { row: 0, col: 4 })).toBe(false);
		});
	});

	describe('canPromote', () => {
		test('can promote when entering promotion zone', () => {
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			// Moving from row 3 to row 2 (entering sente promotion zone)
			expect(canPromote(pawn, { row: 3, col: 4 }, { row: 2, col: 4 })).toBe(
				true
			);
		});

		test('can promote when already in promotion zone', () => {
			const bishop: ShogiPiece = { type: 'bishop', color: 'sente' };
			expect(canPromote(bishop, { row: 1, col: 1 }, { row: 2, col: 2 })).toBe(
				true
			);
		});

		test('cannot promote pieces that are already promoted', () => {
			const promoted: ShogiPiece = {
				type: 'pawn',
				color: 'sente',
				isPromoted: true,
			};
			expect(canPromote(promoted, { row: 3, col: 4 }, { row: 2, col: 4 })).toBe(
				false
			);
		});

		test('king and gold cannot promote', () => {
			const king: ShogiPiece = { type: 'king', color: 'sente' };
			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			expect(canPromote(king, { row: 3, col: 4 }, { row: 2, col: 4 })).toBe(
				false
			);
			expect(canPromote(gold, { row: 3, col: 4 }, { row: 2, col: 4 })).toBe(
				false
			);
		});

		test('cannot promote when not in promotion zone', () => {
			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
			expect(canPromote(pawn, { row: 5, col: 4 }, { row: 4, col: 4 })).toBe(
				false
			);
		});
	});

	describe('getPromotedType', () => {
		test('pawn promotes to promoted_pawn', () => {
			expect(getPromotedType('pawn')).toBe('promoted_pawn');
		});

		test('lance promotes to promoted_lance', () => {
			expect(getPromotedType('lance')).toBe('promoted_lance');
		});

		test('knight promotes to promoted_knight', () => {
			expect(getPromotedType('knight')).toBe('promoted_knight');
		});

		test('silver promotes to promoted_silver', () => {
			expect(getPromotedType('silver')).toBe('promoted_silver');
		});

		test('bishop promotes to horse', () => {
			expect(getPromotedType('bishop')).toBe('horse');
		});

		test('rook promotes to dragon', () => {
			expect(getPromotedType('rook')).toBe('dragon');
		});

		test('non-promotable pieces return same type', () => {
			expect(getPromotedType('king')).toBe('king');
			expect(getPromotedType('gold')).toBe('gold');
		});
	});

	describe('getBaseType', () => {
		test('promoted_pawn demotion to pawn', () => {
			expect(getBaseType('promoted_pawn')).toBe('pawn');
		});

		test('horse demotes to bishop', () => {
			expect(getBaseType('horse')).toBe('bishop');
		});

		test('dragon demotes to rook', () => {
			expect(getBaseType('dragon')).toBe('rook');
		});

		test('unpromoted pieces return same type', () => {
			expect(getBaseType('pawn')).toBe('pawn');
			expect(getBaseType('king')).toBe('king');
		});
	});
});
