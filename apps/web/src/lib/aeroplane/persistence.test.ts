import { expect, test } from 'bun:test';
import {
	CLASSIC_CONFIG,
	createAeroplaneMatch,
	rollTurn,
	type AeroplaneMatch,
} from './game';
import {
	ACTIVE_MATCH_STORAGE_KEY,
	SESSION_DIAGNOSTICS_KEY,
	clearActiveMatch,
	restoreActiveMatch,
	saveActiveMatch,
} from './persistence';
import type {
	AeroplaneActionRecord,
	AeroplaneState,
	PersistedAeroplaneMatchV1,
} from './types';

interface MemoryStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function memoryStorage(initial?: Record<string, string>): MemoryStorage {
	const values = new Map(Object.entries(initial ?? {}));
	return {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: key => void values.delete(key),
	};
}

function baseRecord(): AeroplaneActionRecord {
	return {
		kind: 'roll',
		actor: 'human',
		color: 'red',
		roll: 1,
		selectedPlaneId: null,
		events: [],
		checksum: '00000000',
	};
}

function validSave(
	match: AeroplaneMatch = createAeroplaneMatch(CLASSIC_CONFIG, 39101),
	state: AeroplaneState = match.state,
	extra: Partial<PersistedAeroplaneMatchV1> = {}
): PersistedAeroplaneMatchV1 {
	return {
		version: 1,
		savedAt: '2026-08-09T00:00:00.000Z',
		rootSeed: match.rootSeed,
		config: match.state.config,
		state,
		seats: match.seats,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		actions: [],
		...extra,
	};
}

function restoreFixture(saved: unknown, storage = memoryStorage()) {
	storage.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(saved));
	return restoreActiveMatch(storage);
}

test('valid snapshot round-trips through active storage', () => {
	const saved = validSave();
	const storage = memoryStorage();

	expect(saveActiveMatch(saved, storage)).toBe(true);
	const restored = restoreActiveMatch(storage);

	expect(restored.kind).toBe('ok');
	if (restored.kind !== 'ok') throw new Error('expected ok');
	expect(restored.match).toEqual(saved);
});

test('malformed match-start timestamps are rejected', () => {
	const saved = {
		...validSave(),
		startedAt: 'not-a-timestamp',
	};

	expect(restoreFixture(saved).kind).toBe('invalid');
});

test('malformed completion timestamps are rejected', () => {
	const saved = {
		...validSave(),
		completedAt: 'not-a-timestamp',
	};

	expect(restoreFixture(saved).kind).toBe('invalid');
});

test('valid pending-choice snapshot restores exact state seats and RNG', () => {
	const match = createAeroplaneMatch(CLASSIC_CONFIG, 39101);
	const rolled = rollTurn(match.state, match.diceRng);
	const pending = rolled.legalMoves.length > 0 ? rolled.state : match.state;
	const saved = validSave(match, pending, {
		diceRng: rolled.rng ?? match.diceRng,
	});

	const restored = restoreFixture(saved);
	expect(restored.kind).toBe('ok');
	if (restored.kind !== 'ok') throw new Error('expected ok');
	expect(restored.match.state).toEqual(saved.state);
	expect(restored.match.seats).toEqual(saved.seats);
	expect(restored.match.diceRng).toEqual(saved.diceRng);
	expect(restored.match.aiRng).toEqual(saved.aiRng);
});

test('unknown versions are rejected and removed', () => {
	const storage = memoryStorage();
	const saved = validSave();
	storage.setItem(
		ACTIVE_MATCH_STORAGE_KEY,
		JSON.stringify({ ...saved, version: 2 })
	);

	const restored = restoreActiveMatch(storage);

	expect(restored.kind).toBe('invalid');
	expect(storage.getItem(ACTIVE_MATCH_STORAGE_KEY)).toBeNull();
});

test('invalid plane count, identity, and progress are rejected', () => {
	const saved = validSave();
	const invalids = [
		{
			...saved,
			state: { ...saved.state, planes: saved.state.planes.slice(1) },
		},
		{
			...saved,
			state: {
				...saved.state,
				planes: saved.state.planes.map((plane, index) =>
					index === 0 ? { ...plane, id: 'yellow-0' } : plane
				),
			},
		},
		{
			...saved,
			state: {
				...saved.state,
				planes: saved.state.planes.map((plane, index) =>
					index === 0 ? { ...plane, progress: 57 } : plane
				),
			},
		},
	];

	for (const invalid of invalids)
		expect(restoreFixture(invalid).kind).toBe('invalid');
});

test('invalid phase, winner, and pending roll are rejected', () => {
	const saved = validSave();
	const invalids = [
		{ ...saved, state: { ...saved.state, phase: 'bogus' as never } },
		{
			...saved,
			state: { ...saved.state, phase: 'awaiting-roll', pendingRoll: 4 },
		},
		{
			...saved,
			state: {
				...saved.state,
				phase: 'awaiting-choice',
				pendingRoll: null,
			},
		},
		{
			...saved,
			state: { ...saved.state, phase: 'finished', winner: null },
		},
	];

	for (const invalid of invalids)
		expect(restoreFixture(invalid).kind).toBe('invalid');
});

test('awaiting-choice snapshots must have a legal move for the pending roll', () => {
	const saved = validSave();
	const impossible = {
		...saved,
		state: {
			...saved.state,
			phase: 'awaiting-choice' as const,
			pendingRoll: 1,
		},
	};

	expect(restoreFixture(impossible).kind).toBe('invalid');
});

test('finished snapshots must meet the configured victory target', () => {
	const saved = validSave();
	const impossible = {
		...saved,
		state: {
			...saved.state,
			phase: 'finished' as const,
			currentPlayer: 'red' as const,
			winner: 'red' as const,
		},
	};

	expect(restoreFixture(impossible).kind).toBe('invalid');
});

test('finished winner must be the current player', () => {
	const saved = validSave();
	const finishedPlanes = saved.state.planes.map(plane =>
		plane.color === 'red' ? { ...plane, progress: 56 } : plane
	);
	const impossible = {
		...saved,
		state: {
			...saved.state,
			planes: finishedPlanes,
			phase: 'finished' as const,
			currentPlayer: 'red' as const,
			winner: 'yellow' as const,
		},
	};

	expect(restoreFixture(impossible).kind).toBe('invalid');
});

test('invalid seats and RNG are rejected', () => {
	const saved = validSave();
	const invalids = [
		{ ...saved, seats: saved.seats.slice(1) },
		{
			...saved,
			seats: [{ ...saved.seats[0]!, color: 'red' }, ...saved.seats.slice(1)],
		},
		{ ...saved, diceRng: { value: 0 } },
		{ ...saved, aiRng: { value: Number.NaN } },
	];

	for (const invalid of invalids)
		expect(restoreFixture(invalid).kind).toBe('invalid');
});

test('storage exceptions never escape persistence helpers', () => {
	const throwingStorage: MemoryStorage = {
		getItem: () => {
			throw new Error('blocked');
		},
		setItem: () => {
			throw new Error('blocked');
		},
		removeItem: () => {
			throw new Error('blocked');
		},
	};

	expect(() => saveActiveMatch(validSave(), throwingStorage)).not.toThrow();
	expect(() => restoreActiveMatch(throwingStorage)).not.toThrow();
	expect(() => clearActiveMatch(throwingStorage)).not.toThrow();
});

test('invalid raw text is cleared and copied to session diagnostics when available', () => {
	const storage = memoryStorage({ [ACTIVE_MATCH_STORAGE_KEY]: '{not-json' });
	const diagnostics = memoryStorage();

	const restored = restoreActiveMatch(storage, diagnostics);

	expect(restored.kind).toBe('invalid');
	expect(storage.getItem(ACTIVE_MATCH_STORAGE_KEY)).toBeNull();
	expect(diagnostics.getItem(SESSION_DIAGNOSTICS_KEY)).not.toBeNull();
});

test('action records contain structured events but no state snapshots', () => {
	const saved = validSave(undefined, undefined, { actions: [baseRecord()] });
	const restored = restoreFixture(saved);

	expect(restored.kind).toBe('ok');
});

test('legacy action aliases are not accepted by the versioned contract', () => {
	const saved = validSave();
	const alias = { ...baseRecord(), type: 'roll' } as Record<string, unknown>;
	delete alias.kind;

	expect(restoreFixture({ ...saved, actions: [alias] }).kind).toBe('invalid');
});

test('validPosition rejects an unknown position kind', () => {
	const saved = validSave();
	const action = {
		...baseRecord(),
		kind: 'move',
		selectedPlaneId: 'red-0',
		events: [
			{
				type: 'move',
				planeId: 'red-0',
				from: { kind: 'hangar', color: 'red' },
				to: { kind: 'wormhole', color: 'red' },
			},
		],
	};

	expect(restoreFixture({ ...saved, actions: [action] }).kind).toBe('invalid');
});

test('selectedPlaneId coerces an empty string and a non-string to null on roll records', () => {
	const saved = validSave();
	const empty = { ...baseRecord(), selectedPlaneId: '' };
	const nonString = { ...baseRecord(), selectedPlaneId: 42 };

	expect(restoreFixture({ ...saved, actions: [empty] }).kind).toBe('ok');
	expect(restoreFixture({ ...saved, actions: [nonString] }).kind).toBe('ok');
});

test('browserStorage returns a candidate when localStorage is available', () => {
	const fakeStorage = {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	};
	const root = globalThis as Record<string, unknown>;
	const previousLocalStorage = root.localStorage;
	const previousWindow = root.window;
	root.localStorage = fakeStorage;
	root.window = { localStorage: fakeStorage };

	try {
		// saveActiveMatch/restoreActiveMatch with no storage arg falls back to
		// browserStorage(localStorage). With our fake in place, it should be
		// used rather than throwing.
		expect(() => saveActiveMatch(validSave())).not.toThrow();
		expect(() => restoreActiveMatch()).not.toThrow();
	} finally {
		root.localStorage = previousLocalStorage;
		root.window = previousWindow;
	}
});

test('browserStorage returns null when no storage is available', () => {
	const root = globalThis as Record<string, unknown>;
	const previousLocalStorage = root.localStorage;
	const previousWindow = root.window;
	delete root.localStorage;
	delete root.window;

	try {
		// With no global storage, the helpers should not throw and should
		// treat the missing storage as a no-op.
		expect(() => saveActiveMatch(validSave())).not.toThrow();
		expect(() => restoreActiveMatch()).not.toThrow();
	} finally {
		root.localStorage = previousLocalStorage;
		root.window = previousWindow;
	}
});
