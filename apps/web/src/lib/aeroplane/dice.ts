import { getLegalMoves } from './rules';
import { nextUint32, type RngState } from './rng';
import type { AeroplaneState } from './types';

export interface DiceResult {
	roll: number;
	rng: RngState;
}

function fairValue(sample: number): number {
	return (sample % 6) + 1;
}

/** Fair dice intentionally use one modulo sample (including its tiny bias). */
export function rollFair(rng: RngState): DiceResult {
	const sample = nextUint32(rng);
	return { roll: fairValue(sample.value), rng: sample.rng };
}

function isRelaxedProtectionActive(state: AeroplaneState): boolean {
	const color = state.currentPlayer;
	return state.noMoveStreak[color] >= 3 || state.lastPlaceRounds[color] >= 3;
}

/**
 * Relaxed dice protect a player after three consecutive no-move turns or
 * three consecutive rounds in last place. Protection consumes one extra
 * sample; otherwise relaxed mode is the same one-sample fair roll.
 */
export function rollRelaxed(state: AeroplaneState, rng: RngState): DiceResult {
	const first = rollFair(rng);
	if (!isRelaxedProtectionActive(state)) return first;

	const second = rollFair(first.rng);
	const firstLegal = getLegalMoves(state, first.roll).length > 0;
	const secondLegal = getLegalMoves(state, second.roll).length > 0;
	// Relaxed protection is deliberately not a high-roll preference: preserve
	// candidate one whenever it is playable, and only use candidate two when it
	// is the first playable candidate.
	const roll = !firstLegal && secondLegal ? second.roll : first.roll;
	return { roll, rng: second.rng };
}

export function rollDice(state: AeroplaneState, rng: RngState): DiceResult {
	return state.config.diceMode === 'relaxed'
		? rollRelaxed(state, rng)
		: rollFair(rng);
}
