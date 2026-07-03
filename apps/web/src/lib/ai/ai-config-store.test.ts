import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
	subscribeConfig,
	subscribeAIPlayer,
	getConfigSlice,
	getAIPlayer,
	setConfig,
	setModel,
	setAIPlayer,
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
		setAIPlayer('black');
	});

	test('initial snapshot is defaults with black AI', () => {
		expect(getConfigSlice().config).toEqual(defaultAIConfig);
		expect(getAIPlayer()).toBe('black');
	});

	test('setModel updates config', () => {
		setModel('gemini-2.5-pro');
		expect(getConfigSlice().config.model).toBe('gemini-2.5-pro');
	});

	test('setAIPlayer updates aiPlayer', () => {
		setAIPlayer('white');
		expect(getAIPlayer()).toBe('white');
	});

	test('config subscribers are notified on config changes only', () => {
		let configCalls = 0;
		let aiPlayerCalls = 0;
		const unsubConfig = subscribeConfig(() => configCalls++);
		const unsubAIPlayer = subscribeAIPlayer(() => aiPlayerCalls++);

		setModel('gpt-4o');
		// setAIPlayer('white') is a no-op when already white after reset; flip
		// to the opposite of the default 'black' to guarantee a notification.
		setAIPlayer('white');

		expect(configCalls).toBe(1); // only setModel
		expect(aiPlayerCalls).toBe(1); // only setAIPlayer

		unsubConfig();
		unsubAIPlayer();
		setModel('gemini-2.5-pro');
		setAIPlayer('black');
		expect(configCalls).toBe(1);
		expect(aiPlayerCalls).toBe(1);
	});

	test('setProvider returns error message when fetch fails', async () => {
		// Mock fetch to reject so setProvider's fetchAIConfigList fails
		// deterministically — without this, bun's built-in fetch makes real
		// network calls to the API server.
		const originalFetch = globalThis.fetch;
		// @ts-expect-error -- test-only: replace global fetch with failing mock
		globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

		const err = await setProvider('openai');

		// @ts-expect-error -- test-only: restore global fetch
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
		// @ts-expect-error -- test-only: capture existing window/fetch to restore
		originalWindow = globalThis.window;
		// @ts-expect-error -- test-only: capture existing fetch to restore later
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
		// @ts-expect-error -- test-only restore: reset window/fetch to original
		globalThis.window = originalWindow;
		// @ts-expect-error -- test-only restore: reset fetch to original value
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
		// @ts-expect-error -- test-only: capture existing window/fetch to restore
		originalWindow = globalThis.window;
		// @ts-expect-error -- test-only: capture existing fetch to restore later
		originalFetch = globalThis.fetch;
		// storage.ts references bare `localStorage` (globalThis.localStorage)
		// and `window`, so set both — mirroring storage.test.ts's setupBrowserMocks.
		// @ts-expect-error -- test-only override: simulate browser window in Node
		globalThis.window = { localStorage: ls };
		// @ts-expect-error -- test-only override: expose localStorage as a global
		globalThis.localStorage = ls;
	});

	afterEach(() => {
		// @ts-expect-error -- test-only restore: reset window/fetch to original
		globalThis.window = originalWindow;
		// @ts-expect-error -- test-only restore: reset fetch to original value
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
