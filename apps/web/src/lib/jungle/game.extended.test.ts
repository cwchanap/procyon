import { describe, test, expect, beforeEach } from 'bun:test';
import {
	createInitialGameState,
	makeGameMove,
	getGameStatus,
	resetGame,
	clearSelection,
	getCapturablePiece,
	getPiecesByType,
	hasPlayerWon,
	getWinner,
	isLegalMove,
	selectSquare,
} from './game';
import { setPieceAt, getPieceAt } from './board';
import { PIECE_RANKS } from './types';
import type { JungleGameState, JunglePiece } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyBoard(): (JunglePiece | null)[][] {
	return Array(9)
		.fill(null)
		.map(() => Array(7).fill(null));
}

function stateWith(overrides: Partial<JungleGameState>): JungleGameState {
	return { ...createInitialGameState(), ...overrides };
}

// ---------------------------------------------------------------------------
// resetGame
// ---------------------------------------------------------------------------

describe('resetGame', () => {
	test('returns a fresh initial game state', () => {
		const state = createInitialGameState();
		// Make a move to dirty the state
		const moved = selectSquare(state, { row: 8, col: 0 });
		const target = moved.possibleMoves[0]!;
		const afterMove = selectSquare(moved, target);

		const reset = resetGame();
		expect(reset.moveHistory).toHaveLength(0);
		expect(reset.currentPlayer).toBe('red');
		expect(reset.status).toBe('playing');
		expect(reset.selectedSquare).toBeNull();
		// Pieces should be back to start
		expect(getPieceAt(reset.board, { row: 8, col: 0 })?.type).toBe('lion');
		// The afterMove variable is used only to avoid ts unused-var warning
		expect(afterMove.currentPlayer).toBe('blue');
	});
});

// ---------------------------------------------------------------------------
// clearSelection
// ---------------------------------------------------------------------------

describe('clearSelection', () => {
	test('clears selectedSquare and possibleMoves', () => {
		const state = selectSquare(createInitialGameState(), { row: 8, col: 0 });
		expect(state.selectedSquare).not.toBeNull();
		expect(state.possibleMoves.length).toBeGreaterThan(0);

		const cleared = clearSelection(state);
		expect(cleared.selectedSquare).toBeNull();
		expect(cleared.possibleMoves).toHaveLength(0);
	});

	test('does not change other state fields', () => {
		const initial = createInitialGameState();
		const cleared = clearSelection(initial);
		expect(cleared.currentPlayer).toBe(initial.currentPlayer);
		expect(cleared.status).toBe(initial.status);
		expect(cleared.moveHistory).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// getCapturablePiece
// ---------------------------------------------------------------------------

describe('getCapturablePiece', () => {
	test('returns null for empty square', () => {
		const state = createInitialGameState();
		// Middle of the board is empty at start
		expect(getCapturablePiece(state, { row: 4, col: 3 })).toBeNull();
	});

	test('returns piece on normal terrain', () => {
		const state = createInitialGameState();
		const piece = getCapturablePiece(state, { row: 8, col: 0 }); // red lion
		expect(piece?.type).toBe('lion');
		expect(piece?.color).toBe('red');
	});

	test('returns piece in enemy trap (weakened)', () => {
		const state = createInitialGameState();
		// Blue trap at row 0, col 2 — place a red piece there
		const redLion: JunglePiece = {
			type: 'lion',
			color: 'red',
			rank: PIECE_RANKS.lion,
		};
		state.board[0]![2] = redLion;
		const result = getCapturablePiece(state, { row: 0, col: 2 });
		expect(result?.type).toBe('lion');
	});
});

// ---------------------------------------------------------------------------
// getPiecesByType
// ---------------------------------------------------------------------------

describe('getPiecesByType', () => {
	test('returns both lions on initial board', () => {
		const state = createInitialGameState();
		const lions = getPiecesByType(state, 'lion');
		expect(lions).toHaveLength(2);
		expect(lions.every(p => p.type === 'lion')).toBe(true);
	});

	test('returns 0 for piece type not on board', () => {
		const state = stateWith({ board: emptyBoard() });
		expect(getPiecesByType(state, 'elephant')).toHaveLength(0);
	});

	test('counts all 8 piece types initially', () => {
		const state = createInitialGameState();
		const pieceTypes = [
			'elephant',
			'lion',
			'tiger',
			'leopard',
			'dog',
			'wolf',
			'cat',
			'rat',
		] as const;
		for (const type of pieceTypes) {
			expect(getPiecesByType(state, type)).toHaveLength(2);
		}
	});
});

// ---------------------------------------------------------------------------
// hasPlayerWon / getWinner
// ---------------------------------------------------------------------------

describe('hasPlayerWon', () => {
	test('returns false in initial state for both players', () => {
		const state = createInitialGameState();
		expect(hasPlayerWon(state, 'red')).toBe(false);
		expect(hasPlayerWon(state, 'blue')).toBe(false);
	});

	test('returns true when red piece is in blue den (row 0, col 3)', () => {
		const state = createInitialGameState();
		const redRat: JunglePiece = {
			type: 'rat',
			color: 'red',
			rank: PIECE_RANKS.rat,
		};
		state.board[0]![3] = redRat;
		expect(hasPlayerWon(state, 'red')).toBe(true);
	});

	test('returns true when blue piece is in red den (row 8, col 3)', () => {
		const state = createInitialGameState();
		const blueCat: JunglePiece = {
			type: 'cat',
			color: 'blue',
			rank: PIECE_RANKS.cat,
		};
		state.board[8]![3] = blueCat;
		expect(hasPlayerWon(state, 'blue')).toBe(true);
	});

	test('returns false when own piece is in own den', () => {
		const state = createInitialGameState();
		// Red den is at row 8, col 3 — place a red piece there (invalid but tests logic)
		const redCat: JunglePiece = {
			type: 'cat',
			color: 'red',
			rank: PIECE_RANKS.cat,
		};
		state.board[8]![3] = redCat;
		expect(hasPlayerWon(state, 'red')).toBe(false);
	});
});

describe('getWinner', () => {
	test('returns null when no one has won', () => {
		expect(getWinner(createInitialGameState())).toBeNull();
	});

	test('returns red when red has a piece in blue den', () => {
		const state = createInitialGameState();
		const redRat: JunglePiece = {
			type: 'rat',
			color: 'red',
			rank: PIECE_RANKS.rat,
		};
		state.board[0]![3] = redRat;
		expect(getWinner(state)).toBe('red');
	});

	test('returns blue when blue has a piece in red den', () => {
		const state = createInitialGameState();
		const blueLion: JunglePiece = {
			type: 'lion',
			color: 'blue',
			rank: PIECE_RANKS.lion,
		};
		state.board[8]![3] = blueLion;
		expect(getWinner(state)).toBe('blue');
	});
});

// ---------------------------------------------------------------------------
// isLegalMove
// ---------------------------------------------------------------------------

describe('isLegalMove', () => {
	test('returns true for a legal adjacent move', () => {
		const state = createInitialGameState();
		// Red lion at row 8, col 0 — can move up
		expect(isLegalMove(state, { row: 8, col: 0 }, { row: 7, col: 0 })).toBe(
			true
		);
	});

	test('returns false when no piece at from position', () => {
		const state = createInitialGameState();
		expect(isLegalMove(state, { row: 4, col: 3 }, { row: 5, col: 3 })).toBe(
			false
		);
	});

	test('returns false when piece belongs to opponent', () => {
		const state = createInitialGameState(); // currentPlayer = red
		// Blue lion is at row 0, col 6
		expect(isLegalMove(state, { row: 0, col: 6 }, { row: 1, col: 6 })).toBe(
			false
		);
	});

	test('returns false for an illegal destination', () => {
		const state = createInitialGameState();
		// Lion cannot move two squares away without a river jump
		expect(isLegalMove(state, { row: 8, col: 0 }, { row: 6, col: 0 })).toBe(
			false
		);
	});
});

// ---------------------------------------------------------------------------
// makeGameMove
// ---------------------------------------------------------------------------

describe('makeGameMove', () => {
	let state: JungleGameState;

	beforeEach(() => {
		state = createInitialGameState();
	});

	test('returns new state with piece moved and turn switched', () => {
		const result = makeGameMove(state, { row: 8, col: 0 }, { row: 7, col: 0 });
		expect(result).not.toBeNull();
		expect(getPieceAt(result!.board, { row: 7, col: 0 })?.type).toBe('lion');
		expect(getPieceAt(result!.board, { row: 8, col: 0 })).toBeNull();
		expect(result!.currentPlayer).toBe('blue');
		expect(result!.moveHistory).toHaveLength(1);
	});

	test('returns null for an illegal move', () => {
		const result = makeGameMove(state, { row: 4, col: 3 }, { row: 5, col: 3 });
		expect(result).toBeNull();
	});

	test('records captured piece in move history', () => {
		// Place a blue piece adjacent to a red piece so red can capture it
		const blueRat: JunglePiece = {
			type: 'rat',
			color: 'blue',
			rank: PIECE_RANKS.rat,
		};
		state.board[7]![0] = blueRat; // adjacent to red lion at (8,0)
		const result = makeGameMove(state, { row: 8, col: 0 }, { row: 7, col: 0 });
		expect(result?.moveHistory[0]?.capturedPiece?.type).toBe('rat');
	});

	test('sets status to checkmate when red enters blue den', () => {
		// Place red rat right next to blue den
		const redRat: JunglePiece = {
			type: 'rat',
			color: 'red',
			rank: PIECE_RANKS.rat,
		};
		// Clear everything and set minimal board
		state.board = emptyBoard();
		state.board[1]![3] = redRat; // row above blue den (0,3)
		const result = makeGameMove(state, { row: 1, col: 3 }, { row: 0, col: 3 });
		expect(result).not.toBeNull();
		expect(result!.status).toBe('checkmate');
	});

	test('clears selectedSquare and possibleMoves after move', () => {
		const withSelection = { ...state, selectedSquare: { row: 8, col: 0 } };
		const result = makeGameMove(
			withSelection,
			{ row: 8, col: 0 },
			{ row: 7, col: 0 }
		);
		expect(result?.selectedSquare).toBeNull();
		expect(result?.possibleMoves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// getGameStatus
// ---------------------------------------------------------------------------

describe('getGameStatus', () => {
	test('returns playing for initial state', () => {
		expect(getGameStatus(createInitialGameState())).toBe('playing');
	});

	test('returns checkmate when current player has no pieces', () => {
		const state = createInitialGameState();
		state.board = emptyBoard();
		// Only blue pieces remain — red has no moves
		const blueLion: JunglePiece = {
			type: 'lion',
			color: 'blue',
			rank: PIECE_RANKS.lion,
		};
		setPieceAt(state.board, { row: 0, col: 6 }, blueLion);
		expect(getGameStatus(state)).toBe('checkmate');
	});

	test('returns checkmate when a den capture is in move history', () => {
		// Simulate red entering the blue den in a previous move
		const state = createInitialGameState();
		const redRat: JunglePiece = {
			type: 'rat',
			color: 'red',
			rank: PIECE_RANKS.rat,
		};
		state.moveHistory = [
			{
				from: { row: 1, col: 3 },
				to: { row: 0, col: 3 },
				piece: redRat,
			},
		];
		expect(getGameStatus(state)).toBe('checkmate');
	});
});
