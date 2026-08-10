/** The serializable state of one deterministic xorshift32 stream. */
export interface RngState {
	readonly value: number;
}

export interface RngSample {
	readonly value: number;
	readonly rng: RngState;
}

/** xorshift32 has one absorbing state; use a fixed seed instead of zero. */
export const NONZERO_RNG_VALUE = 0x6d2b79f5;

function normalizeValue(value: number): number {
	if (!Number.isFinite(value)) return NONZERO_RNG_VALUE;
	const normalized = Math.trunc(value) >>> 0;
	return normalized === 0 ? NONZERO_RNG_VALUE : normalized;
}

export function normalizeRngState(state: RngState | number): RngState {
	return {
		value: normalizeValue(typeof state === 'number' ? state : state.value),
	};
}

/**
 * Advance a stream without mutating the input. The returned value is the
 * uint32 sample and `rng` is the immutable state to use for the next sample.
 */
export function nextUint32(state: RngState): RngSample {
	let value = normalizeValue(state.value);
	value ^= value << 13;
	value ^= value >>> 17;
	value ^= value << 5;
	value >>>= 0;
	if (value === 0) value = NONZERO_RNG_VALUE;
	return { value, rng: { value } };
}

/**
 * Derive independent deterministic streams from one match seed. Distinct
 * salts keep dice and AI consumption isolated even when they start together.
 */
export function deriveRngStreams(rootSeed: number): {
	dice: RngState;
	ai: RngState;
} {
	const seed = normalizeValue(rootSeed);
	const diceSeed = normalizeValue(seed ^ 0xa511e9b3);
	const aiSeed = normalizeValue(seed ^ 0x63d83595);
	return {
		dice: { value: nextUint32({ value: diceSeed }).value },
		ai: { value: nextUint32({ value: aiSeed }).value },
	};
}
