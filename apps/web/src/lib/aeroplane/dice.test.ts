import { expect, test } from 'bun:test';
import { rollFair, rollRelaxed } from './dice';
import { nextUint32 } from './rng';
import type {
	AeroplaneConfig,
	AeroplaneState,
	AeroplaneStats,
	PlaneState,
} from './types';

const CLASSIC_CONFIG: AeroplaneConfig = {
	rulePreset: 'classic',
	victoryTarget: 4,
	diceMode: 'fair',
	launchRule: 'six',
	finishRule: 'exact',
	stacking: false,
	blockades: false,
	humanColor: 'red',
	chatter: false,
};

const STATS: AeroplaneStats = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

function relaxedFixtureState(): AeroplaneState {
	const planes: PlaneState[] = [
		{ id: 'red-0', color: 'red', progress: 1 },
		{ id: 'red-1', color: 'red', progress: null },
		{ id: 'red-2', color: 'red', progress: null },
		{ id: 'red-3', color: 'red', progress: null },
	];

	return {
		config: { ...CLASSIC_CONFIG, diceMode: 'relaxed' },
		currentPlayer: 'red',
		phase: 'awaiting-roll',
		pendingRoll: null,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: STATS,
	};
}

test('fair consumes exactly one sample', () => {
	const rng = { value: 123 };

	expect(rollFair(rng).rng).toEqual(nextUint32(rng).rng);
});

test('fair maps every sample to one die value', () => {
	const result = rollFair({ value: 123 });

	expect(result.roll).toBeGreaterThanOrEqual(1);
	expect(result.roll).toBeLessThanOrEqual(6);
});

test('active relaxed protection consumes exactly two samples', () => {
	const rng = { value: 456 };
	const state = {
		...relaxedFixtureState(),
		noMoveStreak: { red: 3, yellow: 0, blue: 0, green: 0 },
	};
	const result = rollRelaxed(state, rng);
	const first = nextUint32(rng);
	const second = nextUint32(first.rng);

	expect(result.rng).toEqual(second.rng);
});

test('relaxed protection below both current-player thresholds consumes one sample', () => {
	const rng = { value: 456 };
	const state = {
		...relaxedFixtureState(),
		noMoveStreak: { red: 2, yellow: 3, blue: 0, green: 0 },
		lastPlaceRounds: { red: 2, yellow: 3, blue: 0, green: 0 },
	};

	expect(rollRelaxed(state, rng).rng).toEqual(nextUint32(rng).rng);
});

test('relaxed protection activates at the current-player no-move threshold', () => {
	const rng = { value: 456 };
	const state = {
		...relaxedFixtureState(),
		noMoveStreak: { red: 3, yellow: 0, blue: 0, green: 0 },
	};
	const first = nextUint32(rng);
	const second = nextUint32(first.rng);

	expect(rollRelaxed(state, rng).rng).toEqual(second.rng);
});

test('relaxed protection activates at the current-player last-place threshold', () => {
	const rng = { value: 456 };
	const state = {
		...relaxedFixtureState(),
		lastPlaceRounds: { red: 3, yellow: 0, blue: 0, green: 0 },
	};
	const first = nextUint32(rng);
	const second = nextUint32(first.rng);

	expect(rollRelaxed(state, rng).rng).toEqual(second.rng);
});

test('relaxed protection ignores another colour counters', () => {
	const rng = { value: 456 };
	const state = {
		...relaxedFixtureState(),
		noMoveStreak: { red: 0, yellow: 3, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 3, blue: 0, green: 0 },
	};

	expect(rollRelaxed(state, rng).rng).toEqual(nextUint32(rng).rng);
});

test('relaxed protection prefers the first candidate when both are legal', () => {
	const state = {
		...relaxedFixtureState(),
		noMoveStreak: { red: 3, yellow: 0, blue: 0, green: 0 },
	};
	const result = rollRelaxed(state, { value: 456 });

	// Seed 456 yields candidate rolls 5 and 6; the active red plane can play
	// either, so the normative first-candidate preference must keep 5.
	expect(result.roll).toBe(5);
});
