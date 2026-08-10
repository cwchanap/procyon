import { expect, test } from 'bun:test';
import { resolveLegalMove } from './rules';
import {
	CLASSIC_CONFIG,
	QUICK_CONFIG,
	createAeroplaneMatch,
	playResolvedMove,
	rollTurn,
	seatAIs,
} from './game';
import { TURN_ORDER } from './topology';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	AeroplaneStats,
	PlaneState,
} from './types';

const STATS: AeroplaneStats = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

function stateWithPlanes(
	planes: PlaneState[],
	config: AeroplaneConfig = CLASSIC_CONFIG,
	currentPlayer: AeroplaneColor = 'red',
	phase: AeroplaneState['phase'] = 'awaiting-roll',
	pendingRoll: number | null = null,
	extra: Partial<AeroplaneState> = {}
): AeroplaneState {
	return {
		config,
		currentPlayer,
		phase,
		pendingRoll,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: STATS,
		...extra,
	};
}

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: id.split('-')[0] as AeroplaneColor, progress };
}

const seatCases = [
	[
		'red',
		[
			['yellow', 'cautious'],
			['blue', 'aggressive'],
			['green', 'unpredictable'],
		],
	],
	[
		'yellow',
		[
			['blue', 'cautious'],
			['green', 'aggressive'],
			['red', 'unpredictable'],
		],
	],
	[
		'blue',
		[
			['green', 'cautious'],
			['red', 'aggressive'],
			['yellow', 'unpredictable'],
		],
	],
	[
		'green',
		[
			['red', 'cautious'],
			['yellow', 'aggressive'],
			['blue', 'unpredictable'],
		],
	],
] as const;

for (const [humanColor, expected] of seatCases) {
	test(`seats AIs clockwise when human is ${humanColor}`, () => {
		expect(
			seatAIs(humanColor).map(seat => [seat.color, seat.personality])
		).toEqual(expected.map(pair => [...pair]));
	});
}

test('red always starts', () => {
	for (const humanColor of TURN_ORDER) {
		expect(
			createAeroplaneMatch({ ...CLASSIC_CONFIG, humanColor }, 39101).state
				.currentPlayer
		).toBe('red');
	}
});

test('classic and quick presets normalize their exact rule values', () => {
	expect(createAeroplaneMatch(CLASSIC_CONFIG, 1).state.config).toEqual(
		CLASSIC_CONFIG
	);
	expect(createAeroplaneMatch({ ...QUICK_CONFIG }, 1).state.config).toEqual(
		QUICK_CONFIG
	);
});

test('game rejects a resolved move belonging to the wrong player', () => {
	const state = stateWithPlanes(
		[plane('red-0', 1), plane('yellow-0', 1)],
		CLASSIC_CONFIG,
		'red',
		'awaiting-choice',
		3
	);
	const yellowMove = resolveLegalMove(state, 'yellow-0', 3);

	expect(yellowMove).not.toBeNull();
	if (!yellowMove) return;
	expect(() => playResolvedMove(state, yellowMove)).toThrow(/current player/i);
});

test('six grants another turn even when no legal move exists', () => {
	const state = stateWithPlanes([
		plane('red-0', 56),
		plane('red-1', 56),
		plane('red-2', 56),
		plane('red-3', 56),
	]);
	const result = rollTurn(state, 6);

	expect(result.state.currentPlayer).toBe('red');
	expect(result.state.phase).toBe('awaiting-roll');
});

test('green to red completes a round on a non-six', () => {
	const state = stateWithPlanes(
		[plane('green-0', 1)],
		CLASSIC_CONFIG,
		'green',
		'awaiting-choice',
		4,
		{ roundNumber: 2 }
	);
	const move = resolveLegalMove(state, 'green-0', 4);

	expect(move).not.toBeNull();
	if (!move) return;
	const result = playResolvedMove(state, move);

	expect(result.state.currentPlayer).toBe('red');
	expect(result.state.roundNumber).toBe(3);
});

test('last-place duration increments tied minimum scores and resets others', () => {
	const state = stateWithPlanes(
		[
			plane('red-0', 20),
			plane('yellow-0', 5),
			plane('blue-0', null),
			plane('green-0', 1),
		],
		CLASSIC_CONFIG,
		'green',
		'awaiting-choice',
		4,
		{
			roundNumber: 2,
			lastPlaceRounds: { red: 2, yellow: 1, blue: 3, green: 2 },
		}
	);
	const move = resolveLegalMove(state, 'green-0', 4);

	expect(move).not.toBeNull();
	if (!move) return;
	const result = playResolvedMove(state, move);

	expect(result.state.lastPlaceRounds).toEqual({
		red: 0,
		yellow: 0,
		blue: 4,
		green: 0,
	});

	const nextRoundState: AeroplaneState = {
		...result.state,
		currentPlayer: 'green',
		phase: 'awaiting-choice',
		pendingRoll: 4,
	};
	const nextMove = resolveLegalMove(nextRoundState, 'green-0', 4);

	expect(nextMove).not.toBeNull();
	if (!nextMove) return;
	const nextResult = playResolvedMove(nextRoundState, nextMove);

	expect(nextResult.state.lastPlaceRounds).toEqual({
		red: 0,
		yellow: 0,
		blue: 5,
		green: 0,
	});
});

test('Quick finishes at two planes and has no draw state', () => {
	const state = stateWithPlanes(
		[
			plane('red-0', 56),
			plane('red-1', 55),
			plane('red-2', null),
			plane('red-3', null),
		],
		QUICK_CONFIG,
		'red',
		'awaiting-choice',
		1,
		{ stats: { ...STATS, finished: { ...STATS.finished, red: 1 } } }
	);
	const move = resolveLegalMove(state, 'red-1', 1);

	expect(move).not.toBeNull();
	if (!move) return;
	const result = playResolvedMove(state, move);

	expect(result.state.phase).toBe('finished');
	expect(result.state.winner).toBe('red');
	expect(result.state.phase).not.toBe('draw');
});

test('rollTurn rejects a roll outside the awaiting-roll phase', () => {
	const state = stateWithPlanes(
		[plane('red-0', 1)],
		CLASSIC_CONFIG,
		'red',
		'awaiting-choice',
		3
	);

	expect(() => rollTurn(state, 3)).toThrow(/awaiting-roll/);
});

test('playResolvedMove rejects a move outside the awaiting-choice phase', () => {
	const state = stateWithPlanes(
		[plane('red-0', 1)],
		CLASSIC_CONFIG,
		'red',
		'awaiting-roll',
		null
	);
	const move = resolveLegalMove(state, 'red-0', 3);
	expect(move).not.toBeNull();
	if (!move) return;

	expect(() => playResolvedMove(state, move)).toThrow(/awaiting-choice/);
});
