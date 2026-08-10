import { canonicalSerialize } from './checksum';
import { getLegalMoves } from './rules';
import { FINISH_PROGRESS, TURN_ORDER } from './topology';
import type {
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	AiSeat,
	PersistedAeroplaneMatchV1,
	Personality,
} from './types';

export const ACTIVE_MATCH_STORAGE_KEY = 'procyon:aeroplane:active-match:v1';
export const SESSION_DIAGNOSTICS_KEY =
	'procyon:aeroplane:active-match:diagnostics:v1';

export interface AeroplaneStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export type RestoreActiveMatchResult =
	| { kind: 'ok'; match: PersistedAeroplaneMatchV1 }
	| { kind: 'empty' }
	| { kind: 'invalid'; reason: string }
	| { kind: 'unavailable'; reason: string };

export interface ValidationResult {
	ok: true;
	value: PersistedAeroplaneMatchV1;
}

export interface InvalidValidationResult {
	ok: false;
	reason: string;
}

export type PersistedAeroplaneValidationResult =
	| ValidationResult
	| InvalidValidationResult;

const PERSONALITIES = new Set<Personality>([
	'cautious',
	'aggressive',
	'unpredictable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is AeroplaneColor {
	return (
		typeof value === 'string' &&
		(TURN_ORDER as readonly string[]).includes(value)
	);
}

function isUint32(value: unknown, allowZero = true): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= (allowZero ? 0 : 1) &&
		value <= 0xffffffff
	);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

function isFiniteTimestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		Number.isFinite(Date.parse(value))
	);
}

function validConfig(value: unknown): value is AeroplaneConfig {
	if (!isRecord(value)) return false;
	return (
		(value.rulePreset === 'classic' ||
			value.rulePreset === 'quick-chill' ||
			value.rulePreset === 'custom') &&
		(value.victoryTarget === 2 || value.victoryTarget === 4) &&
		(value.diceMode === 'fair' || value.diceMode === 'relaxed') &&
		(value.launchRule === 'six' || value.launchRule === 'five-or-six') &&
		(value.finishRule === 'exact' || value.finishRule === 'bounce') &&
		isBoolean(value.stacking) &&
		isBoolean(value.blockades) &&
		isColor(value.humanColor) &&
		isBoolean(value.chatter) &&
		(!value.blockades || value.stacking)
	);
}

function validRng(value: unknown): boolean {
	return isRecord(value) && isUint32(value.value, false);
}

function validCounters(
	value: unknown
): value is Record<AeroplaneColor, number> {
	if (!isRecord(value)) return false;
	return TURN_ORDER.every(color => isNonNegativeInteger(value[color]));
}

function validStats(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		validCounters(value.capturesMade) &&
		validCounters(value.capturesSuffered) &&
		validCounters(value.finished)
	);
}

function validPosition(value: unknown): value is AeroplanePosition {
	if (!isRecord(value) || !isColor(value.color)) return false;
	switch (value.kind) {
		case 'hangar':
		case 'launch':
		case 'finished':
			return true;
		case 'track':
			return (
				isNonNegativeInteger(value.progress) &&
				value.progress >= 1 &&
				value.progress <= 50 &&
				isNonNegativeInteger(value.globalIndex) &&
				value.globalIndex <= 51
			);
		case 'home':
			return (
				isNonNegativeInteger(value.progress) &&
				value.progress >= 51 &&
				value.progress <= 55 &&
				isNonNegativeInteger(value.homeIndex) &&
				value.homeIndex <= 4
			);
		default:
			return false;
	}
}

function validEvent(value: unknown): value is AeroplaneEvent {
	if (!isRecord(value)) return false;
	if (
		(value.type !== 'move' &&
			value.type !== 'jump' &&
			value.type !== 'flight') ||
		typeof value.planeId !== 'string' ||
		!validPosition(value.from) ||
		!validPosition(value.to)
	)
		return false;
	return (
		value.distance === undefined ||
		(typeof value.distance === 'number' &&
			Number.isFinite(value.distance) &&
			value.distance >= 0)
	);
}

function selectedPlaneId(value: Record<string, unknown>): string | null {
	const selected = value.selectedPlaneId;
	return selected === null || selected === undefined
		? null
		: typeof selected === 'string' && selected.length > 0
			? selected
			: null;
}

function validAction(value: unknown): value is AeroplaneActionRecord {
	if (!isRecord(value)) return false;
	if (
		(value.kind !== 'roll' && value.kind !== 'move') ||
		(value.actor !== 'human' && value.actor !== 'ai') ||
		!isColor(value.color) ||
		!isNonNegativeInteger(value.roll) ||
		value.roll < 1 ||
		value.roll > 6 ||
		!Array.isArray(value.events) ||
		!value.events.every(validEvent) ||
		typeof value.checksum !== 'string' ||
		value.checksum.length === 0
	)
		return false;
	if (value.kind === 'move' && selectedPlaneId(value) === null) return false;
	return true;
}

function validSeats(
	value: unknown,
	humanColor: AeroplaneColor
): value is AiSeat[] {
	if (!Array.isArray(value) || value.length !== 3) return false;
	const colors = new Set<AeroplaneColor>();
	for (const seat of value) {
		if (
			!isRecord(seat) ||
			!isColor(seat.color) ||
			seat.color === humanColor ||
			!PERSONALITIES.has(seat.personality as Personality) ||
			colors.has(seat.color)
		)
			return false;
		colors.add(seat.color);
	}
	return colors.size === 3;
}

function validPlane(
	value: unknown,
	expectedId: string,
	expectedColor: AeroplaneColor
): boolean {
	if (!isRecord(value)) return false;
	return (
		value.id === expectedId &&
		value.color === expectedColor &&
		(value.progress === null ||
			(isNonNegativeInteger(value.progress) && value.progress <= 56))
	);
}

function validState(
	value: unknown,
	config: AeroplaneConfig
): value is AeroplaneState {
	if (!isRecord(value) || !isColor(value.currentPlayer)) return false;
	if (canonicalSerialize(value.config) !== canonicalSerialize(config))
		return false;
	if (
		(value.phase !== 'awaiting-roll' &&
			value.phase !== 'awaiting-choice' &&
			value.phase !== 'finished') ||
		(value.pendingRoll !== null &&
			(!isNonNegativeInteger(value.pendingRoll) ||
				value.pendingRoll < 1 ||
				value.pendingRoll > 6)) ||
		(value.phase === 'awaiting-roll' && value.pendingRoll !== null) ||
		(value.phase === 'awaiting-choice' && value.pendingRoll === null) ||
		(value.phase === 'finished' && value.pendingRoll !== null) ||
		(value.winner !== null && !isColor(value.winner)) ||
		(value.phase === 'finished' && value.winner === null) ||
		(value.phase !== 'finished' && value.winner !== null) ||
		!isNonNegativeInteger(value.turnNumber) ||
		value.turnNumber < 1 ||
		!isNonNegativeInteger(value.roundNumber) ||
		value.roundNumber < 1 ||
		!validCounters(value.noMoveStreak) ||
		!validCounters(value.lastPlaceRounds) ||
		!validStats(value.stats) ||
		!Array.isArray(value.planes) ||
		value.planes.length !== 16
	)
		return false;

	for (const color of TURN_ORDER) {
		for (let index = 0; index < 4; index += 1) {
			const expectedId = `${color}-${index}`;
			const plane = value.planes.find(
				candidate => isRecord(candidate) && candidate.id === expectedId
			);
			if (!validPlane(plane, expectedId, color)) return false;
		}
	}

	const authoritative = value as unknown as AeroplaneState;
	if (
		authoritative.phase === 'awaiting-choice' &&
		(authoritative.pendingRoll === null ||
			getLegalMoves(authoritative, authoritative.pendingRoll).length === 0)
	) {
		return false;
	}
	if (
		authoritative.phase === 'finished' &&
		(authoritative.winner !== authoritative.currentPlayer ||
			authoritative.winner === null ||
			authoritative.planes.filter(
				plane =>
					plane.color === authoritative.winner &&
					plane.progress === FINISH_PROGRESS
			).length < config.victoryTarget)
	) {
		return false;
	}
	return true;
}

/** Validate a persisted payload without replaying its action history. */
export function validatePersistedAeroplaneMatch(
	value: unknown
): PersistedAeroplaneValidationResult {
	if (!isRecord(value))
		return { ok: false, reason: 'snapshot must be an object' };
	if (value.version !== 1)
		return { ok: false, reason: 'unknown snapshot version' };
	if (typeof value.savedAt !== 'string' || value.savedAt.length === 0)
		return { ok: false, reason: 'savedAt must be a non-empty string' };
	if (value.startedAt !== undefined && !isFiniteTimestamp(value.startedAt))
		return { ok: false, reason: 'startedAt must be a finite timestamp' };
	if (value.completedAt !== undefined && !isFiniteTimestamp(value.completedAt))
		return { ok: false, reason: 'completedAt must be a finite timestamp' };
	if (!isUint32(value.rootSeed))
		return { ok: false, reason: 'invalid root seed' };
	if (!validConfig(value.config))
		return { ok: false, reason: 'invalid config' };
	if (!validState(value.state, value.config))
		return { ok: false, reason: 'invalid authoritative state' };
	if (!validSeats(value.seats, value.config.humanColor))
		return { ok: false, reason: 'invalid AI seats' };
	if (!validRng(value.diceRng) || !validRng(value.aiRng))
		return { ok: false, reason: 'invalid RNG state' };
	if (!Array.isArray(value.actions) || !value.actions.every(validAction))
		return { ok: false, reason: 'invalid action history' };
	return { ok: true, value: value as unknown as PersistedAeroplaneMatchV1 };
}

export function isValidPersistedAeroplaneMatch(
	value: unknown
): value is PersistedAeroplaneMatchV1 {
	return validatePersistedAeroplaneMatch(value).ok;
}

function browserStorage(
	name: 'localStorage' | 'sessionStorage'
): AeroplaneStorage | null {
	try {
		const root = globalThis as Record<string, unknown>;
		const windowValue = isRecord(root.window) ? root.window[name] : undefined;
		const candidate = root[name] ?? windowValue;
		if (
			isRecord(candidate) &&
			typeof candidate.getItem === 'function' &&
			typeof candidate.setItem === 'function' &&
			typeof candidate.removeItem === 'function'
		) {
			return candidate as unknown as AeroplaneStorage;
		}
	} catch {
		// Browser privacy settings can throw while reading localStorage itself.
	}
	return null;
}

function writeDiagnostics(
	reason: string,
	raw: string,
	diagnostics?: AeroplaneStorage | null
): void {
	const target = diagnostics ?? browserStorage('sessionStorage');
	if (!target) return;
	try {
		target.setItem(
			SESSION_DIAGNOSTICS_KEY,
			JSON.stringify({ reason, raw, recordedAt: new Date().toISOString() })
		);
	} catch {
		// Diagnostics are best effort and must never interrupt gameplay.
	}
}

function removeActive(storage: AeroplaneStorage): void {
	try {
		storage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
	} catch {
		// Storage failures are non-fatal by design.
	}
}

/** Save a validated authoritative envelope; returns false when storage fails. */
export function saveActiveMatch(
	value: PersistedAeroplaneMatchV1,
	storage?: AeroplaneStorage
): boolean {
	const target = storage ?? browserStorage('localStorage');
	if (!target) return false;
	if (!isValidPersistedAeroplaneMatch(value)) return false;
	try {
		target.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

/**
 * Restore the authoritative snapshot directly.  Action checksums are only
 * structural diagnostics here; replay is intentionally not called.
 */
export function restoreActiveMatch(
	storage?: AeroplaneStorage,
	diagnostics?: AeroplaneStorage
): RestoreActiveMatchResult {
	const target = storage ?? browserStorage('localStorage');
	if (!target) return { kind: 'empty' };
	let raw: string | null;
	try {
		raw = target.getItem(ACTIVE_MATCH_STORAGE_KEY);
	} catch {
		return { kind: 'unavailable', reason: 'active-match storage unavailable' };
	}
	if (raw === null) return { kind: 'empty' };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		removeActive(target);
		writeDiagnostics('invalid JSON', raw, diagnostics);
		return { kind: 'invalid', reason: 'invalid JSON' };
	}
	const validation = validatePersistedAeroplaneMatch(parsed);
	if (!validation.ok) {
		removeActive(target);
		writeDiagnostics(validation.reason, raw, diagnostics);
		return { kind: 'invalid', reason: validation.reason };
	}
	return { kind: 'ok', match: validation.value };
}

export function clearActiveMatch(storage?: AeroplaneStorage): void {
	const target = storage ?? browserStorage('localStorage');
	if (target) removeActive(target);
}
