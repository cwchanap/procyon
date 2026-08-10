import type { AeroplaneState } from './types';

const OMITTED_KEYS = new Set([
	'savedAt',
	'timestamp',
	'presentation',
	'presentationQueue',
	'chatter',
	'diagnostics',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a stable JSON-compatible value for checksums.  Object keys are sorted
 * at every level and plane arrays are ordered by their stable ids.  UI and
 * diagnostic timestamps are deliberately omitted so presentation work cannot
 * change an authoritative checksum.
 */
function canonicalize(value: unknown, key?: string): unknown {
	if (key !== undefined && OMITTED_KEYS.has(key)) return undefined;
	if (Array.isArray(value)) {
		const values = value
			.map(item => canonicalize(item))
			.filter(item => item !== undefined);
		if (
			key === 'planes' &&
			values.every(item => isRecord(item) && typeof item.id === 'string')
		) {
			return values.sort((a, b) =>
				String((a as Record<string, unknown>).id).localeCompare(
					String((b as Record<string, unknown>).id)
				)
			);
		}
		return values;
	}
	if (isRecord(value)) {
		const result: Record<string, unknown> = {};
		for (const objectKey of Object.keys(value).sort()) {
			const next = canonicalize(value[objectKey], objectKey);
			if (next !== undefined) result[objectKey] = next;
		}
		return result;
	}
	return value;
}

export function canonicalSerialize(value: unknown): string {
	return JSON.stringify(canonicalize(value)) ?? 'null';
}

/**
 * Deterministic, non-cryptographic FNV-1a checksum for an authoritative state.
 * Passing a persisted envelope is convenient for diagnostics; in that case
 * only its `state` member is hashed, keeping action checksums independent of
 * save timestamps and presentation metadata.
 */
export function checksumState(
	state: AeroplaneState | { state: AeroplaneState } | unknown
): string {
	const source = isRecord(state) && isRecord(state.state) ? state.state : state;
	const serialized = canonicalSerialize(source);
	let hash = 0x811c9dc5;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}
