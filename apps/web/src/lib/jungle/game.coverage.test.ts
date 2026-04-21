import { test, expect, describe } from 'bun:test';
import {
	createInitialGameState,
	selectSquare,
	makeGameMove,
	getGameStatus,
	isLegalMove,
	hasPlayerWon,
	getWinner,
} from './game';
import { getPossibleMoves, isValidMove, makeMove } from './moves';
import { setPieceAt, getPieceAt } from './board';
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

// ---------------------------------------------------------------------------
// selectSquare - additional branches
// ---------------------------------------------------------------------------

describe('selectSquare - win via den entry', () => {
	test('red piece entering blue den sets status to checkmate', () => {
		const state = createInitialGameState();
		// Place a red rat directly above blue den (row 0, col 3)
		const redRat: JunglePiece = { type: 'rat', color: 'red', rank: PIECE_RANKS.rat };
		state.board[1]![3] = redRat;
		// Clear the board except the red rat and something to avoid stalemate for blue
		state.board = Array(JUNGLE_ROWS).fill(null).map(() => Array(JUNGLE_COLS).fill(null));
		state.board[1]![3] = redRat;
		const blueLion: JunglePiece = { type: 'lion', color: 'blue', rank: PIECE_RANKS.lion };
		state.board[5]![6] = blueLion;

		const selected = selectSquare(state, { row: 1, col: 3 });
		expect(selected.possibleMoves).toContainEqual({ row: 0, col: 3 });

		const after = selectSquare(selected, { row: 0, col: 3 });
		expect(after.status).toBe('checkmate');
		expect(after.currentPlayer).toBe('blue');
	});

	test('blue piece entering red den sets status to checkmate', () => {
		const state = createInitialGameState();
		state.board = Array(JUNGLE_ROWS).fill(null).map(() => Array(JUNGLE_COLS).fill(null));
		const blueCat: JunglePiece = { type: 'cat', color: 'blue', rank: PIECE_RANKS.cat };
		state.board[7]![3] = blueCat;
		const redWolf: JunglePiece = { type: 'wolf', color: 'red', rank: PIECE_RANKS.wolf };
		state.board[5]![0] = redWolf;
		state.currentPlayer = 'blue';

		const selected = selectSquare(state, { row: 7, col: 3 });
		expect(selected.possibleMoves).toContainEqual({ row: 8, col: 3 });

		const after = selectSquare(selected, { row: 8, col: 3 });
		expect(after.status).toBe('checkmate');
		expect(after.currentPlayer).toBe('red');
	});
});

describe('selectSquare - clicking empty square with no prior selection', () => {
	test('clicking empty square when nothing selected returns cleared state', () => {
		const state = createInitialGameState();
		// Middle of the board is empty
		const next = selectSquare(state, { row: 4, col: 3 });
		expect(next.selectedSquare).toBeNull();
		expect(next.possibleMoves).toHaveLength(0);
	});

	test('clicking same color piece twice switches selection', () => {
		const state = createInitialGameState();
		// Red lion at row 8, col 0; red tiger at row 8, col 6
		const first = selectSquare(state, { row: 8, col: 0 }); // lion
		const second = selectSquare(first, { row: 8, col: 6 }); // tiger
		expect(second.selectedSquare).toEqual({ row: 8, col: 6 });
	});
});

describe('selectSquare - capture via possibleMoves', () => {
	test('clicking enemy piece in possibleMoves executes capture', () => {
		const state = createInitialGameState();
		// Arrange: red dog, blue rat adjacent
		state.board = emptyBoard();
		const redDog: JunglePiece = { type: 'dog', color: 'red', rank: PIECE_RANKS.dog };
		const blueRat: JunglePiece = { type: 'rat', color: 'blue', rank: PIECE_RANKS.rat };
		state.board[4]![3] = redDog;
		state.board[5]![3] = blueRat;

		const selected = selectSquare(state, { row: 4, col: 3 });
		expect(selected.possibleMoves).toContainEqual({ row: 5, col: 3 });

		const after = selectSquare(selected, { row: 5, col: 3 });
		expect(after.currentPlayer).toBe('blue');
		expect(after.moveHistory).toHaveLength(1);
		expect(after.moveHistory[0]?.capturedPiece?.type).toBe('rat');
		expect(getPieceAt(after.board, { row: 5, col: 3 })?.type).toBe('dog');
	});
});

describe('selectSquare - opponent click with no selection', () => {
	test('clicking an opponent piece when nothing selected does not select it', () => {
		const state = createInitialGameState(); // currentPlayer = red
		// Blue pieces are in row 0
		const next = selectSquare(state, { row: 0, col: 6 }); // blue lion
		expect(next.selectedSquare).toBeNull();
		expect(next.possibleMoves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// isValidMove - additional edge cases
// ---------------------------------------------------------------------------

describe('isValidMove - additional edge cases', () => {
	test('cannot enter own den (red piece → red den)', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		const redCat: JunglePiece = { type: 'cat', color: 'red', rank: PIECE_RANKS.cat };
		// Red den is at row 8, col 3
		setPieceAt(board, { row: 8, col: 2 }, redCat);
		// Trying to move into red den at row 8, col 3
		expect(isValidMove(board, terrain, { row: 8, col: 2 }, { row: 8, col: 3 })).toBe(false);
	});

	test('cannot enter own den (blue piece → blue den)', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		const blueDog: JunglePiece = { type: 'dog', color: 'blue', rank: PIECE_RANKS.dog };
		// Blue den is at row 0, col 3
		setPieceAt(board, { row: 0, col: 4 }, blueDog);
		// Trying to move into blue den at row 0, col 3
		expect(isValidMove(board, terrain, { row: 0, col: 4 }, { row: 0, col: 3 })).toBe(false);
	});

	test('wolf can capture cat (rank 3 ≥ rank 2)', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const wolf: JunglePiece = { type: 'wolf', color: 'red', rank: PIECE_RANKS.wolf };
		const cat: JunglePiece = { type: 'cat', color: 'blue', rank: PIECE_RANKS.cat };
		setPieceAt(board, { row: 4, col: 3 }, wolf);
		setPieceAt(board, { row: 4, col: 4 }, cat);
		expect(isValidMove(board, terrain, { row: 4, col: 3 }, { row: 4, col: 4 })).toBe(true);
	});

	test('diagonal move is not valid', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const leopard: JunglePiece = { type: 'leopard', color: 'red', rank: PIECE_RANKS.leopard };
		setPieceAt(board, { row: 4, col: 3 }, leopard);
		// Diagonal move is not valid in Jungle chess
		expect(isValidMove(board, terrain, { row: 4, col: 3 }, { row: 5, col: 4 })).toBe(false);
	});

	test('move more than one square without river jump is not valid', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const dog: JunglePiece = { type: 'dog', color: 'red', rank: PIECE_RANKS.dog };
		setPieceAt(board, { row: 4, col: 3 }, dog);
		expect(isValidMove(board, terrain, { row: 4, col: 3 }, { row: 4, col: 6 })).toBe(false);
	});

	test('tiger can jump right across horizontal river', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		// Tiger at row 4, col 0 (adjacent to water at col 1-2)
		const tiger: JunglePiece = { type: 'tiger', color: 'red', rank: PIECE_RANKS.tiger };
		setPieceAt(board, { row: 4, col: 0 }, tiger);
		// Water is at cols 1-2, jump lands at col 3
		expect(isValidMove(board, terrain, { row: 4, col: 0 }, { row: 4, col: 3 })).toBe(true);
	});

	test('lion cannot jump river diagonally', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: PIECE_RANKS.lion };
		// Adjacent to water at (3,1)
		setPieceAt(board, { row: 2, col: 0 }, lion);
		// Attempt diagonal river jump - not valid
		expect(isValidMove(board, terrain, { row: 2, col: 0 }, { row: 6, col: 3 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getPossibleMoves - additional scenarios
// ---------------------------------------------------------------------------

describe('getPossibleMoves - additional scenarios', () => {
	test('rat in water can move to adjacent water or land', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		const rat: JunglePiece = { type: 'rat', color: 'red', rank: PIECE_RANKS.rat };
		// Row 4, col 1 is water
		setPieceAt(board, { row: 4, col: 1 }, rat);
		const moves = getPossibleMoves(board, terrain, { row: 4, col: 1 });
		// Can move to adjacent water (col 2) and adjacent land (row 3 col 1 is also water, row 5 col 1 is water...)
		// Actually rows 3-5 col 1-2 are water; row 4 col 0 is land
		expect(moves).toContainEqual({ row: 4, col: 2 }); // another water square
		expect(moves).toContainEqual({ row: 4, col: 0 }); // land
	});

	test('wolf has exactly 4 moves in empty board center', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const wolf: JunglePiece = { type: 'wolf', color: 'red', rank: PIECE_RANKS.wolf };
		setPieceAt(board, { row: 4, col: 3 }, wolf);
		const moves = getPossibleMoves(board, terrain, { row: 4, col: 3 });
		expect(moves).toHaveLength(4);
	});

	test('leopard at edge has 2-3 moves depending on position', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const leopard: JunglePiece = { type: 'leopard', color: 'red', rank: PIECE_RANKS.leopard };
		// Row 0, col 0 corner — only 2 valid moves
		setPieceAt(board, { row: 0, col: 0 }, leopard);
		const moves = getPossibleMoves(board, terrain, { row: 0, col: 0 });
		expect(moves).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// makeMove - additional cases
// ---------------------------------------------------------------------------

describe('makeMove - additional cases', () => {
	test('moving lion into opponent den is valid', () => {
		const board = emptyBoard();
		const terrain = createInitialTerrain();
		const lion: JunglePiece = { type: 'lion', color: 'red', rank: PIECE_RANKS.lion };
		// Blue den is at row 0, col 3; trap at row 1, col 3
		setPieceAt(board, { row: 1, col: 3 }, lion);
		const result = makeMove(board, terrain, { row: 1, col: 3 }, { row: 0, col: 3 });
		expect(result).not.toBeNull();
		expect(result?.newBoard[0]?.[3]?.type).toBe('lion');
	});

	test('cannot make invalid move (returns null)', () => {
		const board = emptyBoard();
		const terrain = emptyTerrain();
		const cat: JunglePiece = { type: 'cat', color: 'red', rank: PIECE_RANKS.cat };
		setPieceAt(board, { row: 4, col: 3 }, cat);
		const result = makeMove(board, terrain, { row: 4, col: 3 }, { row: 4, col: 3 });
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// makeGameMove - additional cases
// ---------------------------------------------------------------------------

describe('makeGameMove - blue entering red den', () => {
	test('blue piece entering red den sets status to checkmate', () => {
		const state = createInitialGameState();
		state.board = emptyBoard();
		const blueLion: JunglePiece = { type: 'lion', color: 'blue', rank: PIECE_RANKS.lion };
		state.board[7]![3] = blueLion; // row above red den (8,3)
		state.currentPlayer = 'blue';

		const result = makeGameMove(state, { row: 7, col: 3 }, { row: 8, col: 3 });
		expect(result).not.toBeNull();
		expect(result!.status).toBe('checkmate');
		expect(result!.currentPlayer).toBe('red');
	});

	test('returns null for illegal move', () => {
		const state = createInitialGameState();
		const result = makeGameMove(state, { row: 4, col: 3 }, { row: 5, col: 3 });
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getGameStatus - additional
// ---------------------------------------------------------------------------

describe('getGameStatus - additional cases', () => {
	test('returns playing when both players have moves', () => {
		expect(getGameStatus(createInitialGameState())).toBe('playing');
	});

	test('returns checkmate when blue has no moves', () => {
		const state = createInitialGameState();
		state.board = emptyBoard();
		// Only red pieces remain
		const redLion: JunglePiece = { type: 'lion', color: 'red', rank: PIECE_RANKS.lion };
		setPieceAt(state.board, { row: 5, col: 0 }, redLion);
		// Blue current player has no pieces → no valid moves
		state.currentPlayer = 'blue';
		expect(getGameStatus(state)).toBe('checkmate');
	});
});

// ---------------------------------------------------------------------------
// isLegalMove - additional cases
// ---------------------------------------------------------------------------

describe('isLegalMove - additional cases', () => {
	test('returns false when from position is empty', () => {
		const state = createInitialGameState();
		expect(isLegalMove(state, { row: 4, col: 3 }, { row: 5, col: 3 })).toBe(false);
	});

	test('returns false when it is not the piece owner\'s turn', () => {
		const state = createInitialGameState(); // currentPlayer = red
		// Blue lion at row 0, col 6
		expect(isLegalMove(state, { row: 0, col: 6 }, { row: 1, col: 6 })).toBe(false);
	});

	test('returns true for a valid rat move on land', () => {
		const state = createInitialGameState();
		// Red rat is at row 6, col 6 in initial board
		expect(isLegalMove(state, { row: 6, col: 6 }, { row: 6, col: 5 })).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// hasPlayerWon / getWinner - edge cases
// ---------------------------------------------------------------------------

describe('hasPlayerWon - edge cases', () => {
	test('returns false when den is empty', () => {
		const state = createInitialGameState();
		// Ensure no piece in blue den at row 0, col 3
		expect(getPieceAt(state.board, { row: 0, col: 3 })).toBeNull();
		expect(hasPlayerWon(state, 'red')).toBe(false);
	});

	test('returns false when own piece in own den', () => {
		const state = createInitialGameState();
		// Put red piece in red den (not a win for red)
		const redCat: JunglePiece = { type: 'cat', color: 'red', rank: PIECE_RANKS.cat };
		state.board[8]![3] = redCat;
		expect(hasPlayerWon(state, 'red')).toBe(false);
	});
});

describe('getWinner - after game played', () => {
	test('returns null when no win condition met', () => {
		expect(getWinner(createInitialGameState())).toBeNull();
	});

	test('returns red when red piece is in blue den', () => {
		const state = createInitialGameState();
		state.board[0]![3] = { type: 'elephant', color: 'red', rank: PIECE_RANKS.elephant };
		expect(getWinner(state)).toBe('red');
	});
});
