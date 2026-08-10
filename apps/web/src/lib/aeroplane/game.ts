import { applyResolvedMove, getLegalMoves } from './rules';
import { rollDice, type DiceResult } from './dice';
import { TURN_ORDER, FINISH_PROGRESS } from './topology';
import { deriveRngStreams, normalizeRngState, type RngState } from './rng';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	AeroplaneStats,
	AeroplaneTransition,
	AiSeat,
	Personality,
	PlaneState,
	ResolvedMove,
} from './types';

export const CLASSIC_CONFIG: AeroplaneConfig = {
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

export const QUICK_CONFIG: AeroplaneConfig = {
	rulePreset: 'quick-chill',
	victoryTarget: 2,
	diceMode: 'relaxed',
	launchRule: 'five-or-six',
	finishRule: 'bounce',
	stacking: false,
	blockades: false,
	humanColor: 'red',
	chatter: false,
};

export interface AeroplaneMatch {
	rootSeed: number;
	state: AeroplaneState;
	seats: AiSeat[];
	diceRng: RngState;
	aiRng: RngState;
}

export interface AeroplaneRollResult {
	state: AeroplaneState;
	roll: number;
	legalMoves: ResolvedMove[];
	rng: RngState | null;
}

function cloneStats(stats: AeroplaneStats): AeroplaneStats {
	return {
		capturesMade: { ...stats.capturesMade },
		capturesSuffered: { ...stats.capturesSuffered },
		finished: { ...stats.finished },
	};
}

function zeroStats(): AeroplaneStats {
	return {
		capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
		capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
		finished: { red: 0, yellow: 0, blue: 0, green: 0 },
	};
}

function cloneCounters(
	values: Record<AeroplaneColor, number>
): Record<AeroplaneColor, number> {
	return { ...values };
}

/** Apply the two reviewed setup dependencies without mutating caller data. */
export function normalizeConfig(
	input: Partial<AeroplaneConfig> = {}
): AeroplaneConfig {
	const preset = input.rulePreset ?? 'classic';
	const base = preset === 'quick-chill' ? QUICK_CONFIG : CLASSIC_CONFIG;
	const config: AeroplaneConfig = {
		...base,
		...input,
		rulePreset: preset,
	};

	if (config.blockades) config.stacking = true;
	if (!config.stacking) config.blockades = false;
	return config;
}

/** Assign the three AI personalities in clockwise order after the human. */
export function seatAIs(humanColor: AeroplaneColor): AiSeat[] {
	const humanIndex = TURN_ORDER.indexOf(humanColor);
	if (humanIndex < 0)
		throw new RangeError(`Unknown Aeroplane colour: ${humanColor}`);
	const personalities: Personality[] = [
		'cautious',
		'aggressive',
		'unpredictable',
	];
	return personalities.map((personality, offset) => ({
		color: TURN_ORDER[(humanIndex + offset + 1) % TURN_ORDER.length]!,
		personality,
	}));
}

function initialPlanes(): PlaneState[] {
	return TURN_ORDER.flatMap(color =>
		Array.from({ length: 4 }, (_, index) => ({
			id: `${color}-${index}`,
			color,
			progress: null,
		}))
	);
}

/** Build a fresh immutable-input match with red selected for the first turn. */
export function createAeroplaneMatch(
	input: Partial<AeroplaneConfig> = CLASSIC_CONFIG,
	rootSeed = Date.now()
): AeroplaneMatch {
	const config = normalizeConfig(input);
	const streams = deriveRngStreams(rootSeed);
	const state: AeroplaneState = {
		config,
		currentPlayer: 'red',
		phase: 'awaiting-roll',
		pendingRoll: null,
		planes: initialPlanes(),
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: zeroStats(),
	};
	return {
		rootSeed: normalizeRngState(rootSeed).value,
		state,
		seats: seatAIs(config.humanColor),
		diceRng: streams.dice,
		aiRng: streams.ai,
	};
}

function nextColor(color: AeroplaneColor): AeroplaneColor {
	const index = TURN_ORDER.indexOf(color);
	return TURN_ORDER[(index + 1) % TURN_ORDER.length]!;
}

function isValidRoll(roll: number): boolean {
	return Number.isInteger(roll) && roll >= 1 && roll <= 6;
}

function moveEquivalent(a: ResolvedMove, b: ResolvedMove): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function progressScore(state: AeroplaneState, color: AeroplaneColor): number {
	let finishedPlanes = 0;
	let activeProgress = 0;
	for (const plane of state.planes) {
		if (plane.color !== color || plane.progress === null) continue;
		if (plane.progress === FINISH_PROGRESS) {
			finishedPlanes += 1;
		} else {
			activeProgress += plane.progress;
		}
	}
	return finishedPlanes * 1000 + activeProgress;
}

function boundaryLastPlaceRounds(
	state: AeroplaneState
): Record<AeroplaneColor, number> {
	// A completed non-six green turn is the only authoritative round boundary.
	// Every colour tied for the minimum progress remains in last place; colours
	// above that minimum leave last place and reset their duration.
	const scores = {} as Record<AeroplaneColor, number>;
	for (const color of TURN_ORDER) scores[color] = progressScore(state, color);
	const minimum = Math.min(...TURN_ORDER.map(color => scores[color]));
	const result = { ...state.lastPlaceRounds };
	for (const color of TURN_ORDER) {
		result[color] =
			scores[color] === minimum ? state.lastPlaceRounds[color] + 1 : 0;
	}
	return result;
}

function advanceAfterTurn(
	state: AeroplaneState,
	roll: number,
	noMove: boolean
): AeroplaneState {
	const samePlayer = roll === 6;
	const crossesRound = !samePlayer && state.currentPlayer === 'green';
	const nextRoundNumber = state.roundNumber + (crossesRound ? 1 : 0);
	const nextPlayer = samePlayer
		? state.currentPlayer
		: nextColor(state.currentPlayer);
	const noMoveStreak = cloneCounters(state.noMoveStreak);
	if (noMove) noMoveStreak[state.currentPlayer] += 1;
	const lastPlaceRounds = crossesRound
		? boundaryLastPlaceRounds(state)
		: cloneCounters(state.lastPlaceRounds);

	return {
		...state,
		currentPlayer: nextPlayer,
		phase: 'awaiting-roll',
		pendingRoll: null,
		turnNumber: state.turnNumber + 1,
		noMoveStreak,
		lastPlaceRounds,
		roundNumber: nextRoundNumber,
	};
}

export type RollInput = RngState | number | DiceResult | (() => number);

function parseRollInput(
	state: AeroplaneState,
	input: RollInput
): { roll: number; rng: RngState | null } {
	if (typeof input === 'number') return { roll: input, rng: null };
	if (typeof input === 'function') return { roll: input(), rng: null };
	if ('roll' in input) return { roll: input.roll, rng: input.rng };
	const result = rollDice(state, input);
	return { roll: result.roll, rng: result.rng };
}

/**
 * Roll for the current player. A roll with no legal moves completes the skip
 * here; otherwise the authoritative state waits for move selection.
 */
export function rollTurn(
	state: AeroplaneState,
	rngOrFixedRoll: RollInput
): AeroplaneRollResult {
	if (state.phase !== 'awaiting-roll') {
		throw new Error('A turn can only be rolled while awaiting-roll');
	}
	const { roll, rng } = parseRollInput(state, rngOrFixedRoll);
	if (!isValidRoll(roll))
		throw new RangeError('Aeroplane roll must be 1 through 6');
	const legalMoves = getLegalMoves(state, roll);
	if (legalMoves.length === 0) {
		return {
			state: advanceAfterTurn(state, roll, true),
			roll,
			legalMoves,
			rng,
		};
	}
	return {
		state: {
			...state,
			phase: 'awaiting-choice',
			pendingRoll: roll,
			planes: state.planes.map(plane => ({ ...plane })),
			stats: cloneStats(state.stats),
		},
		roll,
		legalMoves,
		rng,
	};
}

function updateStats(
	state: AeroplaneState,
	move: ResolvedMove
): AeroplaneStats {
	const stats = cloneStats(state.stats);
	stats.capturesMade[move.color] += move.capturedPlaneIds.length;
	for (const capturedId of move.capturedPlaneIds) {
		const captured = state.planes.find(plane => plane.id === capturedId);
		if (captured) stats.capturesSuffered[captured.color] += 1;
	}
	if (move.finalEndpoint.kind === 'finished') stats.finished[move.color] += 1;
	return stats;
}

function finishedCount(state: AeroplaneState, color: AeroplaneColor): number {
	return state.planes.filter(
		plane => plane.color === color && plane.progress === FINISH_PROGRESS
	).length;
}

/**
 * Apply a selected move only when it is still legal for the current player and
 * pending roll. This is the gameplay ownership boundary around the pure rules
 * resolver.
 */
export function playResolvedMove(
	state: AeroplaneState,
	move: ResolvedMove
): AeroplaneTransition {
	if (state.phase !== 'awaiting-choice' || state.pendingRoll === null) {
		throw new Error('A move can only be played while awaiting-choice');
	}
	if (move.color !== state.currentPlayer) {
		throw new Error('Move does not belong to the current player');
	}
	const legalMoves = getLegalMoves(state, state.pendingRoll);
	const legalMove = legalMoves.find(
		candidate => candidate.planeId === move.planeId
	);
	if (!legalMove || !moveEquivalent(legalMove, move)) {
		throw new Error('Move is not legal for the current player and roll');
	}

	const transition = applyResolvedMove(state, legalMove);
	const stats = updateStats(state, legalMove);
	const finished = finishedCount(transition.state, legalMove.color);
	const hasWon = finished >= state.config.victoryTarget;
	let nextState: AeroplaneState = {
		...transition.state,
		stats,
		noMoveStreak: {
			...state.noMoveStreak,
			[legalMove.color]: 0,
		},
		pendingRoll: null,
	};
	if (hasWon) {
		nextState = {
			...nextState,
			phase: 'finished',
			winner: legalMove.color,
			turnNumber: state.turnNumber + 1,
		};
	} else {
		nextState = advanceAfterTurn(nextState, legalMove.roll, false);
	}

	return {
		...transition,
		state: nextState,
	};
}
