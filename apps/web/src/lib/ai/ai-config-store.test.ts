import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
	subscribe,
	getSnapshot,
	setConfig,
	setModel,
	setAIPlayer,
	setProvider,
	hydrate,
	resetAIConfigStore,
} from './ai-config-store';
import { defaultAIConfig } from './storage';

describe('ai-config-store', () => {
	beforeEach(() => {
		resetAIConfigStore();
		// reset to defaults via setConfig
		setConfig(defaultAIConfig);
		setAIPlayer('black');
	});

	test('initial snapshot is defaults with black AI', () => {
		expect(getSnapshot().config).toEqual(defaultAIConfig);
		expect(getSnapshot().aiPlayer).toBe('black');
	});

	test('setModel updates config', () => {
		setModel('gemini-2.5-pro');
		expect(getSnapshot().config.model).toBe('gemini-2.5-pro');
	});

	test('setAIPlayer updates aiPlayer', () => {
		setAIPlayer('white');
		expect(getSnapshot().aiPlayer).toBe('white');
	});

	test('subscribe is notified on change and unsubscribes', () => {
		let calls = 0;
		const unsub = subscribe(() => calls++);
		setModel('gpt-4o');
		setAIPlayer('white');
		expect(calls).toBe(2);
		unsub();
		setModel('gemini-2.5-pro');
		expect(calls).toBe(2);
	});

	test('setProvider returns error message when fetch fails', async () => {
		const err = await setProvider('openai');
		// No auth / no network in test → expect a non-null error string
		expect(typeof err).toBe('string');
		expect(err!.length).toBeGreaterThan(0);
	});

	test('hydrate does not throw and leaves a valid snapshot', async () => {
		await expect(hydrate()).resolves.toBeUndefined();
		expect(getSnapshot().config).toBeTruthy();
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

		const snap = getSnapshot();
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

		const snap = getSnapshot();
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

		const snap = getSnapshot();
		expect(snap.hydrated).toBe(true);
		expect(snap.hydrateError).toBe(false);
		expect(snap.availableProviders).toEqual([]);
	});
});
