import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';

// Import storage without a module mock. Bun's mock.module is process-global and
// would leak a partial auth module into unrelated component test files.
const {
	defaultAIConfig,
	saveAIConfig,
	clearAIConfig,
	loadAIConfig,
	loadAIConfigWithProviders,
} = await import('./storage');
import type { AIConfig } from './types';

// ---------------------------------------------------------------------------
// Helper: sets up a fake browser environment (window + localStorage) and
// returns the backing store plus a cleanup function.
// ---------------------------------------------------------------------------
function setupBrowserMocks(): {
	localStorageStore: Record<string, string>;
	cleanup: () => void;
} {
	const localStorageStore: Record<string, string> = {};
	const originalWindow = globalThis.window;
	const originalLocalStorage = globalThis.localStorage;

	const ls = {
		getItem: (key: string) => localStorageStore[key] ?? null,
		setItem: (key: string, value: string) => {
			localStorageStore[key] = value;
		},
		removeItem: (key: string) => {
			delete localStorageStore[key];
		},
	};

	// @ts-expect-error -- test-only override: simulate browser window in Node
	globalThis.window = { localStorage: ls };
	// @ts-expect-error -- test-only override: simulate browser localStorage in Node
	globalThis.localStorage = ls;

	return {
		localStorageStore,
		cleanup: () => {
			globalThis.window = originalWindow;
			globalThis.localStorage = originalLocalStorage;
		},
	};
}

describe('AI Storage', () => {
	describe('defaultAIConfig', () => {
		test('should have expected default values', () => {
			expect(defaultAIConfig.provider).toBe('gemini');
			expect(defaultAIConfig.apiKey).toBe('');
			expect(defaultAIConfig.enabled).toBe(false);
			expect(defaultAIConfig.gameVariant).toBe('chess');
		});

		test('should have a default model', () => {
			expect(typeof defaultAIConfig.model).toBe('string');
			expect(defaultAIConfig.model.length).toBeGreaterThan(0);
		});
	});

	describe('saveAIConfig (server-side/SSR)', () => {
		test('should not throw when window is undefined', () => {
			// In bun test env, typeof window === 'undefined', so saveAIConfig returns early
			const config: AIConfig = {
				provider: 'gemini',
				apiKey: 'test-key',
				model: 'gemini-2.5-flash-lite',
				enabled: true,
			};

			expect(() => saveAIConfig(config)).not.toThrow();
		});
	});

	describe('clearAIConfig (server-side/SSR)', () => {
		test('should not throw when window is undefined', () => {
			expect(() => clearAIConfig()).not.toThrow();
		});
	});

	describe('loadAIConfig (server-side/SSR)', () => {
		test('should return defaultAIConfig when window is undefined', async () => {
			const config = await loadAIConfig();
			expect(config).toEqual(defaultAIConfig);
		});
	});

	describe('loadAIConfig (browser-side)', () => {
		let localStorageStore: Record<string, string>;
		let cleanup: () => void;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let originalFetch: any;

		beforeEach(() => {
			({ localStorageStore, cleanup } = setupBrowserMocks());
			originalFetch = globalThis.fetch;
		});

		afterEach(() => {
			globalThis.fetch = originalFetch;
			cleanup();
		});

		test('should fetch active config from API when available', async () => {
			let callCount = 0;
			// @ts-expect-error -- test-only: replace global fetch with mock
			globalThis.fetch = mock(async (url: string) => {
				callCount++;
				if (callCount === 1) {
					// First call: list of configurations
					return {
						ok: true,
						json: async () => ({
							configurations: [
								{ id: 'cfg-1', isActive: true, hasApiKey: true },
							],
						}),
					};
				}
				// Second call: full config for the active entry
				expect(url).toContain('/cfg-1/full');
				return {
					ok: true,
					json: async () => ({
						provider: 'openai',
						apiKey: 'sk-key',
						modelName: 'gpt-4o',
						gameVariant: 'chess',
					}),
				};
			});

			const result = await loadAIConfig();

			expect(callCount).toBe(2);
			expect(result.provider).toBe('openai');
			expect(result.apiKey).toBe('sk-key');
			expect(result.model).toBe('gpt-4o');
			expect(result.enabled).toBe(true);
			expect(result.gameVariant).toBe('chess');
		});

		test('should return defaultAIConfig when fetch throws', async () => {
			// When fetch throws the catch block fires before the localStorage fallback
			// (which lives inside the try), so the function returns defaultAIConfig.
			// @ts-expect-error -- test-only: replace global fetch with failing mock
			globalThis.fetch = mock(async () => {
				throw new Error('Network error');
			});

			const result = await loadAIConfig();

			expect(result).toEqual(defaultAIConfig);
		});

		test('should fall back to localStorage (sanitized) when API returns non-ok response', async () => {
			const savedConfig: AIConfig = {
				provider: 'openrouter',
				apiKey: 'or-key',
				model: 'gpt-oss-120b',
				enabled: true,
			};
			localStorageStore['procyon_ai_config'] = JSON.stringify(savedConfig);

			// @ts-expect-error -- test-only: replace global fetch with non-ok mock
			globalThis.fetch = mock(async () => ({
				ok: false,
				json: async () => ({}),
			}));

			const result = await loadAIConfig();

			expect(result.provider).toBe('openrouter');
			// Legacy cached apiKey must be stripped on read — never surfaced
			// from localStorage — and the cache re-saved without it.
			expect(result.apiKey).toBe('');
			const reSaved = JSON.parse(
				localStorageStore['procyon_ai_config']!
			) as AIConfig;
			expect(reSaved.apiKey).toBe('');
		});

		test('should return defaultAIConfig when no config is active and localStorage is empty', async () => {
			// API returns a list with no active config → falls through to localStorage → nothing saved
			// @ts-expect-error -- test-only: replace global fetch with empty-list mock
			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => ({ configurations: [] }),
			}));

			const result = await loadAIConfig();

			expect(result).toEqual(defaultAIConfig);
		});

		test('should return defaultAIConfig when localStorage holds corrupt JSON (try path)', async () => {
			// Corrupt cache on the try-path (fetch succeeds, no active config,
			// readLocalConfig is called at the fall-through). Must not throw.
			localStorageStore['procyon_ai_config'] = '{not valid json';
			// @ts-expect-error -- test-only: replace global fetch with empty-list mock
			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => ({ configurations: [] }),
			}));

			const result = await loadAIConfig();

			expect(result).toEqual(defaultAIConfig);
			// Corrupt entry should be purged so retries don't re-trigger.
			expect(localStorageStore['procyon_ai_config']).toBeUndefined();
		});

		test('should return defaultAIConfig when localStorage holds corrupt JSON (catch fallback)', async () => {
			// Corrupt cache on the catch fallback path (fetch itself fails,
			// readLocalConfig is called inside the catch). Must not re-throw.
			localStorageStore['procyon_ai_config'] = '{not valid json';
			// @ts-expect-error -- test-only: replace global fetch with failing mock
			globalThis.fetch = mock(async () => {
				throw new Error('Network error');
			});

			const result = await loadAIConfig();

			expect(result).toEqual(defaultAIConfig);
			expect(localStorageStore['procyon_ai_config']).toBeUndefined();
		});

		test('should mark fromFallback=true when /ai-config/:id/full fails after list succeeds', async () => {
			// List fetch succeeds with an active keyed config, but the
			// subsequent /full fetch fails. The fall-through must surface
			// fromFallback=true so the sidebar shows a retry/error state
			// instead of treating a stale localStorage cache as a clean load.
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
									id: 'cfg-1',
									isActive: true,
									hasApiKey: true,
									provider: 'openai',
								},
							],
						}),
					};
				}
				// Second call: /full fails
				expect(url).toContain('/cfg-1/full');
				return { ok: false, json: async () => ({}) };
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			// Providers with keys are still surfaced from the list response.
			expect(result.availableProviders).toEqual(['openai']);
		});

		test('should mark fromFallback=true when /ai-config/:id/full throws after list succeeds with no localStorage', async () => {
			// Same as above but the /full fetch throws (network) and there is
			// no localStorage cache, so the default-config return path must
			// still carry fromFallback=true.
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
									id: 'cfg-1',
									isActive: true,
									hasApiKey: true,
									provider: 'gemini',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				throw new Error('Network error on /full');
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			expect(result.config).toEqual(defaultAIConfig);
		});

		test('should keep fromFallback=false when list succeeds with no active keyed config', async () => {
			// List succeeds but no entry is active+keyed: the fall-through is
			// NOT a fallback (the list fetch itself succeeded), so
			// fromFallback must stay false. This guards against the fix
			// over-flagging the no-active-config branch.
			// @ts-expect-error -- test-only: replace global fetch with mock
			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => ({ configurations: [] }),
			}));

			const result = await loadAIConfigWithProviders();

			expect(result.fromFallback).toBe(false);
			expect(result.config).toEqual(defaultAIConfig);
		});

		test('should auto-fetch full config for the first keyed provider when no active config and multiple keyed providers exist', async () => {
			// User has keyed configs for openai and chutes but none is
			// active. Without auto-fetch the fall-through normalizes the
			// provider to availableProviders[0] ('openai') with apiKey='',
			// and the sidebar select — which binds to config.provider and
			// only fires onChange on a selection change — already displays
			// 'openai' as the first option, so re-clicking it does nothing
			// and setProvider never loads the key. The load must fetch /full
			// for the first available provider and return enabled=true with
			// the real apiKey.
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
									id: 'cfg-1',
									isActive: false,
									hasApiKey: true,
									provider: 'openai',
								},
								{
									id: 'cfg-2',
									isActive: false,
									hasApiKey: true,
									provider: 'chutes',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				return {
					ok: true,
					json: async () => ({
						provider: 'openai',
						apiKey: 'sk-key',
						modelName: 'gpt-4o',
						gameVariant: 'chess',
					}),
				};
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.availableProviders).toEqual(['openai', 'chutes']);
			expect(result.config.provider).toBe('openai');
			expect(result.config.apiKey).toBe('sk-key');
			expect(result.config.model).toBe('gpt-4o');
			expect(result.config.enabled).toBe(true);
			expect(result.fromFallback).toBe(false);
		});

		test('should fall through to normalize when no active config, multiple keyed providers, and candidate /full fails', async () => {
			// Multiple keyed providers, none active, and the auto-fetch for
			// the first provider's /full fails. The fall-through must set
			// fullLoadFailed so fromFallback=true surfaces (sidebar shows
			// the retry state, not broken selects), and the provider is
			// normalized to the first available with apiKey=''.
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
									id: 'cfg-1',
									isActive: false,
									hasApiKey: true,
									provider: 'openai',
								},
								{
									id: 'cfg-2',
									isActive: false,
									hasApiKey: true,
									provider: 'chutes',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				return { ok: false, json: async () => ({}) };
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			expect(result.availableProviders).toEqual(['openai', 'chutes']);
			expect(result.config.provider).toBe('openai');
			expect(result.config.apiKey).toBe('');
		});

		test('should auto-fetch full config for the sole keyed provider when no active config exists', async () => {
			// Exactly one keyed provider, none active. Without auto-fetch the
			// sidebar renders the sole option as already selected, so
			// re-clicking it never fires onChange and setProvider never
			// loads the key. The load must fetch /full for that sole
			// provider and return enabled=true with the real apiKey.
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
									id: 'cfg-1',
									isActive: false,
									hasApiKey: true,
									provider: 'openai',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				return {
					ok: true,
					json: async () => ({
						provider: 'openai',
						apiKey: 'sk-key',
						modelName: 'gpt-4o',
						gameVariant: 'chess',
					}),
				};
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(false);
			expect(result.availableProviders).toEqual(['openai']);
			expect(result.config.provider).toBe('openai');
			expect(result.config.apiKey).toBe('sk-key');
			expect(result.config.model).toBe('gpt-4o');
			expect(result.config.enabled).toBe(true);
		});

		test('should fall through with fromFallback=true when sole provider /full fails and no active config', async () => {
			// Sole keyed provider, none active, but /full fails. The
			// auto-fetch catch must set fullLoadFailed so the fall-through
			// surfaces a retry state instead of treating the empty-key
			// cache/default as a clean load.
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
									id: 'cfg-1',
									isActive: false,
									hasApiKey: true,
									provider: 'openai',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				return { ok: false, json: async () => ({}) };
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			expect(result.availableProviders).toEqual(['openai']);
			expect(result.config.provider).toBe('openai');
			expect(result.config.apiKey).toBe('');
		});

		test('should not auto-fetch when the sole keyed provider is the active config whose /full already failed', async () => {
			// Active+keyed sole provider whose /full fails: the active
			// branch already attempted the fetch, so the sole-provider
			// auto-fetch must NOT retry it (callCount stays at 2, not 3).
			let callCount = 0;
			// @ts-expect-error -- test-only: replace global fetch with mock
			globalThis.fetch = mock(async () => {
				callCount++;
				if (callCount === 1) {
					return {
						ok: true,
						json: async () => ({
							configurations: [
								{
									id: 'cfg-1',
									isActive: true,
									hasApiKey: true,
									provider: 'openai',
								},
							],
						}),
					};
				}
				return { ok: false, json: async () => ({}) };
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			expect(result.availableProviders).toEqual(['openai']);
		});

		test('should normalize provider to an available one when active full load fails and localStorage has stale provider', async () => {
			// Active config exists but /full fails; localStorage cache has a
			// stale provider ('gemini') that is not in the keyed providers
			// list. The fall-through must normalize the provider to the
			// first available keyed provider.
			localStorageStore['procyon_ai_config'] = JSON.stringify({
				provider: 'gemini',
				apiKey: '',
				model: 'gemini-2.5-flash-lite',
				enabled: true,
			});
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
									id: 'cfg-1',
									isActive: true,
									hasApiKey: true,
									provider: 'openai',
								},
							],
						}),
					};
				}
				expect(url).toContain('/cfg-1/full');
				return { ok: false, json: async () => ({}) };
			});

			const result = await loadAIConfigWithProviders();

			expect(callCount).toBe(2);
			expect(result.fromFallback).toBe(true);
			expect(result.availableProviders).toEqual(['openai']);
			expect(result.config.provider).toBe('openai');
			expect(result.config.model).toBe('gpt-4o-mini');
		});

		test('should not normalize when availableProviders is empty', async () => {
			// List fetch fails (catch path) and localStorage has a stale
			// provider. With no available providers, normalization is a
			// no-op — the config keeps its provider so the sidebar shows
			// the full provider list (resolveProviderOptions returns
			// ALL_PROVIDER_OPTIONS when availableProviders is empty).
			localStorageStore['procyon_ai_config'] = JSON.stringify({
				provider: 'openrouter',
				apiKey: '',
				model: 'gpt-oss-120b',
				enabled: true,
			});
			// @ts-expect-error -- test-only: replace global fetch with failing mock
			globalThis.fetch = mock(async () => {
				throw new Error('Network error');
			});

			const result = await loadAIConfigWithProviders();

			expect(result.availableProviders).toEqual([]);
			expect(result.config.provider).toBe('openrouter');
		});
	});

	describe('saveAIConfig (browser-side)', () => {
		let localStorageStore: Record<string, string>;
		let cleanup: () => void;

		beforeEach(() => {
			({ localStorageStore, cleanup } = setupBrowserMocks());
		});

		afterEach(() => {
			cleanup();
		});

		test('should save config to localStorage without persisting apiKey', () => {
			const config: AIConfig = {
				provider: 'openai',
				apiKey: 'sk-test-key',
				model: 'gpt-4o-mini',
				enabled: true,
			};

			saveAIConfig(config);

			const stored = localStorageStore['procyon_ai_config'];
			expect(stored).toBeDefined();

			const parsed = JSON.parse(stored!) as AIConfig;
			expect(parsed.provider).toBe('openai');
			// apiKey must never be persisted to localStorage
			expect(parsed.apiKey).toBe('');
			expect(parsed.model).toBe('gpt-4o-mini');
			expect(parsed.enabled).toBe(true);
		});

		test('should overwrite existing config', () => {
			const config1: AIConfig = {
				provider: 'gemini',
				apiKey: 'g-key',
				model: 'gemini-2.5-flash-lite',
				enabled: true,
			};
			const config2: AIConfig = {
				provider: 'openai',
				apiKey: 'oai-key',
				model: 'gpt-4o',
				enabled: false,
			};

			saveAIConfig(config1);
			saveAIConfig(config2);

			const stored = localStorageStore['procyon_ai_config'];
			const parsed = JSON.parse(stored!) as AIConfig;
			expect(parsed.provider).toBe('openai');
			expect(parsed.enabled).toBe(false);
		});

		test('should save different providers correctly without apiKey', () => {
			const testCases: AIConfig[] = [
				{
					provider: 'gemini',
					apiKey: 'g-key',
					model: 'gemini-2.5-flash-lite',
					enabled: true,
				},
				{
					provider: 'openrouter',
					apiKey: 'or-key',
					model: 'gpt-oss-120b',
					enabled: false,
				},
				{
					provider: 'chutes',
					apiKey: 'ch-key',
					model: 'deepseek-ai/DeepSeek-R1',
					enabled: true,
				},
			];

			for (const config of testCases) {
				saveAIConfig(config);
				const stored = localStorageStore['procyon_ai_config'];
				const parsed = JSON.parse(stored!) as AIConfig;
				expect(parsed.provider).toBe(config.provider);
				// apiKey is never persisted
				expect(parsed.apiKey).toBe('');
			}
		});
	});

	describe('clearAIConfig (browser-side)', () => {
		let localStorageStore: Record<string, string>;
		let cleanup: () => void;

		beforeEach(() => {
			({ localStorageStore, cleanup } = setupBrowserMocks());
		});

		afterEach(() => {
			cleanup();
		});

		test('should remove config from localStorage', () => {
			localStorageStore['procyon_ai_config'] = JSON.stringify(defaultAIConfig);

			clearAIConfig();

			expect(localStorageStore['procyon_ai_config']).toBeUndefined();
		});

		test('should not throw when key does not exist', () => {
			expect(() => clearAIConfig()).not.toThrow();
		});
	});

	describe('defaultAIConfig immutability check', () => {
		test('defaultAIConfig retains expected values across tests', () => {
			expect(defaultAIConfig.provider).toBe('gemini');
			expect(defaultAIConfig.enabled).toBe(false);
			expect(defaultAIConfig.gameVariant).toBe('chess');
		});
	});
});
