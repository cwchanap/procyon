import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
	subscribeConfig,
	getConfigSlice,
	setConfig,
	setModel,
	setProvider,
	hydrate,
	rehydrate,
	resetAIConfigStore,
} from './ai-config-store';
import { defaultAIConfig } from './storage';
import { AI_PROVIDERS } from './types';

/**
 * Shared test scaffolding for describe blocks that need a browser-like
 * environment (window + localStorage) and a clean store. Sets up
 * localStorage mocks, captures/restores window and fetch, and resets the
 * store in beforeEach. Returns the localStorage map in case a test needs
 * to seed or inspect it.
 */
function setupAIConfigStoreFetchMocks() {
	const localStorageStore: Record<string, string> = {};
	const ls = {
		getItem: (k: string) => localStorageStore[k] ?? null,
		setItem: (k: string, v: string) => {
			localStorageStore[k] = v;
		},
		removeItem: (k: string) => {
			delete localStorageStore[k];
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let originalWindow: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let originalFetch: any;

	beforeEach(() => {
		resetAIConfigStore();
		for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
		originalWindow = globalThis.window;
		originalFetch = globalThis.fetch;
		// @ts-expect-error -- test-only override: simulate browser window in Node
		globalThis.window = { localStorage: ls };
		// @ts-expect-error -- test-only override: expose localStorage as a global
		globalThis.localStorage = ls;
	});

	afterEach(() => {
		globalThis.window = originalWindow;
		globalThis.fetch = originalFetch;
		// @ts-expect-error -- test-only restore: drop test-only localStorage global
		delete globalThis.localStorage;
	});

	return { localStorageStore, ls };
}

describe('ai-config-store', () => {
	beforeEach(() => {
		resetAIConfigStore();
		// reset to defaults via setConfig
		setConfig(defaultAIConfig);
	});

	test('initial snapshot is defaults', () => {
		expect(getConfigSlice().config).toEqual(defaultAIConfig);
	});

	test('setModel updates config', () => {
		setModel('gemini-2.5-pro');
		expect(getConfigSlice().config.model).toBe('gemini-2.5-pro');
	});

	test('config subscribers are notified on config changes', () => {
		let configCalls = 0;
		const unsubConfig = subscribeConfig(() => configCalls++);

		setModel('gpt-4o');
		expect(configCalls).toBe(1);

		unsubConfig();
		setModel('gemini-2.5-pro');
		expect(configCalls).toBe(1);
	});

	test('setProvider returns error message when fetch fails', async () => {
		// Mock fetch to reject so setProvider's fetchAIConfigList fails
		// deterministically — without this, bun's built-in fetch makes real
		// network calls to the API server.
		const originalFetch = globalThis.fetch;
		// @ts-expect-error -- test-only: replace global fetch with failing mock
		globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

		const err = await setProvider('openai');

		globalThis.fetch = originalFetch;
		expect(typeof err).toBe('string');
		expect(err!.length).toBeGreaterThan(0);
	});

	test('hydrate does not throw and leaves a valid snapshot', async () => {
		await expect(hydrate()).resolves.toBeUndefined();
		expect(getConfigSlice().config).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// setProvider model fallback. When /ai-config/:id/full returns no model,
// setProvider must derive a provider-specific default rather than reuse the
// prior provider's stale model — otherwise the dropdown shows the new
// provider's first model while the AI service receives the old model.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider model fallback', () => {
	setupAIConfigStoreFetchMocks();

	beforeEach(() => {
		// Seed the store with a prior provider's model so the fallback path is
		// distinguishable from the new provider's default.
		setConfig({
			provider: 'gemini',
			apiKey: '',
			model: 'gemini-2.5-flash-lite',
			enabled: false,
			gameVariant: 'chess',
		});
	});

	test('falls back to the new provider default when full.model is empty', async () => {
		// First call → /ai-config list; second call → /:id/full with no model.
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					// modelName intentionally omitted to exercise the fallback
					gameVariant: 'chess',
				}),
			};
		});

		const err = await setProvider('openai');

		expect(err).toBeNull();
		const { config } = getConfigSlice();
		expect(config.provider).toBe('openai');
		// Must be an OpenAI model, NOT the stale 'gemini-2.5-flash-lite'.
		expect(config.model).toBe(AI_PROVIDERS.openai.models[0]!);
		expect(config.model).not.toBe('gemini-2.5-flash-lite');
	});

	test('uses full.model when the backend returns one', async () => {
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		const err = await setProvider('openai');

		expect(err).toBeNull();
		expect(getConfigSlice().config.model).toBe('gpt-4o');
	});
});

// ---------------------------------------------------------------------------
// setProvider clears hydrateError. A failed hydrate sets hydrateError=true,
// which blocks Start in all game components. If the user recovers by
// switching to a provider with a valid API key, setProvider must clear the
// stale error so Start is re-enabled.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider clears hydrateError', () => {
	setupAIConfigStoreFetchMocks();

	test('clears hydrateError after a successful provider switch', async () => {
		// Simulate a failed hydrate by setting hydrateError directly via the
		// store's internal state — hydrate() would require a failing fetch,
		// but we only need the flag to be set before setProvider runs.
		// Use setConfig to seed defaults, then manually trigger a hydrate
		// failure by mocking fetch to throw during hydrate.
		// @ts-expect-error -- test-only: replace global fetch with failing mock
		globalThis.fetch = mock(async () => {
			throw new Error('Network error');
		});
		await hydrate();
		expect(getConfigSlice().hydrateError).toBe(true);

		// Now mock fetch to succeed for setProvider's list + full fetches.
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		const err = await setProvider('openai');

		expect(err).toBeNull();
		const snap = getConfigSlice();
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		// The key assertion: hydrateError must be cleared so Start is
		// re-enabled in the game components.
		expect(snap.hydrateError).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// setProvider stale-write race. When a user switches providers twice before
// the first request finishes, the older in-flight call must not clobber the
// newer provider/model in the store. Uses controllable pending fetches to
// interleave two setProvider calls and verify the older one is dropped.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider stale-write race', () => {
	setupAIConfigStoreFetchMocks();

	test('older setProvider does not clobber store when newer one resolves first', async () => {
		// Controllable resolvers for the first setProvider's fetches.
		// The second setProvider's fetches resolve immediately.
		let resolveFirstList: (v: unknown) => void = () => {};
		let resolveOpenaiFull: (v: unknown) => void = () => {};
		const firstListPending = new Promise(r => {
			resolveFirstList = r;
		});
		const openaiFullPending = new Promise(r => {
			resolveOpenaiFull = r;
		});

		// Call counter for the list fetch: 1st call (first setProvider)
		// holds pending; 2nd call (second setProvider) resolves immediately.
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					return firstListPending;
				}
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// /ai-config/:id/full — route by the config ID in the URL.
			// The first setProvider requests cfg-o (openai) → held pending.
			// The second setProvider requests cfg-g (gemini) → immediate.
			const id = url.split('/').pop();
			if (id === 'cfg-o') {
				return openaiFullPending;
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gem-key',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start the first setProvider (openai) — its list fetch is pending.
		const firstPromise = setProvider('openai');

		// Start the second setProvider (gemini) — its list fetch resolves
		// immediately (listCallCount=2), then its full fetch for cfg-g
		// also resolves immediately.
		const secondPromise = setProvider('gemini');
		await secondPromise;

		// The store should now reflect gemini (the newer call).
		expect(getConfigSlice().config.provider).toBe('gemini');
		expect(getConfigSlice().config.apiKey).toBe('gem-key');

		// Now release the first (stale) setProvider's list fetch. It will
		// proceed to fetch cfg-o/full, which is also held pending.
		resolveFirstList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-o', provider: 'openai', hasApiKey: true, isActive: false },
				],
			}),
		});
		// Release the stale openai full fetch.
		resolveOpenaiFull({
			ok: true,
			json: async () => ({
				provider: 'openai',
				apiKey: 'oai-key',
				modelName: 'gpt-4o',
				gameVariant: 'chess',
			}),
		});
		await firstPromise;

		// The stale openai response must NOT have clobbered the store.
		expect(getConfigSlice().config.provider).toBe('gemini');
		expect(getConfigSlice().config.apiKey).toBe('gem-key');
		expect(getConfigSlice().config.model).toBe('gemini-2.5-flash');
	});
});

// ---------------------------------------------------------------------------
// setProvider stale catch paths. When a newer setProvider supersedes an
// older one, the older call's catch blocks must return null (not an error
// string) so the game handler's unconditional setErrorMsg(err) doesn't
// display a stale failure or clear the newer switch's error.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider stale catch paths', () => {
	setupAIConfigStoreFetchMocks();

	test('stale list-fetch failure returns null, not an error string', async () => {
		// Controllable resolver for the first (stale) setProvider's list fetch.
		// We resolve (not reject) with a failing HTTP response to avoid
		// unhandled-rejection warnings — fetchAIConfigList throws on !res.ok,
		// which exercises the same catch path in setProvider.
		let resolveFirstList: (v: unknown) => void = () => {};
		const firstListPending = new Promise(r => {
			resolveFirstList = r;
		});

		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// First call (stale) — held pending, will resolve with a
					// failing response after the newer switch completes.
					return firstListPending;
				}
				// Second call (newer) — succeeds immediately.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gem-key',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start the first setProvider (openai) — its list fetch is pending.
		const firstPromise = setProvider('openai');

		// Start the second setProvider (gemini) — supersedes the first.
		const secondPromise = setProvider('gemini');
		const secondErr = await secondPromise;
		expect(secondErr).toBeNull();

		// Now resolve the stale first list fetch with a failing response.
		resolveFirstList({ ok: false, status: 500 });
		const firstErr = await firstPromise;

		// The stale failure must return null, not an error string —
		// otherwise the game handler would display it after the user
		// already switched to gemini.
		expect(firstErr).toBeNull();
	});

	test('stale full-fetch failure returns null, not an error string', async () => {
		// Controllable resolver for the first (stale) setProvider's full fetch.
		// Resolves (not rejects) with a failing HTTP response to avoid
		// unhandled-rejection warnings — fetchFullAIConfig throws on !res.ok,
		// which exercises the same catch path in setProvider.
		let resolveOpenaiFull: (v: unknown) => void = () => {};
		const openaiFullPending = new Promise(r => {
			resolveOpenaiFull = r;
		});

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			const id = url.split('/').pop();
			if (id === 'cfg-o') {
				// Stale openai full fetch — held pending, will resolve with a
				// failing response after the newer switch completes.
				return openaiFullPending;
			}
			// Newer gemini full fetch — succeeds immediately.
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gem-key',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start the first setProvider (openai) — its full fetch is pending.
		const firstPromise = setProvider('openai');

		// Start the second setProvider (gemini) — supersedes the first.
		const secondPromise = setProvider('gemini');
		const secondErr = await secondPromise;
		expect(secondErr).toBeNull();

		// Now resolve the stale openai full fetch with a failing response.
		resolveOpenaiFull({ ok: false, status: 500 });
		const firstErr = await firstPromise;

		// The stale failure must return null, not an error string.
		expect(firstErr).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Hydration fields (availableProviders / hydrated / hydrateError) driven by
// the /ai-config fetch. These require a browser-like environment (window +
// localStorage) because loadAIConfigWithProviders short-circuits to defaults
// when window is undefined. Mocks global fetch to assert the store surfaces
// the provider list and distinguishes a failed hydrate from an empty one.
// ---------------------------------------------------------------------------
describe('ai-config-store hydration (mocked fetch)', () => {
	setupAIConfigStoreFetchMocks();

	test('hydrate populates availableProviders and clears hydrateError on success', async () => {
		// List returns gemini+openai keyed, none active. With the
		// auto-fetch fix, loadAIConfigWithProviders also fetches /full
		// for the first available provider (gemini) before returning, so
		// the mock must handle that second call.
		let callCount = 0;
		// @ts-expect-error -- test-only: replace global fetch with mock
		globalThis.fetch = mock(async (url: string) => {
			callCount++;
			if (callCount === 1) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
							// no-key entry should be filtered out of availableProviders
							{ id: 'cfg-x', provider: 'openrouter', hasApiKey: false },
						],
					}),
				};
			}
			expect(url).toContain('/cfg-g/full');
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gem-key',
					modelName: 'gemini-2.5-flash-lite',
					gameVariant: 'chess',
				}),
			};
		});

		await hydrate();

		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual(['gemini', 'openai']);
	});

	test('hydrate sets hydrateError when the fetch fails', async () => {
		// @ts-expect-error -- test-only: replace global fetch with failing mock
		globalThis.fetch = mock(async () => {
			throw new Error('Network error');
		});

		await hydrate();

		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(true);
		expect(snap.availableProviders).toEqual([]);
	});

	test('hydrate with no keyed providers leaves availableProviders empty but no error', async () => {
		// List fetch succeeds but no entry has a key → fromFallback is false,
		// so the UI shows the empty-state prompt, not the error/retry state.
		// @ts-expect-error -- test-only: replace global fetch with empty-list mock
		globalThis.fetch = mock(async () => ({
			ok: true,
			json: async () => ({ configurations: [] }),
		}));

		await hydrate();

		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual([]);
	});

	test('hydrate does not clobber store after setProvider completes', async () => {
		// Hold the first /ai-config call (hydrate's list fetch) pending so
		// we can interleave a setProvider while runHydrate is in flight.
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// First call — hydrate's list fetch, held pending.
					return hydrateListPending;
				}
				// Second call — setProvider's list fetch, resolves immediately.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// /ai-config/:id/full — setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// While hydrate is in flight, the user switches to openai.
		// setProvider bumps setProviderGeneration and writes openai to the store.
		const providerErr = await setProvider('openai');
		expect(providerErr).toBeNull();
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().config.apiKey).toBe('sk-test');

		// Now release hydrate's stale list fetch. It returns a list with
		// only gemini (no active config), so loadAIConfigWithProviders
		// would fall through to defaultAIConfig (provider: 'gemini').
		// Without the setProviderGeneration guard, runHydrate would
		// overwrite the store with 'gemini', clobbering the user's
		// 'openai' selection.
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		// The store must still reflect the user's openai selection.
		const snap = getConfigSlice();
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.config.model).toBe('gpt-4o');
		// setProvider must also complete the hydration state: runHydrate's
		// generation guard discards its result (providerGen mismatch), so
		// without setProvider writing hydrated=true the config slice would
		// stay un-hydrated forever (module-level `hydrated` is true, so
		// hydrate() short-circuits and never retries).
		expect(snap.hydrated).toBe(true);
	});

	test('setProvider completes hydration when it wins the race against runHydrate', async () => {
		// Hold the first /ai-config call (hydrate's list fetch) pending so
		// we can interleave a setProvider while runHydrate is in flight.
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					return hydrateListPending;
				}
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// While hydrate is in flight, the user switches to openai.
		// setProvider bumps setProviderGeneration and writes to the store.
		await setProvider('openai');

		// Before releasing the stale hydrate, the config slice must already
		// be hydrated — otherwise every game's Start control is disabled
		// with no retry UI (hydrateError is false).
		expect(getConfigSlice().hydrated).toBe(true);

		// Release the stale hydrate list fetch — it must be discarded.
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		// Hydration must remain true after the stale hydrate resolves.
		expect(getConfigSlice().hydrated).toBe(true);
	});

	test('resetAIConfigStore ignores a stale in-flight hydrate', async () => {
		// Hold the list fetch pending so we can interleave a logout/reset
		// while runHydrate is still awaiting it.
		let resolveFetch: (v: unknown) => void = () => {};
		const pending = new Promise(resolve => {
			resolveFetch = resolve;
		});
		// @ts-expect-error -- test-only: replace global fetch with a controllable pending response
		globalThis.fetch = mock(async () => pending);

		// Start hydrate but don't await — it's now in flight.
		const hydratePromise = hydrate();

		// Logout (or a session reset) clears the store while the fetch is
		// still pending. This bumps the hydrate generation token.
		resetAIConfigStore();

		// Now release the stale fetch with User A's provider list. Without
		// the generation guard, runHydrate would write this back into the
		// store after the reset already cleared it.
		resolveFetch({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		const snap = getConfigSlice();
		// Reset cleared the slice; the stale hydrate must not have re-populated it.
		expect(snap.hydrated).toBe(false);
		expect(snap.availableProviders).toEqual([]);
		expect(snap.config).toEqual(defaultAIConfig);
	});

	// [P1] When setProvider fails (unconfigured provider or fetch error)
	// while the initial runHydrate is still in-flight, setProvider bumps
	// setProviderGeneration but doesn't mark the config slice hydrated.
	// The pending runHydrate must still write hydrated=true so the UI
	// isn't stuck with hydrated=false and no retry path.
	test('runHydrate marks hydrated=true even when setProvider failed during race', async () => {
		// Hold the first /ai-config call (hydrate's list fetch) pending so
		// we can interleave a failing setProvider while runHydrate is in flight.
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// First call — hydrate's list fetch, held pending.
					return hydrateListPending;
				}
				// Second call — setProvider's list fetch, resolves immediately
				// but returns a list without the requested provider (anthropic
				// has no keyed config), so setProvider returns an error string
				// without writing hydrated=true to the slice.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// While hydrate is in flight, the user tries to switch to chutes
		// (which has no keyed config in the mock list). setProvider bumps
		// setProviderGeneration and returns an error string without
		// writing hydrated=true.
		const providerErr = await setProvider('chutes');
		expect(typeof providerErr).toBe('string');
		expect(getConfigSlice().hydrated).toBe(false);

		// Now release hydrate's stale list fetch. It returns a list with
		// gemini keyed. Without the fix, runHydrate's providerGen guard
		// would return without writing hydrated=true, leaving the slice
		// stuck (module-level `hydrated` is true so hydrate() short-circuits).
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		// The config slice must be hydrated so the UI isn't stuck.
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		// hydrateError should be false — the hydrate fetch succeeded
		// (fromFallback=false), and setProvider didn't succeed so there's
		// no working config, but the data is valid and the user can retry
		// by selecting a different provider.
		expect(snap.hydrateError).toBe(false);
		// availableProviders should be populated from the hydrate response.
		expect(snap.availableProviders).toEqual(['gemini']);
	});

	// [P1] Same scenario as above but setProvider's list fetch itself
	// fails (network error), exercising the catch path in setProvider.
	test('runHydrate marks hydrated=true even when setProvider fetch failed during race', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					return hydrateListPending;
				}
				// setProvider's list fetch fails.
				throw new Error('Network error');
			}
			// Hydrate's auto-fetch for the first available provider (gemini).
			expect(url).toContain('/cfg-g/full');
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gem-key',
					modelName: 'gemini-2.5-flash-lite',
					gameVariant: 'chess',
				}),
			};
		});

		const hydratePromise = hydrate();

		// setProvider's list fetch throws — setProvider bumps
		// setProviderGeneration and returns an error string.
		const providerErr = await setProvider('openai');
		expect(typeof providerErr).toBe('string');
		expect(getConfigSlice().hydrated).toBe(false);

		// Release hydrate's list fetch — it succeeds (fromFallback=false).
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
					{ id: 'cfg-o', provider: 'openai', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual(['gemini', 'openai']);
	});

	// [P1] When both setProvider and runHydrate fail (network down),
	// the providerGen guard in the catch path must still mark hydrated
	// and set hydrateError so the user gets a Retry button.
	test('runHydrate catch marks hydrated+hydrateError when setProvider also failed', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					return hydrateListPending;
				}
				throw new Error('Network error');
			}
			return { ok: true, json: async () => ({}) };
		});

		const hydratePromise = hydrate();

		// setProvider fails (network error).
		await setProvider('openai');
		expect(getConfigSlice().hydrated).toBe(false);

		// Release hydrate's list fetch with a failing response — the
		// hydrate itself also fails. Without the fix, the catch path's
		// providerGen guard would return without writing anything.
		resolveHydrateList({ ok: false, status: 500 });
		await hydratePromise;

		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(true);
	});

	// [P2] When setProvider succeeds before the initial hydrate completes,
	// the hydrate response must still populate availableProviders —
	// otherwise the sidebar shows the empty-state message despite the
	// user having a valid API key.
	test('runHydrate populates availableProviders when setProvider won the race', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				// setProvider's list fetch — resolves immediately.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// setProvider succeeds — writes openai config + hydrated=true,
		// and adds 'openai' to availableProviders so the sidebar doesn't
		// show an empty-state message if the concurrent hydrate fails.
		await setProvider('openai');
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().hydrated).toBe(true);
		expect(getConfigSlice().availableProviders).toEqual(['openai']);

		// Release hydrate's list fetch — it returns both gemini and openai.
		// Without the fix, the providerGen guard would discard this and
		// availableProviders would stay [].
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
					{ id: 'cfg-o', provider: 'openai', hasApiKey: true, isActive: false },
				],
			}),
		});
		await hydratePromise;

		// availableProviders must be populated from the hydrate response.
		const snap = getConfigSlice();
		expect(snap.availableProviders).toEqual(['gemini', 'openai']);
		// The config must still reflect the user's openai selection.
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] When setProvider succeeds (populating availableProviders with
	// the providers that had keys at switch time) and a concurrent hydrate
	// then resolves successfully (fromFallback=false) with an empty
	// provider list — e.g. the user revoked/deleted all API keys between
	// the two list fetches — the hydrate must NOT preserve setProvider's
	// stale list. A successful hydrate reflects the current backend state;
	// preserving the old list would leave the sidebar offering providers
	// whose keys no longer exist. Only fallback responses (which couldn't
	// reach the backend) should preserve the existing list.
	test('runHydrate does not preserve stale providers for a successful empty hydrate', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				// setProvider's list fetch — openai has a key at switch time.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// setProvider succeeds — writes openai config + availableProviders.
		await setProvider('openai');
		expect(getConfigSlice().availableProviders).toEqual(['openai']);

		// Release hydrate's list fetch — it succeeds (fromFallback=false)
		// but returns no keyed providers (keys were revoked since setProvider
		// fetched its list). No active config either, so loadAIConfigWithProviders
		// returns defaults with fromFallback=false and availableProviders=[].
		resolveHydrateList({
			ok: true,
			json: async () => ({ configurations: [] }),
		});
		await hydratePromise;

		// availableProviders must be empty — the successful hydrate reflects
		// the current backend state. Preserving setProvider's ['openai'] would
		// offer a provider whose key no longer exists.
		const snap = getConfigSlice();
		expect(snap.availableProviders).toEqual([]);
		// setProvider succeeded, so the user's openai selection is preserved.
		expect(snap.config.provider).toBe('openai');
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] When setProvider succeeds and the concurrent hydrate's fetch
	// throws (catch path), the catch path doesn't populate
	// availableProviders. Without setProvider adding the selected
	// provider to the list, availableProviders would stay [] permanently
	// and the sidebar would show "No AI providers configured" despite
	// the user having a valid key for the selected provider.
	test('setProvider preserves availableProviders when concurrent hydrate fails', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				// setProvider's list fetch — resolves immediately.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// setProvider succeeds — writes openai config + adds 'openai'
		// to availableProviders.
		await setProvider('openai');
		expect(getConfigSlice().availableProviders).toEqual(['openai']);

		// Release hydrate's list fetch with a failing response — the
		// hydrate itself fails. The catch path's providerGen guard runs
		// but doesn't populate availableProviders.
		resolveHydrateList({ ok: false, status: 500 });
		await hydratePromise;

		// availableProviders must still contain 'openai' (from
		// setProvider's success path), not be empty.
		const snap = getConfigSlice();
		expect(snap.availableProviders).toEqual(['openai']);
		expect(snap.config.provider).toBe('openai');
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] setProvider fetches the complete /ai-config list, so it should
	// derive availableProviders from that list — not just store the single
	// selected provider. When the concurrent hydrate's fetch fails (catch
	// path doesn't populate availableProviders), the sidebar would otherwise
	// hide the user's other configured providers until a later successful
	// hydrate.
	test('setProvider preserves all configured providers when concurrent hydrate fails', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				// setProvider's list fetch — returns multiple keyed providers.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: false,
							},
							// no-key entry should be filtered out
							{
								id: 'cfg-or',
								provider: 'openrouter',
								hasApiKey: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o (openai).
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// setProvider succeeds — switches to openai. The fetched list has
		// both openai and gemini keyed, so availableProviders must contain
		// both (openrouter is excluded — no key).
		await setProvider('openai');
		expect(getConfigSlice().availableProviders).toEqual(['openai', 'gemini']);

		// Release hydrate's list fetch with a failing response — the
		// hydrate itself fails. The catch path doesn't populate
		// availableProviders, so the list from setProvider must survive.
		resolveHydrateList({ ok: false, status: 500 });
		await hydratePromise;

		// Both keyed providers must still be present — not just 'openai'.
		const snap = getConfigSlice();
		expect(snap.availableProviders).toEqual(['openai', 'gemini']);
		expect(snap.config.provider).toBe('openai');
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] When setProvider fails during hydration (unconfigured provider
	// or fetch error), it bumps setProviderGeneration without writing to
	// the slice. runHydrate's providerGen guard then runs, but must apply
	// the hydrate's config — not preserve configSlice.config (which is
	// still defaultAIConfig). Without this, the store ends up with default
	// credentials, hydrated=true, and no error, leaving AI gameplay
	// unusable.
	test('runHydrate applies hydrate config when setProvider failed during race', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				// setProvider's list fetch — returns a list without the
				// requested provider (chutes has no keyed config), so
				// setProvider fails without writing to the slice.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			// Hydrate's full fetch for the active gemini config.
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-123',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// setProvider fails — chutes has no keyed config in the mock list.
		const providerErr = await setProvider('chutes');
		expect(typeof providerErr).toBe('string');
		expect(getConfigSlice().hydrated).toBe(false);

		// Release hydrate's list fetch — it returns gemini as active with
		// a valid API key. The hydrate's full fetch also succeeds.
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await hydratePromise;

		// The store must apply the hydrate's config (gemini with key),
		// not preserve the default config from the failed setProvider.
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.config.provider).toBe('gemini');
		expect(snap.config.apiKey).toBe('gemini-key-123');
		expect(snap.config.model).toBe('gemini-2.5-flash');
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual(['gemini']);
	});

	// [P2] When a setProvider succeeds during hydration and a *later*
	// setProvider fails, the hydrate must still preserve the successful
	// provider choice. The failed switch bumps setProviderGeneration without
	// recording setProviderSucceededGen, so checking
	// setProviderSucceededGen === setProviderGeneration would evaluate false
	// and the hydrate would overwrite the successful provider with stale
	// data. The fix compares setProviderSucceededGen > providerGen instead,
	// which detects the earlier success regardless of the later failure.
	test('runHydrate preserves successful provider switch when a later switch fails during race', async () => {
		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending.
					return hydrateListPending;
				}
				if (listCallCount === 2) {
					// First setProvider's list fetch — openai is keyed.
					return {
						ok: true,
						json: async () => ({
							configurations: [
								{
									id: 'cfg-o',
									provider: 'openai',
									hasApiKey: true,
									isActive: false,
								},
							],
						}),
					};
				}
				// Second setProvider's list fetch — chutes has no keyed
				// config, so this switch will fail.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o (openai).
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// Start hydrate but don't await — its list fetch is pending.
		const hydratePromise = hydrate();

		// First setProvider succeeds — switches to openai.
		await setProvider('openai');
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().config.apiKey).toBe('sk-test');

		// Second setProvider fails — chutes has no keyed config.
		const providerErr = await setProvider('chutes');
		expect(typeof providerErr).toBe('string');

		// The successful openai config must still be in the store.
		expect(getConfigSlice().config.provider).toBe('openai');

		// Release hydrate's list fetch — it returns gemini as the active
		// config (stale, from before any provider switch).
		resolveHydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await hydratePromise;

		// The store must preserve the successful openai switch, not overwrite
		// it with the hydrate's stale gemini config.
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] If setProvider succeeds BEFORE the first hydrate() has started,
	// it writes configSlice.hydrated=true but the module-level `hydrated`
	// guard stays false. A later hydrate() then proceeds, captures
	// providerGen === setProviderGeneration (no new setProvider during the
	// fetch), so the providerGen race guard doesn't fire, and the hydrate
	// overwrites the user's newly selected provider/model/key with the
	// stale active backend config. setProvider must also set the
	// module-level `hydrated` flag so the later hydrate() short-circuits.
	test('setProvider before hydrate prevents later hydrate from clobbering store', async () => {
		// setProvider's fetches resolve immediately.
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				// setProvider's list fetch — openai is keyed.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		// setProvider succeeds BEFORE hydrate() is ever called.
		const providerErr = await setProvider('openai');
		expect(providerErr).toBeNull();
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().config.apiKey).toBe('sk-test');
		expect(getConfigSlice().hydrated).toBe(true);

		// Now swap the fetch mock so a subsequent hydrate() would return
		// gemini as the active config — the stale backend state from before
		// the user switched to openai.
		// @ts-expect-error -- test-only: replace global fetch with stale mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-stale',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// A later hydrate() must short-circuit (module-level hydrated=true
		// from setProvider) and NOT overwrite the user's openai selection.
		await hydrate();

		const snap = getConfigSlice();
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.config.model).toBe('gpt-4o');
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] After a successful first hydrate, configSlice.hydrated is true.
	// If rehydrate() is then called (e.g. the user clicks Retry after a
	// transient error), and a concurrent setProvider fails during the
	// rehydrate's in-flight fetch, runHydrate's providerGen guard must NOT
	// use configSlice.hydrated as the success signal — it's still true from
	// the first hydrate, so the failed setProvider would be mistaken for a
	// successful one, preserving the old config and hydrateError instead of
	// applying the rehydrate's fresh config.
	test('rehydrate + concurrent failed setProvider applies hydrate config, not stale hydrated flag', async () => {
		// Step 1: Successful initial hydrate — sets configSlice.hydrated=true
		// with gemini as the active provider.
		// @ts-expect-error -- test-only: replace global fetch with list mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			// Hydrate's full fetch for the active gemini config.
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-initial',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		await hydrate();
		expect(getConfigSlice().hydrated).toBe(true);
		expect(getConfigSlice().config.apiKey).toBe('gemini-key-initial');

		// Step 2: Start a rehydrate (e.g. user clicked Retry). Hold its
		// list fetch pending so we can interleave a setProvider.
		let resolveRehydrateList: (v: unknown) => void = () => {};
		const rehydrateListPending = new Promise(r => {
			resolveRehydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// rehydrate's list fetch — held pending.
					return rehydrateListPending;
				}
				// setProvider's list fetch — returns a list without the
				// requested provider (chutes has no keyed config), so
				// setProvider fails without writing to the slice.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			// rehydrate's full fetch for the active gemini config.
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-fresh',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start rehydrate — its list fetch is pending.
		const rehydratePromise = rehydrate();

		// While rehydrate is in flight, the user tries to switch to chutes
		// (which has no keyed config). setProvider bumps
		// setProviderGeneration and returns an error string without
		// writing to the slice.
		const providerErr = await setProvider('chutes');
		expect(typeof providerErr).toBe('string');

		// configSlice.hydrated is still true from the first hydrate —
		// this is the stale flag that the old code used as the success
		// signal.
		expect(getConfigSlice().hydrated).toBe(true);

		// Release rehydrate's list fetch — it returns gemini as active
		// with a fresh API key. Without the fix, runHydrate would see
		// configSlice.hydrated=true and treat the failed setProvider as
		// successful, preserving the old config (gemini-key-initial)
		// instead of applying the fresh one (gemini-key-fresh).
		resolveRehydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydratePromise;

		// The store must apply the rehydrate's fresh config, not preserve
		// the stale config from the first hydrate.
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.config.provider).toBe('gemini');
		expect(snap.config.apiKey).toBe('gemini-key-fresh');
		expect(snap.config.model).toBe('gemini-2.5-flash');
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual(['gemini']);
	});

	// [P2] If a setProvider succeeds at gen N BEFORE a rehydrate starts,
	// the rehydrate captures providerGen=N. If a later setProvider fails
	// at gen N+1 during the rehydrate's fetch, setProviderSucceededGen
	// stays N (the failure doesn't record). The old guard
	// `setProviderSucceededGen > providerGen` (N > N) reports false, so
	// the rehydrate applies its stale backend snapshot — clobbering the
	// successful gen N switch even though the gen N+1 failure wrote
	// nothing. The fix uses `>= ` (with a `> 0` guard to distinguish
	// "no setProvider ever succeeded" from "succeeded at gen N") so the
	// prior success is preserved.
	test('rehydrate preserves prior successful setProvider when a later setProvider fails during the fetch', async () => {
		// Step 1: setProvider succeeds — switches to openai.
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// setProvider's full fetch for cfg-o.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-test',
					modelName: 'gpt-4o',
					gameVariant: 'chess',
				}),
			};
		});

		const providerErr = await setProvider('openai');
		expect(providerErr).toBeNull();
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().config.apiKey).toBe('sk-test');

		// Step 2: Start a rehydrate. Hold its list fetch pending so we
		// can interleave a failing setProvider.
		let resolveRehydrateList: (v: unknown) => void = () => {};
		const rehydrateListPending = new Promise(r => {
			resolveRehydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// rehydrate's list fetch — held pending.
					return rehydrateListPending;
				}
				// setProvider's list fetch — returns a list without the
				// requested provider (chutes has no keyed config), so
				// setProvider fails without writing to the slice.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			// rehydrate's full fetch for the active openai config.
			// Returns a DIFFERENT API key than what setProvider wrote,
			// so we can detect if the rehydrate clobbered the switch.
			return {
				ok: true,
				json: async () => ({
					provider: 'openai',
					apiKey: 'sk-stale-backend',
					modelName: 'gpt-4o-mini',
					gameVariant: 'chess',
				}),
			};
		});

		// Start rehydrate — its list fetch is pending.
		const rehydratePromise = rehydrate();

		// While rehydrate is in flight, the user tries to switch to
		// chutes (which has no keyed config). setProvider bumps
		// setProviderGeneration to N+1 and returns an error string
		// without writing to the slice or recording setProviderSucceededGen.
		const failErr = await setProvider('chutes');
		expect(typeof failErr).toBe('string');

		// Release rehydrate's list fetch.
		resolveRehydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-o',
						provider: 'openai',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydratePromise;

		// The store must preserve the successful openai switch (sk-test),
		// NOT overwrite it with the rehydrate's stale backend snapshot
		// (sk-stale-backend).
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.config.model).toBe('gpt-4o');
		expect(snap.hydrateError).toBe(false);
	});

	// [P2] isRehydrating flag: rehydrate() must set isRehydrating=true on
	// the config slice so consumers can disable model/provider edits while
	// the fetch is in flight. configSlice.hydrated stays true from the
	// prior hydrate, so without isRehydrating the selects stay enabled and
	// a setModel() call (which doesn't bump setProviderGeneration) would
	// be silently overwritten when runHydrate resolves.
	test('rehydrate sets isRehydrating during fetch and clears it after', async () => {
		// Step 1: Successful initial hydrate so configSlice.hydrated=true.
		// @ts-expect-error -- test-only: replace global fetch with list mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		await hydrate();
		expect(getConfigSlice().isRehydrating).toBe(false);

		// Step 2: Start a rehydrate with a held-pending list fetch so we
		// can inspect the slice mid-flight.
		let resolveRehydrateList: (v: unknown) => void = () => {};
		const rehydrateListPending = new Promise(r => {
			resolveRehydrateList = r;
		});

		// @ts-expect-error -- test-only: replace global fetch with held mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				return rehydrateListPending;
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-fresh',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		const rehydratePromise = rehydrate();

		// While the fetch is in flight, isRehydrating must be true.
		expect(getConfigSlice().isRehydrating).toBe(true);

		// Release the fetch — rehydrate resolves and clears isRehydrating.
		resolveRehydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydratePromise;

		expect(getConfigSlice().isRehydrating).toBe(false);
		expect(getConfigSlice().hydrated).toBe(true);
	});

	// [P2] runHydrate catch path with providerGen guard: when
	// loadAIConfigWithProviders throws (not just returns fallback) while
	// a setProvider has raced, the catch path must still mark hydrated
	// and set hydrateError so the UI isn't stuck. loadAIConfigWithProviders
	// normally swallows all errors, but if localStorage.getItem throws in
	// its catch-path readLocalConfig call, the throw propagates to
	// runHydrate's catch.
	test('runHydrate catch marks hydrated+hydrateError when loadAIConfigWithProviders throws and setProvider raced', async () => {
		// The describe block's setupAIConfigStoreFetchMocks() already
		// sets up globalThis.localStorage. Access it to override getItem.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ls = globalThis.localStorage as any;

		let resolveHydrateList: (v: unknown) => void = () => {};
		const hydrateListPending = new Promise(r => {
			resolveHydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// Hydrate's list fetch — held pending, will resolve with
					// a failing response so fetchAIConfigList throws.
					return hydrateListPending;
				}
				// setProvider's list fetch — throw immediately so setProvider
				// fails but still bumps setProviderGeneration.
				throw new Error('Network error');
			}
			return { ok: true, json: async () => ({}) };
		});

		// Make localStorage.getItem throw so readLocalConfig throws in
		// loadAIConfigWithProviders' catch path, propagating to runHydrate.
		const originalGetItem = ls.getItem;
		ls.getItem = () => {
			throw new Error('localStorage unavailable');
		};

		try {
			// Start hydrate — its list fetch is pending.
			const hydratePromise = hydrate();

			// setProvider fails (list fetch throws) but bumps
			// setProviderGeneration so the providerGen guard in runHydrate's
			// catch path fires.
			const providerErr = await setProvider('openai');
			expect(typeof providerErr).toBe('string');

			// Release hydrate's list fetch with a failing response.
			// fetchAIConfigList throws → loadAIConfigWithProviders catches →
			// readLocalConfig([]) calls localStorage.getItem which throws →
			// throw propagates to runHydrate's catch.
			resolveHydrateList({ ok: false, status: 500 });
			await hydratePromise;

			// The catch path's providerGen guard must have marked hydrated
			// and set hydrateError (setProvider didn't succeed, so
			// setProviderSucceededGen is 0, making hydrateError=true).
			const snap = getConfigSlice();
			expect(snap.hydrated).toBe(true);
			expect(snap.hydrateError).toBe(true);
		} finally {
			ls.getItem = originalGetItem;
		}
	});

	// [P2] runHydrate catch path without setProvider race: when
	// loadAIConfigWithProviders throws and no setProvider raced, the
	// catch path's non-guard branch must mark hydrated+hydrateError.
	test('runHydrate catch marks hydrated+hydrateError when loadAIConfigWithProviders throws (no setProvider race)', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ls = globalThis.localStorage as any;

		// @ts-expect-error -- test-only: replace global fetch with failing mock
		globalThis.fetch = mock(async () => {
			throw new Error('Network error');
		});

		// Make localStorage.getItem throw so readLocalConfig throws in
		// loadAIConfigWithProviders' catch path, propagating to runHydrate.
		const originalGetItem = ls.getItem;
		ls.getItem = () => {
			throw new Error('localStorage unavailable');
		};

		try {
			await hydrate();

			// No setProvider raced, so the non-guard catch path runs:
			// setConfigSlice({ ...configSlice, hydrated: true, hydrateError: true })
			const snap = getConfigSlice();
			expect(snap.hydrated).toBe(true);
			expect(snap.hydrateError).toBe(true);
		} finally {
			ls.getItem = originalGetItem;
		}
	});

	// [P2] When a rehydrate is in flight and resetAIConfigStore() runs
	// (logout), a later login can start another rehydrate(). The old
	// promise's finally must NOT clear the module-level inFlight or the
	// isRehydrating flag, which now belong to the newer request. Without
	// tying cleanup to the request that created it, the old finally
	// re-enables provider/model controls while the newer fetch is still
	// pending, and a subsequent setModel() can be overwritten when the
	// newer runHydrate resolves.
	test('rehydrate finally does not clear newer rehydrate inFlight or isRehydrating after reset', async () => {
		// Step 1: Start rehydrate1 with a held-pending list fetch.
		let resolveList1: (v: unknown) => void = () => {};
		const list1Pending = new Promise(r => {
			resolveList1 = r;
		});
		let resolveList2: (v: unknown) => void = () => {};
		const list2Pending = new Promise(r => {
			resolveList2 = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) return list1Pending;
				if (listCallCount === 2) return list2Pending;
				return {
					ok: true,
					json: async () => ({ configurations: [] }),
				};
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-fresh',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start rehydrate1 — its list fetch is pending.
		const rehydrate1Promise = rehydrate();
		expect(getConfigSlice().isRehydrating).toBe(true);

		// Step 2: Reset (logout) — clears inFlight, isRehydrating, bumps
		// hydrateGeneration.
		resetAIConfigStore();
		expect(getConfigSlice().isRehydrating).toBe(false);

		// Step 3: Start rehydrate2 (new login). reset cleared inFlight so
		// rehydrate2 doesn't await rehydrate1. Sets isRehydrating=true.
		const rehydrate2Promise = rehydrate();
		expect(getConfigSlice().isRehydrating).toBe(true);

		// Step 4: Release rehydrate1's list fetch. runHydrate1 sees
		// gen !== hydrateGeneration (reset bumped it) and returns early.
		// Its finally must NOT clear inFlight or isRehydrating, which
		// now belong to rehydrate2.
		resolveList1({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-stale',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydrate1Promise;

		// isRehydrating must still be true — rehydrate2 is still in flight.
		expect(getConfigSlice().isRehydrating).toBe(true);

		// Step 5: Release rehydrate2's list fetch. It resolves and clears
		// isRehydrating.
		resolveList2({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydrate2Promise;

		const snap = getConfigSlice();
		expect(snap.isRehydrating).toBe(false);
		expect(snap.hydrated).toBe(true);
		expect(snap.config.apiKey).toBe('gemini-key-fresh');
	});

	// [P1] When two rehydrate callers overlap and logout/reset happens while
	// the second call is waiting at `if (inFlight) await inFlight`, that
	// continuation resumes after resetAIConfigStore() cleared the store and
	// then unconditionally starts another runHydrate(). The post-logout
	// runHydrate sets the module-level `hydrated = true`, causing the next
	// login's automatic hydrate() to short-circuit. The fix captures the
	// generation before the await and returns when it changes.
	test('rehydrate aborts after reset while awaiting an older in-flight request', async () => {
		// Controllable resolvers for each potential /ai-config list fetch.
		// rehydrate1 uses call #1; with the fix, rehydrate2 never starts a
		// fetch. Without the fix, rehydrate2 starts call #2.
		let resolveList1: (v: unknown) => void = () => {};
		let resolveList2: (v: unknown) => void = () => {};
		const list1Pending = new Promise(r => {
			resolveList1 = r;
		});
		const list2Pending = new Promise(r => {
			resolveList2 = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) return list1Pending;
				return list2Pending;
			}
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-stale',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start rehydrate1 — its list fetch is pending (call #1).
		const rehydrate1Promise = rehydrate();
		expect(getConfigSlice().isRehydrating).toBe(true);

		// Start rehydrate2 — it awaits rehydrate1's inFlight at
		// `if (inFlight) await inFlight`.
		const rehydrate2Promise = rehydrate();

		// Logout/reset — bumps hydrateGeneration, clears inFlight, resets
		// the slice to initialConfigSlice.
		resetAIConfigStore();
		expect(getConfigSlice().isRehydrating).toBe(false);
		expect(getConfigSlice().hydrated).toBe(false);

		// Release rehydrate1's list fetch. runHydrate1 sees gen mismatch
		// and returns early. Its finally also sees gen mismatch and returns
		// without touching inFlight or isRehydrating.
		resolveList1({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-stale',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydrate1Promise;

		// rehydrate2's `await inFlight` has now resolved. With the fix,
		// it detects the generation change and returns WITHOUT starting a
		// new runHydrate. Without the fix, it starts a fresh runHydrate
		// (call #2) that sets hydrated=true post-logout.
		expect(listCallCount).toBe(1);
		expect(getConfigSlice().hydrated).toBe(false);
		expect(getConfigSlice().isRehydrating).toBe(false);

		// rehydrate2 should already have resolved (with the fix, it
		// returned immediately after the await).
		let rehydrate2Resolved = false;
		rehydrate2Promise.then(() => {
			rehydrate2Resolved = true;
		});
		await Promise.resolve();
		expect(rehydrate2Resolved).toBe(true);

		// Cleanup: without the fix, rehydrate2 started a fetch (call #2)
		// that's still pending. Resolve it so no unhandled promise remains.
		resolveList2({
			ok: true,
			json: async () => ({ configurations: [] }),
		});
	});

	// [P2] When setProvider has incremented setProviderGeneration but is
	// still awaiting its provider fetch, and a Retry click starts
	// rehydrate(), runHydrate captures the same generation. If the provider
	// switch succeeds before the rehydrate's fetch resolves,
	// providerGen === setProviderGeneration skips the race branch, so the
	// normal success path applies stale backend config and overwrites the
	// user's selected provider and key. The fix tracks the in-flight
	// switch via setProviderSucceededGen even when the generation is equal.
	test('rehydrate preserves provider switch that predates it when setProvider succeeds during fetch', async () => {
		let resolveSetProviderList: (v: unknown) => void = () => {};
		let resolveSetProviderFull: (v: unknown) => void = () => {};
		let resolveRehydrateList: (v: unknown) => void = () => {};
		const setProviderListPending = new Promise(r => {
			resolveSetProviderList = r;
		});
		const setProviderFullPending = new Promise(r => {
			resolveSetProviderFull = r;
		});
		const rehydrateListPending = new Promise(r => {
			resolveRehydrateList = r;
		});
		let listCallCount = 0;

		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				listCallCount++;
				if (listCallCount === 1) {
					// setProvider's list fetch — held pending.
					return setProviderListPending;
				}
				// rehydrate's list fetch — held pending.
				return rehydrateListPending;
			}
			// /ai-config/:id/full — route by the config ID segment.
			// url.split('/').pop() returns 'full', so match on the
			// /<id>/full suffix instead.
			if (url.includes('/cfg-o/full')) {
				// setProvider's full fetch for cfg-o (openai) — held pending.
				return setProviderFullPending;
			}
			// rehydrate's full fetch for cfg-g (gemini, the stale active
			// config from before the user switched) — resolves immediately.
			return {
				ok: true,
				json: async () => ({
					provider: 'gemini',
					apiKey: 'gemini-key-stale',
					modelName: 'gemini-2.5-flash',
					gameVariant: 'chess',
				}),
			};
		});

		// Start setProvider('openai') — increments setProviderGeneration
		// to 1, then awaits its list fetch (pending).
		const setProviderPromise = setProvider('openai');

		// Start rehydrate — inFlight is null (setProvider doesn't set it),
		// so rehydrate doesn't await. runHydrate captures
		// providerGen = setProviderGeneration = 1, then awaits its own
		// list fetch (rehydrateListPending).
		const rehydratePromise = rehydrate();

		// setProvider's list fetch resolves — openai is keyed.
		resolveSetProviderList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-o',
						provider: 'openai',
						hasApiKey: true,
						isActive: false,
					},
				],
			}),
		});

		// setProvider's full fetch resolves — openai with sk-test.
		resolveSetProviderFull({
			ok: true,
			json: async () => ({
				provider: 'openai',
				apiKey: 'sk-test',
				modelName: 'gpt-4o',
				gameVariant: 'chess',
			}),
		});
		await setProviderPromise;

		// setProvider succeeded — store has openai config.
		expect(getConfigSlice().config.provider).toBe('openai');
		expect(getConfigSlice().config.apiKey).toBe('sk-test');
		expect(getConfigSlice().hydrated).toBe(true);
		// setProviderGeneration is still 1 (no newer setProvider).
		// setProviderSucceededGen is 1.

		// Release rehydrate's list fetch — returns gemini as active
		// (stale pre-switch backend state). loadAIConfigWithProviders
		// then fetches cfg-g/full (immediate) → gemini-key-stale.
		resolveRehydrateList({
			ok: true,
			json: async () => ({
				configurations: [
					{
						id: 'cfg-g',
						provider: 'gemini',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
		await rehydratePromise;

		// The store must preserve the user's openai selection, not
		// overwrite it with the rehydrate's stale gemini backend snapshot.
		// Without the fix, providerGen === setProviderGeneration (1 === 1)
		// skips the race branch and the normal success path applies gemini.
		const snap = getConfigSlice();
		expect(snap.hydrated).toBe(true);
		expect(snap.config.provider).toBe('openai');
		expect(snap.config.apiKey).toBe('sk-test');
		expect(snap.config.model).toBe('gpt-4o');
		expect(snap.hydrateError).toBe(false);
		// availableProviders should come from the rehydrate's list (gemini).
		expect(snap.availableProviders).toEqual(['gemini']);
	});
});

// ---------------------------------------------------------------------------
// setProvider non-stale full-fetch failure. When the list fetch succeeds
// but the full config fetch fails (and no newer setProvider has superseded),
// setProvider must return an error string — not null (stale) — so the UI
// can surface the failure.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider non-stale full-fetch failure', () => {
	setupAIConfigStoreFetchMocks();

	test('returns error string when full config fetch fails (non-stale)', async () => {
		// @ts-expect-error -- test-only: replace global fetch with routing mock
		globalThis.fetch = mock(async (url: string) => {
			if (url.endsWith('/ai-config')) {
				// List fetch succeeds — openai is keyed.
				return {
					ok: true,
					json: async () => ({
						configurations: [
							{
								id: 'cfg-o',
								provider: 'openai',
								hasApiKey: true,
								isActive: false,
							},
						],
					}),
				};
			}
			// Full fetch for cfg-o — fails with 500.
			return {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: async () => ({}),
			};
		});

		const err = await setProvider('openai');

		// Must return the full-fetch error string, not null.
		expect(err).toBe(
			"We couldn't load your saved API key details. Please try again."
		);
	});
});
