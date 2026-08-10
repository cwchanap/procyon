import { expect, test } from 'bun:test';
import { applyResolvedMove, resolveLegalMove } from './rules';
import { nextUint32, type RngState } from './rng';
import {
	chooseAiMove,
	countImmediateCaptureThreats,
	extractAiMoveFeatures,
} from './ai';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	Personality,
	PlaneState,
	ResolvedMove,
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

const STATS = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: id.split('-')[0] as AeroplaneColor, progress };
}

function stateWithPlanes(
	planes: PlaneState[],
	config: Partial<AeroplaneConfig> = {},
	currentPlayer: AeroplaneColor = 'red'
): AeroplaneState {
	return {
		config: { ...CLASSIC_CONFIG, ...config },
		currentPlayer,
		phase: 'awaiting-choice',
		pendingRoll: 2,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: STATS,
	};
}

function legalMove(
	state: AeroplaneState,
	planeId: string,
	roll: number
): ResolvedMove {
	const move = resolveLegalMove(state, planeId, roll);
	expect(move).not.toBeNull();
	if (!move) throw new Error(`Expected ${planeId} to be legal for ${roll}`);
	return move;
}

function quietFixture(): {
	state: AeroplaneState;
	moves: ResolvedMove[];
} {
	const state = stateWithPlanes([
		plane('red-quiet-a', 1),
		plane('red-quiet-b', 5),
	]);
	return {
		state,
		moves: [
			legalMove(state, 'red-quiet-a', 1),
			legalMove(state, 'red-quiet-b', 1),
		],
	};
}

function aggressiveFixture(): {
	state: AeroplaneState;
	moves: ResolvedMove[];
} {
	const state = stateWithPlanes(
		[
			plane('red-capturer', 12),
			plane('red-progressor', 1),
			plane('green-target-a', 43),
			plane('green-target-b', 43),
		],
		{ stacking: true }
	);
	return {
		state,
		moves: [
			legalMove(state, 'red-capturer', 2),
			legalMove(state, 'red-progressor', 2),
		],
	};
}

function finishFixture(): {
	state: AeroplaneState;
	moves: ResolvedMove[];
} {
	const state = stateWithPlanes([
		plane('red-finisher', 55),
		plane('red-progressor', 10),
	]);
	return {
		state,
		moves: [
			legalMove(state, 'red-finisher', 1),
			legalMove(state, 'red-progressor', 1),
		],
	};
}

function exposedCandidateFixture(): {
	state: AeroplaneState;
	afterExposedMove: AeroplaneState;
	movedPlaneId: string;
} {
	const state = stateWithPlanes([
		plane('red-exposed', 12),
		plane('yellow-threat', 14),
	]);
	const move = legalMove(state, 'red-exposed', 2);
	return {
		state,
		afterExposedMove: applyResolvedMove(state, move).state,
		movedPlaneId: move.planeId,
	};
}

function exposureDecisionFixture(): {
	state: AeroplaneState;
	moves: ResolvedMove[];
	safePlaneId: string;
} {
	// Both candidates start at 12 and roll 2, so each has the same jump + flight
	// chain, progress gain, and all other non-exposure features. Their colour
	// changes the shared destination, letting one opponent threat distinguish
	// the candidates without changing any of those feature counts.
	const state = stateWithPlanes([
		plane('red-safe', 12),
		plane('blue-exposed', 12),
		plane('yellow-threat', 40),
	]);
	return {
		state,
		moves: [
			legalMove(state, 'red-safe', 2),
			legalMove(state, 'blue-exposed', 2),
		],
		safePlaneId: 'red-safe',
	};
}

test('aggressive prefers multi-plane capture over quiet progress', () => {
	const fixture = aggressiveFixture();
	const result = chooseAiMove(fixture.state, fixture.moves, 'aggressive', {
		value: 7,
	});

	expect(result.move.planeId).toBe('red-capturer');
});

test('all personalities take a guaranteed finish', () => {
	const fixture = finishFixture();
	for (const personality of [
		'cautious',
		'aggressive',
		'unpredictable',
	] as const) {
		expect(
			chooseAiMove(fixture.state, fixture.moves, personality, { value: 7 }).move
				.planeId
		).toBe('red-finisher');
	}
});

test('same state and seed repeats exactly', () => {
	const fixture = quietFixture();
	const first = chooseAiMove(fixture.state, fixture.moves, 'unpredictable', {
		value: 391,
	});
	const second = chooseAiMove(fixture.state, fixture.moves, 'unpredictable', {
		value: 391,
	});

	expect(first).toEqual(second);
});

test('cautious and aggressive do not consume RNG for a unique top score', () => {
	const fixture = aggressiveFixture();
	for (const personality of ['cautious', 'aggressive'] as const) {
		const input = { value: 7 };
		const result = chooseAiMove(
			fixture.state,
			fixture.moves,
			personality,
			input
		);
		expect(result.rng).toEqual(input);
	}
});

test('cautious consumes one RNG sample only when top scores tie', () => {
	const state = stateWithPlanes([plane('red-a', 1), plane('red-b', 1)], {
		stacking: true,
	});
	const moves = [legalMove(state, 'red-a', 1), legalMove(state, 'red-b', 1)];
	const input: RngState = { value: 7 };

	const result = chooseAiMove(state, moves, 'cautious', input);

	expect(result.rng).toEqual(nextUint32(input).rng);
	expect(['red-a', 'red-b']).toContain(result.move.planeId);
});

test('unpredictable consumes one sample per legal move for jitter', () => {
	const fixture = quietFixture();
	const input: RngState = { value: 391 };
	const first = nextUint32(input);
	const second = nextUint32(first.rng);

	const result = chooseAiMove(
		fixture.state,
		fixture.moves,
		'unpredictable',
		input
	);

	expect(result.rng).toEqual(second.rng);
});

test('unpredictable consumes one extra sample when jittered top scores tie', () => {
	const state = stateWithPlanes([plane('red-a', 1), plane('red-b', 1)], {
		stacking: true,
	});
	const moves = [legalMove(state, 'red-a', 1), legalMove(state, 'red-b', 1)];
	const input: RngState = { value: 1 };
	const first = nextUint32(input);
	const second = nextUint32(first.rng);
	const third = nextUint32(second.rng);

	const result = chooseAiMove(state, moves, 'unpredictable', input);

	expect(result.rng).toEqual(third.rng);
});

test('opponent threat probe sees a capture while another player is current', () => {
	const fixture = exposedCandidateFixture();

	expect(
		countImmediateCaptureThreats(fixture.afterExposedMove, fixture.movedPlaneId)
	).toBeGreaterThan(0);
});

test('cautious avoids an otherwise-equal exposed move', () => {
	const fixture = exposureDecisionFixture();
	const result = chooseAiMove(fixture.state, fixture.moves, 'cautious', {
		value: 7,
	});

	expect(result.move.planeId).toBe(fixture.safePlaneId);
});

test('AI only returns one of the provided legal moves', () => {
	const fixture = aggressiveFixture();
	for (const personality of [
		'cautious',
		'aggressive',
		'unpredictable',
	] as const) {
		const result = chooseAiMove(fixture.state, fixture.moves, personality, {
			value: 99,
		});
		expect(fixture.moves).toContain(result.move);
	}
});

test('formsBlockade counts a same-color stack on the destination track square', () => {
	const state = stateWithPlanes(
		[plane('red-anchor', 3), plane('red-arriver', 1)],
		{ stacking: true, blockades: true }
	);
	const move = legalMove(state, 'red-arriver', 2);

	const features = extractAiMoveFeatures(state, move);
	expect(features.blockade).toBe(1);
});

test('formsBlockade is zero when blockades are disabled even with stacking', () => {
	const state = stateWithPlanes(
		[plane('red-anchor', 3), plane('red-arriver', 1)],
		{ stacking: true, blockades: false }
	);
	const move = legalMove(state, 'red-arriver', 2);

	const features = extractAiMoveFeatures(state, move);
	expect(features.blockade).toBe(0);
});

test('formsBlockade is zero when the move ends off the shared track', () => {
	const state = stateWithPlanes(
		[plane('red-anchor', 10), plane('red-finisher', 55)],
		{ stacking: true, blockades: true }
	);
	const move = legalMove(state, 'red-finisher', 1);

	const features = extractAiMoveFeatures(state, move);
	expect(features.blockade).toBe(0);
});

test('chooseAiMove rejects an unknown personality', () => {
	const fixture = quietFixture();
	expect(() =>
		chooseAiMove(fixture.state, fixture.moves, 'bogus' as Personality, {
			value: 7,
		})
	).toThrow(RangeError);
});

test('chooseAiMove rejects an empty legal move set', () => {
	const fixture = quietFixture();
	expect(() =>
		chooseAiMove(fixture.state, [], 'cautious', { value: 7 })
	).toThrow(RangeError);
});
