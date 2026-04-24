import { test, expect, describe } from 'bun:test';
import { AI_PROVIDERS } from './types';
import type { AIProvider } from './types';

const ALL_PROVIDERS: AIProvider[] = [
	'gemini',
	'openrouter',
	'openai',
	'chutes',
];

describe('AI_PROVIDERS', () => {
	test('has an entry for every supported provider', () => {
		for (const provider of ALL_PROVIDERS) {
			expect(AI_PROVIDERS).toHaveProperty(provider);
		}
	});

	test('has exactly 4 providers', () => {
		expect(Object.keys(AI_PROVIDERS)).toHaveLength(4);
	});

	test('every provider has a non-empty name', () => {
		for (const provider of ALL_PROVIDERS) {
			expect(typeof AI_PROVIDERS[provider].name).toBe('string');
			expect(AI_PROVIDERS[provider].name.length).toBeGreaterThan(0);
		}
	});

	test('every provider has a non-empty defaultModel', () => {
		for (const provider of ALL_PROVIDERS) {
			expect(typeof AI_PROVIDERS[provider].defaultModel).toBe('string');
			expect(AI_PROVIDERS[provider].defaultModel.length).toBeGreaterThan(0);
		}
	});

	test('every provider has at least one model', () => {
		for (const provider of ALL_PROVIDERS) {
			expect(AI_PROVIDERS[provider].models.length).toBeGreaterThan(0);
		}
	});

	test("every provider's defaultModel is listed in its models array", () => {
		for (const provider of ALL_PROVIDERS) {
			const info = AI_PROVIDERS[provider];
			expect(info.models).toContain(info.defaultModel);
		}
	});

	test('all providers require an API key', () => {
		for (const provider of ALL_PROVIDERS) {
			expect(AI_PROVIDERS[provider].requiresApiKey).toBe(true);
		}
	});

	describe('gemini', () => {
		const info = AI_PROVIDERS.gemini;

		test('name is Google Gemini', () => {
			expect(info.name).toBe('Google Gemini');
		});

		test('default model is gemini-2.5-flash-lite', () => {
			expect(info.defaultModel).toBe('gemini-2.5-flash-lite');
		});

		test('models list includes gemini-2.5-flash-lite', () => {
			expect(info.models).toContain('gemini-2.5-flash-lite');
		});

		test('models list includes gemini-1.5-flash', () => {
			expect(info.models).toContain('gemini-1.5-flash');
		});

		test('models list includes gemini-1.5-pro', () => {
			expect(info.models).toContain('gemini-1.5-pro');
		});

		test('has 3 models', () => {
			expect(info.models).toHaveLength(3);
		});
	});

	describe('openai', () => {
		const info = AI_PROVIDERS.openai;

		test('name is OpenAI', () => {
			expect(info.name).toBe('OpenAI');
		});

		test('default model is gpt-4o-mini', () => {
			expect(info.defaultModel).toBe('gpt-4o-mini');
		});

		test('models list includes gpt-4o', () => {
			expect(info.models).toContain('gpt-4o');
		});

		test('models list includes gpt-4o-mini', () => {
			expect(info.models).toContain('gpt-4o-mini');
		});

		test('models list includes gpt-4-turbo', () => {
			expect(info.models).toContain('gpt-4-turbo');
		});

		test('has 4 models', () => {
			expect(info.models).toHaveLength(4);
		});
	});

	describe('openrouter', () => {
		const info = AI_PROVIDERS.openrouter;

		test('name is OpenRouter', () => {
			expect(info.name).toBe('OpenRouter');
		});

		test('default model is gpt-oss-120b', () => {
			expect(info.defaultModel).toBe('gpt-oss-120b');
		});

		test('has 3 models', () => {
			expect(info.models).toHaveLength(3);
		});
	});

	describe('chutes', () => {
		const info = AI_PROVIDERS.chutes;

		test('name is Chutes.ai', () => {
			expect(info.name).toBe('Chutes.ai');
		});

		test('default model is deepseek-ai/DeepSeek-R1', () => {
			expect(info.defaultModel).toBe('deepseek-ai/DeepSeek-R1');
		});

		test('has 4 models', () => {
			expect(info.models).toHaveLength(4);
		});

		test('models list includes DeepSeek-R1', () => {
			expect(info.models).toContain('deepseek-ai/DeepSeek-R1');
		});

		test('models list includes DeepSeek-V3', () => {
			expect(info.models).toContain('deepseek-ai/DeepSeek-V3');
		});
	});
});
