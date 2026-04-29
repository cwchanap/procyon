import { test, expect, describe } from 'bun:test';
import { createInitialTerrain } from './types';
import { getPossibleMoves, isValidMove, makeMove } from './moves';
import type { JunglePiece, JungleTerrain } from './types';

// Helper: create an empty 9x7 board
function emptyBoard(): (JunglePiece | null)[][] {
	return Array(9)
		.fill(null)
		.map(() => Array(7).fill(null));
}

// Helper: place a piece at a position
function place(
	board: (JunglePiece | null)[][],
	row: number,
	col: number,
	piece: JunglePiece
): void {
	board[row]![col] = piece;
}

const terrain = createInitialTerrain();

// The initial terrain:
// Water: rows 3-5, cols 1-2 AND rows 3-5, cols 4-5
// Blue den: row 0, col 3
// Red den: row 8, col 3
// Blue traps: (0,2), (0,4), (1,3)
// Red traps: (8,2), (8,4), (7,3)

describe('jungle moves - river jump left (getRiverJumpMoves)', () => {
	test('lion at right edge of river can jump left across water', () => {
		const board = emptyBoard();
		// Right river: rows 3-5, cols 4-5. Lion at col 6, row 4 can jump left to col 3.
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 4, 6, lion);

		const moves = getPossibleMoves(board, terrain, { row: 4, col: 6 });
		// Should include col 3 (past the right river block at cols 4-5)
		const jumpLeft = moves.find(m => m.row === 4 && m.col === 3);
		expect(jumpLeft).toBeDefined();
	});

	test('tiger at right edge of river can jump left across water', () => {
		const board = emptyBoard();
		const tiger: JunglePiece = { type: 'tiger', color: 'blue', rank: 6 };
		place(board, 3, 6, tiger);

		const moves = getPossibleMoves(board, terrain, { row: 3, col: 6 });
		const jumpLeft = moves.find(m => m.row === 3 && m.col === 3);
		expect(jumpLeft).toBeDefined();
	});

	test('lion jump left is blocked when rat is in the river', () => {
		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		const rat: JunglePiece = { type: 'rat', color: 'blue', rank: 1 };
		place(board, 4, 6, lion);
		place(board, 4, 5, rat); // Rat blocks the jump at water square

		const moves = getPossibleMoves(board, terrain, { row: 4, col: 6 });
		const jumpLeft = moves.find(m => m.row === 4 && m.col === 3);
		expect(jumpLeft).toBeUndefined();
	});
});

describe('jungle moves - river jump down (getRiverJumpMoves)', () => {
	test('lion above river can jump down across water', () => {
		const board = emptyBoard();
		// Left river: rows 3-5, col 1. Lion at (2,1) can jump to (6,1).
		const lion: JunglePiece = { type: 'lion', color: 'blue', rank: 7 };
		place(board, 2, 1, lion);

		const moves = getPossibleMoves(board, terrain, { row: 2, col: 1 });
		const jumpDown = moves.find(m => m.row === 6 && m.col === 1);
		expect(jumpDown).toBeDefined();
	});

	test('tiger above river can jump down', () => {
		const board = emptyBoard();
		const tiger: JunglePiece = { type: 'tiger', color: 'red', rank: 6 };
		place(board, 2, 4, tiger);

		const moves = getPossibleMoves(board, terrain, { row: 2, col: 4 });
		const jumpDown = moves.find(m => m.row === 6 && m.col === 4);
		expect(jumpDown).toBeDefined();
	});

	test('lion jump down blocked by rat in the river', () => {
		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'blue', rank: 7 };
		const rat: JunglePiece = { type: 'rat', color: 'red', rank: 1 };
		place(board, 2, 1, lion);
		place(board, 4, 1, rat); // Rat blocks at water square

		const moves = getPossibleMoves(board, terrain, { row: 2, col: 1 });
		const jumpDown = moves.find(m => m.row === 6 && m.col === 1);
		expect(jumpDown).toBeUndefined();
	});
});

describe('jungle moves - isValidRiverJump edge cases', () => {
	test('diagonal jump is invalid (not straight line)', () => {
		// A lion trying to jump diagonally across river
		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 2, 1, lion);

		// Diagonal target (neither same row nor same col)
		const valid = isValidMove(
			board,
			terrain,
			{ row: 2, col: 1 },
			{ row: 6, col: 2 }
		);
		expect(valid).toBe(false);
	});

	test('river jump with non-water square in horizontal path is invalid', () => {
		// Create a custom terrain where the horizontal path has a non-water square
		const customTerrain: JungleTerrain[][] = createInitialTerrain();
		// Make col 5 at row 4 non-water (breaking the river)
		customTerrain[4]![5] = { type: 'normal' };

		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 4, 6, lion);

		// Without continuous water, jump should be invalid
		const valid = isValidMove(
			board,
			customTerrain,
			{ row: 4, col: 6 },
			{ row: 4, col: 3 }
		);
		expect(valid).toBe(false);
	});

	test('river jump with non-water square in vertical path is invalid', () => {
		const customTerrain: JungleTerrain[][] = createInitialTerrain();
		// Break the vertical river at row 4 col 1
		customTerrain[4]![1] = { type: 'normal' };

		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'blue', rank: 7 };
		place(board, 2, 1, lion);

		const valid = isValidMove(
			board,
			customTerrain,
			{ row: 2, col: 1 },
			{ row: 6, col: 1 }
		);
		expect(valid).toBe(false);
	});
});

describe('jungle moves - isNearWater returns false', () => {
	test('position in center of board far from water returns no river jumps', () => {
		const board = emptyBoard();
		// Col 3 is between rivers at rows 3-5 — it is normal terrain, not near water
		// But its neighbors at col 2 and col 4 ARE water. Actually col 3 is adjacent to water.
		// Use row 0, col 3 (blue den area, far from river) for lion
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 0, 3, lion);

		const moves = getPossibleMoves(board, terrain, { row: 0, col: 3 });
		// No river jumps from this position - just normal moves
		// All moves should be adjacent (distance 1)
		for (const move of moves) {
			const dist = Math.abs(move.row - 0) + Math.abs(move.col - 3);
			expect(dist).toBe(1);
		}
	});

	test('position in row 6 col 3 (away from river) generates no river jumps', () => {
		const board = emptyBoard();
		const tiger: JunglePiece = { type: 'tiger', color: 'red', rank: 6 };
		// Row 6 col 3 is normal terrain, not adjacent to water
		place(board, 6, 3, tiger);

		const moves = getPossibleMoves(board, terrain, { row: 6, col: 3 });
		for (const move of moves) {
			const dist = Math.abs(move.row - 6) + Math.abs(move.col - 3);
			expect(dist).toBe(1);
		}
	});
});

describe('jungle moves - canJumpAcrossRiver returns true', () => {
	test('isValidMove returns true for valid river jump', () => {
		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 2, 1, lion);

		// Valid jump: from (2,1) above the river to (6,1) below the river
		const valid = isValidMove(
			board,
			terrain,
			{ row: 2, col: 1 },
			{ row: 6, col: 1 }
		);
		expect(valid).toBe(true);
	});

	test('horizontal river jump is valid with no blocking piece', () => {
		const board = emptyBoard();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 4, 0, lion);

		// From col 0, left river is at cols 1-2, land at col 3
		const valid = isValidMove(
			board,
			terrain,
			{ row: 4, col: 0 },
			{ row: 4, col: 3 }
		);
		expect(valid).toBe(true);
	});
});

describe('jungle moves - makeMove edge case', () => {
	test('makeMove returns null for invalid move', () => {
		const board = emptyBoard();
		const piece: JunglePiece = { type: 'cat', color: 'red', rank: 2 };
		place(board, 0, 0, piece);

		// Attempt to move cat to a position more than 1 square away (invalid)
		const result = makeMove(
			board,
			terrain,
			{ row: 0, col: 0 },
			{ row: 0, col: 5 }
		);
		expect(result).toBeNull();
	});

	test('makeMove returns null when no piece at from position', () => {
		const board = emptyBoard();
		// No piece at (0,0) - from is empty
		const result = makeMove(
			board,
			terrain,
			{ row: 0, col: 0 },
			{ row: 0, col: 1 }
		);
		expect(result).toBeNull();
	});
});

describe('jungle moves - jump up across river', () => {
	test('lion below river can jump up', () => {
		const board = emptyBoard();
		// Left river: rows 3-5, col 1. Lion at (6,1) can jump up to (2,1).
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 6, 1, lion);

		const moves = getPossibleMoves(board, terrain, { row: 6, col: 1 });
		const jumpUp = moves.find(m => m.row === 2 && m.col === 1);
		expect(jumpUp).toBeDefined();
	});

	test('tiger below river can jump up', () => {
		const board = emptyBoard();
		const tiger: JunglePiece = { type: 'tiger', color: 'blue', rank: 6 };
		place(board, 6, 4, tiger);

		const moves = getPossibleMoves(board, terrain, { row: 6, col: 4 });
		const jumpUp = moves.find(m => m.row === 2 && m.col === 4);
		expect(jumpUp).toBeDefined();
	});
});

describe('jungle moves - own den is invalid target', () => {
	test('red piece cannot enter red den at (8,3)', () => {
		const board = emptyBoard();
		// Red den is at row 8, col 3
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		place(board, 8, 2, lion); // adjacent to red den

		const valid = isValidMove(
			board,
			terrain,
			{ row: 8, col: 2 },
			{ row: 8, col: 3 }
		);
		expect(valid).toBe(false);
	});

	test('blue piece cannot enter blue den at (0,3)', () => {
		const board = emptyBoard();
		// Blue den is at row 0, col 3
		const lion: JunglePiece = { type: 'lion', color: 'blue', rank: 7 };
		place(board, 1, 3, lion); // adjacent to blue den

		const valid = isValidMove(
			board,
			terrain,
			{ row: 1, col: 3 },
			{ row: 0, col: 3 }
		);
		expect(valid).toBe(false);
	});
});
