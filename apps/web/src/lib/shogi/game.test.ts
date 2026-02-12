import { test, expect, describe, beforeEach } from 'bun:test';
import {
	createInitialGameState,
	selectSquare,
	makeMove,
	isKingInCheck,
	getGameStatus,
	confirmPromotion,
} from './game';
import { createInitialBoard, getPieceAt, copyBoard, setPieceAt } from './board';
import { getPossibleMoves, canDropAt } from './moves';
import type { ShogiGameState, ShogiPiece } from './types';
import { SHOGI_BOARD_SIZE } from './types';

describe('Shogi Game Engine', () => {
	describe('createInitialGameState', () => {
		test('should create initial game state with correct setup', () => {
			const state = createInitialGameState();

			expect(state.currentPlayer).toBe('sente');
			expect(state.status).toBe('playing');
			expect(state.moveHistory).toHaveLength(0);
			expect(state.senteHand).toHaveLength(0);
			expect(state.goteHand).toHaveLength(0);
			expect(state.selectedSquare).toBeNull();
			expect(state.possibleMoves).toHaveLength(0);
		});

		test('should have correct piece positions', () => {
			const state = createInitialGameState();

			// Check sente king at e9 (row 8, col 4)
			const senteKing = getPieceAt(state.board, { row: 8, col: 4 });
			expect(senteKing?.type).toBe('king');
			expect(senteKing?.color).toBe('sente');

			// Check gote king at e1 (row 0, col 4)
			const goteKing = getPieceAt(state.board, { row: 0, col: 4 });
			expect(goteKing?.type).toBe('king');
			expect(goteKing?.color).toBe('gote');

			// Check sente pawns on row 6
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const pawn = getPieceAt(state.board, { row: 6, col });
				expect(pawn?.type).toBe('pawn');
				expect(pawn?.color).toBe('sente');
			}

			// Check gote pawns on row 2
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const pawn = getPieceAt(state.board, { row: 2, col });
				expect(pawn?.type).toBe('pawn');
				expect(pawn?.color).toBe('gote');
			}
		});
	});

	describe('selectSquare', () => {
		let state: ShogiGameState;

		beforeEach(() => {
			state = createInitialGameState();
		});

		test('should select own piece and show possible moves', () => {
			// Select sente pawn at e7 (row 6, col 4)
			const newState = selectSquare(state, { row: 6, col: 4 });

			expect(newState.selectedSquare).toEqual({ row: 6, col: 4 });
			expect(newState.possibleMoves.length).toBeGreaterThan(0);
		});

		test('should not select opponent piece', () => {
			// Try to select gote pawn at e3 (row 2, col 4)
			const newState = selectSquare(state, { row: 2, col: 4 });

			expect(newState.selectedSquare).toBeNull();
			expect(newState.possibleMoves).toHaveLength(0);
		});

		test('should deselect when clicking same square', () => {
			// Select piece
			let newState = selectSquare(state, { row: 6, col: 4 });
			expect(newState.selectedSquare).not.toBeNull();

			// Click same square to deselect
			newState = selectSquare(newState, { row: 6, col: 4 });
			expect(newState.selectedSquare).toBeNull();
		});

		test('should execute hand piece drop when clicking valid position', () => {
			// Set up a state with a gold general in sente's hand (gold has no nifu restriction)
			const goldInHand: ShogiPiece = {
				type: 'gold',
				color: 'sente',
				isPromoted: false,
			};
			const stateWithHand: ShogiGameState = {
				...state,
				senteHand: [goldInHand],
				selectedHandPiece: goldInHand,
			};

			// Click on an empty square (e5 - row 4, col 4)
			const dropResult = selectSquare(stateWithHand, { row: 4, col: 4 });

			// Verify drop was executed
			expect(dropResult.moveHistory).toHaveLength(1);
			expect(dropResult.moveHistory[0]?.isDrop).toBe(true);
			expect(dropResult.selectedHandPiece).toBeNull();
			expect(dropResult.senteHand).toHaveLength(0); // Piece removed from hand
			expect(dropResult.currentPlayer).toBe('gote'); // Player switched
		});

		test('should clear hand piece selection when clicking invalid drop position', () => {
			// Set up a state with a pawn in sente's hand
			const pawnInHand: ShogiPiece = {
				type: 'pawn',
				color: 'sente',
				isPromoted: false,
			};
			const stateWithHand: ShogiGameState = {
				...state,
				senteHand: [pawnInHand],
				selectedHandPiece: pawnInHand,
			};

			// Click on a square with a piece (invalid drop)
			const dropResult = selectSquare(stateWithHand, { row: 6, col: 4 }); // Has sente pawn

			// Verify selection was cleared but no move made
			expect(dropResult.moveHistory).toHaveLength(0);
			expect(dropResult.selectedHandPiece).toBeNull();
			expect(dropResult.possibleMoves).toHaveLength(0);
		});
	});

	describe('makeMove', () => {
		let state: ShogiGameState;

		beforeEach(() => {
			state = createInitialGameState();
		});

		test('should make valid pawn move', () => {
			// Move sente pawn from e7 to e6
			const newState = makeMove(state, { row: 6, col: 4 }, { row: 5, col: 4 });

			expect(newState).not.toBeNull();
			expect(newState!.currentPlayer).toBe('gote');
			expect(getPieceAt(newState!.board, { row: 5, col: 4 })?.type).toBe(
				'pawn'
			);
			expect(getPieceAt(newState!.board, { row: 6, col: 4 })).toBeNull();
		});

		test('should reject invalid move', () => {
			// Try to move pawn backwards
			const newState = makeMove(state, { row: 6, col: 4 }, { row: 7, col: 4 });

			expect(newState).toBeNull();
		});

		test('should capture opponent piece and add to hand', () => {
			// Set up a position where capture is possible
			const captureBoard = copyBoard(state.board);
			setPieceAt(
				captureBoard,
				{ row: 4, col: 4 },
				{ type: 'pawn', color: 'sente' }
			);
			setPieceAt(
				captureBoard,
				{ row: 3, col: 4 },
				{ type: 'pawn', color: 'gote' }
			);
			setPieceAt(captureBoard, { row: 6, col: 4 }, null);

			const captureState: ShogiGameState = {
				...state,
				board: captureBoard,
			};

			const newState = makeMove(
				captureState,
				{ row: 4, col: 4 },
				{ row: 3, col: 4 }
			);

			expect(newState).not.toBeNull();
			expect(newState!.senteHand.length).toBeGreaterThan(0);
			expect(newState!.senteHand[0]?.type).toBe('pawn');
		});
	});

	describe('getPossibleMoves', () => {
		test('pawn should move forward one square', () => {
			const board = createInitialBoard();
			const pawn = getPieceAt(board, { row: 6, col: 4 });

			const moves = getPossibleMoves(board, pawn!, { row: 6, col: 4 });

			expect(moves).toHaveLength(1);
			expect(moves[0]).toEqual({ row: 5, col: 4 });
		});

		test('knight should move in L-shape forward only', () => {
			const board = createInitialBoard();
			// Clear pawns in front of knight at col 0 and col 2
			setPieceAt(board, { row: 6, col: 0 }, null);
			setPieceAt(board, { row: 6, col: 2 }, null);

			const knight = getPieceAt(board, { row: 8, col: 1 });
			const moves = getPossibleMoves(board, knight!, { row: 8, col: 1 });

			// Knight at b9 can move to a7 and c7
			expect(moves.length).toBe(2);
			expect(moves).toContainEqual({ row: 6, col: 0 });
			expect(moves).toContainEqual({ row: 6, col: 2 });
		});

		test('rook should move in straight lines', () => {
			// Create empty board with just a rook
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			const rook: ShogiPiece = { type: 'rook', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, rook);

			const moves = getPossibleMoves(board, rook, { row: 4, col: 4 });

			// Should be able to move to all squares on same row and column
			expect(moves.length).toBe(16); // 8 horizontal + 8 vertical
		});

		test('bishop should move diagonally', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			const bishop: ShogiPiece = { type: 'bishop', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, bishop);

			const moves = getPossibleMoves(board, bishop, { row: 4, col: 4 });

			// All diagonal moves from center
			expect(moves.length).toBe(16);
		});

		test('gold general should move in 6 directions', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			const gold: ShogiPiece = { type: 'gold', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, gold);

			const moves = getPossibleMoves(board, gold, { row: 4, col: 4 });

			// Gold moves: forward 3 + sideways 2 + back 1 = 6
			expect(moves.length).toBe(6);
		});

		test('silver general should move in 5 directions', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			const silver: ShogiPiece = { type: 'silver', color: 'sente' };
			setPieceAt(board, { row: 4, col: 4 }, silver);

			const moves = getPossibleMoves(board, silver, { row: 4, col: 4 });

			// Silver moves: forward 3 + diagonal back 2 = 5
			expect(moves.length).toBe(5);
		});
	});

	describe('canDropAt', () => {
		test('should not allow pawn drop on last rank', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };

			// Sente pawn cannot be dropped on row 0
			expect(canDropAt(board, pawn, { row: 0, col: 4 })).toBe(false);
			// But can be dropped on row 1
			expect(canDropAt(board, pawn, { row: 1, col: 4 })).toBe(true);
		});

		test('should not allow pawn drop on file with existing pawn (nifu)', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			// Place existing pawn
			setPieceAt(board, { row: 5, col: 4 }, { type: 'pawn', color: 'sente' });

			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };

			// Cannot drop another sente pawn on column 4
			expect(canDropAt(board, pawn, { row: 3, col: 4 })).toBe(false);
			// But can drop on a different column
			expect(canDropAt(board, pawn, { row: 3, col: 3 })).toBe(true);
		});

		test('should not allow drop on occupied square', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			setPieceAt(board, { row: 4, col: 4 }, { type: 'gold', color: 'gote' });

			const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };

			expect(canDropAt(board, pawn, { row: 4, col: 4 })).toBe(false);
		});
	});

	describe('isKingInCheck', () => {
		test('should detect when king is in check', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			// Place sente king
			setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
			// Place gote rook attacking the king
			setPieceAt(board, { row: 0, col: 4 }, { type: 'rook', color: 'gote' });

			expect(isKingInCheck(board, 'sente')).toBe(true);
		});

		test('should not detect check when king is safe', () => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			// Place sente king
			setPieceAt(board, { row: 8, col: 4 }, { type: 'king', color: 'sente' });
			// Place gote rook not attacking the king
			setPieceAt(board, { row: 0, col: 0 }, { type: 'rook', color: 'gote' });

			expect(isKingInCheck(board, 'sente')).toBe(false);
		});
	});

	describe('getGameStatus', () => {
		test('should return playing for normal position', () => {
			const state = createInitialGameState();
			expect(getGameStatus(state)).toBe('playing');
		});
	});

	describe('Promotion behavior', () => {
		test('should auto-promote when forced (pawn/lance at last row)', () => {
			// Set up a pawn about to enter the last row (row 0 for sente)
			const testBoard = copyBoard(createInitialBoard());
			// Keep the kings but clear pawns
			setPieceAt(testBoard, { row: 6, col: 4 }, null); // Remove sente pawn
			// Move gote king to safe location so we don't overwrite it
			setPieceAt(testBoard, { row: 0, col: 4 }, null); // Remove from col 4
			setPieceAt(
				testBoard,
				{ row: 0, col: 0 },
				{ type: 'king', color: 'gote' }
			); // Place king at a1
			// Place sente pawn at row 1, one move away from last row
			setPieceAt(
				testBoard,
				{ row: 1, col: 4 },
				{ type: 'pawn', color: 'sente' }
			);

			const testState: ShogiGameState = {
				...createInitialGameState(),
				board: testBoard,
			};

			// Select the pawn
			const selectedState = selectSquare(testState, { row: 1, col: 4 });
			expect(selectedState.selectedSquare).toEqual({ row: 1, col: 4 });

			// Move to last row - should auto-promote (forced)
			const moveState = selectSquare(selectedState, { row: 0, col: 4 });
			expect(moveState).not.toBeNull();
			expect(moveState.moveHistory.length).toBe(1);
			expect(moveState.moveHistory[0]?.isPromotion).toBe(true);
		});

		test('should set pendingPromotion for optional promotion', () => {
			// Set up a pawn entering promotion zone (row 2) but not last row
			const testBoard = copyBoard(createInitialBoard());
			setPieceAt(
				testBoard,
				{ row: 3, col: 4 },
				{ type: 'pawn', color: 'sente' }
			);
			setPieceAt(testBoard, { row: 2, col: 4 }, null);

			const testState: ShogiGameState = {
				...createInitialGameState(),
				board: testBoard,
			};

			// Select the pawn
			const selectedState = selectSquare(testState, { row: 3, col: 4 });
			expect(selectedState.selectedSquare).toEqual({ row: 3, col: 4 });

			// Move to promotion zone - should set pendingPromotion, not auto-promote
			const moveState = selectSquare(selectedState, { row: 2, col: 4 });
			expect(moveState.pendingPromotion).toBeDefined();
			expect(moveState.pendingPromotion?.piece.type).toBe('pawn');
			expect(moveState.moveHistory.length).toBe(0); // Move not yet made
		});

		test('confirmPromotion should apply move with promotion', () => {
			// Set up pending promotion
			const testBoard = copyBoard(createInitialBoard());
			setPieceAt(
				testBoard,
				{ row: 3, col: 4 },
				{ type: 'pawn', color: 'sente' }
			);
			setPieceAt(testBoard, { row: 2, col: 4 }, null);

			const pendingState: ShogiGameState = {
				...createInitialGameState(),
				board: testBoard,
				pendingPromotion: {
					piece: { type: 'pawn', color: 'sente' },
					from: { row: 3, col: 4 },
					to: { row: 2, col: 4 },
				},
			};

			// Confirm promotion
			const promotedState = confirmPromotion(pendingState, true);
			expect(promotedState).not.toBeNull();
			expect(promotedState?.moveHistory.length).toBe(1);
			expect(promotedState?.moveHistory[0]?.isPromotion).toBe(true);
			expect(promotedState?.pendingPromotion).toBeUndefined();
		});

		test('confirmPromotion should apply move without promotion', () => {
			// Set up pending promotion
			const testBoard = copyBoard(createInitialBoard());
			setPieceAt(
				testBoard,
				{ row: 3, col: 4 },
				{ type: 'pawn', color: 'sente' }
			);
			setPieceAt(testBoard, { row: 2, col: 4 }, null);

			const pendingState: ShogiGameState = {
				...createInitialGameState(),
				board: testBoard,
				pendingPromotion: {
					piece: { type: 'pawn', color: 'sente' },
					from: { row: 3, col: 4 },
					to: { row: 2, col: 4 },
				},
			};

			// Decline promotion
			const notPromotedState = confirmPromotion(pendingState, false);
			expect(notPromotedState).not.toBeNull();
			expect(notPromotedState?.moveHistory.length).toBe(1);
			expect(notPromotedState?.moveHistory[0]?.isPromotion).toBe(false);
			expect(notPromotedState?.pendingPromotion).toBeUndefined();
		});

		test('confirmPromotion should return null when no pending promotion', () => {
			const state = createInitialGameState();
			const result = confirmPromotion(state, true);
			expect(result).toBeNull();
		});
	});
});
