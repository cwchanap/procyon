import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import {
	CLASSIC_CONFIG,
	QUICK_CONFIG,
	createAeroplaneMatch,
	rollTurn,
} from '../lib/aeroplane/game';
import { rollFair } from '../lib/aeroplane/dice';
import {
	ACTIVE_MATCH_STORAGE_KEY,
	saveActiveMatch,
	type AeroplaneStorage,
} from '../lib/aeroplane/persistence';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	AiSeat,
	PersistedAeroplaneMatchV1,
	PlaneState,
} from '../lib/aeroplane/types';
import {
	readDevOverrides,
	useAeroplaneMatch,
	type AeroplaneE2EFixture,
	type UseAeroplaneMatchOptions,
} from './useAeroplaneMatch';

setupReactDom();

// createHookHarness enables fake timers per test; restore the real clock
// after every test so it cannot leak into integration or fixture-contract
// tests that expect real timers.
afterEach(() => {
	jest.useRealTimers();
});

const STATS = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

interface MemoryStorage extends AeroplaneStorage {
	values: Map<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: key => void values.delete(key),
	};
}

function plane(
	color: AeroplaneColor,
	index: number,
	progress: number | null
): PlaneState {
	return { id: `${color}-${index}`, color, progress };
}

function fixtureState(
	currentPlayer: AeroplaneColor,
	planes: PlaneState[],
	config: AeroplaneConfig = CLASSIC_CONFIG,
	phase: AeroplaneState['phase'] = 'awaiting-roll',
	pendingRoll: number | null = null
): AeroplaneState {
	const allPlanes = [
		...planes,
		...(['red', 'yellow', 'blue', 'green'] as const).flatMap(color =>
			Array.from({ length: 4 }, (_, index) =>
				planes.some(candidate => candidate.id === `${color}-${index}`)
					? null
					: plane(color, index, null)
			)
		),
	].filter((candidate): candidate is PlaneState => candidate !== null);
	return {
		config,
		currentPlayer,
		phase,
		pendingRoll,
		planes: allPlanes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: STATS,
	};
}

function diceStateForRoll(roll: number): { value: number } {
	for (let value = 1; value <= 0xffffffff; value += 1) {
		const result = rollFair({ value });
		if (result.roll === roll) return { value };
		if (value > 100_000) break;
	}
	throw new Error(`no small deterministic seed for roll ${roll}`);
}

function oneLegalHumanMoveFixture(): AeroplaneE2EFixture {
	return {
		seed: 39101,
		state: fixtureState('red', [plane('red', 0, 1)]),
		diceRng: diceStateForRoll(1),
		aiRng: { value: 33 },
		skipAnimations: false,
	};
}

function captureHumanMoveFixture(chatter: boolean): AeroplaneE2EFixture {
	const fixture = oneLegalHumanMoveFixture();
	fixture.config = { ...CLASSIC_CONFIG, chatter };
	fixture.state = {
		...fixture.state!,
		config: fixture.config,
		planes: fixture.state!.planes.map(candidate => {
			if (candidate.id === 'red-0') return { ...candidate, progress: 1 };
			if (candidate.id === 'blue-0') return { ...candidate, progress: 32 };
			return candidate;
		}),
	};
	return fixture;
}

function twoLegalHumanMovesFixture(): AeroplaneE2EFixture {
	return {
		seed: 39102,
		state: fixtureState('red', [plane('red', 0, 1), plane('red', 1, 1)]),
		diceRng: diceStateForRoll(1),
		aiRng: { value: 33 },
		skipAnimations: true,
	};
}

function aiTurnFixture(): AeroplaneE2EFixture {
	return {
		seed: 39103,
		state: fixtureState('yellow', [plane('yellow', 0, 1)]),
		diceRng: diceStateForRoll(1),
		aiRng: { value: 33 },
		skipAnimations: false,
	};
}

function terminalAeroplaneFixture(
	winner: AeroplaneColor = 'red'
): AeroplaneE2EFixture {
	const config: AeroplaneConfig = {
		...CLASSIC_CONFIG,
		victoryTarget: 2,
	};
	const match = createAeroplaneMatch(config, 39105);
	const planes = match.state.planes.map(candidate =>
		candidate.color === winner && Number(candidate.id.slice(-1)) < 2
			? { ...candidate, progress: 56 }
			: candidate
	);
	return {
		seed: match.rootSeed,
		config,
		state: {
			...match.state,
			config,
			currentPlayer: winner,
			phase: 'finished',
			pendingRoll: null,
			planes,
			winner,
		},
		seats: match.seats,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		skipAnimations: true,
	};
}

function nearVictoryAeroplaneFixture(): AeroplaneE2EFixture {
	const config = { ...QUICK_CONFIG, chatter: false };
	const match = createAeroplaneMatch(config, 39107);
	const state: AeroplaneState = {
		...match.state,
		config: match.state.config,
		currentPlayer: 'red',
		phase: 'awaiting-choice',
		pendingRoll: 1,
		winner: null,
		planes: match.state.planes.map(candidate => {
			if (candidate.id === 'red-0') return { ...candidate, progress: 56 };
			if (candidate.id === 'red-1') return { ...candidate, progress: 55 };
			return candidate;
		}),
		stats: {
			...match.state.stats,
			finished: { ...match.state.stats.finished, red: 1 },
		},
	};
	return {
		seed: match.rootSeed,
		config: match.state.config,
		state,
		seats: match.seats,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		skipAnimations: true,
	};
}

function saveAiAwaitingChoice(storage: MemoryStorage): void {
	const fixture = aiTurnFixture();
	const config = { ...fixture.state!.config, humanColor: 'blue' as const };
	const state = { ...fixture.state!, config };
	const diceRng = fixture.diceRng!;
	const rolled = rollTurn(state, diceRng);
	if (!rolled.rng || rolled.legalMoves.length !== 1)
		throw new Error('expected one legal AI move in fixture');
	const match = createAeroplaneMatch(config, fixture.seed);
	const saved: PersistedAeroplaneMatchV1 = {
		version: 1,
		savedAt: new Date(0).toISOString(),
		rootSeed: match.rootSeed,
		config: state.config,
		state: rolled.state,
		seats: match.seats,
		diceRng: rolled.rng,
		aiRng: fixture.aiRng!,
		actions: [
			{
				kind: 'roll',
				actor: 'ai',
				color: 'yellow',
				roll: rolled.roll,
				selectedPlaneId: null,
				events: [],
				checksum: '00000000',
			},
		],
	};
	if (!saveActiveMatch(saved, storage))
		throw new Error('expected AI awaiting-choice snapshot to save');
}

function createHookHarness(
	fixture: AeroplaneE2EFixture,
	options: Omit<UseAeroplaneMatchOptions, 'fixture' | 'dev'> = {}
) {
	jest.useFakeTimers();
	const storage = options.storage ?? memoryStorage();
	const rendered = renderHook(() =>
		useAeroplaneMatch({
			...options,
			storage,
			fixture,
			dev: true,
		})
	);
	return {
		...rendered,
		storage,
		state: () => rendered.result.current.state,
		legalMoves: () => rendered.result.current.legalMoves,
		eventFeed: () => rendered.result.current.eventFeed,
		aiRng: () => rendered.result.current.aiRng,
		roll: () => act(() => rendered.result.current.roll()),
		select: (planeId: string) =>
			act(() => rendered.result.current.select(planeId)),
		advanceTime: (ms: number) =>
			act(() =>
				(
					jest as unknown as { advanceTimersByTime(value: number): void }
				).advanceTimersByTime(ms)
			),
		flushPresentation: async () => {
			await act(async () => {
				(
					jest as unknown as { runOnlyPendingTimers(): void }
				).runOnlyPendingTimers();
				await Promise.resolve();
			});
		},
		skipAnimations: () => act(() => rendered.result.current.skipAnimations()),
	};
}

describe('useAeroplaneMatch controller', () => {
	test('one legal human move auto-applies without prompting', async () => {
		const match = createHookHarness(oneLegalHumanMoveFixture());
		match.roll();
		await match.flushPresentation();
		expect(match.state().phase).toBe('awaiting-roll');
	});

	test('multiple legal human moves wait for selection', () => {
		const match = createHookHarness(twoLegalHumanMovesFixture());
		match.roll();
		expect(match.state().phase).toBe('awaiting-choice');
		expect(match.legalMoves()).toHaveLength(2);
	});

	test('AI delay consumes no gameplay RNG before decision time', () => {
		const match = createHookHarness(aiTurnFixture());
		const before = match.aiRng();
		match.advanceTime(400);
		expect(match.aiRng()).toEqual(before);
	});

	test('skip animations is idempotent', () => {
		const match = createHookHarness(oneLegalHumanMoveFixture());
		match.skipAnimations();
		const once = match.state();
		match.skipAnimations();
		expect(match.state()).toEqual(once);
	});

	test('enqueues deterministic local chatter only after a committed notable move', () => {
		const match = createHookHarness(captureHumanMoveFixture(true));
		match.roll();

		const humanPresentation = match
			.eventFeed()
			.find(presentation => presentation.action.actor === 'human');
		expect(humanPresentation?.chatter).toBeTruthy();
		expect(
			match.state().planes.find(plane => plane.id === 'red-0')?.progress
		).toBe(6);
	});

	test('does not enqueue chatter when the setup toggle is disabled', () => {
		const match = createHookHarness(captureHumanMoveFixture(false));
		match.roll();

		const humanPresentation = match
			.eventFeed()
			.find(presentation => presentation.action.actor === 'human');
		expect(humanPresentation?.chatter).toBeUndefined();
	});

	test('reset cancels stale AI timer', () => {
		const match = createHookHarness(aiTurnFixture());
		act(() => match.result.current.reset());
		match.advanceTime(1000);
		expect(match.state().turnNumber).toBe(1);
		expect(match.state().currentPlayer).toBe('red');
	});

	test('unmount cancels stale AI timer', () => {
		const match = createHookHarness(aiTurnFixture());
		match.unmount();
		match.advanceTime(1000);
		expect(match.storage.getItem(ACTIVE_MATCH_STORAGE_KEY)).not.toBeNull();
	});

	test('pending-choice roll is persisted before selection', () => {
		const storage = memoryStorage();
		const match = createHookHarness(twoLegalHumanMovesFixture(), { storage });
		match.roll();
		const raw = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
		expect(raw).not.toBeNull();
		const saved = JSON.parse(raw ?? '{}') as PersistedAeroplaneMatchV1;
		expect(saved.state.phase).toBe('awaiting-choice');
		expect(saved.actions.at(-1)?.kind).toBe('roll');
	});

	test('resume restores persisted seats exactly', () => {
		const original = createAeroplaneMatch(CLASSIC_CONFIG, 39104);
		const seats: AiSeat[] = original.seats.map((seat, index) => ({
			...seat,
			personality: index === 0 ? 'unpredictable' : seat.personality,
		}));
		const saved: PersistedAeroplaneMatchV1 = {
			version: 1,
			savedAt: new Date(0).toISOString(),
			rootSeed: original.rootSeed,
			config: original.state.config,
			state: original.state,
			seats,
			diceRng: original.diceRng,
			aiRng: original.aiRng,
			actions: [],
		};
		const storage = memoryStorage();
		saveActiveMatch(saved, storage);
		const match = createHookHarness({}, { storage });
		expect(match.result.current.seats).toEqual(seats);
		expect(match.result.current.rootSeed).toBe(original.rootSeed);
	});

	test('initial restore schedules a persisted AI awaiting-choice decision', () => {
		const storage = memoryStorage();
		saveAiAwaitingChoice(storage);
		const match = createHookHarness({}, { storage });
		expect(match.state().phase).toBe('awaiting-choice');
		match.advanceTime(649);
		expect(match.state().phase).toBe('awaiting-choice');
		match.advanceTime(1);
		expect(match.state().phase).toBe('awaiting-roll');
		expect(match.state().currentPlayer).toBe('blue');
		const saved = JSON.parse(
			storage.getItem(ACTIVE_MATCH_STORAGE_KEY) ?? '{}'
		) as PersistedAeroplaneMatchV1;
		expect(saved.actions).toHaveLength(2);
		expect(saved.actions.at(-1)?.kind).toBe('move');
	});

	test('explicit resume reschedules a persisted AI awaiting-choice decision', () => {
		const storage = memoryStorage();
		saveAiAwaitingChoice(storage);
		const match = createHookHarness({}, { storage });
		act(() => {
			expect(match.result.current.resume()).toBe(true);
		});
		match.advanceTime(650);
		expect(match.state().phase).toBe('awaiting-roll');
		const saved = JSON.parse(
			storage.getItem(ACTIVE_MATCH_STORAGE_KEY) ?? '{}'
		) as PersistedAeroplaneMatchV1;
		expect(saved.actions).toHaveLength(2);
		expect(saved.actions.at(-1)?.kind).toBe('move');
	});

	test('setup preset mutation applies the complete preset contract', () => {
		const match = createHookHarness(oneLegalHumanMoveFixture());
		act(() => match.result.current.setSetup({ rulePreset: 'quick-chill' }));
		expect(match.result.current.setup.rulePreset).toBe('quick-chill');
		expect(match.result.current.setup.victoryTarget).toBe(2);
		expect(match.result.current.setup.diceMode).toBe('relaxed');
		expect(match.result.current.setup.launchRule).toBe('five-or-six');
		expect(match.result.current.setup.finishRule).toBe('bounce');
	});

	test('red-first AI turns run automatically when human is not red', () => {
		const fixture = aiTurnFixture();
		fixture.config = { ...CLASSIC_CONFIG, humanColor: 'green' };
		fixture.state = fixtureState(
			'red',
			[plane('red', 0, 1)],
			fixture.config,
			'awaiting-roll',
			null
		);
		const match = createHookHarness(fixture);
		match.advanceTime(650);
		expect(match.state().currentPlayer).not.toBe('red');
	});
});

describe('useAeroplaneMatch terminal history integration', () => {
	let originalFetch: typeof globalThis.fetch;
	let capturedBodies: Array<Record<string, unknown>>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		capturedBodies = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit
		) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history') && init?.body) {
				capturedBodies.push(
					JSON.parse(String(init.body)) as Record<string, unknown>
				);
			}
			return new Response('{}', {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			});
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__?: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = undefined;
	});

	function renderTerminalMatch(
		authenticated: boolean,
		storage: MemoryStorage = memoryStorage()
	) {
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = authenticated
			? { id: 'user-a', email: 'a@b.com', username: 'a' }
			: null;
		return renderHook(() =>
			useAeroplaneMatch({
				fixture: terminalAeroplaneFixture(),
				dev: true,
				storage,
			})
		);
	}

	function renderRestoredTerminalMatch(
		storage: MemoryStorage,
		now: () => string
	) {
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = {
			id: 'user-a',
			email: 'a@b.com',
			username: 'a',
		};
		return renderHook(() => useAeroplaneMatch({ storage, dev: true, now }));
	}

	function saveTerminalSnapshot(
		storage: MemoryStorage,
		startedAt: string,
		savedAt = startedAt
	): void {
		const fixture = terminalAeroplaneFixture();
		const saved = {
			version: 1 as const,
			savedAt,
			startedAt,
			rootSeed: fixture.seed!,
			config: fixture.config!,
			state: fixture.state!,
			seats: fixture.seats!,
			diceRng: fixture.diceRng!,
			aiRng: fixture.aiRng!,
			actions: [],
		};
		if (!saveActiveMatch(saved, storage))
			throw new Error('expected terminal snapshot to save');
	}

	async function flushHistorySave(): Promise<void> {
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
	}

	test('terminal Aeroplane match builds the human-perspective trio payload once', async () => {
		const match = renderTerminalMatch(true);
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]).toMatchObject({
			gameId: 'aeroplane',
			opponentEngineId: 'aeroplane-trio-v1',
			status: 'win',
			details: {
				rulePreset: 'classic',
				victoryTarget: 2,
				diceMode: 'fair',
				humanColor: 'red',
				planesFinished: 0,
				capturesMade: 0,
				capturesSuffered: 0,
				aiPlayers: [
					{ color: 'yellow', personality: 'cautious' },
					{ color: 'blue', personality: 'aggressive' },
					{ color: 'green', personality: 'unpredictable' },
				],
			},
		});

		match.unmount();
	});

	test('repeated terminal renders do not submit another Aeroplane history record', async () => {
		const match = renderTerminalMatch(true);
		await flushHistorySave();
		match.rerender();
		match.rerender();
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(1);
		match.unmount();
	});

	test('successful terminal save prevents a restored remount from submitting again', async () => {
		const storage = memoryStorage();
		const first = renderTerminalMatch(true, storage);
		await flushHistorySave();
		first.unmount();

		const second = renderRestoredTerminalMatch(
			storage,
			() => '2026-08-09T00:00:01.000Z'
		);
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(1);
		second.unmount();
	});

	test('stale success cannot clear a synchronously persisted replacement match', async () => {
		let replaceBeforeSuccess: (() => void) | null = null;
		let playHistoryCalls = 0;
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit
		) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history') && init?.body) {
				playHistoryCalls++;
				if (playHistoryCalls === 1) {
					return Promise.resolve({
						get ok() {
							replaceBeforeSuccess?.();
							return true;
						},
						status: 201,
						statusText: 'Created',
					} as Response);
				}
			}
			return new Response('{}', { status: 201 });
		}) as typeof fetch;

		const storage = memoryStorage();
		let removeCount = 0;
		const removeActive = storage.removeItem;
		storage.removeItem = key => {
			removeCount++;
			removeActive(key);
		};
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = {
			id: 'user-a',
			email: 'a@b.com',
			username: 'a',
		};
		const match = renderTerminalMatch(true, storage);
		replaceBeforeSuccess = () => match.result.current.reset(undefined, 39106);
		await flushHistorySave();

		expect(removeCount).toBe(1);
		expect(playHistoryCalls).toBe(1);
		match.unmount();
	});

	test('ambiguous terminal history failure is not resubmitted after a restored remount', async () => {
		const storage = memoryStorage();
		let attempts = 0;
		let storageAtTransport: string | null = 'not-called';
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				attempts++;
				storageAtTransport = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
				return Promise.reject(new Error('network failure'));
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const first = renderTerminalMatch(true, storage);
		await flushHistorySave();
		expect(attempts).toBe(1);
		expect(storageAtTransport).toBeNull();
		first.unmount();

		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				attempts++;
				return new Response('{}', { status: 201 });
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;
		const second = renderRestoredTerminalMatch(
			storage,
			() => '2026-08-09T00:00:01.000Z'
		);
		await flushHistorySave();

		expect(attempts).toBe(1);
		second.unmount();
	});

	test('freezes terminal duration when a winning move commits across restored remount', async () => {
		const storage = memoryStorage();
		let nowValue = '2026-08-09T00:00:00.000Z';
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = null;
		const first = renderHook(() =>
			useAeroplaneMatch({
				fixture: nearVictoryAeroplaneFixture(),
				dev: true,
				storage,
				now: () => nowValue,
			})
		);
		act(() => first.result.current.select('red-1'));
		await flushHistorySave();

		const savedRaw = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
		expect(savedRaw).not.toBeNull();
		const saved = JSON.parse(savedRaw ?? '{}') as PersistedAeroplaneMatchV1;
		expect(saved.state.phase).toBe('finished');
		expect(saved.completedAt).toBe(nowValue);
		first.unmount();

		nowValue = '2026-08-09T12:00:00.000Z';
		const second = renderRestoredTerminalMatch(storage, () => nowValue);
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(1);
		expect(
			(capturedBodies[0]?.details as { durationSeconds?: number })
				.durationSeconds
		).toBe(0);
		second.unmount();
	});

	test('legacy restored terminal payload uses savedAt as deterministic completion fallback', async () => {
		const storage = memoryStorage();
		const startedAt = '2026-08-09T00:00:00.000Z';
		saveTerminalSnapshot(storage, startedAt, '2026-08-09T00:00:05.000Z');
		const match = renderRestoredTerminalMatch(
			storage,
			() => '2026-08-09T00:00:12.900Z'
		);
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(1);
		expect(
			(capturedBodies[0]?.details as { durationSeconds?: number })
				.durationSeconds
		).toBe(5);
		match.unmount();
	});

	test('signed-out Aeroplane play does not submit history', async () => {
		const match = renderTerminalMatch(false);
		await flushHistorySave();

		expect(capturedBodies).toHaveLength(0);
		match.unmount();
	});
});

describe('Aeroplane DEV fixture contract', () => {
	test('non-DEV ignores query and fixture', () => {
		expect(
			readDevOverrides({
				dev: false,
				search: '?e2eSeed=12',
				fixture: { seed: 34 },
			})
		).toEqual({});
	});

	test('fixture seed wins over query and defaults skip animations', () => {
		expect(
			readDevOverrides({
				dev: true,
				search: '?e2eSeed=12',
				fixture: { seed: 34 },
			})
		).toMatchObject({ seed: 34, skipAnimations: true });
	});

	test('explicit fixture false keeps animations enabled', () => {
		expect(
			readDevOverrides({
				dev: true,
				search: '?e2eSeed=12',
				fixture: { seed: 34, skipAnimations: false },
			})
		).toMatchObject({ seed: 34, skipAnimations: false });
	});

	test('invalid authoritative fixture data is ignored with a DEV warning', () => {
		const warnings: string[] = [];
		const fixture = oneLegalHumanMoveFixture();
		fixture.state = {
			...fixture.state!,
			planes: fixture.state!.planes.map(plane => ({
				...plane,
				progress: null,
			})),
			phase: 'awaiting-choice',
			pendingRoll: 1,
		};
		const overrides = readDevOverrides({
			dev: true,
			fixture,
			warn: message => warnings.push(message),
		});
		expect(overrides.state).toBeUndefined();
		expect(warnings.length).toBeGreaterThan(0);
	});

	test('non-record fixture is ignored with a DEV warning', () => {
		const warnings: string[] = [];
		const overrides = readDevOverrides({
			dev: true,
			search: '?e2eSeed=12',
			fixture: 'not-a-record' as unknown as AeroplaneE2EFixture,
			warn: message => warnings.push(message),
		});
		expect(overrides).toEqual({ seed: 12, skipAnimations: true });
		expect(warnings.length).toBeGreaterThan(0);
	});

	test('invalid fixture seed is ignored with a DEV warning', () => {
		const warnings: string[] = [];
		const overrides = readDevOverrides({
			dev: true,
			search: '?e2eSeed=12',
			fixture: { seed: -1 },
			warn: message => warnings.push(message),
		});
		expect(overrides.seed).toBe(12);
		expect(warnings.length).toBeGreaterThan(0);
	});

	test('invalid fixture config is ignored with a DEV warning', () => {
		const warnings: string[] = [];
		const overrides = readDevOverrides({
			dev: true,
			fixture: {
				seed: 34,
				config: { rulePreset: 'invalid' } as unknown as AeroplaneConfig,
			},
			warn: message => warnings.push(message),
		});
		expect(overrides.seed).toBe(34);
		expect(overrides.config).toBeUndefined();
		expect(warnings.length).toBeGreaterThan(0);
	});

	test('querySeed returns undefined for a non-numeric e2eSeed', () => {
		expect(readDevOverrides({ dev: true, search: '?e2eSeed=abc' })).toEqual({});
	});

	test('querySeed returns undefined for a negative e2eSeed', () => {
		expect(readDevOverrides({ dev: true, search: '?e2eSeed=-5' })).toEqual({});
	});

	test('querySeed returns undefined when e2eSeed is missing', () => {
		expect(readDevOverrides({ dev: true, search: '?other=123' })).toEqual({});
	});

	test('querySeed returns undefined for an empty search string', () => {
		expect(readDevOverrides({ dev: true, search: '' })).toEqual({});
		expect(readDevOverrides({ dev: true, search: undefined })).toEqual({});
	});

	test('DEV mode with only a query seed defaults skip animations', () => {
		expect(readDevOverrides({ dev: true, search: '?e2eSeed=42' })).toEqual({
			seed: 42,
			skipAnimations: true,
		});
	});

	test('non-DEV mode ignores the fixture entirely', () => {
		const fixture = oneLegalHumanMoveFixture();
		expect(readDevOverrides({ dev: false, fixture })).toEqual({});
	});
});
