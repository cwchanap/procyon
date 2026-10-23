/**
 * Pure, React-free presentation projection for Aeroplane Chess.
 *
 * Consolidates the board's anchor/route math (previously local to
 * AeroplaneBoard.tsx) and expands resolved moves into ordered normalized SVG
 * segments with bounded durations. Nothing here mutates its inputs, touches
 * the DOM, or affects rules; playback consumers only read the returned data.
 */

import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	STACK_OFFSETS,
	TRACK_ANCHORS,
	planeIndex,
	type LayoutAnchor,
} from './layout';
import { isFinishBounce } from './rules';
import { FINISH_PROGRESS, progressFromPosition, toPosition } from './topology';
import type {
	AeroplaneColor,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	PlaneState,
	ResolvedMove,
} from './types';

/** Hard ceiling for one complete move timeline, including capture returns. */
export const AEROPLANE_VISUAL_MAX_MS = 600;

/** Natural duration of one unit of motion weight before budget scaling. */
const BASE_HOP_MS = 80;
const JUMP_WEIGHT = 1.5;
const FLIGHT_WEIGHT = 3;
const CAPTURE_WEIGHT = 2;

/** Project any logical position onto its normalized 100×100 SVG anchor. */
export function positionAnchor(
	position: AeroplanePosition,
	planeId?: string
): LayoutAnchor {
	switch (position.kind) {
		case 'hangar':
			return (
				HANGAR_SLOTS[position.color][planeIndex(planeId ?? '')] ??
				HANGAR_SLOTS[position.color][0]!
			);
		case 'launch':
			return LAUNCH_PADS[position.color];
		case 'track':
			return TRACK_ANCHORS[position.globalIndex] ?? TRACK_ANCHORS[0]!;
		case 'home':
			return (
				HOME_PATHS[position.color][position.homeIndex] ??
				HOME_PATHS[position.color][0]!
			);
		case 'finished':
			return HOME_PATHS[position.color][5]!;
	}
}

/**
 * Persisted progress is trusted but not assumed: out-of-range values clamp
 * back into the legal span and non-numeric ones fall back to the hangar, so
 * a damaged save still renders instead of crashing the board.
 */
function saneProgress(progress: number | null): number | null {
	if (progress === null || !Number.isFinite(progress) || progress < 0)
		return null;
	return Math.min(FINISH_PROGRESS, Math.round(progress));
}

/** Committed planes project through their logical progress, never raw math. */
export function planeAnchor(plane: PlaneState): LayoutAnchor {
	return positionAnchor(
		toPosition(plane.color, saneProgress(plane.progress)),
		plane.id
	);
}

export interface StackedPlanePlacement {
	plane: PlaneState;
	anchor: LayoutAnchor;
	offset: LayoutAnchor;
}

/**
 * Committed glyph positions in array order: planes sharing one anchor take
 * successive STACK_OFFSETS entries. This is the single copy of the stacking
 * rule — the committed layer and the playback endpoints both consume it.
 */
export function stackedPlanePlacements(
	planes: readonly PlaneState[]
): StackedPlanePlacement[] {
	const countByAnchor = new Map<string, number>();
	return planes.map(plane => {
		const anchor = planeAnchor(plane);
		const key = anchorKey(anchor);
		const index = countByAnchor.get(key) ?? 0;
		countByAnchor.set(key, index + 1);
		const offset = STACK_OFFSETS[index % STACK_OFFSETS.length]!;
		return { plane, anchor, offset };
	});
}

function anchorKey(anchor: LayoutAnchor): string {
	return `${anchor.x.toFixed(3)}:${anchor.y.toFixed(3)}`;
}

function eventAnchor(event: AeroplaneEvent): [LayoutAnchor, LayoutAnchor] {
	return [
		positionAnchor(event.from, event.planeId),
		positionAnchor(event.to, event.planeId),
	];
}

/** SVG path string for dashed previews; identical contract to the board's. */
export function routePath(move: ResolvedMove): string {
	const points: LayoutAnchor[] = [];
	for (const event of move.events) {
		const [from, to] = eventAnchor(event);
		if (points.length === 0) points.push(from);
		points.push(to);
	}
	if (points.length === 0) {
		points.push(
			positionAnchor(move.start, move.planeId),
			positionAnchor(move.finalEndpoint, move.planeId)
		);
	}
	return points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
		.join(' ');
}

export type AeroplaneMotionKind = 'hop' | 'jump' | 'flight';

export interface AeroplaneMotionSegment {
	kind: AeroplaneMotionKind;
	from: LayoutAnchor;
	to: LayoutAnchor;
	/** Quadratic control point; present only on flight segments. */
	control?: LayoutAnchor;
	durationMs: number;
}

export interface AeroplaneCaptureReturn {
	planeId: string;
	from: LayoutAnchor;
	to: LayoutAnchor;
	durationMs: number;
}

export interface AeroplaneMoveTimeline {
	planeId: string;
	color: AeroplaneColor;
	segments: AeroplaneMotionSegment[];
	captures: AeroplaneCaptureReturn[];
	/** Bounded by AEROPLANE_VISUAL_MAX_MS; 0 in zero-motion mode. */
	totalMs: number;
}

export interface AeroplaneTimelineOptions {
	/** Reduced motion / skip: keep the geometry, drop every duration. */
	zeroMotion?: boolean;
}

/**
 * Expand one base move into per-step anchors. Bounce reflects progress past
 * the finish (54 + 5 follows 55→56→55→54→53) instead of interpolating a
 * straight chord; launch keeps its single direct hangar-pad hop.
 */
function moveWaypoints(
	color: AeroplaneColor,
	event: AeroplaneEvent
): LayoutAnchor[] {
	const points: LayoutAnchor[] = [positionAnchor(event.from, event.planeId)];
	const fromProgress = progressFromPosition(event.from);
	const toProgress = progressFromPosition(event.to);
	if (fromProgress === null || toProgress === null) {
		// Launch (or a non-progress endpoint): a single direct hop.
		points.push(positionAnchor(event.to, event.planeId));
		return points;
	}
	// Endpoint comparison alone misses a bounce whose overshoot lands at or
	// ahead of the start (54 +3 settles on 55, 54 +4 returns to 54); the
	// rule's overshoot check is shared with the resolver via isFinishBounce.
	if (!isFinishBounce(fromProgress, toProgress, event.distance)) {
		for (
			let progress = fromProgress + 1;
			progress <= toProgress;
			progress += 1
		) {
			points.push(positionAnchor(toPosition(color, progress), event.planeId));
		}
		return points;
	}
	// A finish bounce is the only rule that lowers progress, so walk up to
	// FINISH_PROGRESS and reflect back down to the settled endpoint.
	for (
		let progress = fromProgress + 1;
		progress <= FINISH_PROGRESS;
		progress += 1
	) {
		points.push(positionAnchor(toPosition(color, progress), event.planeId));
	}
	for (
		let progress = FINISH_PROGRESS - 1;
		progress >= toProgress;
		progress -= 1
	) {
		points.push(positionAnchor(toPosition(color, progress), event.planeId));
	}
	return points;
}

/**
 * Anchor of the mover's committed glyph in `state`, stacking offset included,
 * so playback ends exactly where the board reveals the plane.
 */
function committedGlyphAnchor(
	state: AeroplaneState,
	planeId: string
): LayoutAnchor | null {
	const index = state.planes.findIndex(plane => plane.id === planeId);
	if (index < 0) return null;
	const { anchor, offset } = stackedPlanePlacements(state.planes)[index]!;
	return { x: anchor.x + offset.x, y: anchor.y + offset.y };
}

/**
 * Anchor of the mover's glyph before the move, stacking offset included, so
 * a plane leaving a stack departs from its rendered slot rather than the
 * bare square. Stackmates still occupying that anchor post-commit are the
 * ones counted; captured victims can never share the mover's start node (a
 * valid state never mixes colours), so the committed state suffices.
 */
function departureGlyphAnchor(
	state: AeroplaneState,
	move: ResolvedMove
): LayoutAnchor | null {
	const moverIndex = state.planes.findIndex(plane => plane.id === move.planeId);
	if (moverIndex < 0) return null;
	const anchor = positionAnchor(move.start, move.planeId);
	const key = anchorKey(anchor);
	let stackIndex = 0;
	for (let index = 0; index < moverIndex; index += 1) {
		if (anchorKey(planeAnchor(state.planes[index]!)) === key) {
			stackIndex += 1;
		}
	}
	const offset = STACK_OFFSETS[stackIndex % STACK_OFFSETS.length]!;
	return { x: anchor.x + offset.x, y: anchor.y + offset.y };
}

/**
 * Build the ordered motion timeline for one resolved move against the
 * committed post-move state. Durations are weighted (hops < jump < flight,
 * capture return included) and scaled to fit AEROPLANE_VISUAL_MAX_MS.
 */
export function buildMoveTimeline(
	move: ResolvedMove,
	state: AeroplaneState,
	options: AeroplaneTimelineOptions = {}
): AeroplaneMoveTimeline {
	const segments: AeroplaneMotionSegment[] = [];

	for (const event of move.events) {
		if (event.type === 'jump') {
			const [from, to] = eventAnchor(event);
			segments.push({ kind: 'jump', from, to, durationMs: 0 });
			continue;
		}
		if (event.type === 'flight') {
			// Reuse the board's colour-specific quadratic guide verbatim.
			const guide = FLIGHT_GUIDES.find(
				candidate => candidate.color === move.color
			)!;
			segments.push({
				kind: 'flight',
				from: guide.from,
				control: guide.control,
				to: guide.to,
				durationMs: 0,
			});
			continue;
		}
		const waypoints = moveWaypoints(move.color, event);
		for (let index = 1; index < waypoints.length; index += 1) {
			segments.push({
				kind: 'hop',
				from: waypoints[index - 1]!,
				to: waypoints[index]!,
				durationMs: 0,
			});
		}
	}
	if (segments.length === 0) {
		segments.push({
			kind: 'hop',
			from: positionAnchor(move.start, move.planeId),
			to: positionAnchor(move.finalEndpoint, move.planeId),
			durationMs: 0,
		});
	}

	const captureFrom = positionAnchor(move.finalEndpoint, move.planeId);
	const captures: AeroplaneCaptureReturn[] = [];
	for (const [victimIndex, victimId] of move.capturedPlaneIds.entries()) {
		const victim = state.planes.find(plane => plane.id === victimId);
		if (!victim) continue;
		// Victims keep their pre-move stack slots while parked, in captured
		// order (the resolver emits them in board order), so several captured
		// planes fan out instead of hiding each other.
		const offset = STACK_OFFSETS[victimIndex % STACK_OFFSETS.length]!;
		captures.push({
			planeId: victimId,
			from: { x: captureFrom.x + offset.x, y: captureFrom.y + offset.y },
			to: positionAnchor(toPosition(victim.color, null), victim.id),
			durationMs: 0,
		});
	}

	const weightOf = (kind: AeroplaneMotionKind) =>
		kind === 'flight' ? FLIGHT_WEIGHT : kind === 'jump' ? JUMP_WEIGHT : 1;
	const naturalWeight =
		segments.reduce((sum, segment) => sum + weightOf(segment.kind), 0) +
		captures.length * CAPTURE_WEIGHT;
	const scale = Math.min(
		1,
		AEROPLANE_VISUAL_MAX_MS / (naturalWeight * BASE_HOP_MS)
	);
	const duration = (weight: number) =>
		options.zeroMotion
			? 0
			: Math.max(1, Math.floor(weight * BASE_HOP_MS * scale));

	for (const segment of segments) {
		segment.durationMs = duration(weightOf(segment.kind));
	}
	for (const capture of captures) {
		capture.durationMs = duration(CAPTURE_WEIGHT);
	}

	// Playback departs from and lands on the rendered glyphs, stacking
	// offsets included at both ends.
	const departure = departureGlyphAnchor(state, move);
	const landing = committedGlyphAnchor(state, move.planeId);
	const first = segments[0];
	const last = segments.at(-1);
	if (departure && first) first.from = departure;
	if (landing && last) last.to = landing;

	const totalMs =
		segments.reduce((sum, segment) => sum + segment.durationMs, 0) +
		captures.reduce((sum, capture) => sum + capture.durationMs, 0);

	return {
		planeId: move.planeId,
		color: move.color,
		segments,
		captures,
		totalMs,
	};
}
