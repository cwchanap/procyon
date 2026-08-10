import type { AeroplaneColor, AeroplanePosition } from './types';

export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const START_OFFSET = {
	red: 0,
	yellow: 13,
	blue: 26,
	green: 39,
} as const;
export const SHARED_PROGRESS_MAX = 50;
export const FINISH_PROGRESS = 56;
export const FLIGHT_ENTRANCE_PROGRESS = 18;
export const FLIGHT_EXIT_PROGRESS = 30;

function assertProgress(progress: number): void {
	if (
		!Number.isInteger(progress) ||
		progress < 0 ||
		progress > FINISH_PROGRESS
	) {
		throw new RangeError(
			`Aeroplane progress must be an integer from 0 to ${FINISH_PROGRESS}`
		);
	}
}

function assertTrackProgress(progress: number): void {
	if (
		!Number.isInteger(progress) ||
		progress < 1 ||
		progress > SHARED_PROGRESS_MAX
	) {
		throw new RangeError(
			`Aeroplane track progress must be an integer from 1 to ${SHARED_PROGRESS_MAX}`
		);
	}
}

/** Convert player-relative track progress to one of the 52 shared nodes. */
export function toGlobalTrackIndex(
	color: AeroplaneColor,
	progress: number
): number {
	assertTrackProgress(progress);
	const offset = START_OFFSET[color];
	if (offset === undefined)
		throw new RangeError(`Unknown Aeroplane colour: ${String(color)}`);
	return (offset + progress - 1) % 52;
}

/** Return the logical position used by rule events and board projections. */
export function toPosition(
	color: AeroplaneColor,
	progress: number | null
): AeroplanePosition {
	if (progress === null) return { kind: 'hangar', color };
	assertProgress(progress);
	if (progress === 0) return { kind: 'launch', color };
	if (progress <= SHARED_PROGRESS_MAX) {
		return {
			kind: 'track',
			color,
			progress,
			globalIndex: toGlobalTrackIndex(color, progress),
		};
	}
	if (progress < FINISH_PROGRESS) {
		return { kind: 'home', color, progress, homeIndex: progress - 51 };
	}
	return { kind: 'finished', color };
}

export function isFlightEntrance(progress: number): boolean {
	return progress === FLIGHT_ENTRANCE_PROGRESS;
}

/**
 * Matching-colour jump nodes are every fourth shared step. The flight
 * entrance is a dedicated node, not a normal jump node, and progress 50 has
 * no room for the +4 jump.
 */
export function isNormalJumpSquare(progress: number): boolean {
	return (
		Number.isInteger(progress) &&
		progress >= 1 &&
		progress <= SHARED_PROGRESS_MAX &&
		progress !== FLIGHT_ENTRANCE_PROGRESS &&
		progress % 4 === 2 &&
		progress + 4 <= SHARED_PROGRESS_MAX
	);
}

export function isSharedTrackProgress(progress: number): boolean {
	return (
		Number.isInteger(progress) &&
		progress >= 1 &&
		progress <= SHARED_PROGRESS_MAX
	);
}

export function isPrivateHomeProgress(progress: number): boolean {
	return Number.isInteger(progress) && progress >= 51 && progress <= 55;
}
