import { describe, expect, test } from 'bun:test';
import { getChatterLine, type AeroplaneChatterCue } from './chatter';
import type { ResolvedMove } from './types';

const captureMove: ResolvedMove = {
	planeId: 'red-0',
	color: 'red',
	roll: 3,
	start: { kind: 'track', color: 'red', progress: 4, globalIndex: 3 },
	baseEndpoint: { kind: 'track', color: 'red', progress: 7, globalIndex: 6 },
	finalEndpoint: { kind: 'track', color: 'red', progress: 7, globalIndex: 6 },
	events: [
		{
			type: 'move',
			planeId: 'red-0',
			from: { kind: 'track', color: 'red', progress: 4, globalIndex: 3 },
			to: { kind: 'track', color: 'red', progress: 7, globalIndex: 6 },
		},
	],
	capturedPlaneIds: ['blue-0'],
};

const flightMove: ResolvedMove = {
	...captureMove,
	planeId: 'blue-0',
	color: 'blue',
	capturedPlaneIds: [],
	events: [
		{
			type: 'flight',
			planeId: 'blue-0',
			from: { kind: 'track', color: 'blue', progress: 18, globalIndex: 43 },
			to: { kind: 'track', color: 'blue', progress: 30, globalIndex: 3 },
			distance: 12,
		},
	],
};

const finishMove: ResolvedMove = {
	...captureMove,
	planeId: 'green-0',
	color: 'green',
	finalEndpoint: { kind: 'finished', color: 'green' },
	capturedPlaneIds: [],
	events: [
		{
			type: 'move',
			planeId: 'green-0',
			from: { kind: 'home', color: 'green', progress: 55, homeIndex: 4 },
			to: { kind: 'finished', color: 'green' },
		},
	],
};

describe('Aeroplane local chatter', () => {
	test('same notable event produces a stable local line', () => {
		const first = getChatterLine(captureMove, 'aggressive');
		const second = getChatterLine(captureMove, 'aggressive');

		expect(first).toBeTruthy();
		expect(first).toBe(second);
	});

	test('selects presentation-only lines for each notable event kind', () => {
		const cues: AeroplaneChatterCue[] = [
			{ kind: 'capture', token: 'blue-0' },
			{ kind: 'flight', token: 'blue-0' },
			{ kind: 'finish', token: 'green-0' },
			{ kind: 'win', token: 'red' },
			{ kind: 'loss', token: 'yellow' },
		];

		for (const cue of cues) {
			expect(getChatterLine(cue, 'cautious')).toBeTruthy();
		}
	});

	test('derives flight and finish cues from committed moves', () => {
		expect(getChatterLine(flightMove, 'unpredictable')).toBeTruthy();
		expect(getChatterLine(finishMove, 'cautious')).toBeTruthy();
	});

	test('returns no line for an ordinary move', () => {
		const ordinary = { ...captureMove, capturedPlaneIds: [] };
		expect(getChatterLine(ordinary, 'aggressive')).toBeNull();
	});
});
