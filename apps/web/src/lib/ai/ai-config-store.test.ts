import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
	subscribeConfig,
	getConfigSlice,
	setConfig,
	setModel,
	setProvider,
	hydrate,
	resetAIConfigStore,
} from './ai-config-store';
import { defaultAIConfig } from './storage';
import { AI_PROVIDERS } from './types';

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

	afterEach(() => {
		globalThis.window = originalWindow;
		globalThis.fetch = originalFetch;
		// @ts-expect-error -- test-only restore: drop test-only localStorage global
		delete globalThis.localStorage;
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
// setProvider stale-write race. When a user switches providers twice before
// the first request finishes, the older in-flight call must not clobber the
// newer provider/model in the store. Uses controllable pending fetches to
// interleave two setProvider calls and verify the older one is dropped.
// ---------------------------------------------------------------------------
describe('ai-config-store setProvider stale-write race', () => {
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
		// storage.ts references bare `localStorage` (globalThis.localStorage)
		// and `window`, so set both — mirroring storage.test.ts's setupBrowserMocks.
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

	test('hydrate populates availableProviders and clears hydrateError on success', async () => {
		// @ts-expect-error -- test-only: replace global fetch with list mock
		globalThis.fetch = mock(async () => ({
			ok: true,
			json: async () => ({
				configurations: [
					{ id: 'cfg-g', provider: 'gemini', hasApiKey: true, isActive: false },
					{ id: 'cfg-o', provider: 'openai', hasApiKey: true, isActive: false },
					// no-key entry should be filtered out of availableProviders
					{ id: 'cfg-x', provider: 'openrouter', hasApiKey: false },
				],
			}),
		}));

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
});
