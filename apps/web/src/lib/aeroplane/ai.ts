import { nextUint32, type RngState } from './rng';
import { applyResolvedMove, resolveLegalMove } from './rules';
import {
	FINISH_PROGRESS,
	isSharedTrackProgress,
	toGlobalTrackIndex,
	toPosition,
} from './topology';
import {
	applyTycoonEffects,
	tycoonTileKindAt,
	type TycoonLandingResult,
	type TycoonTileKind,
} from './tycoon';
import type {
	AiMoveChoice,
	AeroplanePosition,
	AeroplaneState,
	Personality,
	ResolvedMove,
} from './types';

export interface AiMoveFeatures {
	finish: number;
	enterHome: number;
	capture: number;
	jump: number;
	flight: number;
	launch: number;
	blockade: number;
	progress: number;
	exposure: number;
	/** Sky Tycoon landing-tile utility; always 0 in Standard mode. */
	tycoonTile: number;
}

export const AI_WEIGHTS = {
	cautious: {
		finish: 10000,
		enterHome: 220,
		capture: 80,
		jump: 35,
		flight: 45,
		launch: 45,
		blockade: 140,
		progress: 2,
		exposure: -150,
		tycoonTile: 1,
	},
	aggressive: {
		finish: 10000,
		enterHome: 80,
		capture: 260,
		jump: 100,
		flight: 160,
		launch: 35,
		blockade: 25,
		progress: 4,
		exposure: -35,
		tycoonTile: 1,
	},
	unpredictable: {
		finish: 10000,
		enterHome: 130,
		capture: 150,
		jump: 90,
		flight: 130,
		launch: 90,
		blockade: 70,
		progress: 3,
		exposure: -75,
		tycoonTile: 1,
	},
} as const satisfies Record<Personality, Record<keyof AiMoveFeatures, number>>;

/**
 * Small flat expectation per Sky Tycoon landing tile, shared by every
 * personality. Chance is a flat guess: cards are never simulated or drawn.
 */
export const TYCOON_TILE_UTILITY = {
	'airport-buy': 30,
	'airport-own': 5,
	'airport-toll': -25,
	chance: 10,
	boost: 25,
	tailwind: 30,
	shield: 20,
	wormhole: 25,
	storm: -25,
	customs: -20,
	tax: -10,
	crash: -60,
} as const satisfies Record<
	Exclude<TycoonTileKind, 'airport'> | `airport-${'buy' | 'own' | 'toll'}`,
	number
>;

const JITTER_MIN = -120;
const JITTER_MAX = 120;
const JITTER_RANGE = JITTER_MAX - JITTER_MIN + 1;

interface ScoredMove {
	move: ResolvedMove;
	score: number;
}

function progressOf(position: AeroplanePosition): number {
	switch (position.kind) {
		case 'hangar':
		case 'launch':
			return 0;
		case 'track':
		case 'home':
			return position.progress;
		case 'finished':
			return FINISH_PROGRESS;
	}
}

function countEventType(move: ResolvedMove, type: 'jump' | 'flight'): number {
	return move.events.filter(event => event.type === type).length;
}

function trackOccupants(
	state: AeroplaneState,
	color: ResolvedMove['color'],
	globalIndex: number
): number {
	return state.planes.filter(
		plane =>
			plane.color === color &&
			plane.progress !== null &&
			plane.progress >= 1 &&
			plane.progress <= 50 &&
			toGlobalTrackIndex(color, plane.progress) === globalIndex
	).length;
}

function formsBlockade(
	state: AeroplaneState,
	move: ResolvedMove,
	afterState: AeroplaneState
): number {
	if (!state.config.blockades) return 0;
	// The blockade must be counted where the projected mover actually stops:
	// a Tycoon relocation can carry it away from move.finalEndpoint.
	const moved = afterState.planes.find(plane => plane.id === move.planeId);
	if (moved?.progress === null || moved === undefined) return 0;
	if (!isSharedTrackProgress(moved.progress)) return 0;
	const globalIndex = toGlobalTrackIndex(move.color, moved.progress);
	const before = trackOccupants(state, move.color, globalIndex);
	const after = trackOccupants(afterState, move.color, globalIndex);
	return before < 2 && after >= 2 ? 1 : 0;
}

/**
 * Count every opponent plane/die combination that can immediately capture a
 * named plane. The resolver intentionally ignores currentPlayer, so this
 * probe is valid while another colour owns the turn.
 */
export function countImmediateCaptureThreats(
	state: AeroplaneState,
	movedPlaneId: string
): number {
	const movedPlane = state.planes.find(plane => plane.id === movedPlaneId);
	if (!movedPlane) return 0;

	let threats = 0;
	const tycoon = state.tycoon;
	for (const opponent of state.planes) {
		if (opponent.color === movedPlane.color) continue;
		// A colour due to skip its next roll (due now or armed for the next
		// handoff) cannot move next turn, so its planes threaten nothing.
		if (
			tycoon &&
			(tycoon.skipNextRoll[opponent.color] ||
				tycoon.skipPending[opponent.color])
		)
			continue;
		for (let roll = 1; roll <= 6; roll += 1) {
			const candidate = resolveLegalMove(state, opponent.id, roll);
			if (candidate?.capturedPlaneIds.includes(movedPlaneId)) threats += 1;
		}
	}
	return threats;
}

/**
 * Flat utilities apply only to outcomes the simulated landing produced: a
 * blocked Boost/Storm, a dead-end Wormhole, a paid Customs or a Tax on an
 * empty purse leave the tile neutral. Chance keeps its flat guess because
 * the undealt card is never simulated.
 */
function tycoonTileUtility(
	state: AeroplaneState,
	move: ResolvedMove,
	landing: TycoonLandingResult | null
): number {
	const tycoon = state.tycoon;
	if (!tycoon || move.finalEndpoint.kind !== 'track') return 0;
	const tile = move.finalEndpoint.globalIndex;
	const kind = tycoonTileKindAt(tile);
	if (kind === null) return 0;
	if (kind === 'chance') return TYCOON_TILE_UTILITY.chance;
	if (kind === 'airport') {
		// The projected landing already settled the outcome: a purchase
		// event means buy, a toll transfer means pay, anything else is a
		// stay on the owner's own pad or a failed purchase.
		if (landing?.events.some(event => event.type === 'airport'))
			return TYCOON_TILE_UTILITY['airport-buy'];
		if (landing?.events.some(event => event.type === 'transfer'))
			return TYCOON_TILE_UTILITY['airport-toll'];
		return tycoon.airports[tile] === move.color
			? TYCOON_TILE_UTILITY['airport-own']
			: 0;
	}
	return landing !== null && landing.events.length > 0
		? TYCOON_TILE_UTILITY[kind]
		: 0;
}

interface MoveProjection {
	state: AeroplaneState;
	landing: TycoonLandingResult | null;
}

/**
 * Project the committed move for feature extraction through the same
 * applyTycoonEffects the engine runs — shield expiry, departure pay, one
 * landing resolution and the forced relocation — except Chance: the undealt
 * card is hidden information, so the mover stays on the Chance square and
 * the flat tile utility prices the unknown draw instead of leaking the top
 * of the seeded deck.
 */
function projectAfterMove(
	state: AeroplaneState,
	move: ResolvedMove
): MoveProjection {
	return applyTycoonEffects(applyResolvedMove(state, move).state, move, {
		holdChance: true,
	});
}

export function extractAiMoveFeatures(
	state: AeroplaneState,
	move: ResolvedMove
): AiMoveFeatures {
	const { state: afterState, landing } = projectAfterMove(state, move);
	const startProgress = progressOf(move.start);
	// The committed destination is where the projected mover actually stops:
	// a forced relocation (crash, boost, warp) moves it off move.finalEndpoint.
	const movedPlane = afterState.planes.find(plane => plane.id === move.planeId);
	const finalEndpoint = toPosition(
		move.color,
		movedPlane === undefined ? null : movedPlane.progress
	);
	const finalProgress = progressOf(finalEndpoint);

	return {
		finish: finalEndpoint.kind === 'finished' ? 1 : 0,
		enterHome:
			finalEndpoint.kind === 'home' && move.start.kind !== 'home' ? 1 : 0,
		capture: move.capturedPlaneIds.length,
		jump: countEventType(move, 'jump'),
		flight: countEventType(move, 'flight'),
		launch:
			move.start.kind === 'hangar' && move.finalEndpoint.kind === 'launch'
				? 1
				: 0,
		blockade: formsBlockade(state, move, afterState),
		progress: finalProgress - startProgress,
		exposure: countImmediateCaptureThreats(afterState, move.planeId),
		tycoonTile: tycoonTileUtility(afterState, move, landing),
	};
}

export function scoreAiMove(
	features: AiMoveFeatures,
	personality: Personality
): number {
	const weights = AI_WEIGHTS[personality];
	return (
		features.finish * weights.finish +
		features.enterHome * weights.enterHome +
		features.capture * weights.capture +
		features.jump * weights.jump +
		features.flight * weights.flight +
		features.launch * weights.launch +
		features.blockade * weights.blockade +
		features.progress * weights.progress +
		features.exposure * weights.exposure +
		features.tycoonTile * weights.tycoonTile
	);
}

function selectTie(
	scored: ScoredMove[],
	topScore: number,
	rng: RngState
): { move: ResolvedMove; rng: RngState } {
	const top = scored.filter(item => item.score === topScore);
	if (top.length === 1) return { move: top[0]!.move, rng };
	const sample = nextUint32(rng);
	return {
		move: top[sample.value % top.length]!.move,
		rng: sample.rng,
	};
}

function assertPersonality(personality: Personality): void {
	if (!(personality in AI_WEIGHTS)) {
		throw new RangeError(
			`Unknown Aeroplane AI personality: ${String(personality)}`
		);
	}
}

/** Select one legal move using deterministic, local personality scoring. */
export function chooseAiMove(
	state: AeroplaneState,
	legalMoves: ResolvedMove[],
	personality: Personality,
	rng: RngState
): AiMoveChoice {
	assertPersonality(personality);
	if (legalMoves.length === 0) {
		throw new RangeError(
			'Cannot choose an Aeroplane AI move without legal moves'
		);
	}

	let nextRng = rng;
	const scored: ScoredMove[] = [];
	for (const move of legalMoves) {
		const baseScore = scoreAiMove(
			extractAiMoveFeatures(state, move),
			personality
		);
		if (personality !== 'unpredictable') {
			scored.push({ move, score: baseScore });
			continue;
		}

		const sample = nextUint32(nextRng);
		nextRng = sample.rng;
		const jitter = (sample.value % JITTER_RANGE) + JITTER_MIN;
		scored.push({ move, score: baseScore + jitter });
	}

	const topScore = Math.max(...scored.map(item => item.score));
	return selectTie(scored, topScore, nextRng);
}
