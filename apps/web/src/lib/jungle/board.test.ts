import { test, expect, describe } from 'bun:test';
import {
	createInitialBoard,
	getPieceAt,
	setPieceAt,
	isValidPosition,
	positionsEqual,
	getPiecesByColor,
	findPiecePosition,
	copyBoard,
	getTerrainAt,
	isWaterPosition,
	isTrapPosition,
	isDenPosition,
	getTerrainOwner,
	copyTerrain,
	copyGameState,
} from './board';
import {
	createInitialTerrain,
	JUNGLE_ROWS,
	JUNGLE_COLS,
	PIECE_RANKS,
} from './types';
import type { JunglePiece, JungleGameState } from './types';

describe('Jungle Board Utilities', () => {
	describe('createInitialBoard', () => {
		test('should create a 9x7 board', () => {
			const board = createInitialBoard();
			expect(board.length).toBe(JUNGLE_ROWS);
			board.forEach(row => {
				expect(row.length).toBe(JUNGLE_COLS);
			});
		});

		test('should place red pieces on bottom rows', () => {
			const board = createInitialBoard();
			// Lion at row 8, col 0
			expect(board[8]?.[0]?.type).toBe('lion');
			expect(board[8]?.[0]?.color).toBe('red');
			// Tiger at row 8, col 6
			expect(board[8]?.[6]?.type).toBe('tiger');
			expect(board[8]?.[6]?.color).toBe('red');
		});

		test('should place blue pieces on top rows', () => {
			const board = createInitialBoard();
			// Lion at row 0, col 6
			expect(board[0]?.[6]?.type).toBe('lion');
			expect(board[0]?.[6]?.color).toBe('blue');
			// Tiger at row 0, col 0
			expect(board[0]?.[0]?.type).toBe('tiger');
			expect(board[0]?.[0]?.color).toBe('blue');
		});

		test('should assign correct ranks to pieces', () => {
			const board = createInitialBoard();
			expect(board[8]?.[0]?.rank).toBe(PIECE_RANKS.lion);
			expect(board[6]?.[0]?.rank).toBe(PIECE_RANKS.elephant);
			expect(board[6]?.[6]?.rank).toBe(PIECE_RANKS.rat);
		});

		test('should have 8 red and 8 blue pieces', () => {
			const board = createInitialBoard();
			let redCount = 0;
			let blueCount = 0;
			for (let row = 0; row < JUNGLE_ROWS; row++) {
				for (let col = 0; col < JUNGLE_COLS; col++) {
					const piece = board[row]?.[col];
					if (piece?.color === 'red') redCount++;
					if (piece?.color === 'blue') blueCount++;
				}
			}
			expect(redCount).toBe(8);
			expect(blueCount).toBe(8);
		});
	});

	describe('getPieceAt', () => {
		test('should return piece at valid position', () => {
			const board = createInitialBoard();
			const piece = getPieceAt(board, { row: 8, col: 0 });
			expect(piece?.type).toBe('lion');
			expect(piece?.color).toBe('red');
		});

		test('should return null for empty position', () => {
			const board = createInitialBoard();
			expect(getPieceAt(board, { row: 4, col: 3 })).toBeNull();
		});

		test('should return null for out-of-bounds position', () => {
			const board = createInitialBoard();
			expect(getPieceAt(board, { row: -1, col: 0 })).toBeNull();
			expect(getPieceAt(board, { row: 9, col: 0 })).toBeNull();
			expect(getPieceAt(board, { row: 0, col: -1 })).toBeNull();
			expect(getPieceAt(board, { row: 0, col: 7 })).toBeNull();
		});
	});

	describe('setPieceAt', () => {
		test('should set a piece at a valid position', () => {
			const board = createInitialBoard();
			const piece: JunglePiece = {
				type: 'wolf',
				color: 'red',
				rank: PIECE_RANKS.wolf,
			};
			setPieceAt(board, { row: 4, col: 3 }, piece);
			expect(getPieceAt(board, { row: 4, col: 3 })).toEqual(piece);
		});

		test('should set null to clear a square', () => {
			const board = createInitialBoard();
			setPieceAt(board, { row: 8, col: 0 }, null);
			expect(getPieceAt(board, { row: 8, col: 0 })).toBeNull();
		});

		test('should do nothing for out-of-bounds position', () => {
			const board = createInitialBoard();
			const piece: JunglePiece = {
				type: 'wolf',
				color: 'red',
				rank: PIECE_RANKS.wolf,
			};
			// Should not throw
			setPieceAt(board, { row: -1, col: 0 }, piece);
			setPieceAt(board, { row: 9, col: 0 }, piece);
		});
	});

	describe('isValidPosition', () => {
		test('should return true for valid positions', () => {
			expect(isValidPosition({ row: 0, col: 0 })).toBe(true);
			expect(isValidPosition({ row: 8, col: 6 })).toBe(true);
			expect(isValidPosition({ row: 4, col: 3 })).toBe(true);
		});

		test('should return false for invalid positions', () => {
			expect(isValidPosition({ row: -1, col: 0 })).toBe(false);
			expect(isValidPosition({ row: 9, col: 0 })).toBe(false);
			expect(isValidPosition({ row: 0, col: -1 })).toBe(false);
			expect(isValidPosition({ row: 0, col: 7 })).toBe(false);
		});
	});

	describe('positionsEqual', () => {
		test('should return true for same positions', () => {
			expect(positionsEqual({ row: 4, col: 3 }, { row: 4, col: 3 })).toBe(true);
		});

		test('should return false for different positions', () => {
			expect(positionsEqual({ row: 4, col: 3 }, { row: 4, col: 4 })).toBe(
				false
			);
			expect(positionsEqual({ row: 4, col: 3 }, { row: 5, col: 3 })).toBe(
				false
			);
		});
	});

	describe('getPiecesByColor', () => {
		test('should return all red pieces', () => {
			const board = createInitialBoard();
			const redPieces = getPiecesByColor(board, 'red');
			expect(redPieces).toHaveLength(8);
			redPieces.forEach(p => {
				expect(p.color).toBe('red');
			});
		});

		test('should return all blue pieces', () => {
			const board = createInitialBoard();
			const bluePieces = getPiecesByColor(board, 'blue');
			expect(bluePieces).toHaveLength(8);
			bluePieces.forEach(p => {
				expect(p.color).toBe('blue');
			});
		});
	});

	describe('findPiecePosition', () => {
		test('should find position of a piece', () => {
			const board = createInitialBoard();
			const lion: JunglePiece = {
				type: 'lion',
				color: 'red',
				rank: PIECE_RANKS.lion,
			};
			const pos = findPiecePosition(board, lion);
			expect(pos).toEqual({ row: 8, col: 0 });
		});

		test('should return null if piece not on board', () => {
			const board = createInitialBoard();
			const wolf: JunglePiece = {
				type: 'wolf',
				color: 'red',
				rank: PIECE_RANKS.wolf,
			};
			// Wolf is on board at row 6, col 2 - let's remove it
			setPieceAt(board, { row: 6, col: 2 }, null);
			const pos = findPiecePosition(board, wolf);
			expect(pos).toBeNull();
		});
	});

	describe('copyBoard', () => {
		test('should create an independent copy', () => {
			const board = createInitialBoard();
			const copy = copyBoard(board);
			setPieceAt(
				board,
				{ row: 4, col: 3 },
				{ type: 'wolf', color: 'red', rank: PIECE_RANKS.wolf }
			);
			expect(getPieceAt(copy, { row: 4, col: 3 })).toBeNull();
		});

		test('should preserve the same pieces', () => {
			const board = createInitialBoard();
			const copy = copyBoard(board);
			expect(copy[8]?.[0]?.type).toBe('lion');
			expect(copy[0]?.[6]?.type).toBe('lion');
		});

		test('should deep-copy pieces so mutating a piece property on the original does not affect the copy', () => {
			const board = createInitialBoard();
			const copy = copyBoard(board);
			const piece = getPieceAt(board, { row: 8, col: 0 })!;
			// Mutate the piece object in-place on the original
			(piece as unknown as Record<string, unknown>)['type'] = 'wolf';
			// Copy should still have the original type
			expect(getPieceAt(copy, { row: 8, col: 0 })?.type).toBe('lion');
			// Piece references must differ
			expect(getPieceAt(copy, { row: 8, col: 0 })).not.toBe(piece);
		});
	});

	describe('getTerrainAt', () => {
		test('should return terrain at a valid position', () => {
			const terrain = createInitialTerrain();
			const terrainAtDen = getTerrainAt(terrain, { row: 8, col: 3 });
			expect(terrainAtDen.type).toBe('den');
		});

		test('should return normal terrain for positions out-of-bounds', () => {
			const terrain = createInitialTerrain();
			const terrainAtInvalid = getTerrainAt(terrain, { row: -1, col: 0 });
			expect(terrainAtInvalid.type).toBe('normal');
		});
	});

	describe('isWaterPosition', () => {
		test('should return true for water squares', () => {
			const terrain = createInitialTerrain();
			// Water tiles are rows 3-5, cols 1-2 and 4-5
			expect(isWaterPosition(terrain, { row: 3, col: 1 })).toBe(true);
			expect(isWaterPosition(terrain, { row: 4, col: 2 })).toBe(true);
			expect(isWaterPosition(terrain, { row: 5, col: 4 })).toBe(true);
		});

		test('should return false for non-water squares', () => {
			const terrain = createInitialTerrain();
			expect(isWaterPosition(terrain, { row: 0, col: 0 })).toBe(false);
			expect(isWaterPosition(terrain, { row: 3, col: 3 })).toBe(false); // center column, not water
		});
	});

	describe('isTrapPosition', () => {
		test('should return true for trap squares', () => {
			const terrain = createInitialTerrain();
			// Red traps: row 8 col 2, row 8 col 4, row 7 col 3
			expect(isTrapPosition(terrain, { row: 8, col: 2 })).toBe(true);
			expect(isTrapPosition(terrain, { row: 7, col: 3 })).toBe(true);
			// Blue traps: row 0 col 2, row 0 col 4, row 1 col 3
			expect(isTrapPosition(terrain, { row: 0, col: 2 })).toBe(true);
		});

		test('should return false for non-trap squares', () => {
			const terrain = createInitialTerrain();
			expect(isTrapPosition(terrain, { row: 4, col: 3 })).toBe(false);
			expect(isTrapPosition(terrain, { row: 8, col: 3 })).toBe(false); // den, not trap
		});
	});

	describe('isDenPosition', () => {
		test('should return true for den squares', () => {
			const terrain = createInitialTerrain();
			expect(isDenPosition(terrain, { row: 8, col: 3 })).toBe(true); // red den
			expect(isDenPosition(terrain, { row: 0, col: 3 })).toBe(true); // blue den
		});

		test('should return false for non-den squares', () => {
			const terrain = createInitialTerrain();
			expect(isDenPosition(terrain, { row: 4, col: 3 })).toBe(false);
			expect(isDenPosition(terrain, { row: 8, col: 2 })).toBe(false); // trap
		});
	});

	describe('getTerrainOwner', () => {
		test('should return owner of red den', () => {
			const terrain = createInitialTerrain();
			expect(getTerrainOwner(terrain, { row: 8, col: 3 })).toBe('red');
		});

		test('should return owner of blue trap', () => {
			const terrain = createInitialTerrain();
			expect(getTerrainOwner(terrain, { row: 0, col: 2 })).toBe('blue');
		});

		test('should return null for non-owned terrain', () => {
			const terrain = createInitialTerrain();
			expect(getTerrainOwner(terrain, { row: 4, col: 4 })).toBeNull();
		});
	});

	describe('copyTerrain', () => {
		test('should create an independent copy', () => {
			const terrain = createInitialTerrain();
			const copy = copyTerrain(terrain);
			// Modify original
			terrain[4]![3] = { type: 'water' };
			// Copy should be unchanged
			expect(copy[4]?.[3]?.type).toBe('normal');
		});

		test('should deep-copy terrain cells so mutating a cell property on the original does not affect the copy', () => {
			const terrain = createInitialTerrain();
			const copy = copyTerrain(terrain);
			const cell = terrain[8]![3]!; // red den
			// Mutate the cell object in-place
			(cell as unknown as Record<string, unknown>)['type'] = 'normal';
			// Copy should still have the original type
			expect(copy[8]?.[3]?.type).toBe('den');
			// Cell references must differ
			expect(copy[8]?.[3]).not.toBe(cell);
		});
	});

	describe('copyGameState', () => {
		test('should deep copy a game state', () => {
			const state: JungleGameState = {
				board: createInitialBoard(),
				terrain: createInitialTerrain(),
				currentPlayer: 'red',
				status: 'playing',
				moveHistory: [],
				selectedSquare: { row: 1, col: 2 },
				possibleMoves: [{ row: 2, col: 2 }],
			};

			const copy = copyGameState(state);

			// Record pre-mutation values from the copy
			const originalBoardCell = copy.board[8]?.[0]?.type;
			const originalTerrainCell = copy.terrain[8]?.[3]?.type;
			const originalPossibleMoves = [...copy.possibleMoves];

			// Mutate primitives
			state.currentPlayer = 'blue';
			state.moveHistory.push({
				from: { row: 1, col: 2 },
				to: { row: 2, col: 2 },
				piece: { type: 'cat', color: 'red', rank: 2 },
			});
			state.selectedSquare = null;
			// Mutate board
			state.board[8]![0] = null;
			// Mutate terrain
			state.terrain[8]![3] = { type: 'water' };
			// Mutate possibleMoves
			state.possibleMoves.push({ row: 3, col: 3 });

			// Copy scalars should be unchanged
			expect(copy.currentPlayer).toBe('red');
			expect(copy.moveHistory).toHaveLength(0);
			expect(copy.selectedSquare).toEqual({ row: 1, col: 2 });
			// Copy board should be unchanged
			expect(copy.board[8]?.[0]?.type).toBe(originalBoardCell);
			// Copy terrain should be unchanged
			expect(copy.terrain[8]?.[3]?.type).toBe(originalTerrainCell);
			// Copy possibleMoves should be unchanged
			expect(copy.possibleMoves).toHaveLength(originalPossibleMoves.length);
		});

		test('should deep-copy nested piece and terrain objects', () => {
			const state: JungleGameState = {
				board: createInitialBoard(),
				terrain: createInitialTerrain(),
				currentPlayer: 'red',
				status: 'playing',
				moveHistory: [],
				selectedSquare: null,
				possibleMoves: [],
			};
			const copy = copyGameState(state);

			// Mutate a piece property in-place on the original board
			const piece = getPieceAt(state.board, { row: 8, col: 0 })!;
			(piece as unknown as Record<string, unknown>)['rank'] = 0;
			expect(getPieceAt(copy.board, { row: 8, col: 0 })?.rank).toBe(
				PIECE_RANKS.lion
			);
			expect(getPieceAt(copy.board, { row: 8, col: 0 })).not.toBe(piece);

			// Mutate a terrain cell property in-place on the original terrain
			const cell = state.terrain[8]![3]!; // red den
			(cell as unknown as Record<string, unknown>)['type'] = 'normal';
			expect(copy.terrain[8]?.[3]?.type).toBe('den');
			expect(copy.terrain[8]?.[3]).not.toBe(cell);
		});
	});
});
