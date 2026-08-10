import { nextUint32, type RngState } from './rng';
import { applyResolvedMove, resolveLegalMove } from './rules';
import { FINISH_PROGRESS, toGlobalTrackIndex } from './topology';
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
	},
} as const satisfies Record<Personality, Record<keyof AiMoveFeatures, number>>;

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
	if (!state.config.blockades || move.finalEndpoint.kind !== 'track') return 0;
	const before = trackOccupants(
		state,
		move.color,
		move.finalEndpoint.globalIndex
	);
	const after = trackOccupants(
		afterState,
		move.color,
		move.finalEndpoint.globalIndex
	);
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
	for (const opponent of state.planes) {
		if (opponent.color === movedPlane.color) continue;
		for (let roll = 1; roll <= 6; roll += 1) {
			const candidate = resolveLegalMove(state, opponent.id, roll);
			if (candidate?.capturedPlaneIds.includes(movedPlaneId)) threats += 1;
		}
	}
	return threats;
}

export function extractAiMoveFeatures(
	state: AeroplaneState,
	move: ResolvedMove
): AiMoveFeatures {
	const afterState = applyResolvedMove(state, move).state;
	const startProgress = progressOf(move.start);
	const finalProgress = progressOf(move.finalEndpoint);

	return {
		finish: move.finalEndpoint.kind === 'finished' ? 1 : 0,
		enterHome:
			move.finalEndpoint.kind === 'home' && move.start.kind !== 'home' ? 1 : 0,
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
		features.exposure * weights.exposure
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
