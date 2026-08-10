import { getLegalMoves } from './rules';
import { nextUint32, type RngState } from './rng';
import { FINISH_PROGRESS } from './topology';
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

function hasActivePlane(state: AeroplaneState): boolean {
	return state.planes.some(
		plane => plane.progress !== null && plane.progress < FINISH_PROGRESS
	);
}

/**
 * Relaxed dice protect an active player with one optional reroll. Both
 * samples are consumed whenever a non-finished plane is in play; the better
 * roll is preferred, while a roll that unlocks a legal move wins ties.
 */
export function rollRelaxed(state: AeroplaneState, rng: RngState): DiceResult {
	const first = rollFair(rng);
	if (!hasActivePlane(state)) return first;

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
