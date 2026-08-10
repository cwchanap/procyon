import { expect, test } from 'bun:test';
import { deriveRngStreams, nextUint32 } from './rng';

test('nextUint32 is deterministic and does not mutate input', () => {
	const input = { value: 123456789 };
	const before = structuredClone(input);
	const first = nextUint32(input);
	const second = nextUint32({ value: 123456789 });

	expect(first).toEqual(second);
	expect(input).toEqual(before);
	expect(first.rng).not.toBe(input);
});

test('zero xorshift state is normalized to a nonzero state', () => {
	const result = nextUint32({ value: 0 });

	expect(result.rng.value).not.toBe(0);
	expect(result.value).not.toBe(0);
});

test('dice and AI streams differ for the same root seed', () => {
	const streams = deriveRngStreams(39101);

	expect(streams.dice).not.toEqual(streams.ai);
});
