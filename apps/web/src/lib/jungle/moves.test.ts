import { test, expect, describe } from 'bun:test';
import {
	getPossibleMoves,
	isValidMove,
	makeMove,
	isWinningMove,
	hasValidMoves,
} from './moves';
import { createInitialBoard, setPieceAt, getPieceAt } from './board';
import { createInitialTerrain, PIECE_RANKS } from './types';
import type { JunglePiece, JungleTerrain } from './types';
import { JUNGLE_ROWS, JUNGLE_COLS } from './types';

function emptyBoard(): (JunglePiece | null)[][] {
	return Array(JUNGLE_ROWS)
		.fill(null)
		.map(() => Array(JUNGLE_COLS).fill(null));
}

function emptyTerrain(): JungleTerrain[][] {
	return Array(JUNGLE_ROWS)
		.fill(null)
		.map(() => Array(JUNGLE_COLS).fill({ type: 'normal' as const }));
}

describe('Jungle Move Generation', () => {
	describe('getPossibleMoves - basic moves', () => {
		test('returns empty array when no piece at position', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const moves = getPossibleMoves(board, terrain, { row: 4, col: 3 });
			expect(moves).toHaveLength(0);
		});

		test('normal piece can move to adjacent empty squares', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const leopard: JunglePiece = {
				type: 'leopard',
				color: 'red',
				rank: PIECE_RANKS.leopard,
			};
			setPieceAt(board, { row: 4, col: 3 }, leopard);

			const moves = getPossibleMoves(board, terrain, { row: 4, col: 3 });
			expect(moves).toHaveLength(4);
			expect(moves).toContainEqual({ row: 3, col: 3 });
			expect(moves).toContainEqual({ row: 5, col: 3 });
			expect(moves).toContainEqual({ row: 4, col: 2 });
			expect(moves).toContainEqual({ row: 4, col: 4 });
		});

		test('piece at corner has 2 moves', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 0, col: 0 }, cat);

			const moves = getPossibleMoves(board, terrain, { row: 0, col: 0 });
			expect(moves).toHaveLength(2);
		});

		test('piece cannot move to own-color square', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			const ally: JunglePiece = {
				type: 'dog',
				color: 'red',
				rank: PIECE_RANKS.dog,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);
			setPieceAt(board, { row: 3, col: 3 }, ally); // Block above

			const moves = getPossibleMoves(board, terrain, { row: 4, col: 3 });
			expect(moves).not.toContainEqual({ row: 3, col: 3 });
		});
	});

	describe('getPossibleMoves - water rules', () => {
		test('normal piece cannot enter water', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place a dog at row 2, col 1 (adjacent to water at row 3, col 1)
			const dog: JunglePiece = {
				type: 'dog',
				color: 'red',
				rank: PIECE_RANKS.dog,
			};
			setPieceAt(board, { row: 2, col: 1 }, dog);

			const moves = getPossibleMoves(board, terrain, { row: 2, col: 1 });
			// Should not include the water square at row 3, col 1
			expect(moves).not.toContainEqual({ row: 3, col: 1 });
		});

		test('rat can enter water', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place a rat at row 2, col 1 (adjacent to water at row 3, col 1)
			const rat: JunglePiece = {
				type: 'rat',
				color: 'red',
				rank: PIECE_RANKS.rat,
			};
			setPieceAt(board, { row: 2, col: 1 }, rat);

			const moves = getPossibleMoves(board, terrain, { row: 2, col: 1 });
			expect(moves).toContainEqual({ row: 3, col: 1 });
		});
	});

	describe('getPossibleMoves - den rules', () => {
		test('piece cannot enter own den', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Red lion adjacent to red den at row 8, col 3
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			setPieceAt(board, { row: 8, col: 2 }, lion);

			const moves = getPossibleMoves(board, terrain, { row: 8, col: 2 });
			// Should not include own den
			expect(moves).not.toContainEqual({ row: 8, col: 3 });
		});

		test('piece can enter opponent den', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Red lion adjacent to blue den at row 0, col 3
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			// Place lion adjacent to blue den - row 1, col 3 is a blue trap
			// but row 0 col 3 is the blue den - put lion at row 1, col 3
			setPieceAt(board, { row: 1, col: 3 }, lion);

			const moves = getPossibleMoves(board, terrain, { row: 1, col: 3 });
			// Should include blue den at row 0, col 3
			expect(moves).toContainEqual({ row: 0, col: 3 });
		});
	});

	describe('getPossibleMoves - river jumps for lion/tiger', () => {
		test('lion can jump across river horizontally', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place lion at row 4, col 0 (adjacent to water at row 4, col 1)
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			setPieceAt(board, { row: 4, col: 0 }, lion);

			const moves = getPossibleMoves(board, terrain, { row: 4, col: 0 });
			// Water is at cols 1-2, so jump to col 3
			expect(moves).toContainEqual({ row: 4, col: 3 });
		});

		test('tiger can jump across river vertically', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place tiger at row 2, col 1 (adjacent to water at row 3, col 1)
			const tiger: JunglePiece = {
				type: 'tiger',
				color: 'red',
				rank: PIECE_RANKS.tiger,
			};
			setPieceAt(board, { row: 2, col: 1 }, tiger);

			const moves = getPossibleMoves(board, terrain, { row: 2, col: 1 });
			// Water is at rows 3-5, so jump to row 6
			expect(moves).toContainEqual({ row: 6, col: 1 });
		});

		test('lion cannot jump river if rat is blocking the path', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place lion at row 4, col 0
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			setPieceAt(board, { row: 4, col: 0 }, lion);
			// Place rat in water blocking the jump
			const rat: JunglePiece = {
				type: 'rat',
				color: 'blue',
				rank: PIECE_RANKS.rat,
			};
			setPieceAt(board, { row: 4, col: 1 }, rat); // In water blocking

			const moves = getPossibleMoves(board, terrain, { row: 4, col: 0 });
			// Jump should be blocked
			expect(moves).not.toContainEqual({ row: 4, col: 3 });
		});

		test('non-lion/tiger pieces cannot jump river', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place elephant at row 4, col 0
			const elephant: JunglePiece = {
				type: 'elephant',
				color: 'red',
				rank: PIECE_RANKS.elephant,
			};
			setPieceAt(board, { row: 4, col: 0 }, elephant);

			const moves = getPossibleMoves(board, terrain, { row: 4, col: 0 });
			// Cannot jump river
			expect(moves).not.toContainEqual({ row: 4, col: 3 });
		});
	});

	describe('isValidMove', () => {
		test('valid adjacent move returns true', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(true);
		});

		test('invalid move to same position returns false', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 4, col: 3 })
			).toBe(false);
		});

		test('move to out-of-bounds returns false', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 0, col: 0 }, cat);

			expect(
				isValidMove(board, terrain, { row: 0, col: 0 }, { row: -1, col: 0 })
			).toBe(false);
		});

		test('move from empty square returns false', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(false);
		});

		test('cannot capture own piece', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			const ally: JunglePiece = {
				type: 'dog',
				color: 'red',
				rank: PIECE_RANKS.dog,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);
			setPieceAt(board, { row: 5, col: 3 }, ally);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(false);
		});

		test('higher rank captures lower rank', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const dog: JunglePiece = {
				type: 'dog',
				color: 'red',
				rank: PIECE_RANKS.dog,
			};
			const cat: JunglePiece = {
				type: 'cat',
				color: 'blue',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, dog);
			setPieceAt(board, { row: 5, col: 3 }, cat);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(true);
		});

		test('lower rank cannot capture higher rank', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			const dog: JunglePiece = {
				type: 'dog',
				color: 'blue',
				rank: PIECE_RANKS.dog,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);
			setPieceAt(board, { row: 5, col: 3 }, dog);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(false);
		});

		test('rat can capture elephant', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const rat: JunglePiece = {
				type: 'rat',
				color: 'red',
				rank: PIECE_RANKS.rat,
			};
			const elephant: JunglePiece = {
				type: 'elephant',
				color: 'blue',
				rank: PIECE_RANKS.elephant,
			};
			setPieceAt(board, { row: 4, col: 3 }, rat);
			setPieceAt(board, { row: 5, col: 3 }, elephant);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(true);
		});

		test('elephant cannot capture rat', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const elephant: JunglePiece = {
				type: 'elephant',
				color: 'red',
				rank: PIECE_RANKS.elephant,
			};
			const rat: JunglePiece = {
				type: 'rat',
				color: 'blue',
				rank: PIECE_RANKS.rat,
			};
			setPieceAt(board, { row: 4, col: 3 }, elephant);
			setPieceAt(board, { row: 5, col: 3 }, rat);

			expect(
				isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 })
			).toBe(false);
		});

		test('piece in enemy trap can be captured by any piece', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Put a red elephant in a blue trap (row 0, col 2)
			const elephant: JunglePiece = {
				type: 'elephant',
				color: 'red',
				rank: PIECE_RANKS.elephant,
			};
			const rat: JunglePiece = {
				type: 'rat',
				color: 'blue',
				rank: PIECE_RANKS.rat,
			};
			setPieceAt(board, { row: 0, col: 2 }, elephant);
			setPieceAt(board, { row: 0, col: 1 }, rat);

			// Blue rat can capture red elephant in blue trap
			expect(
				isValidMove(board, terrain, { row: 0, col: 1 }, { row: 0, col: 2 })
			).toBe(true);
		});

		test('rat in water cannot capture a piece on land', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place a rat in water at row 4, col 1
			const rat: JunglePiece = {
				type: 'rat',
				color: 'red',
				rank: PIECE_RANKS.rat,
			};
			const cat: JunglePiece = {
				type: 'cat',
				color: 'blue',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 1 }, rat); // water square
			setPieceAt(board, { row: 4, col: 0 }, cat); // land square

			expect(
				isValidMove(board, terrain, { row: 4, col: 1 }, { row: 4, col: 0 })
			).toBe(false);
		});

		test('attacker in enemy trap cannot capture an adjacent piece', () => {
			const board = emptyBoard();
			const terrain = createInitialTerrain();
			// Place a red cat inside a blue trap (row 0, col 2) — it is weakened
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			const rat: JunglePiece = {
				type: 'rat',
				color: 'blue',
				rank: PIECE_RANKS.rat,
			};
			setPieceAt(board, { row: 0, col: 2 }, cat); // inside blue trap
			setPieceAt(board, { row: 0, col: 1 }, rat); // adjacent land

			// Red cat in enemy trap cannot capture blue rat outside
			expect(
				isValidMove(board, terrain, { row: 0, col: 2 }, { row: 0, col: 1 })
			).toBe(false);
		});
	});

	describe('makeMove', () => {
		test('makes a valid move and returns new board', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);

			const result = makeMove(
				board,
				terrain,
				{ row: 4, col: 3 },
				{ row: 5, col: 3 }
			);
			expect(result).not.toBeNull();
			expect(result?.newBoard[5]?.[3]?.type).toBe('cat');
			expect(result?.newBoard[4]?.[3]).toBeNull();
		});

		test('returns null for invalid move', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);

			const result = makeMove(
				board,
				terrain,
				{ row: 4, col: 3 },
				{ row: 4, col: 3 }
			);
			expect(result).toBeNull();
		});

		test('returns captured piece when capturing', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const dog: JunglePiece = {
				type: 'dog',
				color: 'red',
				rank: PIECE_RANKS.dog,
			};
			const cat: JunglePiece = {
				type: 'cat',
				color: 'blue',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, dog);
			setPieceAt(board, { row: 5, col: 3 }, cat);

			const result = makeMove(
				board,
				terrain,
				{ row: 4, col: 3 },
				{ row: 5, col: 3 }
			);
			expect(result?.capturedPiece?.type).toBe('cat');
		});

		test('does not modify original board', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			const cat: JunglePiece = {
				type: 'cat',
				color: 'red',
				rank: PIECE_RANKS.cat,
			};
			setPieceAt(board, { row: 4, col: 3 }, cat);

			makeMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 3 });
			// Original board should be unchanged
			expect(getPieceAt(board, { row: 4, col: 3 })).toEqual(cat);
		});
	});

	describe('isWinningMove', () => {
		test('entering opponent den is a winning move', () => {
			const terrain = createInitialTerrain();
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			// Red lion moving into blue den at row 0, col 3
			expect(
				isWinningMove(terrain, { row: 1, col: 3 }, { row: 0, col: 3 }, lion)
			).toBe(true);
		});

		test('normal move is not a winning move', () => {
			const terrain = createInitialTerrain();
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			expect(
				isWinningMove(terrain, { row: 4, col: 3 }, { row: 5, col: 3 }, lion)
			).toBe(false);
		});

		test('entering own den is not a winning move', () => {
			const terrain = createInitialTerrain();
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			// Red lion moving into red den at row 8, col 3
			expect(
				isWinningMove(terrain, { row: 7, col: 3 }, { row: 8, col: 3 }, lion)
			).toBe(false);
		});
	});

	describe('hasValidMoves', () => {
		test('initial board has valid moves for both players', () => {
			const board = createInitialBoard();
			const terrain = createInitialTerrain();
			expect(hasValidMoves(board, terrain, 'red')).toBe(true);
			expect(hasValidMoves(board, terrain, 'blue')).toBe(true);
		});

		test('returns false when all pieces are gone', () => {
			const board = emptyBoard();
			const terrain = emptyTerrain();
			expect(hasValidMoves(board, terrain, 'red')).toBe(false);
		});
	});
});
