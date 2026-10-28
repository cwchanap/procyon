import { expect, test } from 'bun:test';
import { CLASSIC_CONFIG, playResolvedMove, rollTurn } from './game';
import { getLegalMoves, resolveLegalMove } from './rules';
import {
	SHARED_PROGRESS_MAX,
	START_OFFSET,
	toGlobalTrackIndex,
} from './topology';
import { TYCOON_TILES, type TycoonTileKind } from './tycoon';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	PlaneState,
	SkyTycoonState,
} from './types';

const TYCOON_CONFIG: AeroplaneConfig = {
	...CLASSIC_CONFIG,
	mode: 'sky-tycoon',
};

const ZERO_STREAK: Record<AeroplaneColor, number> = {
	red: 0,
	yellow: 0,
	blue: 0,
	green: 0,
};

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: id.split('-')[0] as AeroplaneColor, progress };
}

function baseTycoon(patch: Partial<SkyTycoonState> = {}): SkyTycoonState {
	return {
		coins: { red: 10, yellow: 10, blue: 10, green: 10 },
		airports: {},
		shields: [],
		skipPending: { red: false, yellow: false, blue: false, green: false },
		skipNextRoll: { red: false, yellow: false, blue: false, green: false },
		chanceOrder: [...TYCOON_CHANCE_CARDS],
		chanceCursor: 0,
		...patch,
	};
}

function tycoonState(
	planes: PlaneState[],
	tycoon: SkyTycoonState | null,
	options: {
		config?: AeroplaneConfig;
		currentPlayer?: AeroplaneColor;
		phase?: AeroplaneState['phase'];
		pendingRoll?: number | null;
		noMoveStreak?: Record<AeroplaneColor, number>;
	} = {}
): AeroplaneState {
	return {
		config: options.config ?? TYCOON_CONFIG,
		currentPlayer: options.currentPlayer ?? 'red',
		phase: options.phase ?? 'awaiting-choice',
		pendingRoll: options.pendingRoll === undefined ? null : options.pendingRoll,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: options.noMoveStreak ?? ZERO_STREAK,
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: {
			capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
			capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
			finished: { red: 0, yellow: 0, blue: 0, green: 0 },
		},
		tycoon,
	};
}

function fullPlanes(overrides: Record<string, number | null>): PlaneState[] {
	const all: PlaneState[] = ['red', 'yellow', 'blue', 'green'].flatMap(color =>
		Array.from({ length: 4 }, (_, index) => plane(`${color}-${index}`, null))
	);
	return all.map(candidate =>
		candidate.id in overrides
			? plane(candidate.id, overrides[candidate.id]!)
			: candidate
	);
}

function play(
	overrides: Record<string, number | null>,
	roll: number,
	tycoon: SkyTycoonState | null = baseTycoon(),
	options: Parameters<typeof tycoonState>[2] = {}
) {
	const state = tycoonState(fullPlanes(overrides), tycoon, {
		pendingRoll: roll,
		...options,
	});
	const move = resolveLegalMove(state, 'red-0', roll);
	if (!move) throw new Error(`expected a legal red-0 move for +${roll}`);
	return { state, move, result: playResolvedMove(state, move) };
}

test('Storm turns the selected move into an effective warp move', () => {
	const { move, result } = play({ 'red-0': 14 }, 2);

	// Selected move lands on red progress 16 (global 15, a Storm tile).
	expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 16 });
	// The effective move preserves start and route and commits the retreat.
	expect(result.move.start).toEqual(move.start);
	expect(result.move.events.map(item => item.type)).toEqual(['move', 'warp']);
	expect(result.move.events[0]).toEqual(move.events[0]!);
	expect(result.move.events[1]).toEqual({
		type: 'warp',
		planeId: 'red-0',
		from: move.finalEndpoint,
		to: { kind: 'track', color: 'red', progress: 13, globalIndex: 12 },
	});
	expect(result.move.finalEndpoint).toMatchObject({
		kind: 'track',
		color: 'red',
		progress: 13,
	});
	expect(result.effectEvents).toEqual([
		{
			type: 'relocation',
			planeId: 'red-0',
			effect: 'storm',
			toProgress: 13,
		},
	]);
	expect(result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(13);
	expect(result.state.currentPlayer).toBe('yellow');
});

test('actual captures drive the effective move and stats', () => {
	// red lands on plain progress 21 (global 20) capturing yellow-0 there.
	const { result } = play({ 'red-0': 20, 'yellow-0': 8 }, 1);

	expect(result.capturedPlaneIds).toEqual(['yellow-0']);
	expect(result.move.capturedPlaneIds).toEqual(['yellow-0']);
	expect(result.state.planes.find(p => p.id === 'yellow-0')?.progress).toBe(
		null
	);
	expect(result.state.stats.capturesMade.red).toBe(1);
	expect(result.state.stats.capturesSuffered.yellow).toBe(1);
	expect(result.effectEvents).toEqual([]);
});

test('a shielded defender is never reported captured', () => {
	const tycoon = baseTycoon({ shields: ['yellow-0'] });
	const state = tycoonState(
		fullPlanes({ 'red-0': 20, 'yellow-0': 8 }),
		tycoon,
		{ pendingRoll: 1 }
	);

	// The shield makes the enemy endpoint illegal everywhere legality is asked.
	expect(resolveLegalMove(state, 'red-0', 1)).toBeNull();
	expect(
		getLegalMoves(state, 1).filter(move => move.planeId === 'red-0')
	).toEqual([]);

	// A stale selected move resolved before the shield cannot slip through.
	const unshielded = tycoonState(
		fullPlanes({ 'red-0': 20, 'yellow-0': 8 }),
		baseTycoon(),
		{ pendingRoll: 1 }
	);
	const stale = resolveLegalMove(unshielded, 'red-0', 1);
	expect(stale).not.toBeNull();
	if (!stale) return;
	expect(() => playResolvedMove(state, stale)).toThrow(/not legal/);
	expect(state.stats.capturesSuffered.yellow).toBe(0);
});

test('departure pays only on the launch-pad-to-track transition', () => {
	// Hangar → launch pays nothing.
	const launch = play({ 'red-0': null }, 6);
	expect(launch.result.effectEvents).toEqual([]);
	expect(launch.result.state.tycoon?.coins.red).toBe(10);

	// Launch pad → shared track mints exactly the departure bonus. Roll 5
	// lands plain (progress 5, global 4) without jump or tile side effects.
	const departure = play({ 'red-0': 0 }, 5);
	expect(departure.result.effectEvents).toEqual([
		{ type: 'coins', color: 'red', amount: 3, reason: 'departure' },
	]);
	expect(departure.result.state.tycoon?.coins.red).toBe(13);
});

test('departure, boost and no-recursion compose in one launch move', () => {
	// Launch to progress 3 (global 2, Boost) advances to 6 (global 5,
	// Tailwind): the forced relocation must not trigger the second tile.
	const { result } = play({ 'red-0': 0 }, 3);

	expect(result.effectEvents).toEqual([
		{ type: 'coins', color: 'red', amount: 3, reason: 'departure' },
		{
			type: 'relocation',
			planeId: 'red-0',
			effect: 'boost',
			toProgress: 6,
		},
	]);
	expect(result.move.events.map(item => item.type)).toEqual(['move', 'move']);
	expect(result.move.finalEndpoint).toMatchObject({ progress: 6 });
	expect(result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(6);
});

test('Tailwind grants exactly one bonus roll', () => {
	// red 29 + 3 lands on progress 32 (global 31, Tailwind; no jump square).
	const { result } = play({ 'red-0': 29 }, 3);

	expect(result.effectEvents).toEqual([{ type: 'tailwind', color: 'red' }]);
	expect(result.state.currentPlayer).toBe('red');
	expect(result.state.phase).toBe('awaiting-roll');
	expect(result.state.turnNumber).toBe(2);
});

test('a six and Tailwind in one move still grant a single bonus roll', () => {
	// red 26 + 6 lands on 32 (Tailwind); the plain-six control lands on 21.
	const tailwind = play({ 'red-0': 26 }, 6);
	const plain = play({ 'red-0': 15 }, 6);

	expect(tailwind.result.effectEvents).toEqual([
		{ type: 'tailwind', color: 'red' },
	]);
	expect(plain.result.effectEvents).toEqual([]);
	for (const result of [tailwind.result, plain.result]) {
		expect(result.state.currentPlayer).toBe('red');
		expect(result.state.phase).toBe('awaiting-roll');
		expect(result.state.turnNumber).toBe(2);
	}
});

test('a Customs skip consumes the die, hands over and keeps the streak', () => {
	const tycoon = baseTycoon({
		skipNextRoll: { red: true, yellow: false, blue: false, green: false },
	});
	const state = tycoonState(fullPlanes({ 'red-0': 1 }), tycoon, {
		phase: 'awaiting-roll',
		noMoveStreak: { red: 2, yellow: 0, blue: 0, green: 0 },
	});
	const result = rollTurn(state, 5);

	expect(result.roll).toBe(5);
	expect(result.legalMoves).toEqual([]);
	expect(result.effectEvents).toEqual([{ type: 'skipped', color: 'red' }]);
	expect(result.state.currentPlayer).toBe('yellow');
	expect(result.state.phase).toBe('awaiting-roll');
	expect(result.state.tycoon?.skipNextRoll.red).toBe(false);
	expect(result.state.noMoveStreak.red).toBe(2);
	expect(result.state.turnNumber).toBe(2);
});

test('a Customs skip advances even on a six', () => {
	const tycoon = baseTycoon({
		skipNextRoll: { red: true, yellow: false, blue: false, green: false },
	});
	const state = tycoonState(fullPlanes({ 'red-0': 1 }), tycoon, {
		phase: 'awaiting-roll',
	});
	const result = rollTurn(state, 6);

	expect(result.state.currentPlayer).toBe('yellow');
	expect(result.effectEvents).toEqual([{ type: 'skipped', color: 'red' }]);
});

test('a Customs skip armed on a non-six activates at the handoff', () => {
	const poor = baseTycoon({
		coins: { red: 2, yellow: 10, blue: 10, green: 10 },
	});
	// red 16 + 3 lands on progress 19 (global 18, Customs) and cannot pay.
	const armed = play({ 'red-0': 16 }, 3, poor);

	expect(armed.result.effectEvents).toEqual([{ type: 'skip', color: 'red' }]);
	expect(armed.result.state.tycoon?.skipPending.red).toBe(false);
	expect(armed.result.state.tycoon?.skipNextRoll.red).toBe(true);
	expect(armed.result.state.currentPlayer).toBe('yellow');
});

test('a Customs skip armed on a six survives the bonus roll and costs the next turn', () => {
	const poor = baseTycoon({
		coins: { red: 2, yellow: 10, blue: 10, green: 10 },
	});
	// red 13 + 6 lands on progress 19 (global 18, Customs) and cannot pay.
	const armed = play({ 'red-0': 13 }, 6, poor);

	// The six still grants the bonus roll: the skip is armed, not consumed.
	expect(armed.result.effectEvents).toEqual([{ type: 'skip', color: 'red' }]);
	expect(armed.result.state.tycoon?.skipPending.red).toBe(true);
	expect(armed.result.state.tycoon?.skipNextRoll.red).toBe(false);
	expect(armed.result.state.currentPlayer).toBe('red');
	expect(armed.result.state.phase).toBe('awaiting-roll');

	// The bonus roll is a real roll: red moves off the Customs tile.
	const bonus = rollTurn(armed.result.state, 1);
	expect(bonus.effectEvents).toEqual([]);
	const bonusMove = bonus.legalMoves.find(move => move.planeId === 'red-0');
	expect(bonusMove).toBeDefined();
	const handedOff = playResolvedMove(bonus.state, bonusMove!).state;

	// Handing the turn over activates the armed skip for red's next turn.
	expect(handedOff.tycoon?.skipPending.red).toBe(false);
	expect(handedOff.tycoon?.skipNextRoll.red).toBe(true);
	expect(handedOff.currentPlayer).toBe('yellow');

	// When red's next turn comes, the active skip consumes the roll.
	const nextTurn = rollTurn({ ...handedOff, currentPlayer: 'red' }, 4);
	expect(nextTurn.effectEvents).toEqual([{ type: 'skipped', color: 'red' }]);
	expect(nextTurn.legalMoves).toEqual([]);
	expect(nextTurn.state.tycoon?.skipNextRoll.red).toBe(false);
});

test('a shielded plane loses its shield when it moves', () => {
	const { result } = play(
		{ 'red-0': 14 },
		2,
		baseTycoon({ shields: ['red-0'] })
	);
	expect(result.state.tycoon?.shields).toEqual([]);
});

test('shield expiry before landing keeps a shield-tile pickup single', () => {
	// red progress 9 (global 8, Shield): the expired shield is re-picked once.
	const { result } = play(
		{ 'red-0': 8 },
		1,
		baseTycoon({ shields: ['red-0'] })
	);
	expect(result.state.tycoon?.shields).toEqual(['red-0']);
});

test('a blocked Boost keeps the tile landing and consumes the effect', () => {
	// Boost target 6 is held by an own plane; stacking is off.
	const { result } = play({ 'red-0': 2, 'red-1': 6 }, 1);

	expect(result.move.events).toHaveLength(1);
	expect(result.move.finalEndpoint).toMatchObject({ progress: 3 });
	expect(result.effectEvents).toEqual([]);
	expect(result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(3);
});

test('Boost from progress 48–50 respects home occupancy at 51–53', () => {
	// The reviewed map places Boost triggers only at player-relative progress
	// 3/16/29/42 (tiles) and 4/17/30/43 (via Chance), so the 48–50 trigger
	// range is exercised by temporarily promoting red progress 48's tile.
	const globalIndex = toGlobalTrackIndex('red', 48);
	const tiles = TYCOON_TILES as Map<number, TycoonTileKind>;
	const original = tiles.get(globalIndex);
	tiles.set(globalIndex, 'boost');
	try {
		// Own plane on home 51 blocks the boost: stay on 48, consume the effect.
		const blocked = play({ 'red-0': 47, 'red-1': 51 }, 1);
		expect(blocked.result.move.events).toHaveLength(1);
		expect(blocked.result.move.finalEndpoint).toMatchObject({
			kind: 'track',
			progress: 48,
		});
		expect(blocked.result.effectEvents).toEqual([]);
		expect(
			blocked.result.state.planes.find(p => p.id === 'red-0')?.progress
		).toBe(48);

		// A free home cell takes the ordinary forward relocation.
		const free = play({ 'red-0': 47, 'red-1': 52 }, 1);
		expect(free.result.move.events.map(item => item.type)).toEqual([
			'move',
			'move',
		]);
		expect(free.result.move.events[1]).toMatchObject({ distance: 3 });
		expect(free.result.move.finalEndpoint).toMatchObject({
			kind: 'home',
			progress: 51,
			homeIndex: 0,
		});
		expect(free.result.effectEvents).toEqual([
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'boost',
				toProgress: 51,
			},
		]);
		expect(free.result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(
			51
		);
	} finally {
		if (original === undefined) tiles.delete(globalIndex);
		else tiles.set(globalIndex, original);
	}
});

test('no reachable Boost trigger can enter the home lane or finish', () => {
	// Boost globals 2/28 plus the Chance globals whose boost card can fire.
	for (const color of ['red', 'yellow', 'blue', 'green'] as const) {
		for (const globalIndex of [2, 28, 3, 16, 29, 42]) {
			const progress = ((globalIndex - START_OFFSET[color] + 52) % 52) + 1;
			if (progress > SHARED_PROGRESS_MAX) continue;
			expect(progress + 3).toBeLessThanOrEqual(SHARED_PROGRESS_MAX);
		}
	}
});

test('Crash warps the mover back to the hangar', () => {
	// red 24 + 1 lands on progress 25 (global 24, a Crash tile).
	const { result } = play({ 'red-0': 24 }, 1);

	expect(result.effectEvents).toEqual([
		{
			type: 'relocation',
			planeId: 'red-0',
			effect: 'crash',
			toProgress: null,
		},
	]);
	expect(result.move.events.map(item => item.type)).toEqual(['move', 'warp']);
	expect(result.move.finalEndpoint).toEqual({ kind: 'hangar', color: 'red' });
	expect(result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(null);
});

test('a capture before a Storm retreat still counts as an actual capture', () => {
	// red lands on global 15 (Storm) where yellow-0 sits, then retreats to 13.
	const { result } = play({ 'red-0': 15, 'yellow-0': 3 }, 1);

	expect(result.capturedPlaneIds).toEqual(['yellow-0']);
	expect(result.state.stats.capturesMade.red).toBe(1);
	expect(result.move.finalEndpoint).toMatchObject({ progress: 13 });
	expect(result.state.planes.find(p => p.id === 'red-0')?.progress).toBe(13);
});

test('Standard moves keep the effective move identical and effects empty', () => {
	const { result } = play({ 'red-0': 20, 'yellow-0': 8 }, 1, null, {
		config: CLASSIC_CONFIG,
	});

	expect(result.effectEvents).toEqual([]);
	expect(result.move.events.map(item => item.type)).toEqual(['move']);
	expect(result.move.capturedPlaneIds).toEqual(['yellow-0']);
	expect(result.state.tycoon).toBeNull();
	expect(result.state.stats.capturesMade.red).toBe(1);
});
