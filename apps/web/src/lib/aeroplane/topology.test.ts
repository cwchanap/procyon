import { describe, expect, test } from 'bun:test';
import {
	FLIGHT_ENTRANCE_PROGRESS,
	START_OFFSET,
	TURN_ORDER,
	isFlightEntrance,
	isNormalJumpSquare,
	toGlobalTrackIndex,
	toPosition,
} from './topology';

describe('Aeroplane topology', () => {
	test('uses the clockwise 13-node colour offsets', () => {
		expect(START_OFFSET).toEqual({ red: 0, yellow: 13, blue: 26, green: 39 });
		expect(TURN_ORDER).toEqual(['red', 'yellow', 'blue', 'green']);
		expect(toGlobalTrackIndex('red', 1)).toBe(0);
		expect(toGlobalTrackIndex('yellow', 1)).toBe(13);
		expect(toGlobalTrackIndex('blue', 1)).toBe(26);
		expect(toGlobalTrackIndex('green', 1)).toBe(39);
		expect(toGlobalTrackIndex('green', 14)).toBe(0);
	});

	test('marks the dedicated flight entrance and normal jump squares', () => {
		expect(FLIGHT_ENTRANCE_PROGRESS).toBe(18);
		expect(isFlightEntrance(18)).toBe(true);
		expect(isFlightEntrance(17)).toBe(false);
		expect(isNormalJumpSquare(14)).toBe(true);
		expect(isNormalJumpSquare(18)).toBe(false);
		expect(isNormalJumpSquare(30)).toBe(true);
		expect(isNormalJumpSquare(50)).toBe(false);
	});

	test('classifies track, home, launch, hangar, and finished positions', () => {
		expect(toPosition('red', null)).toEqual({ kind: 'hangar', color: 'red' });
		expect(toPosition('red', 0)).toEqual({ kind: 'launch', color: 'red' });
		expect(toPosition('red', 1)).toMatchObject({
			kind: 'track',
			color: 'red',
			progress: 1,
			globalIndex: 0,
		});
		expect(toPosition('red', 51)).toEqual({
			kind: 'home',
			color: 'red',
			progress: 51,
			homeIndex: 0,
		});
		expect(toPosition('red', 56)).toEqual({ kind: 'finished', color: 'red' });
	});

	test('rejects invalid logical progress', () => {
		expect(() => toGlobalTrackIndex('red', 0)).toThrow(/track progress/i);
		expect(() => toGlobalTrackIndex('red', 51)).toThrow(/track progress/i);
		expect(() => toPosition('red', -1)).toThrow(/progress/i);
		expect(() => toPosition('red', 57)).toThrow(/progress/i);
	});
});
