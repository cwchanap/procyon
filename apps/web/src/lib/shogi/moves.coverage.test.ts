import { test, expect, describe } from 'bun:test';
import { getPossibleMoves, isMoveValid, canDropAt, getDropPositions } from './moves';
import { setPieceAt } from './board';
import type { ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';

function emptyBoard(): (ShogiPiece | null)[][] {
	return Array(SHOGI_BOARD_SIZE)
		.fill(null)
		.map(() => Array(SHOGI_BOARD_SIZE).fill(null));
}

// ---------------------------------------------------------------------------
// Promoted pieces that behave like gold (promoted_lance, promoted_knight, promoted_silver)
// ---------------------------------------------------------------------------

describe('getPossibleMoves - promoted_lance (moves like gold)', () => {
	test('sente promoted_lance moves 6 directions like gold', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_lance', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		const moves = getPossibleMoves(board, piece, { row: 4, col: 4 });
		expect(moves).toHaveLength(6);
		// forward (sente = row--)
		expect(moves).toContainEqual({ row: 3, col: 4 });
		// backward (sente = row++)
		expect(moves).toContainEqual({ row: 5, col: 4 });
		// sides
		expect(moves).toContainEqual({ row: 4, col: 3 });
		expect(moves).toContainEqual({ row: 4, col: 5 });
		// forward diagonals
		expect(moves).toContainEqual({ row: 3, col: 3 });
		expect(moves).toContainEqual({ row: 3, col: 5 });
	});

	test('gote promoted_lance moves 6 directions (reversed)', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_lance', color: 'gote', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		const moves = getPossibleMoves(board, piece, { row: 4, col: 4 });
		expect(moves).toHaveLength(6);
		// forward for gote = row++
		expect(moves).toContainEqual({ row: 5, col: 4 });
		// backward for gote = row--
		expect(moves).toContainEqual({ row: 3, col: 4 });
	});
});

describe('getPossibleMoves - promoted_knight (moves like gold)', () => {
	test('sente promoted_knight has 6 moves from center', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_knight', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		const moves = getPossibleMoves(board, piece, { row: 4, col: 4 });
		expect(moves).toHaveLength(6);
	});

	test('promoted_knight cannot move to diagonal backward squares', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_knight', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		const moves = getPossibleMoves(board, piece, { row: 4, col: 4 });
		// Gold cannot move to backward diagonals
		expect(moves).not.toContainEqual({ row: 5, col: 3 });
		expect(moves).not.toContainEqual({ row: 5, col: 5 });
	});
});

describe('getPossibleMoves - promoted_silver (moves like gold)', () => {
	test('sente promoted_silver has 6 moves from center', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_silver', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		const moves = getPossibleMoves(board, piece, { row: 4, col: 4 });
		expect(moves).toHaveLength(6);
	});

	test('promoted_silver has same move set as gold', () => {
		const board = emptyBoard();
		const pSilver: ShogiPiece = { type: 'promoted_silver', color: 'sente', isPromoted: true };
		const gold: ShogiPiece = { type: 'gold', color: 'sente' };
		setPieceAt(board, { row: 4, col: 4 }, pSilver);
		const silverMoves = getPossibleMoves(board, pSilver, { row: 4, col: 4 });
		setPieceAt(board, { row: 4, col: 4 }, gold);
		const goldMoves = getPossibleMoves(board, gold, { row: 4, col: 4 });
		// Sort both to compare
		const sortFn = (a: { row: number; col: number }, b: { row: number; col: number }) =>
			a.row !== b.row ? a.row - b.row : a.col - b.col;
		expect(silverMoves.sort(sortFn)).toEqual(goldMoves.sort(sortFn));
	});
});

// ---------------------------------------------------------------------------
// default case - unknown piece type
// ---------------------------------------------------------------------------

describe('getPossibleMoves - unknown piece type', () => {
	test('returns empty array for unknown piece type', () => {
		const board = emptyBoard();
		const unknown = { type: 'unicorn', color: 'sente' } as unknown as ShogiPiece;
		setPieceAt(board, { row: 4, col: 4 }, unknown);
		const moves = getPossibleMoves(board, unknown, { row: 4, col: 4 });
		expect(moves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Horse (promoted bishop) edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - horse near edges', () => {
	test('horse at corner (0,0) has correct limited moves', () => {
		const board = emptyBoard();
		const horse: ShogiPiece = { type: 'horse', color: 'sente' };
		setPieceAt(board, { row: 0, col: 0 }, horse);
		const moves = getPossibleMoves(board, horse, { row: 0, col: 0 });
		// From corner: bishop diagonals go down-right only (1 direction)
		// Plus orthogonal: right and down
		expect(moves.length).toBeGreaterThan(0);
		expect(moves).toContainEqual({ row: 0, col: 1 }); // orthogonal right
		expect(moves).toContainEqual({ row: 1, col: 0 }); // orthogonal down
	});

	test('horse cannot move to ally-occupied squares', () => {
		const board = emptyBoard();
		const horse: ShogiPiece = { type: 'horse', color: 'sente' };
		const ally: ShogiPiece = { type: 'gold', color: 'sente' };
		setPieceAt(board, { row: 4, col: 4 }, horse);
		setPieceAt(board, { row: 3, col: 4 }, ally); // blocks orthogonal up
		const moves = getPossibleMoves(board, horse, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 3, col: 4 });
	});
});

// ---------------------------------------------------------------------------
// Dragon (promoted rook) edge cases
// ---------------------------------------------------------------------------

describe('getPossibleMoves - dragon near edges', () => {
	test('dragon at corner (8,8) has correct moves', () => {
		const board = emptyBoard();
		const dragon: ShogiPiece = { type: 'dragon', color: 'sente' };
		setPieceAt(board, { row: 8, col: 8 }, dragon);
		const moves = getPossibleMoves(board, dragon, { row: 8, col: 8 });
		// Rook from (8,8): 8 up + 8 left = 16 orthogonal
		// Plus 1 diagonal: only (7,7)
		expect(moves).toContainEqual({ row: 7, col: 7 }); // diagonal
		expect(moves).toContainEqual({ row: 7, col: 8 }); // orthogonal
		expect(moves).toContainEqual({ row: 8, col: 7 }); // orthogonal
	});

	test('dragon cannot capture own pieces', () => {
		const board = emptyBoard();
		const dragon: ShogiPiece = { type: 'dragon', color: 'sente' };
		const ally: ShogiPiece = { type: 'gold', color: 'sente' };
		setPieceAt(board, { row: 4, col: 4 }, dragon);
		setPieceAt(board, { row: 4, col: 6 }, ally); // blocks rook right
		const moves = getPossibleMoves(board, dragon, { row: 4, col: 4 });
		expect(moves).not.toContainEqual({ row: 4, col: 6 });
		expect(moves).not.toContainEqual({ row: 4, col: 7 });
		expect(moves).not.toContainEqual({ row: 4, col: 8 });
	});
});

// ---------------------------------------------------------------------------
// isMoveValid for promoted pieces
// ---------------------------------------------------------------------------

describe('isMoveValid - promoted pieces', () => {
	test('promoted_pawn can move like gold', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_pawn', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		// Gold can move forward, backward, left, right, forward-diagonals
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 3, col: 4 }, piece)).toBe(true); // forward
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 5, col: 4 }, piece)).toBe(true); // backward
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 5, col: 3 }, piece)).toBe(false); // backward-diag (gold can't)
	});

	test('promoted_lance cannot move backward diagonals', () => {
		const board = emptyBoard();
		const piece: ShogiPiece = { type: 'promoted_lance', color: 'sente', isPromoted: true };
		setPieceAt(board, { row: 4, col: 4 }, piece);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 5, col: 3 }, piece)).toBe(false);
		expect(isMoveValid(board, { row: 4, col: 4 }, { row: 5, col: 5 }, piece)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// canDropAt and getDropPositions additional cases
// ---------------------------------------------------------------------------

describe('canDropAt - additional cases', () => {
	test('can drop gold anywhere on empty board except occupied squares', () => {
		const board = emptyBoard();
		const gold: ShogiPiece = { type: 'gold', color: 'sente' };
		expect(canDropAt(board, gold, { row: 0, col: 0 })).toBe(true);
		expect(canDropAt(board, gold, { row: 8, col: 8 })).toBe(true);
	});

	test('cannot drop on occupied square', () => {
		const board = emptyBoard();
		const gold: ShogiPiece = { type: 'gold', color: 'sente' };
		const existing: ShogiPiece = { type: 'pawn', color: 'gote' };
		setPieceAt(board, { row: 4, col: 4 }, existing);
		expect(canDropAt(board, gold, { row: 4, col: 4 })).toBe(false);
	});

	test('gote lance cannot be dropped on row 0 (last rank)', () => {
		const board = emptyBoard();
		const lance: ShogiPiece = { type: 'lance', color: 'gote' };
		expect(canDropAt(board, lance, { row: 8, col: 4 })).toBe(false);
		expect(canDropAt(board, lance, { row: 7, col: 4 })).toBe(true);
	});
});

describe('getDropPositions', () => {
	test('returns all squares for gold on empty board', () => {
		const board = emptyBoard();
		const gold: ShogiPiece = { type: 'gold', color: 'sente' };
		const positions = getDropPositions(board, gold);
		expect(positions).toHaveLength(SHOGI_BOARD_SIZE * SHOGI_BOARD_SIZE);
	});

	test('sente pawn drop positions exclude row 0 and columns with existing pawns', () => {
		const board = emptyBoard();
		// Place pawn on col 0
		setPieceAt(board, { row: 5, col: 0 }, { type: 'pawn', color: 'sente' });
		const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		const positions = getDropPositions(board, pawn);
		// Should not include row 0 (any column) or col 0 (nifu)
		const hasRow0 = positions.some(p => p.row === 0);
		const hasCol0 = positions.some(p => p.col === 0);
		expect(hasRow0).toBe(false);
		expect(hasCol0).toBe(false);
	});
});
