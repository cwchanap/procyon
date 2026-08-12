import {
	isEngineDifficulty,
	type ChessSide,
	type EngineDifficulty,
	type RivalKind,
} from './types';

export const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v2';

export interface RivalPreferenceStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface RivalPreferencesV2 {
	version: 2;
	lastRivalKind: RivalKind;
	humanSideByRival: Record<RivalKind, ChessSide>;
	engineDifficulty: EngineDifficulty;
}

export function createDefaultRivalPreferences(): RivalPreferencesV2 {
	return {
		version: 2,
		lastRivalKind: 'engine',
		humanSideByRival: {
			engine: 'white',
			llm: 'white',
		},
		engineDifficulty: 'casual',
	};
}

function isRivalKind(value: unknown): value is RivalKind {
	return value === 'engine' || value === 'llm';
}

function isChessSide(value: unknown): value is ChessSide {
	return value === 'white' || value === 'black';
}

export function parseRivalPreferences(raw: string): RivalPreferencesV2 | null {
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
	if (
		record.version !== 2 ||
		!isRivalKind(record.lastRivalKind) ||
		!isEngineDifficulty(record.engineDifficulty)
	) {
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
		version: 2,
		lastRivalKind: record.lastRivalKind,
		humanSideByRival: {
			engine: sideRecord.engine,
			llm: sideRecord.llm,
		},
		engineDifficulty: record.engineDifficulty,
	};
}

export function readRivalPreferences(
	storage: RivalPreferenceStorage
): RivalPreferencesV2 {
	let raw: string | null;
	try {
		raw = storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY);
	} catch {
		// Reads can throw in the same blocked contexts as writes (private
		// mode, disabled cookies). Fall back to defaults so a subsequent
		// persist still works from that default state instead of throwing
		// before the caller can update its in-memory state.
		return createDefaultRivalPreferences();
	}
	if (raw === null) {
		return createDefaultRivalPreferences();
	}

	return parseRivalPreferences(raw) ?? createDefaultRivalPreferences();
}

function writeRivalPreferences(
	storage: RivalPreferenceStorage,
	preferences: RivalPreferencesV2
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

export function persistEngineDifficulty(
	storage: RivalPreferenceStorage,
	difficulty: EngineDifficulty
): void {
	const preferences = readRivalPreferences(storage);
	writeRivalPreferences(storage, {
		...preferences,
		engineDifficulty: difficulty,
	});
}
