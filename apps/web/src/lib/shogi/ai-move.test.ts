import { describe, test, expect } from 'bun:test';
import {
	applyShogiAIMoveResponse,
	computeHandPieceClickState,
} from './ai-move';
import { createInitialGameState } from './game';
import { getPieceAt, algebraicToPosition } from './board';
import type { ShogiGameState, ShogiPiece } from './types';

// Builds a fresh initial state with a given piece added to sente's hand.
// sente is the first player, so AI-as-sente drop scenarios start here.
function stateWithSenteHandPiece(piece: ShogiPiece): ShogiGameState {
	const state = createInitialGameState();
	return {
		...state,
		senteHand: [piece],
	};
}

describe('applyShogiAIMoveResponse — drop moves', () => {
	test('drop without pieceType throws "missing pieceType"', () => {
		const state = createInitialGameState();
		expect(() =>
			applyShogiAIMoveResponse(state, {
				move: { from: '*', to: '5e' },
			})
		).toThrow(/Invalid drop move: missing pieceType for 5e/);
	});

	test('drop with an invalid pieceType throws "invalid pieceType"', () => {
		// 'dragon' is a promoted rook — not a legal drop piece type.
		const state = createInitialGameState();
		expect(() =>
			applyShogiAIMoveResponse(state, {
				move: { from: '*', to: '5e', pieceType: 'dragon' },
			})
		).toThrow(/Invalid drop move: invalid pieceType dragon/);
	});

	test('drop with valid pieceType but empty hand throws "Failed to apply"', () => {
		// Initial state has empty hands, so makeShogiAIMove cannot find a
		// gold to drop and returns null -> the helper surfaces the failure.
		const state = createInitialGameState();
		expect(() =>
			applyShogiAIMoveResponse(state, {
				move: { from: '*', to: '5e', pieceType: 'gold' },
			})
		).toThrow(/Failed to apply AI drop move: pieceType=gold, to=5e/);
	});

	test('drop with the piece in hand applies the move and removes it from hand', () => {
		const gold: ShogiPiece = { type: 'gold', color: 'sente' };
		const state = stateWithSenteHandPiece(gold);
		const result = applyShogiAIMoveResponse(state, {
			move: { from: '*', to: '5e', pieceType: 'gold' },
		});

		// The dropped gold now occupies 5e (row 4, col 4).
		const dropPos = algebraicToPosition('5e');
		expect(dropPos).not.toBeNull();
		const placed = getPieceAt(result.board, dropPos!);
		expect(placed).not.toBeNull();
		expect(placed?.type).toBe('gold');
		expect(placed?.color).toBe('sente');
		expect(placed?.isPromoted).toBe(false);

		// The gold was removed from the hand.
		expect(result.senteHand).toHaveLength(0);

		// A move record was appended and the turn switched to gote.
		expect(result.moveHistory).toHaveLength(1);
		expect(result.currentPlayer).toBe('gote');
	});
});

describe('applyShogiAIMoveResponse — regular moves', () => {
	test('a valid opening move (7g-7f) is applied', () => {
		const state = createInitialGameState();
		const result = applyShogiAIMoveResponse(state, {
			move: { from: '7g', to: '7f' },
		});

		// The sente pawn advanced from 7g to 7f; turn switched to gote.
		expect(result.currentPlayer).toBe('gote');
		expect(result.moveHistory).toHaveLength(1);
		const toPos = algebraicToPosition('7f');
		expect(toPos).not.toBeNull();
		expect(getPieceAt(result.board, toPos!)?.type).toBe('pawn');
		const fromPos = algebraicToPosition('7g');
		expect(fromPos).not.toBeNull();
		expect(getPieceAt(result.board, fromPos!)).toBeNull();
	});

	test('an illegal regular move (7g-7a, too far) throws "Failed to apply"', () => {
		const state = createInitialGameState();
		expect(() =>
			applyShogiAIMoveResponse(state, {
				move: { from: '7g', to: '7a' },
			})
		).toThrow(/Failed to apply AI move: from=7g, to=7a, promote=false/);
	});
});

describe('computeHandPieceClickState — AI-turn guard', () => {
	test('returns null when it is the AI player turn in AI mode', () => {
		const state = createInitialGameState(); // currentPlayer === 'sente'
		const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		expect(
			computeHandPieceClickState(state, pawn, 'ai', 'sente', false)
		).toBeNull();
	});

	test('returns null when AI is thinking during the human turn', () => {
		const state = createInitialGameState(); // sente to move
		const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		// aiPlayer is gote, so it is the human's (sente) turn, but the AI
		// is mid-move — the guard must still block the click.
		expect(
			computeHandPieceClickState(state, pawn, 'ai', 'gote', true)
		).toBeNull();
	});

	test('returns null when the clicked piece is not the current player own', () => {
		const state = createInitialGameState(); // sente to move
		const gotePawn: ShogiPiece = { type: 'pawn', color: 'gote' };
		// Human is sente; clicking a gote hand piece is a no-op.
		expect(
			computeHandPieceClickState(state, gotePawn, 'ai', 'gote', false)
		).toBeNull();
	});

	test('returns the selectHandPiece state on the human turn for own piece', () => {
		const state = createInitialGameState(); // sente to move
		const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		const result = computeHandPieceClickState(state, pawn, 'ai', 'gote', false);
		expect(result).not.toBeNull();
		expect(result?.selectedHandPiece).toEqual(pawn);
	});

	test('tutorial mode skips the AI guard and selects an own hand piece', () => {
		const state = createInitialGameState(); // sente to move
		const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
		const result = computeHandPieceClickState(
			state,
			pawn,
			'tutorial',
			'sente',
			true
		);
		// No AI guard in tutorial mode, so isAIThinking is ignored and the
		// own-piece selection proceeds.
		expect(result).not.toBeNull();
		expect(result?.selectedHandPiece).toEqual(pawn);
	});
});
