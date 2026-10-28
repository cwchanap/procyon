import { canonicalSerialize } from './checksum';
import { getLegalMoves } from './rules';
import { FINISH_PROGRESS, TURN_ORDER } from './topology';
import { tycoonTileKindAt } from './tycoon';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	AiSeat,
	PersistedAeroplaneMatchV2,
	Personality,
	SkyTycoonState,
	TycoonEffectEvent,
} from './types';

export const ACTIVE_MATCH_STORAGE_KEY = 'procyon:aeroplane:active-match:v2';
/** Key that held pre-v2 envelopes; read once, then always removed. */
export const LEGACY_MATCH_STORAGE_KEY = 'procyon:aeroplane:active-match:v1';
export const SESSION_DIAGNOSTICS_KEY =
	'procyon:aeroplane:active-match:diagnostics:v1';

export interface AeroplaneStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export type RestoreActiveMatchResult =
	| { kind: 'ok'; match: PersistedAeroplaneMatchV2 }
	| { kind: 'empty' }
	| { kind: 'invalid'; reason: string }
	| { kind: 'unavailable'; reason: string };

export interface ValidationResult {
	ok: true;
	value: PersistedAeroplaneMatchV2;
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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is AeroplaneColor {
	return (
		typeof value === 'string' &&
		(TURN_ORDER as readonly string[]).includes(value)
	);
}

export function isUint32(value: unknown, allowZero = true): value is number {
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

export function validConfig(value: unknown): value is AeroplaneConfig {
	if (!isRecord(value)) return false;
	return (
		(value.mode === 'standard' || value.mode === 'sky-tycoon') &&
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

function validPlaneId(value: unknown): value is string {
	return (
		typeof value === 'string' && /^(red|yellow|blue|green)-[0-3]$/.test(value)
	);
}

function isAirportTile(value: unknown): value is number {
	return isNonNegativeInteger(value) && tycoonTileKindAt(value) === 'airport';
}

const COIN_REASONS = new Set<unknown>([
	'departure',
	'airport-buy',
	'chance',
	'customs',
	'tax',
]);
const RELOCATION_EFFECTS = new Set<unknown>([
	'boost',
	'wormhole',
	'storm',
	'crash',
]);
const CHANCE_CARDS = new Set<unknown>(TYCOON_CHANCE_CARDS);

/** Positional movement; `warp` is a direct relocation but still positional. */
function validPositionalEvent(value: Record<string, unknown>): boolean {
	if (
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

/** Coordinate-free Sky Tycoon effect discriminants. */
function validEffectEvent(value: Record<string, unknown>): boolean {
	switch (value.type) {
		case 'coins':
			return (
				isColor(value.color) &&
				Number.isInteger(value.amount) &&
				COIN_REASONS.has(value.reason)
			);
		case 'transfer':
			return (
				isColor(value.from) &&
				isColor(value.to) &&
				value.from !== value.to &&
				isNonNegativeInteger(value.amount) &&
				value.amount > 0 &&
				(value.reason === 'airport-toll' || value.reason === 'steal')
			);
		case 'airport':
			return isAirportTile(value.tile) && isColor(value.owner);
		case 'card':
			return isColor(value.color) && CHANCE_CARDS.has(value.card);
		case 'shield':
			return validPlaneId(value.planeId);
		case 'skip':
		case 'skipped':
		case 'tailwind':
			return isColor(value.color);
		case 'relocation':
			return (
				validPlaneId(value.planeId) &&
				RELOCATION_EFFECTS.has(value.effect) &&
				(value.toProgress === null ||
					(isNonNegativeInteger(value.toProgress) &&
						value.toProgress <= FINISH_PROGRESS))
			);
		default:
			return false;
	}
}

function validEvent(
	value: unknown
): value is AeroplaneEvent | TycoonEffectEvent {
	if (!isRecord(value)) return false;
	switch (value.type) {
		case 'move':
		case 'jump':
		case 'flight':
		case 'warp':
			return validPositionalEvent(value);
		default:
			return validEffectEvent(value);
	}
}

/** `chanceOrder` must be exactly a permutation of the ten card IDs. */
function validChanceOrder(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length === TYCOON_CHANCE_CARDS.length &&
		new Set(value).size === value.length &&
		value.every(card => CHANCE_CARDS.has(card))
	);
}

function validTycoon(value: unknown): value is SkyTycoonState {
	if (!isRecord(value)) return false;
	const { airports, shields, skipNextRoll, skipPending } = value;
	return (
		validCounters(value.coins) &&
		isRecord(airports) &&
		Object.entries(airports).every(
			([tile, owner]) =>
				/^\d+$/.test(tile) && isAirportTile(Number(tile)) && isColor(owner)
		) &&
		Array.isArray(shields) &&
		new Set(shields).size === shields.length &&
		shields.every(validPlaneId) &&
		isRecord(skipNextRoll) &&
		TURN_ORDER.every(color => isBoolean(skipNextRoll[color])) &&
		isRecord(skipPending) &&
		TURN_ORDER.every(color => isBoolean(skipPending[color])) &&
		validChanceOrder(value.chanceOrder) &&
		isNonNegativeInteger(value.chanceCursor)
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

export function validSeats(
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
		value.planes.length !== 16 ||
		(config.mode === 'sky-tycoon'
			? !validTycoon(value.tycoon)
			: value.tycoon !== null)
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
	let legalMoveCount = 0;
	try {
		legalMoveCount =
			authoritative.phase === 'awaiting-choice' &&
			authoritative.pendingRoll !== null
				? getLegalMoves(authoritative, authoritative.pendingRoll).length
				: 0;
	} catch {
		return false;
	}
	if (
		authoritative.phase === 'awaiting-choice' &&
		(authoritative.pendingRoll === null || legalMoveCount === 0)
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
	if (value.version === 1)
		return {
			ok: false,
			reason: 'v1 snapshots are no longer supported (no migration)',
		};
	if (value.version !== 2)
		return { ok: false, reason: 'unknown snapshot version' };
	if (!isFiniteTimestamp(value.savedAt))
		return { ok: false, reason: 'savedAt must be a finite timestamp' };
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
	const normalizedActions = (
		value.actions as unknown as Record<string, unknown>[]
	).map(action => ({
		...action,
		selectedPlaneId: selectedPlaneId(action),
	}));
	return {
		ok: true,
		value: {
			...value,
			actions: normalizedActions,
		} as unknown as PersistedAeroplaneMatchV2,
	};
}

export function isValidPersistedAeroplaneMatch(
	value: unknown
): value is PersistedAeroplaneMatchV2 {
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
		storage.removeItem(LEGACY_MATCH_STORAGE_KEY);
	} catch {
		// Storage failures are non-fatal by design.
	}
}

/** Save a validated authoritative envelope; returns false when storage fails. */
export function saveActiveMatch(
	value: PersistedAeroplaneMatchV2,
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
		if (raw === null) {
			// Matches saved before the v2 envelope lived under the v1 key.
			// Consume it on read so the pipeline below can still validate or
			// diagnose it, and so an abandoned snapshot cannot resurrect
			// after the v2 key is later cleared.
			raw = target.getItem(LEGACY_MATCH_STORAGE_KEY);
			if (raw !== null) target.removeItem(LEGACY_MATCH_STORAGE_KEY);
		}
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
