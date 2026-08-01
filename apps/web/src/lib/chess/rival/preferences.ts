import type { ChessSide, RivalKind } from './types';

export const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v1';

export interface RivalPreferenceStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface RivalPreferencesV1 {
	version: 1;
	lastRivalKind: RivalKind;
	humanSideByRival: Record<RivalKind, ChessSide>;
}

export function createDefaultRivalPreferences(): RivalPreferencesV1 {
	return {
		version: 1,
		lastRivalKind: 'engine',
		humanSideByRival: {
			engine: 'white',
			llm: 'white',
		},
	};
}

function isRivalKind(value: unknown): value is RivalKind {
	return value === 'engine' || value === 'llm';
}

function isChessSide(value: unknown): value is ChessSide {
	return value === 'white' || value === 'black';
}

function parseRivalPreferences(raw: string): RivalPreferencesV1 | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return null;
	}

	const record = parsed as Record<string, unknown>;
	if (record.version !== 1 || !isRivalKind(record.lastRivalKind)) {
		return null;
	}

	const sides = record.humanSideByRival;
	if (typeof sides !== 'object' || sides === null) {
		return null;
	}

	const sideRecord = sides as Record<string, unknown>;
	if (!isChessSide(sideRecord.engine) || !isChessSide(sideRecord.llm)) {
		return null;
	}

	return {
		version: 1,
		lastRivalKind: record.lastRivalKind,
		humanSideByRival: {
			engine: sideRecord.engine,
			llm: sideRecord.llm,
		},
	};
}

export function readRivalPreferences(
	storage: RivalPreferenceStorage
): RivalPreferencesV1 {
	const raw = storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY);
	if (raw === null) {
		return createDefaultRivalPreferences();
	}

	return parseRivalPreferences(raw) ?? createDefaultRivalPreferences();
}

function writeRivalPreferences(
	storage: RivalPreferenceStorage,
	preferences: RivalPreferencesV1
): void {
	try {
		storage.setItem(RIVAL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
	} catch {
		// Storage may be unavailable (private mode, disabled cookies) or
		// quota-limited. Swallow so rival selection still works in-memory.
	}
}

export function persistRivalKind(
	storage: RivalPreferenceStorage,
	kind: RivalKind
): void {
	const preferences = readRivalPreferences(storage);
	writeRivalPreferences(storage, {
		...preferences,
		lastRivalKind: kind,
	});
}

export function persistHumanSide(
	storage: RivalPreferenceStorage,
	rivalKind: RivalKind,
	side: ChessSide
): void {
	const preferences = readRivalPreferences(storage);
	writeRivalPreferences(storage, {
		...preferences,
		humanSideByRival: {
			...preferences.humanSideByRival,
			[rivalKind]: side,
		},
	});
}
