import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';

// Mock the auth module before importing storage (avoids React dependency)
mock.module('../auth', () => ({
	getAuthHeaders: mock(() => Promise.resolve({})),
}));

// Now import storage after the mock is set up
const { defaultAIConfig, saveAIConfig, clearAIConfig, loadAIConfig } = await import('./storage');
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
	// @ts-expect-error -- test-only: capture existing localStorage to restore later
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
			// @ts-expect-error -- test-only restore: reset window to original value
			globalThis.window = originalWindow;
			// @ts-expect-error -- test-only restore: reset localStorage to original value
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
			// @ts-expect-error -- test-only: capture existing fetch to restore later
			originalFetch = globalThis.fetch;
		});

		afterEach(() => {
			// @ts-expect-error -- test-only restore: reset fetch to original value
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
							configurations: [{ id: 'cfg-1', isActive: true, hasApiKey: true }],
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

		test('should fall back to localStorage when API returns non-ok response', async () => {
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
			expect(result.apiKey).toBe('or-key');
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

		test('should save config to localStorage', () => {
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
			expect(parsed.apiKey).toBe('sk-test-key');
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

		test('should save different providers correctly', () => {
			const testCases: AIConfig[] = [
				{ provider: 'gemini', apiKey: 'g-key', model: 'gemini-2.5-flash-lite', enabled: true },
				{ provider: 'openrouter', apiKey: 'or-key', model: 'gpt-oss-120b', enabled: false },
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
				expect(parsed.apiKey).toBe(config.apiKey);
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
