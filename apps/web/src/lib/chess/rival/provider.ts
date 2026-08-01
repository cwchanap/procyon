import type { GameState } from '../types';
import type { RivalKind, RivalMoveResult } from './types';

/**
 * Contract for a chess rival that computes moves from read-only game snapshots.
 *
 * Implementations must never mutate game state, React state, or any shared
 * store — they only return {@link RivalMoveResult} values for the caller to apply.
 */
export interface ChessRivalProvider {
	readonly kind: RivalKind;
	initialize(): Promise<void>;
	beginGame(): Promise<void>;
	makeMove(state: GameState, requestToken: number): Promise<RivalMoveResult>;
	dispose(): void;
}
