import { expect, describe, test } from 'bun:test';
import { chooseAiMove } from './ai';
import {
	CLASSIC_CONFIG,
	QUICK_CONFIG,
	createAeroplaneMatch,
	playResolvedMove,
	rollTurn,
} from './game';
import type { AeroplaneConfig, AeroplaneState, ResolvedMove } from './types';

/**
 * Step 0 baseline pin (HPA-429): Standard gameplay outcomes must stay
 * identical across the upcoming Sky Tycoon rule changes.
 *
 * Deterministic driving policy (test-only, applies to both runs):
 * - Root seed: 42, from which the engine derives its dice and AI streams.
 * - AI seats: `chooseAiMove` with the personality `seatAIs` assigns each
 *   non-human colour, fed by the match's derived aiRng stream.
 * - Nominal human seat (red): picks the lowest plane id among the legal
 *   moves and consumes no aiRng samples.
 * The loop is capped well above the observed ~160-250 turns so a future
 * regression that prevents termination fails fast instead of hanging.
 * Only gameplay outcomes are pinned (no action-checksum hexes): serialized
 * bytes may legitimately change when config.mode / v2 schema are edited.
 */
const BASELINE_ROOT_SEED = 42;
const MAX_BASELINE_TURNS = 6000;

function lowestPlaneIdChoice(legalMoves: ResolvedMove[]): ResolvedMove {
	return [...legalMoves].sort((a, b) => a.planeId.localeCompare(b.planeId))[0]!;
}

function runStandardMatchToCompletion(
	config: AeroplaneConfig,
	rootSeed: number
): AeroplaneState {
	const match = createAeroplaneMatch(config, rootSeed);
	let state = match.state;
	let diceRng = match.diceRng;
	let aiRng = match.aiRng;
	let turns = 0;
	while (state.phase !== 'finished') {
		turns += 1;
		if (turns > MAX_BASELINE_TURNS) {
			throw new Error(
				`Baseline match did not finish within ${MAX_BASELINE_TURNS} turns`
			);
		}
		const color = state.currentPlayer;
		const rolled = rollTurn(state, diceRng);
		diceRng = rolled.rng ?? diceRng;
		state = rolled.state;
		if (rolled.legalMoves.length === 0) continue;
		const seat = match.seats.find(candidate => candidate.color === color);
		const choice = seat
			? chooseAiMove(state, rolled.legalMoves, seat.personality, aiRng)
			: { move: lowestPlaneIdChoice(rolled.legalMoves), rng: aiRng };
		aiRng = choice.rng;
		state = playResolvedMove(state, choice.move).state;
	}
	return state;
}

function progressByPlane(state: AeroplaneState): Record<string, number | null> {
	return Object.fromEntries(
		state.planes.map(plane => [plane.id, plane.progress])
	);
}

describe('Standard baseline pin (seed 42, red human plays lowest plane id)', () => {
	test('CLASSIC_CONFIG final outcome is pinned', () => {
		const state = runStandardMatchToCompletion(
			CLASSIC_CONFIG,
			BASELINE_ROOT_SEED
		);

		expect(state.winner).toBe('yellow');
		expect(state.turnNumber).toBe(250);
		expect(progressByPlane(state)).toEqual({
			'red-0': 56,
			'red-1': 48,
			'red-2': null,
			'red-3': null,
			'yellow-0': 56,
			'yellow-1': 56,
			'yellow-2': 56,
			'yellow-3': 56,
			'blue-0': 53,
			'blue-1': null,
			'blue-2': 56,
			'blue-3': 56,
			'green-0': null,
			'green-1': 0,
			'green-2': 27,
			'green-3': null,
		});
		expect(state.stats).toEqual({
			capturesMade: { red: 3, yellow: 4, blue: 5, green: 3 },
			capturesSuffered: { red: 1, yellow: 2, blue: 6, green: 6 },
			finished: { red: 1, yellow: 4, blue: 2, green: 0 },
		});
	});

	test('QUICK_CONFIG final outcome is pinned', () => {
		const state = runStandardMatchToCompletion(
			QUICK_CONFIG,
			BASELINE_ROOT_SEED
		);

		expect(state.winner).toBe('red');
		expect(state.turnNumber).toBe(163);
		expect(progressByPlane(state)).toEqual({
			'red-0': 56,
			'red-1': 56,
			'red-2': null,
			'red-3': null,
			'yellow-0': 36,
			'yellow-1': 14,
			'yellow-2': 38,
			'yellow-3': 56,
			'blue-0': 6,
			'blue-1': 39,
			'blue-2': 0,
			'blue-3': 47,
			'green-0': 56,
			'green-1': null,
			'green-2': 0,
			'green-3': 38,
		});
		expect(state.stats).toEqual({
			capturesMade: { red: 3, yellow: 3, blue: 2, green: 0 },
			capturesSuffered: { red: 1, yellow: 2, blue: 2, green: 3 },
			finished: { red: 2, yellow: 1, blue: 0, green: 1 },
		});
	});
});
