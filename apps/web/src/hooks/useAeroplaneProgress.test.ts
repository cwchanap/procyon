import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { AUTH_CHANGE_EVENT, __resetSharedAuthUserForTests } from '../lib/auth';
import type { ServerPlayHistory } from '../lib/play-history';
import { useAeroplaneProgress } from './useAeroplaneProgress';

setupReactDom();

function authUser(id: string) {
	return { id, email: `${id}@b.com`, username: id };
}

function setInitialAuthUser(user: unknown): void {
	(
		window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
	).__PROCYON_INITIAL_AUTH_USER__ = user;
}

function deleteInitialAuthUser(): void {
	delete (window as unknown as Record<string, unknown>)
		.__PROCYON_INITIAL_AUTH_USER__;
}

function dispatchAuthChange(user: unknown): void {
	globalThis.dispatchEvent(
		new CustomEvent(AUTH_CHANGE_EVENT, { detail: { user } })
	);
}

/** One qualifying Standard row: win 10 + captures 2×3 + finished 3×1 = 19. */
function aeroplaneRow(
	overrides: Partial<ServerPlayHistory> = {}
): ServerPlayHistory {
	return {
		id: 1,
		gameId: 'aeroplane',
		date: '2026-08-09T00:00:00.000Z',
		status: 'win',
		opponentUserId: null,
		opponentLlmId: null,
		opponentEngineId: 'aeroplane-trio-v1',
		ratingChange: null,
		newRating: null,
		details: {
			mode: 'standard',
			rulePreset: 'classic',
			victoryTarget: 2,
			diceMode: 'fair',
			launchRule: 'six',
			finishRule: 'exact',
			stacking: false,
			blockades: false,
			chatter: false,
			humanColor: 'red',
			durationSeconds: 120,
			planesFinished: 1,
			capturesMade: 3,
			capturesSuffered: 0,
			aiPlayers: [],
		},
		...overrides,
	};
}

// --- localStorage stub ---
const store = new Map<string, string>();
const localStorageMock = {
	getItem: (key: string): string | null => store.get(key) ?? null,
	setItem: (key: string, value: string): void => {
		store.set(key, value);
	},
	removeItem: (key: string): void => {
		store.delete(key);
	},
	clear: (): void => {
		store.clear();
	},
};

const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;

async function flush(microtaskTurns = 4): Promise<void> {
	await act(async () => {
		for (let i = 0; i < microtaskTurns; i++) await Promise.resolve();
	});
}

describe('useAeroplaneProgress', () => {
	beforeEach(() => {
		__resetSharedAuthUserForTests();
		store.clear();
		globalThis.localStorage = localStorageMock as unknown as Storage;
	});

	afterEach(() => {
		__resetSharedAuthUserForTests();
		globalThis.localStorage = originalLocalStorage;
		globalThis.fetch = originalFetch;
	});

	test('does not fetch while auth is loading, unverified, or signed out', async () => {
		let playHistoryGets = 0;
		let resolveSession: (() => void) | null = null;
		deleteInitialAuthUser();
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				playHistoryGets++;
				return new Response('{}', { status: 200 });
			}
			// Hang /auth/session until the mid-test assertion below.
			return new Promise<Response>(resolve => {
				resolveSession = () => resolve(new Response('{}', { status: 401 }));
			});
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();

		// Auth still loading / unverified: no GET, nothing exposed.
		expect(playHistoryGets).toBe(0);
		expect(result.current.status).toBe('waiting-auth');
		expect(result.current.lifetimeStars).toBe(0);
		expect(result.current.selectedSkin).toBe('classic');

		// Confirmed sign-out: still no GET.
		await act(async () => {
			resolveSession?.();
			await flush();
		});
		expect(playHistoryGets).toBe(0);
		expect(result.current.status).toBe('waiting-auth');
		expect(result.current.selectedSkin).toBe('classic');
	});

	test('fetches once verified and sums only server-returned qualifying rows', async () => {
		setInitialAuthUser(authUser('user-a'));
		let playHistoryGets = 0;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				playHistoryGets++;
				return new Response(
					JSON.stringify({
						playHistory: [
							aeroplaneRow({ id: 1 }),
							// Non-qualifying rows are skipped, not thrown on.
							aeroplaneRow({
								id: 2,
								gameId: 'chess',
								opponentEngineId: null,
								opponentLlmId: 'gpt-4o',
							}),
							// Draw against the trio never scores.
							aeroplaneRow({ id: 3, status: 'draw' }),
							// Corrupt details yield null, never a throw.
							aeroplaneRow({
								id: 4,
								details: { humanColor: 'red' },
							}),
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();

		expect(playHistoryGets).toBe(1);
		expect(result.current.status).toBe('loaded');
		expect(result.current.lifetimeStars).toBe(19);
		expect(result.current.unlockedSkins).toEqual(['classic']);
		expect(result.current.selectedSkin).toBe('classic');
	});

	test('reloads when historySavedRevision changes and replaces, never accumulates, the sum', async () => {
		setInitialAuthUser(authUser('user-a'));
		let playHistoryGets = 0;
		let rowsPerLoad = 1;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				playHistoryGets++;
				const rows = Array.from({ length: rowsPerLoad }, (_, i) =>
					aeroplaneRow({ id: i + 1 })
				);
				return new Response(JSON.stringify({ playHistory: rows }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result, rerender } = renderHook(
			(props: { historySavedRevision?: number }) => useAeroplaneProgress(props),
			{ initialProps: { historySavedRevision: 0 } }
		);
		await flush();

		expect(playHistoryGets).toBe(1);
		expect(result.current.lifetimeStars).toBe(19);

		// Rerendering with the same revision must not refetch.
		rerender({ historySavedRevision: 0 });
		await flush();
		expect(playHistoryGets).toBe(1);

		// A successful terminal POST (including after a reset) bumps the
		// revision; the hook reloads and the new server sum replaces the old.
		rowsPerLoad = 2;
		rerender({ historySavedRevision: 1 });
		await flush();

		expect(playHistoryGets).toBe(2);
		expect(result.current.lifetimeStars).toBe(38);
		expect(result.current.status).toBe('loaded');
	});

	test('failed GET exposes failed status and Retry refetches', async () => {
		setInitialAuthUser(authUser('user-a'));
		let playHistoryGets = 0;
		let failNext = true;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				playHistoryGets++;
				if (failNext) {
					return new Response(
						JSON.stringify({ error: 'database unavailable' }),
						{ status: 500 }
					);
				}
				return new Response(JSON.stringify({ playHistory: [aeroplaneRow()] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();

		expect(result.current.status).toBe('failed');
		expect(result.current.lifetimeStars).toBe(0);
		// A failed GET never exposes unlocks; only classic stays available.
		expect(result.current.unlockedSkins).toEqual(['classic']);
		expect(result.current.selectedSkin).toBe('classic');

		failNext = false;
		await act(async () => {
			result.current.retry();
			await flush();
		});

		expect(playHistoryGets).toBe(2);
		expect(result.current.status).toBe('loaded');
		expect(result.current.lifetimeStars).toBe(19);
	});

	test('identity switch aborts the stale fetch and never exposes previous-user progress', async () => {
		setInitialAuthUser(authUser('user-a'));
		const signals: AbortSignal[] = [];
		const resolvers: Array<(response: Response) => void> = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit
		) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				signals.push(init?.signal ?? new AbortController().signal);
				return new Promise<Response>(resolve => {
					resolvers.push(resolve);
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();
		expect(resolvers).toHaveLength(1);

		// Switch identity while user-a's GET is still in flight.
		await act(async () => {
			dispatchAuthChange(authUser('user-b'));
			await flush();
		});

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(result.current.lifetimeStars).toBe(0);
		expect(result.current.status).toBe('loading');

		// The stale user-a response must be ignored, not applied to user-b.
		await act(async () => {
			resolvers[0]?.(
				new Response(JSON.stringify({ playHistory: [aeroplaneRow()] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			);
			await flush();
		});
		expect(result.current.lifetimeStars).toBe(0);

		await act(async () => {
			resolvers[1]?.(
				new Response(
					JSON.stringify({
						playHistory: [aeroplaneRow({ id: 9 }), aeroplaneRow({ id: 10 })],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);
			await flush();
		});
		expect(result.current.lifetimeStars).toBe(38);
		expect(result.current.status).toBe('loaded');
	});

	test('storage read/write errors fall back to classic', async () => {
		setInitialAuthUser(authUser('user-a'));
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				// Enough stars to unlock every skin except ace.
				const rows = Array.from({ length: 2 }, (_, i) =>
					aeroplaneRow({
						id: i + 1,
						details: {
							mode: 'standard',
							rulePreset: 'classic',
							victoryTarget: 2,
							diceMode: 'fair',
							launchRule: 'six',
							finishRule: 'exact',
							stacking: false,
							blockades: false,
							chatter: false,
							humanColor: 'red',
							durationSeconds: 120,
							planesFinished: 4,
							capturesMade: 10,
							capturesSuffered: 0,
							aiPlayers: [],
						},
					})
				);
				return new Response(JSON.stringify({ playHistory: rows }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const throwingStorage = {
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
		globalThis.localStorage = throwingStorage as unknown as Storage;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();

		// 2 × (10 + 20 + 12) = 84 → racer unlocked, but the read threw.
		expect(result.current.lifetimeStars).toBe(84);
		expect(result.current.status).toBe('loaded');
		expect(result.current.selectedSkin).toBe('classic');

		// A failing write must not adopt the selection either.
		expect(() => result.current.setSelectedSkin('racer')).not.toThrow();
		expect(result.current.selectedSkin).toBe('classic');
	});

	test('stored skin applies only when valid and currently unlocked', async () => {
		setInitialAuthUser(authUser('user-a'));
		store.set('procyon_aeroplane_skin_user-a', 'racer');
		let rowsPerLoad = 1;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				const rows = Array.from({ length: rowsPerLoad }, (_, i) =>
					aeroplaneRow({ id: i + 1 })
				);
				return new Response(JSON.stringify({ playHistory: rows }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result, rerender } = renderHook(
			(props: { historySavedRevision?: number }) => useAeroplaneProgress(props),
			{ initialProps: { historySavedRevision: 0 } }
		);
		await flush();

		// 19 stars: racer (60) is stored but still locked → classic.
		expect(result.current.lifetimeStars).toBe(19);
		expect(result.current.selectedSkin).toBe('classic');

		// Once a reload brings enough server stars the stored skin applies.
		rowsPerLoad = 4;
		rerender({ historySavedRevision: 1 });
		await flush();

		expect(result.current.lifetimeStars).toBe(76);
		expect(result.current.selectedSkin).toBe('racer');

		// An explicit selection persists user-scoped and applies immediately.
		await act(async () => {
			result.current.setSelectedSkin('contrail');
		});
		expect(store.get('procyon_aeroplane_skin_user-a')).toBe('contrail');
		expect(result.current.selectedSkin).toBe('contrail');
	});

	test('invalid stored values are ignored, not trusted as SkinId', async () => {
		setInitialAuthUser(authUser('user-a'));
		store.set('procyon_aeroplane_skin_user-a', 'gold');
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				return new Response(JSON.stringify({ playHistory: [aeroplaneRow()] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();

		expect(result.current.status).toBe('loaded');
		expect(result.current.selectedSkin).toBe('classic');

		// Selecting a valid unlocked skin persists it user-scoped and applies.
		await act(async () => {
			result.current.setSelectedSkin('classic');
		});
		expect(store.get('procyon_aeroplane_skin_user-a')).toBe('classic');
	});

	test('sign-out resets to classic immediately without fetching', async () => {
		setInitialAuthUser(authUser('user-a'));
		store.set('procyon_aeroplane_skin_user-a', 'classic');
		const resolvers: Array<(response: Response) => void> = [];
		let playHistoryGets = 0;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				playHistoryGets++;
				return new Promise<Response>(resolve => {
					resolvers.push(resolve);
				});
			}
			return new Response('{}', { status: 200 });
		}) as typeof fetch;

		const { result } = renderHook(() => useAeroplaneProgress());
		await flush();
		expect(playHistoryGets).toBe(1);

		await act(async () => {
			resolvers[0]?.(
				new Response(JSON.stringify({ playHistory: [aeroplaneRow()] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			);
			await flush();
		});
		expect(result.current.lifetimeStars).toBe(19);

		await act(async () => {
			dispatchAuthChange(null);
			await flush();
		});

		expect(result.current.status).toBe('waiting-auth');
		expect(result.current.lifetimeStars).toBe(0);
		expect(result.current.selectedSkin).toBe('classic');
		expect(playHistoryGets).toBe(1);
	});
});
