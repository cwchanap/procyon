import { describe, expect, test } from 'bun:test';
import { CLASSIC_CONFIG } from './game';
import { TYCOON_AIRPORT_PRICE } from './tycoon';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneColor,
	AeroplaneState,
	AeroplaneStats,
	AeroplaneTransition,
	ResolvedMove,
	SkyTycoonState,
} from './types';
import type { RewardMatchInput, SkinId, StarBreakdown } from './rewards';
import {
	SKIN_CATALOG,
	deriveHumanMoment,
	getUnlockedSkins,
	scoreMatch,
} from './rewards';
import type {
	AeroplanePlayHistoryDetails,
	ServerPlayHistory,
	SubmitPlayHistoryInput,
} from '../play-history';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const HUMAN: AeroplaneColor = CLASSIC_CONFIG.humanColor;

const ZERO_STATS: AeroplaneStats = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

function tycoonWith(
	coins: Partial<Record<AeroplaneColor, number>> = {}
): SkyTycoonState {
	return {
		coins: { red: 10, yellow: 10, blue: 10, green: 10, ...coins },
		airports: {},
		shields: [],
		skipPending: { red: false, yellow: false, blue: false, green: false },
		skipNextRoll: { red: false, yellow: false, blue: false, green: false },
		chanceOrder: [...TYCOON_CHANCE_CARDS],
		chanceCursor: 0,
	};
}

function stateWith(
	options: {
		coins?: Partial<Record<AeroplaneColor, number>>;
		standard?: boolean;
		stats?: AeroplaneStats;
	} = {}
): AeroplaneState {
	return {
		config: {
			...CLASSIC_CONFIG,
			mode: options.standard ? 'standard' : 'sky-tycoon',
		},
		currentPlayer: HUMAN,
		phase: 'awaiting-choice',
		pendingRoll: null,
		planes: [],
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: options.stats ?? ZERO_STATS,
		tycoon: options.standard ? null : tycoonWith(options.coins),
	};
}

function moveFor(color: AeroplaneColor, captured: number): ResolvedMove {
	return {
		planeId: `${color}-0`,
		color,
		roll: 6,
		start: { kind: 'hangar', color },
		baseEndpoint: { kind: 'launch', color },
		finalEndpoint: { kind: 'launch', color },
		events: [],
		capturedPlaneIds: Array.from(
			{ length: captured },
			(_, index) => `target-${index}`
		),
	};
}

function transitionTo(
	prev: AeroplaneState,
	mover: AeroplaneColor,
	captured: number,
	afterCoins?: Partial<Record<AeroplaneColor, number>>
): AeroplaneTransition {
	const move = moveFor(mover, captured);
	return {
		state: afterCoins ? { ...prev, tycoon: tycoonWith(afterCoins) } : prev,
		move,
		events: [],
		effectEvents: [],
		capturedPlaneIds: move.capturedPlaneIds,
	};
}

const BASE_DETAILS: AeroplanePlayHistoryDetails = {
	mode: 'sky-tycoon',
	coins: { red: 10, yellow: 10, blue: 10, green: 10 },
	rulePreset: 'classic',
	victoryTarget: 4,
	diceMode: 'fair',
	launchRule: 'six',
	finishRule: 'exact',
	stacking: false,
	blockades: false,
	chatter: false,
	humanColor: 'red',
	durationSeconds: 60,
	planesFinished: 0,
	capturesMade: 0,
	capturesSuffered: 0,
	aiPlayers: [],
};

function rowWith(
	overrides: Partial<RewardMatchInput> = {},
	detailsOverrides: Record<string, unknown> = {}
): RewardMatchInput {
	return {
		gameId: 'aeroplane',
		status: 'win',
		opponentEngineId: 'aeroplane-trio-v1',
		details: { ...BASE_DETAILS, ...detailsOverrides },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Skin catalog
// ---------------------------------------------------------------------------

describe('SKIN_CATALOG', () => {
	test('lists every skin once, in ascending threshold order', () => {
		expect(SKIN_CATALOG.map(entry => entry.id)).toEqual([
			'classic',
			'contrail',
			'racer',
			'starlight',
			'ace',
		]);
		expect(SKIN_CATALOG.map(entry => entry.stars)).toEqual([
			0, 20, 60, 140, 300,
		]);
	});
});

describe('getUnlockedSkins', () => {
	test('unlocks exactly at each threshold boundary', () => {
		const cases: Array<[number, SkinId[]]> = [
			[0, ['classic']],
			[19, ['classic']],
			[20, ['classic', 'contrail']],
			[59, ['classic', 'contrail']],
			[60, ['classic', 'contrail', 'racer']],
			[139, ['classic', 'contrail', 'racer']],
			[140, ['classic', 'contrail', 'racer', 'starlight']],
			[299, ['classic', 'contrail', 'racer', 'starlight']],
			[300, ['classic', 'contrail', 'racer', 'starlight', 'ace']],
			[1000, ['classic', 'contrail', 'racer', 'starlight', 'ace']],
		];
		for (const [stars, expected] of cases) {
			expect(getUnlockedSkins(stars)).toEqual(expected);
		}
	});
});

// ---------------------------------------------------------------------------
// scoreMatch — exact star totals and caps
// ---------------------------------------------------------------------------

describe('scoreMatch', () => {
	describe('exact totals and caps', () => {
		const cases: Array<{
			name: string;
			row: RewardMatchInput;
			expected: StarBreakdown;
		}> = [
			{
				name: 'standard loss with nothing else scores zero',
				row: rowWith({ status: 'loss' }, { mode: 'standard' }),
				expected: { win: 0, captures: 0, finished: 0, coins: 0, total: 0 },
			},
			{
				name: 'standard win is exactly 10',
				row: rowWith({}, { mode: 'standard' }),
				expected: { win: 10, captures: 0, finished: 0, coins: 0, total: 10 },
			},
			{
				name: 'captures award 2 stars each',
				row: rowWith({ status: 'loss' }, { capturesMade: 9 }),
				expected: { win: 0, captures: 18, finished: 0, coins: 0, total: 18 },
			},
			{
				name: 'captures cap at 10 captures (20 stars)',
				row: rowWith({ status: 'loss' }, { capturesMade: 15 }),
				expected: { win: 0, captures: 20, finished: 0, coins: 0, total: 20 },
			},
			{
				name: 'finished planes award 3 stars each up to 4',
				row: rowWith({ status: 'loss' }, { planesFinished: 4 }),
				expected: { win: 0, captures: 0, finished: 12, coins: 0, total: 12 },
			},
			{
				name: 'tycoon balance at the starting 10 coins scores no bonus',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 10, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 0, total: 0 },
			},
			{
				name: 'tycoon surplus below 5 coins rounds down to zero',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 14, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 0, total: 0 },
			},
			{
				name: 'tycoon surplus of exactly 5 coins scores 1',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 15, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 1, total: 1 },
			},
			{
				name: 'tycoon bonus scales at 5 coins per star',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 34, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 4, total: 4 },
			},
			{
				name: 'tycoon bonus reaches its cap of 10 exactly at 60 coins',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 60, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 10, total: 10 },
			},
			{
				name: 'tycoon bonus clamps above the cap',
				row: rowWith(
					{ status: 'loss' },
					{ coins: { red: 100, yellow: 10, blue: 10, green: 10 } }
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 10, total: 10 },
			},
			{
				name: 'standard rows ignore coin balances entirely',
				row: rowWith(
					{ status: 'loss' },
					{
						mode: 'standard',
						coins: { red: 100, yellow: 10, blue: 10, green: 10 },
					}
				),
				expected: { win: 0, captures: 0, finished: 0, coins: 0, total: 0 },
			},
			{
				name: 'legacy row without mode scores as Standard',
				row: rowWith({ status: 'win' }, { mode: undefined, coins: undefined }),
				expected: { win: 10, captures: 0, finished: 0, coins: 0, total: 10 },
			},
			{
				name: 'every row combines: win + capped captures + planes + capped coins',
				row: rowWith(
					{},
					{
						capturesMade: 12,
						planesFinished: 4,
						coins: { red: 99, yellow: 10, blue: 10, green: 10 },
					}
				),
				expected: { win: 10, captures: 20, finished: 12, coins: 10, total: 52 },
			},
		];

		for (const { name, row, expected } of cases) {
			test(name, () => {
				expect(scoreMatch(row)).toEqual(expected);
			});
		}
	});

	describe('invalid histories are skipped, not thrown', () => {
		const cases: Array<{ name: string; row: RewardMatchInput }> = [
			{ name: 'other game variant', row: rowWith({ gameId: 'chess' }) },
			{
				name: 'other engine opponent',
				row: rowWith({ opponentEngineId: 'stockfish' }),
			},
			{
				name: 'null engine opponent',
				row: rowWith({ opponentEngineId: null }),
			},
			{
				name: 'missing engine opponent',
				row: rowWith({ opponentEngineId: undefined }),
			},
			{ name: 'draw status', row: rowWith({ status: 'draw' }) },
			{ name: 'null details', row: rowWith({ details: null }) },
			{ name: 'missing details', row: rowWith({ details: undefined }) },
			{ name: 'non-object details', row: rowWith({ details: 'wins?' }) },
			{
				name: 'missing humanColor',
				row: rowWith({}, { humanColor: undefined }),
			},
			{
				name: 'unknown humanColor',
				row: rowWith({}, { humanColor: 'purple' }),
			},
			{ name: 'negative captures', row: rowWith({}, { capturesMade: -1 }) },
			{ name: 'fractional captures', row: rowWith({}, { capturesMade: 1.5 }) },
			{ name: 'NaN captures', row: rowWith({}, { capturesMade: Number.NaN }) },
			{ name: 'string captures', row: rowWith({}, { capturesMade: '3' }) },
			{
				name: 'missing captures',
				row: rowWith({}, { capturesMade: undefined }),
			},
			{
				name: 'planesFinished beyond four planes',
				row: rowWith({}, { planesFinished: 5 }),
			},
			{
				name: 'fractional planesFinished',
				row: rowWith({}, { planesFinished: 2.5 }),
			},
			{
				name: 'missing planesFinished',
				row: rowWith({}, { planesFinished: undefined }),
			},
			{ name: 'unknown mode', row: rowWith({}, { mode: 'bogus' }) },
			{
				name: 'sky-tycoon without coin balances',
				row: rowWith({}, { coins: undefined }),
			},
			{
				name: 'sky-tycoon coins missing the human colour',
				row: rowWith({}, { coins: { yellow: 10, blue: 10, green: 10 } }),
			},
			{
				name: 'negative human coin balance',
				row: rowWith(
					{},
					{ coins: { red: -3, yellow: 10, blue: 10, green: 10 } }
				),
			},
			{
				name: 'non-numeric human coin balance',
				row: rowWith(
					{},
					{ coins: { red: 'many', yellow: 10, blue: 10, green: 10 } }
				),
			},
		];

		for (const { name, row } of cases) {
			test(name, () => {
				expect(scoreMatch(row)).toBeNull();
			});
		}
	});

	test('terminal payload and its saved row score identically through scoreMatch', () => {
		const details = {
			...BASE_DETAILS,
			coins: { red: 23, yellow: 10, blue: 10, green: 10 },
			planesFinished: 3,
			capturesMade: 7,
		};
		// Object literal matching buildAeroplaneHistoryPayload's documented
		// status/details shape (the builder itself is exported in Task 2).
		const payload: SubmitPlayHistoryInput = {
			gameId: 'aeroplane',
			status: 'win',
			date: '2026-01-01T00:00:00.000Z',
			opponentEngineId: 'aeroplane-trio-v1',
			details,
		};
		const savedRow: ServerPlayHistory = {
			id: 42,
			gameId: 'aeroplane',
			date: '2026-01-01T00:00:00.000Z',
			status: 'win',
			opponentUserId: null,
			opponentLlmId: null,
			opponentEngineId: 'aeroplane-trio-v1',
			details,
			ratingChange: null,
			newRating: null,
		};

		const fromPayload = scoreMatch(payload);
		// win 10 + captures 2×7 + finished 3×3 + coins floor(13/5) = 35
		expect(fromPayload).toEqual({
			win: 10,
			captures: 14,
			finished: 9,
			coins: 2,
			total: 35,
		});
		expect(scoreMatch(savedRow)).toEqual(fromPayload);
	});
});

// ---------------------------------------------------------------------------
// deriveHumanMoment
// ---------------------------------------------------------------------------

describe('deriveHumanMoment', () => {
	test('labels 2–4 captures and 5+ as multi-capture', () => {
		const prev = stateWith();
		const cases: Array<[number, string]> = [
			[2, 'Double capture!'],
			[3, 'Triple capture!'],
			[4, 'Quadruple capture!'],
			[5, 'Multi-capture (5)!'],
			[7, 'Multi-capture (7)!'],
		];
		for (const [captured, label] of cases) {
			expect(
				deriveHumanMoment(prev, transitionTo(prev, HUMAN, captured), HUMAN)
			).toEqual({ kind: 'capture', label, captures: captured });
		}
	});

	test('a single capture never qualifies, even with captures already accumulated', () => {
		const prev = stateWith({
			stats: {
				...ZERO_STATS,
				capturesMade: { red: 3, yellow: 0, blue: 0, green: 0 },
			},
		});
		expect(
			deriveHumanMoment(prev, transitionTo(prev, HUMAN, 1), HUMAN)
		).toBeNull();
	});

	test('AI multi-captures are not human moments', () => {
		const prev = stateWith();
		expect(
			deriveHumanMoment(prev, transitionTo(prev, 'yellow', 3), HUMAN)
		).toBeNull();
	});

	test('automatic airport purchase (−5) is ignored', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, HUMAN, 0, { red: 5 });
		expect(deriveHumanMoment(prev, transition, HUMAN)).toBeNull();
	});

	test('gains below the airport price are ignored', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, 'yellow', 0, {
			red: 10 + TYCOON_AIRPORT_PRICE - 1,
		});
		expect(deriveHumanMoment(prev, transition, HUMAN)).toBeNull();
	});

	test('a gain of exactly the airport price qualifies', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, 'yellow', 0, {
			red: 10 + TYCOON_AIRPORT_PRICE,
		});
		expect(deriveHumanMoment(prev, transition, HUMAN)).toEqual({
			kind: 'coins',
			label: 'Big coin gain!',
			coinGain: TYCOON_AIRPORT_PRICE,
		});
	});

	test('the emitted coinGain is the raw delta, however large', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, 'yellow', 0, { red: 35 });
		expect(deriveHumanMoment(prev, transition, HUMAN)).toEqual({
			kind: 'coins',
			label: 'Big coin gain!',
			coinGain: 25,
		});
	});

	test('an AI move paying the human still produces the coin moment', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, 'green', 0, { red: 16 });
		expect(deriveHumanMoment(prev, transition, HUMAN)).toEqual({
			kind: 'coins',
			label: 'Big coin gain!',
			coinGain: 6,
		});
	});

	test('a capture wins when a coin gain happens on the same move', () => {
		const prev = stateWith({ coins: { red: 10 } });
		const transition = transitionTo(prev, HUMAN, 2, { red: 16 });
		expect(deriveHumanMoment(prev, transition, HUMAN)).toEqual({
			kind: 'capture',
			label: 'Double capture!',
			captures: 2,
		});
	});

	test('standard mode has no coin moments but still reports human captures', () => {
		const prev = stateWith({ standard: true });
		expect(
			deriveHumanMoment(prev, transitionTo(prev, 'blue', 0), HUMAN)
		).toBeNull();
		expect(
			deriveHumanMoment(prev, transitionTo(prev, HUMAN, 2), HUMAN)
		).toEqual({ kind: 'capture', label: 'Double capture!', captures: 2 });
	});
});
