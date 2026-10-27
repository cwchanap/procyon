import { expect, test } from 'bun:test';
import {
	CLASSIC_CONFIG,
	createAeroplaneMatch,
	playResolvedMove,
	rollTurn,
	type AeroplaneMatch,
} from './game';
import { toGlobalTrackIndex } from './topology';
import { tycoonTileKindAt } from './tycoon';
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
	PersistedAeroplaneMatchV2,
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
	extra: Partial<PersistedAeroplaneMatchV2> = {}
): PersistedAeroplaneMatchV2 {
	return {
		version: 2,
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
		JSON.stringify({ ...saved, version: 3 })
	);

	const restored = restoreActiveMatch(storage);

	expect(restored.kind).toBe('invalid');
	expect(storage.getItem(ACTIVE_MATCH_STORAGE_KEY)).toBeNull();
});

test('v1 snapshots are rejected loudly without migration', () => {
	const storage = memoryStorage();
	const diagnostics = memoryStorage();
	storage.setItem(
		ACTIVE_MATCH_STORAGE_KEY,
		JSON.stringify({ ...validSave(), version: 1 })
	);

	const restored = restoreActiveMatch(storage, diagnostics);

	expect(restored).toEqual({
		kind: 'invalid',
		reason: 'v1 snapshots are no longer supported (no migration)',
	});
	expect(storage.getItem(ACTIVE_MATCH_STORAGE_KEY)).toBeNull();
	expect(diagnostics.getItem(SESSION_DIAGNOSTICS_KEY)).toContain('v1');
	expect(ACTIVE_MATCH_STORAGE_KEY).toBe('procyon:aeroplane:active-match:v2');
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

	expect(saveActiveMatch(validSave(), throwingStorage)).toBe(false);
	expect(restoreActiveMatch(throwingStorage)).toEqual({
		kind: 'unavailable',
		reason: expect.any(String),
	});
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

	const emptyRestored = restoreFixture({ ...saved, actions: [empty] });
	const nonStringRestored = restoreFixture({ ...saved, actions: [nonString] });

	expect(emptyRestored.kind).toBe('ok');
	expect(nonStringRestored.kind).toBe('ok');

	if (emptyRestored.kind === 'ok') {
		expect(emptyRestored.match.actions).toHaveLength(1);
		expect(emptyRestored.match.actions[0]?.selectedPlaneId).toBeNull();
	}
	if (nonStringRestored.kind === 'ok') {
		expect(nonStringRestored.match.actions).toHaveLength(1);
		expect(nonStringRestored.match.actions[0]?.selectedPlaneId).toBeNull();
	}
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

// --- Sky Tycoon v2 envelope ---

const TYCOON_CONFIG = { ...CLASSIC_CONFIG, mode: 'sky-tycoon' as const };

function tycoonSave(): PersistedAeroplaneMatchV2 {
	return validSave(createAeroplaneMatch(TYCOON_CONFIG, 39101));
}

const MIXED_EVENTS: AeroplaneActionRecord['events'] = [
	{
		type: 'move',
		planeId: 'red-0',
		from: { kind: 'track', color: 'red', progress: 14, globalIndex: 14 },
		to: { kind: 'track', color: 'red', progress: 16, globalIndex: 16 },
		distance: 2,
	},
	{ type: 'card', color: 'red', card: 'storm' },
	{ type: 'relocation', planeId: 'red-0', effect: 'storm', toProgress: 13 },
	{
		type: 'warp',
		planeId: 'red-0',
		from: { kind: 'track', color: 'red', progress: 16, globalIndex: 16 },
		to: { kind: 'track', color: 'red', progress: 13, globalIndex: 13 },
	},
	{ type: 'coins', color: 'red', amount: -2, reason: 'tax' },
	{
		type: 'transfer',
		from: 'red',
		to: 'blue',
		amount: 2,
		reason: 'airport-toll',
	},
	{ type: 'airport', tile: 26, owner: 'red' },
	{ type: 'shield', planeId: 'red-0' },
	{ type: 'skip', color: 'red' },
	{ type: 'tailwind', color: 'red' },
];

test('a Tycoon v2 snapshot with mixed positional and effect events round-trips', () => {
	const base = tycoonSave();
	const saved: PersistedAeroplaneMatchV2 = {
		...base,
		state: {
			...base.state,
			tycoon: {
				...base.state.tycoon!,
				coins: { red: 0, yellow: 3, blue: 12, green: 10 },
				airports: { 26: 'red', 13: 'blue' },
				shields: ['red-0'],
				skipNextRoll: { red: false, yellow: true, blue: false, green: false },
				chanceCursor: 23,
			},
		},
		actions: [
			{
				...baseRecord(),
				kind: 'move',
				selectedPlaneId: 'red-0',
				events: MIXED_EVENTS,
			},
		],
	};
	const storage = memoryStorage();

	expect(saveActiveMatch(saved, storage)).toBe(true);
	const restored = restoreActiveMatch(storage);
	expect(restored.kind).toBe('ok');
	if (restored.kind !== 'ok') throw new Error('expected ok');
	expect(restored.match).toEqual(JSON.parse(JSON.stringify(saved)));
});

test('invalid mode and Tycoon state are rejected', () => {
	const saved = tycoonSave();
	const tycoon = saved.state.tycoon!;
	const withTycoon = (patch: Record<string, unknown>) => ({
		...saved,
		state: { ...saved.state, tycoon: { ...tycoon, ...patch } },
	});
	const withConfig = (config: Record<string, unknown>) => ({
		...saved,
		config,
		state: { ...saved.state, config },
	});
	const invalids = [
		withConfig({ ...TYCOON_CONFIG, mode: 'casino' }),
		withConfig({ ...CLASSIC_CONFIG }),
		{ ...saved, state: { ...saved.state, tycoon: null } },
		withTycoon({ coins: { ...tycoon.coins, red: -1 } }),
		withTycoon({ coins: { ...tycoon.coins, red: 1.5 } }),
		withTycoon({ airports: { 3: 'red' } }),
		withTycoon({ airports: { 26: 'purple' } }),
		withTycoon({ shields: ['red-0', 'red-0'] }),
		withTycoon({ shields: ['red-7'] }),
		withTycoon({ skipNextRoll: { ...tycoon.skipNextRoll, red: 1 } }),
		withTycoon({ chanceOrder: tycoon.chanceOrder.slice(1) }),
		withTycoon({
			chanceOrder: [tycoon.chanceOrder[0], ...tycoon.chanceOrder.slice(0, 9)],
		}),
		withTycoon({ chanceOrder: ['jackpot', ...tycoon.chanceOrder.slice(1)] }),
		withTycoon({ chanceCursor: -1 }),
		withTycoon({ chanceCursor: 0.5 }),
	];
	// Standard states must keep a null economy layer.
	const standard = validSave();
	invalids.push({
		...standard,
		state: { ...standard.state, tycoon },
	} as never);

	for (const invalid of invalids)
		expect(restoreFixture(invalid).kind).toBe('invalid');
});

test('invalid positional and informational action events are rejected', () => {
	const saved = tycoonSave();
	const invalidEvents: unknown[] = [
		{ type: 'warp', planeId: 'red-0', from: { kind: 'hangar', color: 'red' } },
		{ type: 'teleport', planeId: 'red-0' },
		{ type: 'coins', color: 'red', amount: 2, reason: 'lottery' },
		{ type: 'coins', color: 'red', amount: 0.5, reason: 'tax' },
		{
			type: 'transfer',
			from: 'red',
			to: 'red',
			amount: 2,
			reason: 'steal',
		},
		{ type: 'airport', tile: 3, owner: 'red' },
		{ type: 'card', color: 'red', card: 'jackpot' },
		{ type: 'shield', planeId: 'nobody' },
		{ type: 'skip', color: 'purple' },
		{
			type: 'relocation',
			planeId: 'red-0',
			effect: 'boost',
			toProgress: 57,
		},
	];
	for (const event of invalidEvents) {
		const action = { ...baseRecord(), events: [event] };
		expect(restoreFixture({ ...saved, actions: [action] }).kind).toBe(
			'invalid'
		);
	}
});

test('awaiting-choice reload before a Chance landing does not advance the deck', () => {
	const match = createAeroplaneMatch(TYCOON_CONFIG, 39101);
	// Red plane on track progress 1; find a die that lands on a Chance tile.
	const roll = [1, 2, 3, 4, 5].find(
		value => tycoonTileKindAt(toGlobalTrackIndex('red', 1 + value)) === 'chance'
	)!;
	const start: AeroplaneState = {
		...match.state,
		planes: match.state.planes.map(plane =>
			plane.id === 'red-0' ? { ...plane, progress: 1 } : plane
		),
		tycoon: { ...match.state.tycoon!, chanceCursor: 12 },
	};
	const rolled = rollTurn(start, roll);
	expect(rolled.state.phase).toBe('awaiting-choice');
	const storage = memoryStorage();
	expect(saveActiveMatch(validSave(match, rolled.state), storage)).toBe(true);

	const restored = restoreActiveMatch(storage);
	if (restored.kind !== 'ok') throw new Error('expected ok');
	const resumed = restored.match.state;
	expect(resumed.tycoon!.chanceCursor).toBe(12);
	expect(resumed.tycoon!.chanceOrder).toEqual(match.state.tycoon!.chanceOrder);

	const move = rolled.legalMoves.find(
		candidate => candidate.planeId === 'red-0'
	)!;
	const transition = playResolvedMove(resumed, move);
	expect(transition.effectEvents[0]).toEqual({
		type: 'card',
		color: 'red',
		card: match.state.tycoon!.chanceOrder[12 % 10]!,
	});
	expect(transition.state.tycoon!.chanceCursor).toBe(13);
	// Identical to playing on without a reload.
	expect(transition).toEqual(playResolvedMove(rolled.state, move));
});
