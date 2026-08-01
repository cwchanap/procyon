import { describe, expect, test } from 'bun:test';
import {
	RIVAL_PREFERENCES_STORAGE_KEY,
	readRivalPreferences,
	persistHumanSide,
	persistRivalKind,
	type RivalPreferenceStorage,
	type RivalPreferencesV1,
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

const defaultPreferences: RivalPreferencesV1 = {
	version: 1,
	lastRivalKind: 'engine',
	humanSideByRival: {
		engine: 'white',
		llm: 'white',
	},
};

describe('rival preferences', () => {
	test('missing storage returns defaults with both human sides white', () => {
		const storage = createMemoryStorage();
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('valid V1 round-trips through storage', () => {
		const storage = createMemoryStorage();
		persistRivalKind(storage, 'llm');
		persistHumanSide(storage, 'engine', 'black');
		persistHumanSide(storage, 'llm', 'black');

		expect(readRivalPreferences(storage)).toEqual({
			version: 1,
			lastRivalKind: 'llm',
			humanSideByRival: {
				engine: 'black',
				llm: 'black',
			},
		});
	});

	test('corrupt JSON falls back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: '{not-json',
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('wrong version falls back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 2,
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'black', llm: 'black' },
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('invalid opponent and side values fall back to defaults', () => {
		const storage = createMemoryStorage({
			[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
				version: 1,
				lastRivalKind: 'cloud',
				humanSideByRival: { engine: 'purple', llm: 'white' },
			}),
		});
		expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
	});

	test('deliberate changes persist independently', () => {
		const storage = createMemoryStorage();
		persistRivalKind(storage, 'llm');
		persistHumanSide(storage, 'engine', 'black');

		expect(readRivalPreferences(storage)).toEqual({
			version: 1,
			lastRivalKind: 'llm',
			humanSideByRival: {
				engine: 'black',
				llm: 'white',
			},
		});
	});

	test('automatic fallback does not update lastRivalKind', () => {
		const storage = createMemoryStorage();
		persistRivalKind(storage, 'engine');
		persistHumanSide(storage, 'engine', 'white');

		readRivalPreferences(storage);
		readRivalPreferences(storage);

		expect(readRivalPreferences(storage).lastRivalKind).toBe('engine');
		expect(storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY)).toContain(
			'"lastRivalKind":"engine"'
		);
	});
});
