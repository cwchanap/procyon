/**
 * Render-only board projection data.  These coordinates are normalized to a
 * 100 by 100 square so the board can scale with its container.  No gameplay
 * module imports this file: logical progress remains the sole source of
 * legality and movement decisions.  The flight-progress offsets are imported
 * from topology so the render projection stays aligned with the rules.
 */

import { FLIGHT_ENTRANCE_PROGRESS, FLIGHT_EXIT_PROGRESS } from './topology';

export type AeroplaneLayoutColor = 'red' | 'yellow' | 'blue' | 'green';

export interface LayoutAnchor {
	x: number;
	y: number;
}

export interface FlightGuide {
	color: AeroplaneLayoutColor;
	from: LayoutAnchor;
	to: LayoutAnchor;
	control: LayoutAnchor;
}

const COLORS: readonly AeroplaneLayoutColor[] = [
	'red',
	'yellow',
	'blue',
	'green',
];

const CENTER = 50;
const TRACK_RADIUS = 37;

function rotateQuarter(anchor: LayoutAnchor, turns = 1): LayoutAnchor {
	let current = anchor;
	for (let index = 0; index < turns; index += 1) {
		current = { x: 100 - current.y, y: current.x };
	}
	return current;
}

function rotatePath(
	path: readonly LayoutAnchor[],
	turns: number
): LayoutAnchor[] {
	return path.map(anchor => rotateQuarter(anchor, turns));
}

/** 52 shared clockwise track nodes, beginning at the red start side. */
export const TRACK_ANCHORS: readonly LayoutAnchor[] = Object.freeze(
	Array.from({ length: 52 }, (_, index) => {
		const angle = -Math.PI / 2 + (index / 52) * Math.PI * 2;
		return Object.freeze({
			x: CENTER + Math.cos(angle) * TRACK_RADIUS,
			y: CENTER + Math.sin(angle) * TRACK_RADIUS,
		});
	})
);

/** Player launch pads.  Each colour is one quarter turn clockwise from red. */
export const LAUNCH_PADS: Readonly<Record<AeroplaneLayoutColor, LayoutAnchor>> =
	Object.freeze({
		red: Object.freeze({ x: 50, y: 7 }),
		yellow: Object.freeze({ x: 93, y: 50 }),
		blue: Object.freeze({ x: 50, y: 93 }),
		green: Object.freeze({ x: 7, y: 50 }),
	});

const RED_HANGAR_SLOTS: readonly LayoutAnchor[] = [
	{ x: 18, y: 18 },
	{ x: 30, y: 18 },
	{ x: 18, y: 30 },
	{ x: 30, y: 30 },
];

/** Four hangar slots for each colour, arranged with rotational symmetry. */
export const HANGAR_SLOTS: Readonly<
	Record<AeroplaneLayoutColor, readonly LayoutAnchor[]>
> = Object.freeze({
	red: Object.freeze(RED_HANGAR_SLOTS.map(anchor => Object.freeze(anchor))),
	yellow: Object.freeze(
		rotatePath(RED_HANGAR_SLOTS, 1).map(anchor => Object.freeze(anchor))
	),
	blue: Object.freeze(
		rotatePath(RED_HANGAR_SLOTS, 2).map(anchor => Object.freeze(anchor))
	),
	green: Object.freeze(
		rotatePath(RED_HANGAR_SLOTS, 3).map(anchor => Object.freeze(anchor))
	),
});

// Red's private lane moves from the southern edge of the shared track toward
// the centre.  The other lanes are quarter-turn projections of this path.
const RED_HOME_PATH: readonly LayoutAnchor[] = [
	{ x: 50, y: 43 },
	{ x: 50, y: 39 },
	{ x: 50, y: 35 },
	{ x: 50, y: 31 },
	{ x: 50, y: 27 },
	{ x: 50, y: 50 },
];

/** Six private home cells (including the finished cell) per colour. */
export const HOME_PATHS: Readonly<
	Record<AeroplaneLayoutColor, readonly LayoutAnchor[]>
> = Object.freeze({
	red: Object.freeze(RED_HOME_PATH.map(anchor => Object.freeze(anchor))),
	yellow: Object.freeze(
		rotatePath(RED_HOME_PATH, 1).map(anchor => Object.freeze(anchor))
	),
	blue: Object.freeze(
		rotatePath(RED_HOME_PATH, 2).map(anchor => Object.freeze(anchor))
	),
	green: Object.freeze(
		rotatePath(RED_HOME_PATH, 3).map(anchor => Object.freeze(anchor))
	),
});

/** Progress offsets used only to project a player's logical track onto SVG. */
export const START_OFFSETS: Readonly<Record<AeroplaneLayoutColor, number>> =
	Object.freeze({ red: 0, yellow: 13, blue: 26, green: 39 });

/** Centre flight guides shown whenever a resolved route includes a flight. */
export const FLIGHT_GUIDES: readonly FlightGuide[] = Object.freeze(
	COLORS.map((color, index) => {
		const offset = START_OFFSETS[COLORS[index]!]!;
		const from =
			TRACK_ANCHORS[
				(offset + FLIGHT_ENTRANCE_PROGRESS - 1) % TRACK_ANCHORS.length
			]!;
		const to =
			TRACK_ANCHORS[
				(offset + FLIGHT_EXIT_PROGRESS - 1) % TRACK_ANCHORS.length
			]!;
		const control = rotateQuarter({ x: 50, y: 50 - 16 }, index);
		return Object.freeze({ color, from, to, control });
	})
);

/** Small, normalized offsets that keep stacked planes individually visible. */
export const STACK_OFFSETS: readonly LayoutAnchor[] = Object.freeze([
	Object.freeze({ x: 0, y: 0 }),
	Object.freeze({ x: 1.8, y: -1.8 }),
	Object.freeze({ x: -1.8, y: 1.8 }),
	Object.freeze({ x: 1.8, y: 1.8 }),
]);
