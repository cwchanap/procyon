import { expect, test } from 'bun:test';
import { playResolvedMove } from './game';
import { applyResolvedMove, resolveLegalMove } from './rules';
import { nextUint32, type RngState } from './rng';
import {
	chooseAiMove,
	countImmediateCaptureThreats,
	extractAiMoveFeatures,
	TYCOON_TILE_UTILITY,
} from './ai';
import { initialTycoonState } from './tycoon';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	Personality,
	PlaneState,
	ResolvedMove,
} from './types';

const CLASSIC_CONFIG: AeroplaneConfig = {
	mode: 'standard',
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
		tycoon: null,
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

function tycoonStateWithPlanes(
	planes: PlaneState[],
	tycoon = initialTycoonState(1)
): AeroplaneState {
	return {
		...stateWithPlanes(planes, { mode: 'sky-tycoon' }),
		tycoon,
	};
}

test('tycoon tile weights steer away from Crash; inert in Standard', () => {
	// red-crash lands on progress 25 (global 24, Crash); red-safe on plain 11.
	const planes = [plane('red-crash', 22), plane('red-safe', 8)];
	const standard = stateWithPlanes(planes);
	const tycoon = tycoonStateWithPlanes(planes);
	const moves = [
		legalMove(standard, 'red-crash', 3),
		legalMove(standard, 'red-safe', 3),
	];

	expect(extractAiMoveFeatures(standard, moves[0]!).tycoonTile).toBe(0);
	expect(extractAiMoveFeatures(tycoon, moves[0]!).tycoonTile).toBe(
		TYCOON_TILE_UTILITY.crash
	);
	expect(extractAiMoveFeatures(tycoon, moves[1]!).tycoonTile).toBe(0);

	for (const personality of ['cautious', 'aggressive'] as const) {
		expect(
			chooseAiMove(tycoon, moves, personality, { value: 5 }).move.planeId
		).toBe('red-safe');
	}
});

test('a shielded mover loses its phantom protection in the exposure probe', () => {
	// blue jumps/flights 12 → 30 (global 3); yellow at 40 reaches it on a 3.
	const tycoon = { ...initialTycoonState(1), shields: ['blue-shielded'] };
	const state = tycoonStateWithPlanes(
		[plane('blue-shielded', 12), plane('yellow-threat', 40)],
		tycoon
	);
	const move = legalMove(state, 'blue-shielded', 2);

	// The mover's shield expires on movement, so the projected exposure must
	// count the opponent roll that can legally capture it next turn.
	expect(extractAiMoveFeatures(state, move).exposure).toBeGreaterThan(0);
});

test('landing on a shield tile keeps the mover protected in the exposure probe', () => {
	// red lands on progress 9 (global 8, Shield); yellow at 46 reaches it on a 2.
	const state = tycoonStateWithPlanes([
		plane('red-mover', 6),
		plane('yellow-threat', 46),
	]);
	const move = legalMove(state, 'red-mover', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 8 });
	// The threat is real: an unshielded plane on that square is capturable.
	const unshielded = applyResolvedMove(state, move).state;
	expect(countImmediateCaptureThreats(unshielded, 'red-mover')).toBeGreaterThan(
		0
	);

	expect(extractAiMoveFeatures(state, move).exposure).toBe(0);
});

test('a storm retreat projects the mover onto the retreated square', () => {
	// red lands on progress 16 (global 15, Storm) and must retreat to 13
	// (global 12). blue reaches 12 only on a 1, green only on a 2 via the
	// jump square; neither roll can reach the abandoned Storm square itself.
	const state = tycoonStateWithPlanes([
		plane('red-stormer', 14),
		plane('blue-chaser', 38),
		plane('green-chaser', 20),
	]);
	const move = legalMove(state, 'red-stormer', 2);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 15 });

	const committed = playResolvedMove(state, move).state;
	expect(
		committed.planes.find(plane => plane.id === 'red-stormer')?.progress
	).toBe(13);

	// Without the relocation the probe sees an empty Storm square and reports
	// 0; the committed plane sits on the threatened retreat square instead.
	expect(extractAiMoveFeatures(state, move).exposure).toBe(2);
});

test('a crash relocation projects the mover back to the hangar', () => {
	// red lands on progress 25 (global 24, Crash); yellow at 8 reaches that
	// square on a 4, but the committed plane sits in its hangar where no
	// opponent can capture it.
	const state = tycoonStateWithPlanes([
		plane('red-crasher', 22),
		plane('yellow-threat', 8),
	]);
	const move = legalMove(state, 'red-crasher', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 24 });

	const preRelocation = applyResolvedMove(state, move).state;
	expect(
		countImmediateCaptureThreats(preRelocation, 'red-crasher')
	).toBeGreaterThan(0);

	expect(extractAiMoveFeatures(state, move).exposure).toBe(0);
});

test('a chance landing probes the tile itself, never the undealt card', () => {
	// red lands on progress 4 (global 3, Chance); yellow at 40 reaches that
	// square on a 3, so the honest probe must count real threats on the
	// Chance square regardless of which card the seeded deck would deal.
	const planes = [plane('red-mover', 1), plane('yellow-threat', 40)];
	const state = tycoonStateWithPlanes(planes);
	const move = legalMove(state, 'red-mover', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 3 });

	const onChanceSquare = applyResolvedMove(state, move).state;
	const threats = countImmediateCaptureThreats(onChanceSquare, 'red-mover');
	expect(threats).toBeGreaterThan(0);

	const base = initialTycoonState(1);
	for (const card of TYCOON_CHANCE_CARDS) {
		const tycoon = {
			...base,
			chanceOrder: [card, ...base.chanceOrder.filter(id => id !== card)],
			chanceCursor: 0,
		};
		expect(extractAiMoveFeatures({ ...state, tycoon }, move).exposure).toBe(
			threats
		);
	}
});

test('tycoon airport weight prefers buying or own airports and avoids rival tolls', () => {
	// red lands on progress 7 (global 6, an airport).
	const planes = [plane('red-flyer', 4)];
	const move = legalMove(stateWithPlanes(planes), 'red-flyer', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 6 });
	const base = initialTycoonState(1);
	const utility = (tycoon: typeof base) =>
		extractAiMoveFeatures(tycoonStateWithPlanes(planes, tycoon), move)
			.tycoonTile;

	expect(utility(base)).toBe(TYCOON_TILE_UTILITY['airport-buy']);
	expect(utility({ ...base, coins: { ...base.coins, red: 4 } })).toBe(0);
	expect(utility({ ...base, airports: { 6: 'red' } })).toBe(
		TYCOON_TILE_UTILITY['airport-own']
	);
	expect(utility({ ...base, airports: { 6: 'blue' } })).toBe(
		TYCOON_TILE_UTILITY['airport-toll']
	);
});

test('a launch departure prices its airport with the departure bonus', () => {
	// red departs the launch pad on a 1, landing on progress 1 (global 0, an
	// airport). The committed move pays +3 before resolving the landing, so
	// balances 2–4 still buy what the pre-bonus balance alone could not.
	const planes = [plane('red-departing', 0)];
	const move = legalMove(tycoonStateWithPlanes(planes), 'red-departing', 1);
	expect(move.start).toMatchObject({ kind: 'launch' });
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 0 });
	const base = initialTycoonState(1);
	const utility = (coins: number) =>
		extractAiMoveFeatures(
			tycoonStateWithPlanes(planes, {
				...base,
				coins: { ...base.coins, red: coins },
			}),
			move
		).tycoonTile;

	expect(utility(1)).toBe(0);
	expect(utility(2)).toBe(TYCOON_TILE_UTILITY['airport-buy']);

	const committed = playResolvedMove(
		{
			...tycoonStateWithPlanes(planes, {
				...base,
				coins: { ...base.coins, red: 2 },
			}),
			pendingRoll: 1,
		},
		move
	);
	expect(committed.state.tycoon?.airports[0]).toBe('red');
	expect(committed.state.tycoon?.coins.red).toBe(0);
});

test('a storm relocation can form a blockade on the retreated square', () => {
	// With blockades on, red lands on progress 16 (global 15, Storm) and
	// retreats onto red-anchor at progress 13. The Storm square is empty
	// after relocation; the retreat square now stacks two red planes.
	const planes = [plane('red-stormer', 14), plane('red-anchor', 13)];
	const state = {
		...stateWithPlanes(planes, { mode: 'sky-tycoon', blockades: true }),
		tycoon: initialTycoonState(1),
	};
	const move = legalMove(state, 'red-stormer', 2);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 15 });

	const committed = playResolvedMove(state, move).state;
	expect(
		committed.planes.find(plane => plane.id === 'red-stormer')?.progress
	).toBe(13);

	expect(extractAiMoveFeatures(state, move).blockade).toBe(1);
});

test('a crash costs the progress it covered instead of earning it', () => {
	// red lands on progress 25 (global 24, Crash); the committed plane sits
	// in its hangar, so the move's progress is what it lost, not the
	// distance it first covered.
	const state = tycoonStateWithPlanes([plane('red-crasher', 22)]);
	const move = legalMove(state, 'red-crasher', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 24 });

	const features = extractAiMoveFeatures(state, move);
	expect(features.progress).toBe(-22);
	expect(features.exposure).toBe(0);
	expect(features.tycoonTile).toBe(TYCOON_TILE_UTILITY.crash);
});

test('a wormhole that can never fire scores no tile utility', () => {
	// The reviewer's example: yellow can only ever land on the second
	// wormhole of its pair — progress 25 is global 37, and the partner at
	// global 11 sits past the home stretch, so the warp can never trigger.
	const state = tycoonStateWithPlanes([plane('yellow-drifting', 22)]);
	const move = legalMove(state, 'yellow-drifting', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 37 });

	const committed = playResolvedMove(
		{ ...state, currentPlayer: 'yellow', pendingRoll: 3 },
		move
	).state;
	expect(
		committed.planes.find(plane => plane.id === 'yellow-drifting')?.progress
	).toBe(25);

	expect(extractAiMoveFeatures(state, move).tycoonTile).toBe(0);
});

test('a firing wormhole keeps its utility and progress covers the warp', () => {
	// red lands on progress 12 (global 11, Wormhole) and warps forward to
	// the paired tile at progress 38 (global 37).
	const state = tycoonStateWithPlanes([plane('red-warper', 9)]);
	const move = legalMove(state, 'red-warper', 3);
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', globalIndex: 11 });

	const features = extractAiMoveFeatures(state, move);
	expect(features.tycoonTile).toBe(TYCOON_TILE_UTILITY.wormhole);
	expect(features.progress).toBe(38 - 9);
});

test('an opponent due to skip its roll poses no capture threat', () => {
	// Same geometry as the exposed-move probe: red lands where yellow can
	// capture next turn — unless yellow is due to skip that roll.
	const planes = [plane('red-exposed', 12), plane('yellow-threat', 14)];
	const base = initialTycoonState(1);
	const active = {
		...base,
		skipNextRoll: { red: false, yellow: true, blue: false, green: false },
	};
	const pending = {
		...base,
		skipPending: { red: false, yellow: true, blue: false, green: false },
	};

	const unflagged = tycoonStateWithPlanes(planes, base);
	const move = legalMove(unflagged, 'red-exposed', 2);
	expect(extractAiMoveFeatures(unflagged, move).exposure).toBeGreaterThan(0);
	for (const tycoon of [active, pending]) {
		const state = tycoonStateWithPlanes(planes, tycoon);
		expect(extractAiMoveFeatures(state, move).exposure).toBe(0);
	}
});
