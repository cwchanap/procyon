import { test, expect, describe, beforeEach } from 'bun:test';
import { readLocalPuzzleProgress, MAX_FAILED_ATTEMPTS } from './usePuzzle';

// --- localStorage stub ---
const store: Record<string, string> = {};

const localStorageMock = {
	getItem: (key: string): string | null => store[key] ?? null,
	setItem: (key: string, value: string): void => {
		store[key] = value;
	},
	removeItem: (key: string): void => {
		delete store[key];
	},
	clear: (): void => {
		Object.keys(store).forEach(k => delete store[k]);
	},
	get length() {
		return Object.keys(store).length;
	},
	key: (index: number): string | null => Object.keys(store)[index] ?? null,
};

// @ts-expect-error - replacing global localStorage in test environment
globalThis.localStorage = localStorageMock;

describe('MAX_FAILED_ATTEMPTS constant', () => {
	test('is exported and equals 3', () => {
		expect(MAX_FAILED_ATTEMPTS).toBe(3);
	});
});

describe('readLocalPuzzleProgress', () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	test('returns empty object when localStorage has no entry', () => {
		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('returns empty object for guest user when no data stored', () => {
		const result = readLocalPuzzleProgress(undefined);
		expect(result).toEqual({});
	});

	test('returns stored progress for authenticated user', () => {
		const userId = 'user-123';
		const progress = {
			42: { solved: true, failedAttempts: 0, solvedAt: '2026-01-01T00:00:00Z' },
		};
		localStorageMock.setItem(
			`procyon_puzzle_progress_${userId}`,
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(userId);
		expect(result[42]).toEqual({
			solved: true,
			failedAttempts: 0,
			solvedAt: '2026-01-01T00:00:00Z',
		});
	});

	test('returns stored progress for guest user (null userId)', () => {
		const progress = {
			7: { solved: false, failedAttempts: 2 },
		};
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(null);
		expect(result[7]).toEqual({ solved: false, failedAttempts: 2 });
	});

	test('returns empty object for corrupt JSON in localStorage', () => {
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			'not-valid-json{'
		);

		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('returns empty object when localStorage.getItem throws', () => {
		const originalGetItem = localStorageMock.getItem;
		localStorageMock.getItem = () => {
			throw new Error('localStorage unavailable');
		};

		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});

		localStorageMock.getItem = originalGetItem;
	});

	test('scopes data per user ID - different users have separate storage', () => {
		const userA = 'user-a';
		const userB = 'user-b';

		localStorageMock.setItem(
			`procyon_puzzle_progress_${userA}`,
			JSON.stringify({ 1: { solved: true, failedAttempts: 0 } })
		);
		localStorageMock.setItem(
			`procyon_puzzle_progress_${userB}`,
			JSON.stringify({ 2: { solved: false, failedAttempts: 1 } })
		);

		const resultA = readLocalPuzzleProgress(userA);
		const resultB = readLocalPuzzleProgress(userB);

		expect(resultA[1]).toBeDefined();
		expect(resultA[2]).toBeUndefined();
		expect(resultB[2]).toBeDefined();
		expect(resultB[1]).toBeUndefined();
	});

	test('returns empty object when stored value is empty string', () => {
		localStorageMock.setItem('procyon_puzzle_progress_guest', '');
		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('handles multiple puzzle entries', () => {
		const progress = {
			1: { solved: true, failedAttempts: 0, solvedAt: '2026-01-01T00:00:00Z' },
			2: { solved: false, failedAttempts: 1 },
			3: { solved: false, failedAttempts: 3 },
		};
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(null);
		expect(Object.keys(result)).toHaveLength(3);
		expect(result[1]?.solved).toBe(true);
		expect(result[2]?.failedAttempts).toBe(1);
		expect(result[3]?.failedAttempts).toBe(3);
	});
});
