import { test, expect, describe } from 'bun:test';
import {
	selectSquare,
	makeMove,
	createInitialGameState,
	getGameStatus,
	selectHandPiece,
} from './game';
import type { ShogiGameState, ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';
import { setPieceAt } from './board';

/**
 * Build a minimal empty board with sente king and gote king placed safely.
 */
function emptyBoard(): (ShogiPiece | null)[][] {
	return Array.from({ length: SHOGI_BOARD_SIZE }, () =>
		Array(SHOGI_BOARD_SIZE).fill(null)
	);
}

function baseState(overrides: Partial<ShogiGameState> = {}): ShogiGameState {
	return {
		board: emptyBoard(),
		currentPlayer: 'sente',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		senteHand: [],
		goteHand: [],
		selectedHandPiece: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// selectSquare - forced promotion path
// ---------------------------------------------------------------------------
describe('selectSquare - forced promotion', () => {
	test('sente pawn moving to row 0 auto-promotes and returns new game state', () => {
		const board = emptyBoard();
		// sente pawn one step from promotion
		setPieceAt(board, { row: 1, col: 4 }, { type: 'pawn', color: 'sente' });
		// kings (required for check detection)
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({
			board,
			selectedSquare: { row: 1, col: 4 },
			possibleMoves: [{ row: 0, col: 4 }],
		});

		const result = selectSquare(state, { row: 0, col: 4 });

		// Should have executed the forced-promotion branch and returned a new state
		expect(result.selectedSquare).toBeNull();
		expect(result.currentPlayer).toBe('gote');
		// The pawn at destination should be promoted
		const promoted = result.board[0]?.[4];
		expect(promoted?.type).toBe('promoted_pawn');
		expect(promoted?.isPromoted).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// selectSquare - optional promotion path (returns pendingPromotion)
// ---------------------------------------------------------------------------
describe('selectSquare - optional promotion', () => {
	test('silver entering promotion zone sets pendingPromotion', () => {
		const board = emptyBoard();
		// sente silver at row 3 moves to row 2 (enters promotion zone)
		setPieceAt(board, { row: 3, col: 4 }, { type: 'silver', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({
			board,
			selectedSquare: { row: 3, col: 4 },
			possibleMoves: [{ row: 2, col: 4 }],
		});

		const result = selectSquare(state, { row: 2, col: 4 });

		expect(result.pendingPromotion).toBeDefined();
		expect(result.pendingPromotion?.piece.type).toBe('silver');
		expect(result.pendingPromotion?.to).toEqual({ row: 2, col: 4 });
		// Player has NOT switched yet (waiting for promotion decision)
		expect(result.currentPlayer).toBe('sente');
	});
});

// ---------------------------------------------------------------------------
// selectSquare - regular move (no promotion possible)
// ---------------------------------------------------------------------------
describe('selectSquare - regular move via selectSquare', () => {
	test('gold moves without promotion branch', () => {
		const board = emptyBoard();
		// Gold cannot promote
		setPieceAt(board, { row: 5, col: 4 }, { type: 'gold', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'king', color: 'gote' });

		const state = baseState({
			board,
			selectedSquare: { row: 5, col: 4 },
			possibleMoves: [{ row: 4, col: 4 }],
		});

		const result = selectSquare(state, { row: 4, col: 4 });

		expect(result.selectedSquare).toBeNull();
		expect(result.currentPlayer).toBe('gote');
		expect(result.board[4]?.[4]?.type).toBe('gold');
	});
});

// ---------------------------------------------------------------------------
// selectSquare - invalid destination clears selection
// ---------------------------------------------------------------------------
describe('selectSquare - invalid move destination', () => {
	test('clicking non-move square clears selection', () => {
		const board = emptyBoard();
		setPieceAt(board, { row: 6, col: 4 }, { type: 'pawn', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'king', color: 'gote' });

		const state = baseState({
			board,
			selectedSquare: { row: 6, col: 4 },
			possibleMoves: [{ row: 5, col: 4 }],
		});

		// Click square NOT in possibleMoves
		const result = selectSquare(state, { row: 7, col: 4 });

		expect(result.selectedSquare).toBeNull();
		expect(result.possibleMoves).toHaveLength(0);
		// Player should not have changed
		expect(result.currentPlayer).toBe('sente');
	});
});

// ---------------------------------------------------------------------------
// makeMove - wrong-color piece returns null
// ---------------------------------------------------------------------------
describe('makeMove - piece color validation', () => {
	test('returns null when trying to move opponent piece', () => {
		const board = emptyBoard();
		// Gote pawn at row 2, but it is sente's turn
		setPieceAt(board, { row: 2, col: 4 }, { type: 'pawn', color: 'gote' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'king', color: 'gote' });

		const state = baseState({ board });

		const result = makeMove(state, { row: 2, col: 4 }, { row: 3, col: 4 });
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// makeMove - move that exposes king (pinned piece) returns null
// ---------------------------------------------------------------------------
describe('makeMove - pinned piece', () => {
	test('returns null when move leaves king in check', () => {
		const board = emptyBoard();
		// Gote rook attacks down col 4
		// Sente silver at row 5 col 4 shields king at row 8 col 4
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 5, col: 4 }, { type: 'silver', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'rook', color: 'gote' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({ board });

		// Attempt to move silver out of the pin line
		const result = makeMove(state, { row: 5, col: 4 }, { row: 4, col: 3 });
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// makeMove - gote captures a sente piece
// ---------------------------------------------------------------------------
describe('makeMove - gote captures', () => {
	test('gote capturing sente piece adds it to gote hand', () => {
		const board = emptyBoard();
		// Gote rook at row 5 captures sente pawn at row 6
		setPieceAt(board, { row: 5, col: 4 }, { type: 'rook', color: 'gote' });
		setPieceAt(board, { row: 6, col: 4 }, { type: 'pawn', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'king', color: 'gote' });

		const state = baseState({ board, currentPlayer: 'gote' });

		const result = makeMove(state, { row: 5, col: 4 }, { row: 6, col: 4 });
		expect(result).not.toBeNull();
		expect(result!.goteHand).toHaveLength(1);
		expect(result!.goteHand[0]?.type).toBe('pawn');
		expect(result!.goteHand[0]?.color).toBe('gote');
	});
});

// ---------------------------------------------------------------------------
// makeDrop via selectSquare - drop that would leave king in check returns null
// ---------------------------------------------------------------------------
describe('makeDrop - drop leaves king in check', () => {
	test('dropping a piece that exposes king clears selection without state change', () => {
		const board = emptyBoard();
		// Gote rook threatens sente king through col 4
		// If sente drops a pawn at col 3 (not in the rook's path), king remains in check
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'rook', color: 'gote' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const pawnInHand: ShogiPiece = { type: 'pawn', color: 'sente' };
		const state = baseState({
			board,
			currentPlayer: 'sente',
			status: 'check',
			senteHand: [pawnInHand],
			selectedHandPiece: pawnInHand,
			possibleMoves: [{ row: 5, col: 3 }],
		});

		// Drop at col 3 does NOT block the rook on col 4 → king stays in check
		const result = selectSquare(state, { row: 5, col: 3 });

		// makeMove returns null (invalid drop), so selection is cleared
		expect(result.selectedHandPiece).toBeNull();
		expect(result.possibleMoves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// gote drop removes piece from gote hand
// ---------------------------------------------------------------------------
describe('makeMove - gote drops piece from hand', () => {
	test('gote dropping a pawn removes it from gote hand', () => {
		const board = emptyBoard();
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const pawnInHand: ShogiPiece = { type: 'pawn', color: 'gote' };
		const state = baseState({
			board,
			currentPlayer: 'gote',
			goteHand: [pawnInHand],
			selectedHandPiece: pawnInHand,
		});

		// Drop the pawn on row 5 (valid drop square for gote pawn)
		const result = makeMove(state, null, { row: 5, col: 4 });
		expect(result).not.toBeNull();
		expect(result!.goteHand).toHaveLength(0);
		expect(result!.board[5]?.[4]?.type).toBe('pawn');
	});
});

// ---------------------------------------------------------------------------
// hasAnyLegalMoves - forced promotion variants exercised via getGameStatus
// ---------------------------------------------------------------------------
describe('getGameStatus - promotion variants in hasAnyLegalMoves', () => {
	test('game is not checkmate when sente pawn can forced-promote to escape', () => {
		// Sente is NOT in check; just need hasAnyLegalMoves to traverse forced-promote path
		const board = emptyBoard();
		// Sente pawn one step from last rank (forced promote on move)
		setPieceAt(board, { row: 1, col: 4 }, { type: 'pawn', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({ board });
		const status = getGameStatus(state);
		expect(status).toBe('playing');
	});

	test('game status accounts for optional-promote moves (silver in zone)', () => {
		const board = emptyBoard();
		// Sente silver in promotion zone can optionally promote
		setPieceAt(board, { row: 2, col: 4 }, { type: 'silver', color: 'sente' });
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({ board });
		const status = getGameStatus(state);
		expect(status).toBe('playing');
	});

	test('game is playing when legal drop moves exist', () => {
		const board = emptyBoard();
		// Sente has only king; with a pawn in hand, it can drop
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });

		const state = baseState({
			board,
			senteHand: [{ type: 'pawn', color: 'sente' }],
		});
		const status = getGameStatus(state);
		expect(status).toBe('playing');
	});
});

// ---------------------------------------------------------------------------
// selectHandPiece - wrong-color piece returns unchanged state
// ---------------------------------------------------------------------------
describe('selectHandPiece', () => {
	test('returns unchanged state when trying to select opponent hand piece', () => {
		const state = createInitialGameState();
		const gotePiece: ShogiPiece = { type: 'pawn', color: 'gote' };
		const result = selectHandPiece(state, gotePiece);
		// sente's turn but gote piece → unchanged
		expect(result).toBe(state);
	});
});

// ---------------------------------------------------------------------------
// hasAnyLegalMoves - drop check path (lines 483-505)
//
// Position: sente king at (8,4) in check from gote rook at (0,4) along col 4.
// All king escape squares are covered by gote lances/pawns that do NOT
// additionally threaten (8,4) itself (avoiding double-check).  A sente pawn
// in hand can be dropped at (4,4) to block the rook.
//
// King escape analysis:
//   (7,4) → attacked by rook along col 4 ✓
//   (7,3) → gote lance at (7,3) is there; after capture, gote pawn at (6,3)
//            defends (7,3) ✓
//   (7,5) → gote lance at (7,5) is there; after capture, gote pawn at (6,5)
//            defends (7,5) ✓
//   (8,3) → gote lance at (8,3), defended by lance at (7,3) ✓
//   (8,5) → gote lance at (8,5), defended by lance at (7,5) ✓
// None of these gote pieces threaten (8,4), so there is exactly one attacker
// (the rook) which can be blocked by a drop.
// ---------------------------------------------------------------------------
describe('hasAnyLegalMoves - drop moves cover lines 483-505', () => {
	function buildSurroundedKingBoard() {
		const board = emptyBoard();
		// Sente king in check from gote rook along col 4
		setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
		setPieceAt(board, { row: 0, col: 4 }, { type: 'rook', color: 'gote' });
		// Gote lances at (7,3) and (7,5) — block diagonal escape squares;
		// each defends the lance one row below it.
		setPieceAt(board, { row: 7, col: 3 }, { type: 'lance', color: 'gote' });
		setPieceAt(board, { row: 7, col: 5 }, { type: 'lance', color: 'gote' });
		// Gote lances at (8,3) and (8,5) — block horizontal escape squares;
		// they are defended by the lances directly above them.
		setPieceAt(board, { row: 8, col: 3 }, { type: 'lance', color: 'gote' });
		setPieceAt(board, { row: 8, col: 5 }, { type: 'lance', color: 'gote' });
		// Gote pawns at (6,3) and (6,5) — defend (7,3) and (7,5) after king
		// would capture the lances there.
		setPieceAt(board, { row: 6, col: 3 }, { type: 'pawn', color: 'gote' });
		setPieceAt(board, { row: 6, col: 5 }, { type: 'pawn', color: 'gote' });
		// Gote king safely out of the way
		setPieceAt(board, { row: 0, col: 0 }, { type: 'king', color: 'gote' });
		return board;
	}

	test('status is check (not checkmate) when pawn drop can block the attacker', () => {
		const board = buildSurroundedKingBoard();

		// Sente has a pawn in hand — can drop at (4,4) to block the rook.
		const state = baseState({
			board,
			currentPlayer: 'sente',
			senteHand: [{ type: 'pawn', color: 'sente' }],
		});

		// getGameStatus calls hasAnyLegalMoves which must reach the drop-check
		// loop to determine that the pawn drop saves the king.
		const status = getGameStatus(state);
		expect(status).toBe('check');
	});

	test('status is checkmate when no drops can save the king', () => {
		const board = buildSurroundedKingBoard();

		// No pieces in hand — no way to block
		const state = baseState({
			board,
			currentPlayer: 'sente',
			senteHand: [],
		});

		const status = getGameStatus(state);
		expect(status).toBe('checkmate');
	});
});
