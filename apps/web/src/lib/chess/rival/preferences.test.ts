import { describe, expect, test } from 'bun:test';
import {
	RIVAL_PREFERENCES_STORAGE_KEY,
	readRivalPreferences,
	persistEngineDifficulty,
	persistHumanSide,
	persistRivalKind,
	type RivalPreferenceStorage,
	type RivalPreferencesV2,
} from './preferences';

function createMemoryStorage(
	initial: Record<string, string> = {}
): RivalPreferenceStorage {
	const store = new Map(Object.entries(initial));
	return {
		getItem: key => store.get(key) ?? null,
		setItem: (key, value) => {
			store.set(key, value);
		},
	};
}

const defaultPreferences: RivalPreferencesV2 = {
	version: 2,
	lastRivalKind: 'engine',
	humanSideByRival: {
		engine: 'white',
		llm: 'white',
	},
	engineDifficulty: 'casual',
};

// The pre-V2 payload key, hard-coded here so the "only the V2 key is read"
// isolation assertion does not depend on the module under test.
const LEGACY_V1_STORAGE_KEY = 'procyon.chess.rival-preferences.v1';

describe('rival preferences', () => {
	test('missing V2 storage returns Casual defaults', () => {
		const storage = createMemoryStorage();
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('V2 round-trips rival, side, and difficulty independently', () => {
		const storage = createMemoryStorage();
		persistRivalKind(storage, 'llm');
		persistHumanSide(storage, 'engine', 'black');
		persistEngineDifficulty(storage, 'strong');

		expect(readRivalPreferences(storage)).toEqual({
			version: 2,
			lastRivalKind: 'llm',
			humanSideByRival: {
				engine: 'black',
				llm: 'white',
			},
			engineDifficulty: 'strong',
		});
	});

	test('invalid V2 difficulty falls back to full defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 2,
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'black', llm: 'black' },
				engineDifficulty: 'expert',
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('corrupt JSON falls back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: '{not-json',
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('future version falls back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 3,
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'black', llm: 'black' },
				engineDifficulty: 'strong',
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('invalid opponent and side values fall back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 2,
				lastRivalKind: 'cloud',
				humanSideByRival: { engine: 'purple', llm: 'white' },
				engineDifficulty: 'casual',
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('only the V2 key is read: a V1-key-only store returns defaults', () => {
		const storage = createMemoryStorage({
			[LEGACY_V1_STORAGE_KEY]: JSON.stringify({
				version: 1,
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'black', llm: 'black' },
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('automatic fallback does not update lastRivalKind', () => {
		const storage = createMemoryStorage();
		persistRivalKind(storage, 'engine');
		persistHumanSide(storage, 'engine', 'white');

		// Capture the storage snapshot after the explicit persists.
		const before = storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY);
		expect(before).not.toBeNull();

		readRivalPreferences(storage);
		readRivalPreferences(storage);

		expect(readRivalPreferences(storage).lastRivalKind).toBe('engine');
		// No write should have occurred during the reads.
		expect(storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY)).toBe(before);
		expect(storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY)).toContain(
			'"lastRivalKind":"engine"'
		);
	});

	test('blocked storage reads fall back to defaults and persists never throw', () => {
		const throwingStorage: RivalPreferenceStorage = {
			getItem: () => {
				throw new Error('storage blocked');
			},
			setItem: () => {
				throw new Error('storage blocked');
			},
		};

		expect(readRivalPreferences(throwingStorage)).toEqual(defaultPreferences);
		expect(() => persistRivalKind(throwingStorage, 'llm')).not.toThrow();
		expect(() =>
			persistHumanSide(throwingStorage, 'engine', 'black')
		).not.toThrow();
		expect(() =>
			persistEngineDifficulty(throwingStorage, 'strong')
		).not.toThrow();
	});
});
