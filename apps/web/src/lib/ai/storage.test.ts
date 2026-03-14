import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';

// Mock the auth module before importing storage (avoids React dependency)
mock.module('../auth', () => ({
	getAuthHeaders: mock(() => Promise.resolve({})),
}));

// Now import storage after the mock is set up
const { defaultAIConfig, saveAIConfig, clearAIConfig, loadAIConfig } = await import('./storage');
import type { AIConfig } from './types';

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

	describe('saveAIConfig (browser-side)', () => {
		let localStorageStore: Record<string, string>;
		let originalWindow: unknown;

		beforeEach(() => {
			localStorageStore = {};
			originalWindow = globalThis.window;

			const ls = {
				getItem: (key: string) => localStorageStore[key] ?? null,
				setItem: (key: string, value: string) => {
					localStorageStore[key] = value;
				},
				removeItem: (key: string) => {
					delete localStorageStore[key];
				},
			};

			// @ts-expect-error - mocking window for browser-side test
			globalThis.window = { localStorage: ls };
			// @ts-expect-error
			globalThis.localStorage = ls;
		});

		afterEach(() => {
			// @ts-expect-error
			globalThis.window = originalWindow;
			// @ts-expect-error
			globalThis.localStorage = undefined;
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
				expect(parsed.apiKey).toBe(config.apiKey);
			}
		});
	});

	describe('clearAIConfig (browser-side)', () => {
		let localStorageStore: Record<string, string>;
		let originalWindow: unknown;

		beforeEach(() => {
			localStorageStore = {};
			originalWindow = globalThis.window;

			const ls = {
				getItem: (key: string) => localStorageStore[key] ?? null,
				setItem: (key: string, value: string) => {
					localStorageStore[key] = value;
				},
				removeItem: (key: string) => {
					delete localStorageStore[key];
				},
			};

			// @ts-expect-error - mocking window for browser-side test
			globalThis.window = { localStorage: ls };
			// @ts-expect-error
			globalThis.localStorage = ls;
		});

		afterEach(() => {
			// @ts-expect-error
			globalThis.window = originalWindow;
			// @ts-expect-error
			globalThis.localStorage = undefined;
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
