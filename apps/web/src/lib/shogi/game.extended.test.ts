import { describe, test, expect } from 'bun:test';
import {
	createInitialGameState,
	clearSelection,
	selectHandPiece,
	isKingInCheck,
	getGameStatus,
	confirmPromotion,
	makeAIMove,
	setAIThinking,
	isAITurn,
	selectSquare,
} from './game';
import { createInitialBoard, setPieceAt, getPieceAt } from './board';
import type { ShogiGameState, ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';

function emptyBoard(): (ShogiPiece | null)[][] {
	return Array(SHOGI_BOARD_SIZE)
		.fill(null)
		.map(() => Array(SHOGI_BOARD_SIZE).fill(null));
}

// ---------------------------------------------------------------------------
// clearSelection
// ---------------------------------------------------------------------------

describe('clearSelection', () => {
	test('clears selectedSquare, possibleMoves, selectedHandPiece', () => {
		const state = selectSquare(createInitialGameState(), { row: 6, col: 4 });
		expect(state.selectedSquare).not.toBeNull();

		const cleared = clearSelection(state);
		expect(cleared.selectedSquare).toBeNull();
		expect(cleared.possibleMoves).toHaveLength(0);
		expect(cleared.selectedHandPiece).toBeNull();
	});

	test('clears pendingPromotion', () => {
		const state: ShogiGameState = {
			...createInitialGameState(),
			pendingPromotion: {
				piece: { type: 'pawn', color: 'sente' },
				from: { row: 3, col: 0 },
				to: { row: 2, col: 0 },
			},
		};
		const cleared = clearSelection(state);
		expect(cleared.pendingPromotion).toBeUndefined();
	});

	test('does not change currentPlayer or status', () => {
		const state = createInitialGameState();
		const cleared = clearSelection(state);
		expect(cleared.currentPlayer).toBe('sente');
		expect(cleared.status).toBe('playing');
	});
});

// ---------------------------------------------------------------------------
// selectHandPiece
// ---------------------------------------------------------------------------

describe('selectHandPiece', () => {
	test('sets selectedHandPiece and shows drop positions', () => {
		const gold: ShogiPiece = {
			type: 'gold',
			color: 'sente',
			isPromoted: false,
		};
		const state: ShogiGameState = {
			...createInitialGameState(),
			senteHand: [gold],
		};

		const result = selectHandPiece(state, gold);
		expect(result.selectedHandPiece).toEqual(gold);
		expect(result.possibleMoves.length).toBeGreaterThan(0);
		expect(result.selectedSquare).toBeNull();
	});

	test('returns unchanged state when opponent piece selected', () => {
		const gold: ShogiPiece = {
			type: 'gold',
			color: 'gote', // opponent's piece
			isPromoted: false,
		};
		const state: ShogiGameState = {
			...createInitialGameState(),
			goteHand: [gold],
		};

		const result = selectHandPiece(state, gold);
		expect(result).toBe(state); // same reference — no change
	});
});

// ---------------------------------------------------------------------------
// isKingInCheck
// ---------------------------------------------------------------------------

describe('isKingInCheck', () => {
	test('returns false when king is safe', () => {
		const board = createInitialBoard();
		expect(isKingInCheck(board, 'sente')).toBe(false);
		expect(isKingInCheck(board, 'gote')).toBe(false);
	});

	test('returns true when king is attacked', () => {
		const board = emptyBoard();
		const senteKing: ShogiPiece = { type: 'king', color: 'sente' };
		const goteRook: ShogiPiece = { type: 'rook', color: 'gote' };
		setPieceAt(board, { row: 8, col: 4 }, senteKing);
		setPieceAt(board, { row: 0, col: 4 }, goteRook); // rook sees king on same col

		expect(isKingInCheck(board, 'sente')).toBe(true);
	});

	test('returns false after king moves out of danger', () => {
		const board = emptyBoard();
		const senteKing: ShogiPiece = { type: 'king', color: 'sente' };
		const goteRook: ShogiPiece = { type: 'rook', color: 'gote' };
		setPieceAt(board, { row: 8, col: 5 }, senteKing); // off column
		setPieceAt(board, { row: 0, col: 4 }, goteRook);

		expect(isKingInCheck(board, 'sente')).toBe(false);
	});

	test('returns true when king is missing (treated as in-check)', () => {
		const board = emptyBoard();
		// No king on the board
		expect(isKingInCheck(board, 'sente')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getGameStatus
// ---------------------------------------------------------------------------

describe('getGameStatus', () => {
	test('returns playing for initial state', () => {
		expect(getGameStatus(createInitialGameState())).toBe('playing');
	});

	test('returns check when king is under attack but has escape', () => {
		const board = emptyBoard();
		const senteKing: ShogiPiece = { type: 'king', color: 'sente' };
		const goteRook: ShogiPiece = { type: 'rook', color: 'gote' };
		// King at (8,4), rook at (0,4) — king can escape sideways
		setPieceAt(board, { row: 8, col: 4 }, senteKing);
		setPieceAt(board, { row: 0, col: 4 }, goteRook);
		// Also need a gote king so the board is valid
		const goteKing: ShogiPiece = { type: 'king', color: 'gote' };
		setPieceAt(board, { row: 0, col: 0 }, goteKing);

		const state: ShogiGameState = {
			...createInitialGameState(),
			board,
			currentPlayer: 'sente',
		};
		expect(getGameStatus(state)).toBe('check');
	});
});

// ---------------------------------------------------------------------------
// confirmPromotion
// ---------------------------------------------------------------------------

describe('confirmPromotion', () => {
	test('returns null when there is no pendingPromotion', () => {
		const state = createInitialGameState();
		expect(confirmPromotion(state, true)).toBeNull();
		expect(confirmPromotion(state, false)).toBeNull();
	});

	test('applies the move with promotion when promote=true', () => {
		// Move a sente pawn from row 3 → row 2 (entering promotion zone, not forced)
		const board = emptyBoard();
		const sentePawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		const senteKing: ShogiPiece = { type: 'king', color: 'sente' };
		const goteKing: ShogiPiece = { type: 'king', color: 'gote' };
		setPieceAt(board, { row: 3, col: 4 }, sentePawn);
		setPieceAt(board, { row: 8, col: 4 }, senteKing);
		setPieceAt(board, { row: 0, col: 0 }, goteKing);

		const state: ShogiGameState = {
			...createInitialGameState(),
			board,
			currentPlayer: 'sente',
			pendingPromotion: {
				piece: sentePawn,
				from: { row: 3, col: 4 },
				to: { row: 2, col: 4 },
			},
		};

		const result = confirmPromotion(state, true);
		expect(result).not.toBeNull();
		const promoted = getPieceAt(result!.board, { row: 2, col: 4 });
		expect(promoted?.type).toBe('promoted_pawn');
	});

	test('applies the move without promotion when promote=false', () => {
		const board = emptyBoard();
		const sentePawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		const senteKing: ShogiPiece = { type: 'king', color: 'sente' };
		const goteKing: ShogiPiece = { type: 'king', color: 'gote' };
		setPieceAt(board, { row: 3, col: 4 }, sentePawn);
		setPieceAt(board, { row: 8, col: 4 }, senteKing);
		setPieceAt(board, { row: 0, col: 0 }, goteKing);

		const state: ShogiGameState = {
			...createInitialGameState(),
			board,
			currentPlayer: 'sente',
			pendingPromotion: {
				piece: sentePawn,
				from: { row: 3, col: 4 },
				to: { row: 2, col: 4 },
			},
		};

		const result = confirmPromotion(state, false);
		expect(result).not.toBeNull();
		const piece = getPieceAt(result!.board, { row: 2, col: 4 });
		expect(piece?.type).toBe('pawn');
		expect(piece?.isPromoted).toBeFalsy();
	});
});

// ---------------------------------------------------------------------------
// makeAIMove
// ---------------------------------------------------------------------------

describe('makeAIMove', () => {
	test('makes a valid move from algebraic notation', () => {
		const state = createInitialGameState();
		// Shogi notation: file = numeric '9'-'1' (col 0-8), rank = letter 'a'-'i' (row 0-8)
		// Sente pawn at row 6, col 0 = file '9', rank 'g' → "9g"
		// Move forward (sente moves up = decreasing row) to row 5 = rank 'f' → "9f"
		const result = makeAIMove(state, '9g', '9f');
		expect(result).not.toBeNull();
		expect(result?.currentPlayer).toBe('gote');
		expect(result?.moveHistory).toHaveLength(1);
	});

	test('returns null for an invalid algebraic move', () => {
		const state = createInitialGameState();
		expect(makeAIMove(state, 'a1', 'a9')).toBeNull(); // no piece at a1 for sente
	});

	test('returns null when from string has invalid length', () => {
		const state = createInitialGameState();
		expect(makeAIMove(state, 'xyz', 'a4')).toBeNull();
	});

	test('handles drop moves with * notation', () => {
		const gold: ShogiPiece = {
			type: 'gold',
			color: 'sente',
			isPromoted: false,
		};
		const state: ShogiGameState = {
			...createInitialGameState(),
			senteHand: [gold],
			selectedHandPiece: gold,
		};
		// Drop gold onto row 4, col 4 = file '5', rank 'e' → "5e"
		const result = makeAIMove(state, '*', '5e', false, 'gold');
		expect(result).not.toBeNull();
		expect(result?.moveHistory[0]?.isDrop).toBe(true);
	});

	test('returns null for drop when piece type not in hand', () => {
		const state = createInitialGameState(); // empty hand
		const result = makeAIMove(state, '*', 'e5', false, 'gold');
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// setAIThinking
// ---------------------------------------------------------------------------

describe('setAIThinking', () => {
	test('returns a copy of the state unchanged (shogi has no isAiThinking field)', () => {
		const state = createInitialGameState();
		const result = setAIThinking(state, true);
		expect(result.currentPlayer).toBe(state.currentPlayer);
		expect(result.status).toBe(state.status);
		expect(result.moveHistory).toHaveLength(0);
	});

	test('does not mutate the original state', () => {
		const state = createInitialGameState();
		const before = JSON.stringify(state);
		setAIThinking(state, true);
		expect(JSON.stringify(state)).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// isAITurn
// ---------------------------------------------------------------------------

describe('isAITurn', () => {
	test('returns false when aiPlayer is undefined', () => {
		const state = createInitialGameState();
		expect(isAITurn(state, undefined)).toBe(false);
	});

	test('returns true when currentPlayer matches aiPlayer and status is playing', () => {
		const state = createInitialGameState(); // currentPlayer = sente
		expect(isAITurn(state, 'sente')).toBe(true);
	});

	test('returns false when it is not the AI player turn', () => {
		const state = createInitialGameState(); // currentPlayer = sente
		expect(isAITurn(state, 'gote')).toBe(false);
	});

	test('returns true when in check and it is AI turn', () => {
		const state: ShogiGameState = {
			...createInitialGameState(),
			currentPlayer: 'gote',
			status: 'check',
		};
		expect(isAITurn(state, 'gote')).toBe(true);
	});

	test('returns false when game is over (checkmate)', () => {
		const state: ShogiGameState = {
			...createInitialGameState(),
			currentPlayer: 'sente',
			status: 'checkmate',
		};
		expect(isAITurn(state, 'sente')).toBe(false);
	});
});
