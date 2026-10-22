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
	type LayoutAnchor,
} from './layout';
import { FINISH_PROGRESS, toPosition } from './topology';
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

function planeIndex(planeId: string): number {
	const value = Number(planeId.split('-').at(-1));
	return Number.isInteger(value) && value >= 0 ? value : 0;
}

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
			return TRACK_ANCHORS[position.globalIndex]!;
		case 'home':
			return (
				HOME_PATHS[position.color][position.homeIndex] ??
				HOME_PATHS[position.color][0]!
			);
		case 'finished':
			return HOME_PATHS[position.color][5]!;
	}
}

/** Committed planes project through their logical progress, never raw math. */
export function planeAnchor(plane: PlaneState): LayoutAnchor {
	return positionAnchor(toPosition(plane.color, plane.progress), plane.id);
}

export function eventAnchor(
	event: AeroplaneEvent
): [LayoutAnchor, LayoutAnchor] {
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

function progressOf(position: AeroplanePosition): number | null {
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
	const fromProgress = progressOf(event.from);
	const toProgress = progressOf(event.to);
	if (fromProgress === null || toProgress === null) {
		// Launch (or a non-progress endpoint): a single direct hop.
		points.push(positionAnchor(event.to, event.planeId));
		return points;
	}
	if (toProgress >= fromProgress) {
		for (
			let progress = fromProgress + 1;
			progress <= toProgress;
			progress += 1
		) {
			points.push(positionAnchor(toPosition(color, progress), event.planeId));
		}
		return points;
	}
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
	const anchor = planeAnchor(state.planes[index]!);
	const key = `${anchor.x.toFixed(3)}:${anchor.y.toFixed(3)}`;
	let stackIndex = 0;
	for (let before = 0; before < index; before += 1) {
		const other = planeAnchor(state.planes[before]!);
		if (`${other.x.toFixed(3)}:${other.y.toFixed(3)}` === key) stackIndex += 1;
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
			const guide =
				FLIGHT_GUIDES.find(candidate => candidate.color === move.color) ??
				FLIGHT_GUIDES[0]!;
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
	for (const victimId of move.capturedPlaneIds) {
		const victim = state.planes.find(plane => plane.id === victimId);
		if (!victim) continue;
		captures.push({
			planeId: victimId,
			from: captureFrom,
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

	// Playback must land on the committed glyph, stacking offset included.
	const landing = committedGlyphAnchor(state, move.planeId);
	const last = segments.at(-1);
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
