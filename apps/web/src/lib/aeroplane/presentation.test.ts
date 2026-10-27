import { describe, expect, test } from 'bun:test';
import {
	AEROPLANE_AI_DELAY_MS,
	AEROPLANE_PRESENTATION_MS,
} from '../../hooks/useAeroplaneMatch';
import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	STACK_OFFSETS,
	TRACK_ANCHORS,
} from './layout';
import {
	AEROPLANE_VISUAL_MAX_MS,
	buildMoveTimeline,
	positionAnchor,
	routePath,
	stackedPlanePlacements,
} from './presentation';
import { playResolvedMove } from './game';
import { applyResolvedMove, resolveLegalMove } from './rules';
import { initialTycoonState } from './tycoon';
import { toPosition } from './topology';
import { AEROPLANE_COLORS } from './types';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneEvent,
	AeroplaneState,
	PlaneState,
	ResolvedMove,
} from './types';

const CLASSIC_CONFIG: AeroplaneConfig = {
	mode: 'standard',
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

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: colorOf(id), progress };
}

function allHangarPlanes(): PlaneState[] {
	return AEROPLANE_COLORS.flatMap(color =>
		Array.from({ length: 4 }, (_, index) => plane(`${color}-${index}`, null))
	);
}

function stateWithPlanes(
	planes: PlaneState[],
	config: Partial<AeroplaneConfig> = {}
): AeroplaneState {
	return {
		config: { ...CLASSIC_CONFIG, ...config },
		currentPlayer: 'red',
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
		tycoon: null,
	};
}

function stateWhere(
	progressById: Record<string, number | null>,
	config: Partial<AeroplaneConfig> = {}
): AeroplaneState {
	return stateWithPlanes(
		allHangarPlanes().map(candidate =>
			candidate.id in progressById
				? plane(candidate.id, progressById[candidate.id]!)
				: candidate
		),
		config
	);
}

/** Resolve a legal move and project it against the committed post-move state. */
function timelineFor(
	state: AeroplaneState,
	planeId: string,
	roll: number,
	options?: Parameters<typeof buildMoveTimeline>[2]
) {
	const move = resolveLegalMove(state, planeId, roll);
	if (!move) throw new Error(`expected a legal move for ${planeId} +${roll}`);
	const committed = applyResolvedMove(state, move).state;
	return { move, timeline: buildMoveTimeline(move, committed, options) };
}

describe('Aeroplane presentation projection', () => {
	test('launch hops directly from the hangar slot to the launch pad', () => {
		const { timeline } = timelineFor(stateWhere({ 'red-0': null }), 'red-0', 6);
		expect(timeline.segments).toHaveLength(1);
		expect(timeline.segments[0]).toMatchObject({
			kind: 'hop',
			from: HANGAR_SLOTS.red[0]!,
			to: LAUNCH_PADS.red,
		});
		expect(timeline.segments[0]!.durationMs).toBe(80);
		expect(timeline.totalMs).toBe(80);
		expect(timeline.captures).toEqual([]);
	});

	test('simple moves expand one hop per logical progress step', () => {
		const oneState = stateWhere({ 'red-0': 3 });
		const { move: oneMove, timeline: one } = timelineFor(oneState, 'red-0', 1);
		expect(one.segments).toHaveLength(1);
		expect(one.segments[0]).toMatchObject({
			kind: 'hop',
			from: TRACK_ANCHORS[2]!,
			to: TRACK_ANCHORS[3]!,
		});
		// The dashed preview contract is unchanged: M/L over the event anchors.
		const previewFrom = positionAnchor(oneMove.events[0]!.from, 'red-0');
		const previewTo = positionAnchor(oneMove.events[0]!.to, 'red-0');
		expect(routePath(oneMove)).toBe(
			`M ${previewFrom.x} ${previewFrom.y} L ${previewTo.x} ${previewTo.y}`
		);

		// Landing on 8 keeps the six-step move free of jump/flight follow-ups.
		const { timeline: six } = timelineFor(
			stateWhere({ 'red-0': 2 }),
			'red-0',
			6
		);
		expect(six.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
			'hop',
			'hop',
			'hop',
			'hop',
		]);
		expect(six.segments[0]!.from).toEqual(TRACK_ANCHORS[1]!);
		expect(six.segments.map(segment => segment.to)).toEqual([
			TRACK_ANCHORS[2]!,
			TRACK_ANCHORS[3]!,
			TRACK_ANCHORS[4]!,
			TRACK_ANCHORS[5]!,
			TRACK_ANCHORS[6]!,
			TRACK_ANCHORS[7]!,
		]);
	});

	test('track progress wraps around the 52-node ring', () => {
		const { timeline } = timelineFor(
			stateWhere({ 'yellow-0': 39 }),
			'yellow-0',
			1
		);
		expect(timeline.segments).toHaveLength(1);
		expect(timeline.segments[0]).toMatchObject({
			from: TRACK_ANCHORS[51]!,
			to: TRACK_ANCHORS[0]!,
		});
	});

	test('corrected home lanes approach the centre monotonically for every colour', () => {
		expect(HOME_PATHS.red.map(anchor => anchor.y)).toEqual([
			27, 31, 35, 39, 43, 50,
		]);
		for (const color of AEROPLANE_COLORS) {
			let previous = Number.POSITIVE_INFINITY;
			for (let progress = 50; progress <= 56; progress += 1) {
				const anchor = positionAnchor(toPosition(color, progress));
				const distance = Math.hypot(anchor.x - 50, anchor.y - 50);
				expect(distance).toBeLessThan(previous);
				previous = distance;
			}
		}
	});

	test('exact finish walks the home lane into the centre', () => {
		const { timeline } = timelineFor(stateWhere({ 'red-0': 54 }), 'red-0', 2);
		expect(timeline.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
		]);
		expect(timeline.segments[0]!.to).toEqual({ x: 50, y: 43 });
		expect(timeline.segments[1]!.to).toEqual({ x: 50, y: 50 });
	});

	test('bounce reflects progress back from the finish', () => {
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 54 }, { finishRule: 'bounce' }),
			'red-0',
			5
		);
		expect(timeline.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
			'hop',
			'hop',
			'hop',
		]);
		// 54 +5 follows 55 → 56 → 55 → 54 → 53.
		expect(timeline.segments.map(segment => segment.to.y)).toEqual([
			43, 50, 43, 39, 35,
		]);
	});

	test('bounce animates the full arc when overshoot lands at or ahead of the start', () => {
		// 54 +3 settles on 55 but still travels 55 → 56 → 55.
		const { timeline: three } = timelineFor(
			stateWhere({ 'red-0': 54 }, { finishRule: 'bounce' }),
			'red-0',
			3
		);
		expect(three.segments.map(segment => segment.to.y)).toEqual([43, 50, 43]);

		// 54 +4 returns to 54 via 55 → 56 → 55 → 54, not a stationary segment.
		const { timeline: four } = timelineFor(
			stateWhere({ 'red-0': 54 }, { finishRule: 'bounce' }),
			'red-0',
			4
		);
		expect(four.segments.map(segment => segment.to.y)).toEqual([
			43, 50, 43, 39,
		]);

		// 55 +2 settles back on 55 via 56 → 55.
		const { timeline: two } = timelineFor(
			stateWhere({ 'red-0': 55 }, { finishRule: 'bounce' }),
			'red-0',
			2
		);
		expect(two.segments.map(segment => segment.to.y)).toEqual([50, 43]);
	});

	test('jump then flight events play in resolution order', () => {
		const { move, timeline } = timelineFor(
			stateWhere({ 'red-0': 12 }),
			'red-0',
			2
		);
		expect(move.events.map(event => event.type)).toEqual([
			'move',
			'jump',
			'flight',
		]);
		expect(timeline.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
			'jump',
			'flight',
		]);
		expect(timeline.segments[1]!.to).toEqual(TRACK_ANCHORS[13]!);
		expect(timeline.segments[2]).toMatchObject({
			from: TRACK_ANCHORS[13]!,
			to: TRACK_ANCHORS[17]!,
		});
		const guide = FLIGHT_GUIDES[0]!;
		expect(timeline.segments[3]).toMatchObject({
			from: guide.from,
			to: guide.to,
		});
	});

	test('flight segments reuse the colour flight guide control point', () => {
		const { timeline } = timelineFor(stateWhere({ 'red-0': 16 }), 'red-0', 2);
		const flight = timeline.segments.at(-1)!;
		expect(flight.kind).toBe('flight');
		expect(flight.control).toEqual(FLIGHT_GUIDES[0]!.control);
	});

	test('a single capture returns the victim to its colour-specific hangar slot', () => {
		// Red lands on shared node 26 (progress 27) where yellow-1 (progress 14) sits.
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 26, 'yellow-1': 14 }),
			'red-0',
			1
		);
		expect(timeline.captures).toHaveLength(1);
		expect(timeline.captures[0]).toMatchObject({
			planeId: 'yellow-1',
			from: TRACK_ANCHORS[26]!,
			to: HANGAR_SLOTS.yellow[1]!,
		});
		expect(timeline.captures[0]!.durationMs).toBeGreaterThan(0);
	});

	test('multiple victims each return to their own hangar slot', () => {
		// Shared node 26 also holds green-2 (progress 40).
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 26, 'yellow-1': 14, 'green-2': 40 }),
			'red-0',
			1
		);
		expect(timeline.captures).toHaveLength(2);
		expect(timeline.captures[0]!.planeId).toBe('yellow-1');
		expect(timeline.captures[0]!.to).toEqual(HANGAR_SLOTS.yellow[1]!);
		expect(timeline.captures[1]!.planeId).toBe('green-2');
		expect(timeline.captures[1]!.to).toEqual(HANGAR_SLOTS.green[2]!);
		// Victims fan out across the stack instead of overlapping on the tile.
		expect(timeline.captures[0]!.from).toEqual({
			x: TRACK_ANCHORS[26]!.x + STACK_OFFSETS[0]!.x,
			y: TRACK_ANCHORS[26]!.y + STACK_OFFSETS[0]!.y,
		});
		expect(timeline.captures[1]!.from).toEqual({
			x: TRACK_ANCHORS[26]!.x + STACK_OFFSETS[1]!.x,
			y: TRACK_ANCHORS[26]!.y + STACK_OFFSETS[1]!.y,
		});
	});

	test('a mover departs from its stacked glyph, not the bare square anchor', () => {
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 10, 'red-1': 10 }, { stacking: true }),
			'red-1',
			1
		);
		const base = positionAnchor(toPosition('red', 10));
		expect(timeline.segments[0]!.from).toEqual({
			x: base.x + STACK_OFFSETS[1]!.x,
			y: base.y + STACK_OFFSETS[1]!.y,
		});
	});

	test('malformed persisted progress clamps or parks instead of throwing', () => {
		const placements = stackedPlanePlacements([
			plane('red-0', 999),
			plane('red-1', Number.NaN),
			plane('red-2', -4),
			plane('red-3', null),
		]);
		expect(placements.map(entry => entry.anchor)).toEqual([
			positionAnchor(toPosition('red', 56)),
			HANGAR_SLOTS.red[1]!,
			HANGAR_SLOTS.red[2]!,
			HANGAR_SLOTS.red[3]!,
		]);
	});

	test('stacked landings end at the committed glyph offset, not the bare tile', () => {
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 11, 'red-1': 9 }, { stacking: true }),
			'red-1',
			2
		);
		// Intermediate hops stay on bare tile anchors.
		expect(timeline.segments[0]!.to).toEqual(TRACK_ANCHORS[9]!);
		const base = positionAnchor(toPosition('red', 11));
		const landing = timeline.segments.at(-1)!;
		expect(landing.to).toEqual({
			x: base.x + STACK_OFFSETS[1]!.x,
			y: base.y + STACK_OFFSETS[1]!.y,
		});
	});

	test('timeline totals stay capped below both production timer defaults', () => {
		expect(AEROPLANE_VISUAL_MAX_MS).toBeLessThan(AEROPLANE_PRESENTATION_MS);
		expect(AEROPLANE_VISUAL_MAX_MS).toBeLessThan(AEROPLANE_AI_DELAY_MS);

		// Heaviest realistic route: 6 hops + jump + flight + capture return.
		const { timeline } = timelineFor(
			stateWhere({ 'red-0': 8, 'yellow-1': 17 }),
			'red-0',
			6
		);
		expect(timeline.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
			'hop',
			'hop',
			'hop',
			'hop',
			'jump',
			'flight',
		]);
		expect(timeline.captures).toHaveLength(1);
		expect(timeline.totalMs).toBeLessThanOrEqual(AEROPLANE_VISUAL_MAX_MS);
		for (const segment of timeline.segments) {
			expect(segment.durationMs).toBeGreaterThan(0);
		}

		// Zero-motion mode keeps the geometry and skips timing entirely.
		const frozen = timelineFor(
			stateWhere({ 'red-0': 8, 'yellow-1': 17 }),
			'red-0',
			6,
			{ zeroMotion: true }
		).timeline;
		expect(frozen.totalMs).toBe(0);
		expect(frozen.segments.map(segment => segment.durationMs)).toEqual(
			frozen.segments.map(() => 0)
		);
		expect(frozen.segments.map(segment => segment.to)).toEqual(
			timeline.segments.map(segment => segment.to)
		);
	});

	test('building a timeline does not mutate the move or committed state', () => {
		const state = stateWhere({ 'red-0': 26, 'yellow-1': 14 });
		const move = resolveLegalMove(state, 'red-0', 1)!;
		const committed = applyResolvedMove(state, move).state;
		const moveSnapshot = structuredClone(move);
		const stateSnapshot = structuredClone(committed);
		buildMoveTimeline(move, committed);
		expect(move).toEqual(moveSnapshot);
		expect(committed).toEqual(stateSnapshot);
	});
});

describe('Sky Tycoon effective-move presentation', () => {
	function warpTimeline(
		final: Record<string, number | null>,
		...events: AeroplaneEvent[]
	) {
		const move: ResolvedMove = {
			planeId: 'red-0',
			color: 'red',
			roll: 2,
			start: events[0]!.from,
			baseEndpoint: events[0]!.to,
			finalEndpoint: events.at(-1)!.to,
			events,
			capturedPlaneIds: [],
		};
		return { move, timeline: buildMoveTimeline(move, stateWhere(final)) };
	}

	test('a Storm warp is one direct segment that never routes via the finish', () => {
		const landing = toPosition('red', 16);
		const retreat = toPosition('red', 13);
		const { timeline } = warpTimeline(
			{ 'red-0': 13 },
			{
				type: 'move',
				planeId: 'red-0',
				from: toPosition('red', 14),
				to: landing,
				distance: 2,
			},
			{ type: 'warp', planeId: 'red-0', from: landing, to: retreat }
		);

		expect(timeline.segments.map(segment => segment.kind)).toEqual([
			'hop',
			'hop',
			'hop',
		]);
		// Two ordinary hops to the Storm tile, then ONE direct chord back.
		expect(timeline.segments.map(segment => segment.to)).toEqual([
			TRACK_ANCHORS[14]!,
			TRACK_ANCHORS[15]!,
			TRACK_ANCHORS[12]!,
		]);
		expect(timeline.segments[2]!.from).toEqual(TRACK_ANCHORS[15]!);
		// A naive bounce read of the backward segment would visit progress 56.
		for (const segment of timeline.segments) {
			expect(segment.to).not.toEqual(TRACK_ANCHORS[51]!);
		}
	});

	test('a Crash warp lands on the committed hangar glyph as the terminal cue', () => {
		const landing = toPosition('red', 25);
		const hangar = toPosition('red', null);
		const { timeline } = warpTimeline(
			{ 'red-0': null },
			{
				type: 'move',
				planeId: 'red-0',
				from: toPosition('red', 24),
				to: landing,
				distance: 1,
			},
			{ type: 'warp', planeId: 'red-0', from: landing, to: hangar }
		);

		expect(timeline.segments).toHaveLength(2);
		// The final segment ends where the mover is actually committed.
		expect(timeline.segments[1]!.to).toEqual(HANGAR_SLOTS.red[0]!);
	});

	test('captures return from the selected landing, not the warp destination', () => {
		// red +1 lands on the Storm tile (global 15) over yellow-0, then retreats.
		const state: AeroplaneState = {
			...stateWhere({ 'red-0': 15, 'yellow-0': 3 }, { mode: 'sky-tycoon' }),
			pendingRoll: 1,
			tycoon: initialTycoonState(1),
		};
		const selected = resolveLegalMove(state, 'red-0', 1)!;
		const transition = playResolvedMove(state, selected);
		const timeline = buildMoveTimeline(transition.move, transition.state);

		expect(transition.move.finalEndpoint).toMatchObject({ progress: 13 });
		expect(timeline.captures[0]!.from).toEqual({
			x: TRACK_ANCHORS[15]!.x + STACK_OFFSETS[0]!.x,
			y: TRACK_ANCHORS[15]!.y + STACK_OFFSETS[0]!.y,
		});
		expect(timeline.segments.at(-1)!.to).toEqual(TRACK_ANCHORS[12]!);
	});
});
