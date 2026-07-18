import type { ShogiGameState, ShogiPiece, ShogiPieceColor } from './types';
import { makeAIMove as makeShogiAIMove, selectHandPiece } from './game';

// Valid Shogi piece types for drops (base types only — no promoted pieces,
// king cannot be dropped). Mirrors the rule guardian's
// VALID_SHOGI_PIECE_TYPES so a response that slips past the guardian is
// still rejected before reaching the game engine.
const VALID_DROP_PIECE_TYPES = [
	'pawn',
	'lance',
	'knight',
	'silver',
	'gold',
	'bishop',
	'rook',
] as const;
type ValidDropPieceType = (typeof VALID_DROP_PIECE_TYPES)[number];

/**
 * Apply an AI response (drop or regular move) to a Shogi game state.
 * Returns the resulting game state on success, or throws with a
 * descriptive message if the move is malformed or cannot be applied.
 *
 * Extracted from ShogiGame's makeAIMove effect so the defensive
 * validation (missing / invalid drop pieceType, failed apply) is
 * unit-testable independently of the rule guardian and AI service — the
 * guardian already rejects these cases, but the component keeps a local
 * guard so a misconfigured guardian cannot corrupt game state.
 */
export function applyShogiAIMoveResponse(
	gameState: ShogiGameState,
	aiResponse: {
		move: {
			from: string;
			to: string;
			pieceType?: string;
			promote?: boolean;
		};
	}
): ShogiGameState {
	if (aiResponse.move.from === '*') {
		// Drop move
		const to = aiResponse.move.to;
		const pieceType = aiResponse.move.pieceType;

		if (!pieceType) {
			throw new Error(`Invalid drop move: missing pieceType for ${to}`);
		}

		// Validate pieceType is a valid Shogi drop piece type
		if (!VALID_DROP_PIECE_TYPES.includes(pieceType as ValidDropPieceType)) {
			throw new Error(`Invalid drop move: invalid pieceType ${pieceType}`);
		}

		// Apply drop move using makeShogiAIMove
		const moveResult = makeShogiAIMove(
			gameState,
			'*',
			to,
			false,
			pieceType as ValidDropPieceType
		);
		if (moveResult) {
			return moveResult;
		}
		throw new Error(
			`Failed to apply AI drop move: pieceType=${pieceType}, to=${to}`
		);
	}

	// Regular move
	const promote = aiResponse.move.promote ?? false;

	// Apply move directly using makeShogiAIMove (bypasses pendingPromotion UI)
	const moveResult = makeShogiAIMove(
		gameState,
		aiResponse.move.from,
		aiResponse.move.to,
		promote
	);
	if (moveResult) {
		return moveResult;
	}
	throw new Error(
		`Failed to apply AI move: from=${aiResponse.move.from}, to=${aiResponse.move.to}, promote=${promote}`
	);
}

/**
 * Compute the next game state for a hand-piece click, or null when the
 * click should be a no-op (AI's turn / AI thinking in AI mode, or the
 * clicked piece does not belong to the current player).
 *
 * Extracted from ShogiGame's handleHandPieceClick so the AI-turn guard
 * is unit-testable without a captured piece in hand — the UI only
 * renders clickable hand buttons once a capture has populated the hand,
 * which cannot happen from the initial board in a fast unit test.
 */
export function computeHandPieceClickState(
	gameState: ShogiGameState,
	piece: ShogiPiece,
	gameMode: 'tutorial' | 'ai',
	aiPlayer: ShogiPieceColor,
	isAIThinking: boolean
): ShogiGameState | null {
	if (gameMode === 'ai') {
		if (gameState.currentPlayer === aiPlayer || isAIThinking) {
			return null;
		}
	}
	if (piece.color === gameState.currentPlayer) {
		return selectHandPiece(gameState, piece);
	}
	return null;
}
