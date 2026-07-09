import { test, expect, describe } from 'bun:test';
import { resolveOpponentLlmId } from './opponent-llm';

describe('resolveOpponentLlmId', () => {
	test('gpt-4o family maps to gpt-4o', () => {
		expect(resolveOpponentLlmId('openai', 'gpt-4o')).toBe('gpt-4o');
		expect(resolveOpponentLlmId('openai', 'gpt-4o-mini')).toBe('gpt-4o');
		expect(resolveOpponentLlmId('openrouter', 'gpt-4o')).toBe('gpt-4o');
	});

	test('is case-insensitive', () => {
		expect(resolveOpponentLlmId('OpenAI', 'GPT-4O')).toBe('gpt-4o');
	});

	test('gemini maps to gemini-2.5-flash', () => {
		expect(resolveOpponentLlmId('gemini', 'gemini-2.5-flash')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('all other providers default to gemini-2.5-flash', () => {
		expect(resolveOpponentLlmId('chutes', 'deepseek-ai/DeepSeek-R1')).toBe(
			'gemini-2.5-flash'
		);
		expect(resolveOpponentLlmId('openrouter', 'claude-3-haiku')).toBe(
			'gemini-2.5-flash'
		);
		expect(resolveOpponentLlmId('anthropic', 'claude-3-opus')).toBe(
			'gemini-2.5-flash'
		);
		expect(resolveOpponentLlmId('unknown', 'unknown-model')).toBe(
			'gemini-2.5-flash'
		);
	});
});
