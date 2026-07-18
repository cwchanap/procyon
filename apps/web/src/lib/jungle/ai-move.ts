import type { JungleGameState, JunglePosition } from './types';
import { selectSquare } from './game';

/**
 * Apply an AI move (already converted to board positions) to a Jungle
 * game state. Returns the resulting state on success, or throws with a
 * descriptive message if the source square has no selectable piece or
 * the destination is illegal.
 *
 * Extracted from JungleGame's makeAIMove effect so the "no selectable
 * piece" guard is unit-testable independently of the rule guardian —
 * the guardian already rejects moves with no piece at `from`, but the
 * component keeps a local guard so a misconfigured guardian cannot
 * select an empty square.
 */
export function applyJungleAIMove(
	gameState: JungleGameState,
	fromPos: JunglePosition,
	toPos: JunglePosition,
	fromLabel: string,
	toLabel: string
): JungleGameState {
	// Apply the move using jungle game logic
	const moveResult = selectSquare(gameState, fromPos);
	const hasSelectedPiece = Boolean(moveResult.selectedSquare);

	if (!hasSelectedPiece) {
		throw new Error(`AI move invalid: no selectable piece at ${fromLabel}`);
	}

	const finalResult = selectSquare(moveResult, toPos);
	// selectSquare always returns a fresh object (copyGameState),
	// so reference inequality cannot detect a failed move. An
	// illegal destination clears selection but leaves the board,
	// history, and turn untouched - the same shape produced after
	// a legal move. Compare move history length instead: a valid
	// move appends exactly one entry; an illegal one appends none.
	const moveApplied =
		finalResult.moveHistory.length > moveResult.moveHistory.length;

	if (!moveApplied) {
		throw new Error(
			`AI move invalid: unable to apply ${fromLabel} -> ${toLabel}`
		);
	}

	return finalResult;
}
