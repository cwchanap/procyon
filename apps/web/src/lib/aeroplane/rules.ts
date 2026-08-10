import {
	FLIGHT_ENTRANCE_PROGRESS,
	FLIGHT_EXIT_PROGRESS,
	FINISH_PROGRESS,
	isNormalJumpSquare,
	isSharedTrackProgress,
	toGlobalTrackIndex,
	toPosition,
} from './topology';
import type {
	AeroplaneColor,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	AeroplaneTransition,
	PlaneState,
	ResolvedMove,
} from './types';

const MIN_ROLL = 1;
const MAX_ROLL = 6;

function sharedOccupants(
	state: AeroplaneState,
	globalIndex: number
): PlaneState[] {
	return state.planes.filter(
		plane =>
			isSharedTrackProgress(plane.progress ?? -1) &&
			toGlobalTrackIndex(plane.color, plane.progress as number) === globalIndex
	);
}

function hasBlockade(state: AeroplaneState, globalIndex: number): boolean {
	return sharedOccupants(state, globalIndex).length >= 2;
}

function effectiveStacking(state: AeroplaneState): boolean {
	// The setup normalizer enforces this dependency. Keeping the implication
	// here makes the pure resolver safe for manually-constructed snapshots too.
	return state.config.stacking || state.config.blockades;
}

function effectiveBlockades(state: AeroplaneState): boolean {
	return state.config.blockades;
}

function pathCrossesBlockade(
	state: AeroplaneState,
	color: AeroplaneColor,
	fromProgress: number,
	toProgress: number
): boolean {
	if (!effectiveBlockades(state)) return false;
	for (let progress = fromProgress + 1; progress <= toProgress; progress += 1) {
		if (
			isSharedTrackProgress(progress) &&
			hasBlockade(state, toGlobalTrackIndex(color, progress))
		) {
			return true;
		}
	}
	return false;
}

function baseProgressFor(progress: number, roll: number): number {
	return progress + roll;
}

function resolveBaseProgress(
	progress: number,
	roll: number,
	finishRule: AeroplaneState['config']['finishRule']
): number | null {
	const candidate = baseProgressFor(progress, roll);
	if (candidate <= FINISH_PROGRESS) return candidate;
	if (finishRule === 'exact') return null;
	return FINISH_PROGRESS - (candidate - FINISH_PROGRESS);
}

function event(
	type: AeroplaneEvent['type'],
	planeId: string,
	from: AeroplanePosition,
	to: AeroplanePosition,
	distance?: number
): AeroplaneEvent {
	return {
		type,
		planeId,
		from,
		to,
		...(distance === undefined ? {} : { distance }),
	};
}

function finalSharedOccupancy(
	state: AeroplaneState,
	plane: PlaneState,
	endpoint: Extract<AeroplanePosition, { kind: 'track' }>
): string[] | null {
	const occupants = sharedOccupants(state, endpoint.globalIndex).filter(
		candidate => candidate.id !== plane.id
	);
	if (occupants.length === 0) return [];

	const own = occupants.filter(candidate => candidate.color === plane.color);
	const enemy = occupants.filter(candidate => candidate.color !== plane.color);
	// A valid authoritative state never mixes colours on one node, but reject a
	// malformed mixed stack rather than silently choosing a capture outcome.
	if (own.length > 0 && enemy.length > 0) return null;

	if (own.length > 0) {
		if (!effectiveStacking(state)) return null;
		// Existing two-plane blockades cannot receive a third plane.
		if (effectiveBlockades(state) && own.length >= 2) return null;
		return [];
	}

	// Enemy blockades are not capturable. A one-plane enemy endpoint is a legal
	// capture regardless of whether stacking is otherwise enabled.
	if (effectiveBlockades(state) && enemy.length >= 2) return null;
	return enemy.map(candidate => candidate.id);
}

function finalHomeOccupancy(
	state: AeroplaneState,
	plane: PlaneState,
	progress: number
): boolean {
	return state.planes.some(
		candidate =>
			candidate.id !== plane.id &&
			candidate.color === plane.color &&
			candidate.progress === progress
	);
}

function launchMove(
	state: AeroplaneState,
	plane: PlaneState,
	roll: number
): ResolvedMove | null {
	const allowed =
		state.config.launchRule === 'six' ? roll === 6 : roll === 5 || roll === 6;
	if (!allowed) return null;
	if (
		state.planes.some(
			candidate => candidate.color === plane.color && candidate.progress === 0
		)
	) {
		return null;
	}
	const start = toPosition(plane.color, null);
	const endpoint = toPosition(plane.color, 0);
	return {
		planeId: plane.id,
		color: plane.color,
		roll,
		start,
		baseEndpoint: endpoint,
		finalEndpoint: endpoint,
		events: [event('move', plane.id, start, endpoint, 0)],
		capturedPlaneIds: [],
	};
}

/**
 * Resolve one named plane without consulting state.currentPlayer. This is the
 * single authority used by gameplay, previews, and opponent threat probes.
 */
export function resolveLegalMove(
	state: AeroplaneState,
	planeId: string,
	roll: number
): ResolvedMove | null {
	if (!Number.isInteger(roll) || roll < MIN_ROLL || roll > MAX_ROLL)
		return null;
	const plane = state.planes.find(candidate => candidate.id === planeId);
	if (!plane || plane.progress === FINISH_PROGRESS) return null;
	if (plane.progress === null) return launchMove(state, plane, roll);

	const start = toPosition(plane.color, plane.progress);
	const baseProgress = resolveBaseProgress(
		plane.progress,
		roll,
		state.config.finishRule
	);
	if (baseProgress === null) return null;

	// Base path checks are only meaningful while traversing shared nodes. A
	// plane in its private home lane has no shared occupancy to cross.
	if (
		plane.progress <= 50 &&
		pathCrossesBlockade(
			state,
			plane.color,
			plane.progress,
			Math.min(baseProgress, 50)
		)
	) {
		return null;
	}

	const baseEndpoint = toPosition(plane.color, baseProgress);
	const events: AeroplaneEvent[] = [
		event('move', plane.id, start, baseEndpoint, roll),
	];
	let finalEndpoint = baseEndpoint;

	if (
		baseEndpoint.kind === 'track' &&
		isNormalJumpSquare(baseEndpoint.progress)
	) {
		const jumpProgress = baseEndpoint.progress + 4;
		if (
			pathCrossesBlockade(
				state,
				plane.color,
				baseEndpoint.progress,
				jumpProgress
			)
		)
			return null;
		const jumpEndpoint = toPosition(plane.color, jumpProgress);
		events.push(event('jump', plane.id, finalEndpoint, jumpEndpoint, 4));
		finalEndpoint = jumpEndpoint;
	}

	// Flight is checked after the single jump pass. This intentionally means a
	// flight ending at progress 30 does not run a second normal jump pass.
	if (
		finalEndpoint.kind === 'track' &&
		finalEndpoint.progress === FLIGHT_ENTRANCE_PROGRESS
	) {
		if (
			effectiveBlockades(state) &&
			hasBlockade(state, toGlobalTrackIndex(plane.color, FLIGHT_EXIT_PROGRESS))
		) {
			return null;
		}
		const flightEndpoint = toPosition(plane.color, FLIGHT_EXIT_PROGRESS);
		events.push(event('flight', plane.id, finalEndpoint, flightEndpoint, 12));
		finalEndpoint = flightEndpoint;
	}

	let capturedPlaneIds: string[] = [];
	if (finalEndpoint.kind === 'track') {
		const captures = finalSharedOccupancy(state, plane, finalEndpoint);
		if (captures === null) return null;
		capturedPlaneIds = captures;
	} else if (
		finalEndpoint.kind === 'home' &&
		finalHomeOccupancy(state, plane, finalEndpoint.progress)
	) {
		return null;
	}

	return {
		planeId: plane.id,
		color: plane.color,
		roll,
		start,
		baseEndpoint,
		finalEndpoint,
		events,
		capturedPlaneIds,
	};
}

export function getLegalMovesForColor(
	state: AeroplaneState,
	color: AeroplaneColor,
	roll: number
): ResolvedMove[] {
	return state.planes
		.filter(plane => plane.color === color)
		.map(plane => resolveLegalMove(state, plane.id, roll))
		.filter((move): move is ResolvedMove => move !== null);
}

export function getLegalMoves(
	state: AeroplaneState,
	roll: number
): ResolvedMove[] {
	return getLegalMovesForColor(state, state.currentPlayer, roll);
}

function progressFromPosition(position: AeroplanePosition): number | null {
	switch (position.kind) {
		case 'hangar':
			return null;
		case 'launch':
			return 0;
		case 'track':
		case 'home':
			return position.progress;
		case 'finished':
			return FINISH_PROGRESS;
	}
}

/** Apply a previously resolved move without mutating the source state. */
export function applyResolvedMove(
	state: AeroplaneState,
	move: ResolvedMove
): AeroplaneTransition {
	const captured = new Set(move.capturedPlaneIds);
	const progress = progressFromPosition(move.finalEndpoint);
	const nextPlanes = state.planes.map(plane => {
		if (captured.has(plane.id)) return { ...plane, progress: null };
		if (plane.id === move.planeId) return { ...plane, progress };
		return { ...plane };
	});
	const nextState: AeroplaneState = {
		...state,
		planes: nextPlanes,
	};
	return {
		state: nextState,
		move,
		events: move.events.map(item => ({ ...item })),
		capturedPlaneIds: [...move.capturedPlaneIds],
	};
}
