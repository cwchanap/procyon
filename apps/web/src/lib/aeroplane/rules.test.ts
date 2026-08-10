import { describe, expect, test } from 'bun:test';
import {
	applyResolvedMove,
	getLegalMoves,
	getLegalMovesForColor,
	resolveLegalMove,
} from './rules';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
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

function colorOf(planeId: string): AeroplaneColor {
	return planeId.split('-')[0] as AeroplaneColor;
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
		pendingRoll: null,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: {
			capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
			capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
			finished: { red: 0, yellow: 0, blue: 0, green: 0 },
		},
	};
}

function stateWithPlane(
	planeId: string,
	progress: number | null,
	config: Partial<AeroplaneConfig> = {},
	extraPlanes: PlaneState[] = [],
	currentPlayer: AeroplaneColor = 'red'
): AeroplaneState {
	return stateWithPlanes(
		[{ id: planeId, color: colorOf(planeId), progress }, ...extraPlanes],
		config,
		currentPlayer
	);
}

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: colorOf(id), progress };
}

describe('Aeroplane path resolver', () => {
	test('base arrival at 30 performs the normal jump to 34', () => {
		const move = resolveLegalMove(stateWithPlane('red-0', 28), 'red-0', 2);
		expect(move?.baseEndpoint).toMatchObject({ kind: 'track', progress: 30 });
		expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 34 });
		expect(move?.events.map(event => event.type)).toEqual(['move', 'jump']);
	});

	test('long flight ends at 30 without a second jump pass', () => {
		const move = resolveLegalMove(stateWithPlane('red-0', 16), 'red-0', 2);
		expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
		expect(move?.events.map(event => event.type)).toEqual(['move', 'flight']);
	});

	test('normal jump can feed the long flight and still stops at 30', () => {
		const move = resolveLegalMove(stateWithPlane('red-0', 12), 'red-0', 2);
		expect(move?.baseEndpoint).toMatchObject({ kind: 'track', progress: 14 });
		expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
		expect(move?.events.map(event => event.type)).toEqual([
			'move',
			'jump',
			'flight',
		]);
	});

	test('launch requires an allowed roll and an empty private launch pad', () => {
		expect(
			resolveLegalMove(stateWithPlane('red-0', null), 'red-0', 5)
		).toBeNull();
		expect(
			resolveLegalMove(stateWithPlane('red-0', null), 'red-0', 6)?.finalEndpoint
		).toEqual({
			kind: 'launch',
			color: 'red',
		});
		expect(
			resolveLegalMove(
				stateWithPlane('red-0', null, {}, [plane('red-1', 0)]),
				'red-0',
				6
			)
		).toBeNull();
	});

	test('supports five-or-six launch rules', () => {
		const state = stateWithPlane(
			'yellow-0',
			null,
			{ launchRule: 'five-or-six' },
			[],
			'yellow'
		);
		expect(resolveLegalMove(state, 'yellow-0', 5)?.finalEndpoint).toEqual({
			kind: 'launch',
			color: 'yellow',
		});
	});

	test('exact rejects overshoot and bounce reflects it', () => {
		expect(
			resolveLegalMove(
				stateWithPlane('red-0', 54, { finishRule: 'exact' }),
				'red-0',
				3
			)
		).toBeNull();
		expect(
			resolveLegalMove(
				stateWithPlane('red-0', 54, { finishRule: 'bounce' }),
				'red-0',
				3
			)?.finalEndpoint
		).toMatchObject({ kind: 'home', progress: 55 });
	});

	test('rejects finished planes and invalid rolls', () => {
		expect(
			resolveLegalMove(stateWithPlane('red-0', 56), 'red-0', 1)
		).toBeNull();
		expect(resolveLegalMove(stateWithPlane('red-0', 1), 'red-0', 0)).toBeNull();
		expect(resolveLegalMove(stateWithPlane('red-0', 1), 'red-0', 7)).toBeNull();
		expect(
			resolveLegalMove(stateWithPlane('missing', null), 'red-1', 6)
		).toBeNull();
	});

	test('jump-flight chain captures only at the final endpoint', () => {
		const move = resolveLegalMove(
			stateWithPlane('red-0', 12, {}, [plane('green-0', 43)]),
			'red-0',
			2
		);
		expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
		expect(move?.capturedPlaneIds).toEqual(['green-0']);
	});

	test('captures every enemy plane in a final stack in stable order', () => {
		const move = resolveLegalMove(
			stateWithPlane('red-0', 12, { stacking: true }, [
				plane('green-0', 43),
				plane('green-1', 43),
			]),
			'red-0',
			2
		);
		expect(move?.capturedPlaneIds).toEqual(['green-0', 'green-1']);
	});

	test('launches and private home lanes never capture', () => {
		const launch = resolveLegalMove(
			stateWithPlane('red-0', null, {}, [plane('green-0', 1)]),
			'red-0',
			6
		);
		expect(launch?.capturedPlaneIds).toEqual([]);

		const home = resolveLegalMove(
			stateWithPlane('red-0', 50, {}, [plane('red-1', 54)]),
			'red-0',
			1
		);
		expect(home?.capturedPlaneIds).toEqual([]);
	});

	test('rejects private home collisions', () => {
		const state = stateWithPlane('red-0', 50, {}, [plane('red-1', 51)]);
		expect(resolveLegalMove(state, 'red-0', 1)).toBeNull();
	});

	test('allows multiple planes to accumulate at the finished cell', () => {
		const state = stateWithPlane('red-0', 55, {}, [plane('red-1', 56)]);
		const move = resolveLegalMove(state, 'red-0', 1);
		expect(move?.finalEndpoint).toEqual({ kind: 'finished', color: 'red' });
	});

	describe('stacking and blockade matrix', () => {
		const cases: Array<{
			name: string;
			config: Partial<AeroplaneConfig>;
			state: AeroplaneState;
			planeId: string;
			roll: number;
			legal: boolean;
		}> = [
			{
				name: 'stacking off rejects friendly final collision',
				config: { stacking: false, blockades: false },
				state: stateWithPlane('red-0', 1, {}, [plane('red-1', 3)]),
				planeId: 'red-0',
				roll: 2,
				legal: false,
			},
			{
				name: 'stacking on permits friendly stack creation',
				config: { stacking: true, blockades: false },
				state: stateWithPlane('red-0', 1, {}, [plane('red-1', 3)]),
				planeId: 'red-0',
				roll: 2,
				legal: true,
			},
			{
				name: 'stacking on permits a member to split from a stack',
				config: { stacking: true, blockades: false },
				state: stateWithPlane('red-0', 3, {}, [plane('red-1', 3)]),
				planeId: 'red-0',
				roll: 2,
				legal: true,
			},
			{
				name: 'blockade rejects base crossing',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 1, {}, [
					plane('yellow-0', 42),
					plane('yellow-1', 42),
				]),
				planeId: 'red-0',
				roll: 4,
				legal: false,
			},
			{
				name: 'blockade rejects landing on a blockade',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 1, {}, [
					plane('yellow-0', 44),
					plane('yellow-1', 44),
				]),
				planeId: 'red-0',
				roll: 4,
				legal: false,
			},
			{
				name: 'blockade rejects crossing a jump segment',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 12, {}, [
					plane('yellow-0', 3),
					plane('yellow-1', 3),
				]),
				planeId: 'red-0',
				roll: 2,
				legal: false,
			},
			{
				name: 'blockade checks flight entrance occupancy',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 16, {}, [
					plane('yellow-0', 5),
					plane('yellow-1', 5),
				]),
				planeId: 'red-0',
				roll: 2,
				legal: false,
			},
			{
				name: 'blockade checks flight exit occupancy',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 16, {}, [
					plane('yellow-0', 17),
					plane('yellow-1', 17),
				]),
				planeId: 'red-0',
				roll: 2,
				legal: false,
			},
			{
				name: 'a plane may leave its own blockade',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 1, {}, [plane('red-1', 1)]),
				planeId: 'red-0',
				roll: 1,
				legal: true,
			},
			{
				name: 'a third plane cannot land on an existing blockade',
				config: { stacking: true, blockades: true },
				state: stateWithPlane('red-0', 1, {}, [
					plane('red-1', 3),
					plane('red-2', 3),
				]),
				planeId: 'red-0',
				roll: 2,
				legal: false,
			},
		];

		for (const scenario of cases) {
			test(scenario.name, () => {
				const state = {
					...scenario.state,
					config: { ...scenario.state.config, ...scenario.config },
				};
				expect(
					resolveLegalMove(state, scenario.planeId, scenario.roll) !== null
				).toBe(scenario.legal);
			});
		}
	});

	test('turn-agnostic resolver can analyze an opponent plane', () => {
		const state = stateWithPlane('yellow-0', 1, {}, [], 'red');
		const move = resolveLegalMove(state, 'yellow-0', 3);
		expect(move).not.toBeNull();
		expect(state.currentPlayer).toBe('red');
	});

	test('getLegalMovesForColor filters by requested colour', () => {
		const state = stateWithPlanes([
			plane('red-0', 1),
			plane('yellow-0', 1),
			plane('blue-0', 1),
		]);
		expect(
			getLegalMovesForColor(state, 'yellow', 3).every(move =>
				move.planeId.startsWith('yellow-')
			)
		).toBe(true);
	});

	test('getLegalMoves remains current-player-only', () => {
		const state = stateWithPlanes([
			plane('red-0', 1),
			plane('yellow-0', 1),
			plane('blue-0', 1),
		]);
		expect(
			getLegalMoves(state, 3).every(move => move.planeId.startsWith('red-'))
		).toBe(true);
	});

	test('applyResolvedMove is immutable and resets captured planes to hangar', () => {
		const state = stateWithPlane('red-0', 12, {}, [plane('green-0', 43)]);
		const move = resolveLegalMove(state, 'red-0', 2);
		expect(move).not.toBeNull();
		if (!move) return;
		const transition = applyResolvedMove(state, move);
		expect(state.planes).toEqual([plane('red-0', 12), plane('green-0', 43)]);
		expect(transition.state.planes).toEqual([
			plane('red-0', 30),
			plane('green-0', null),
		]);
		expect(transition.capturedPlaneIds).toEqual(['green-0']);
	});
});
