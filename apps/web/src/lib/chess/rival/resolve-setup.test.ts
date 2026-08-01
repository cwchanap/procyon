import { describe, expect, test } from 'bun:test';
import { resolveSetup, type ResolveSetupInput } from './resolve-setup';

const supportedEngine = { status: 'supported' } as const;
const unsupportedEngine = {
	status: 'unsupported',
	message: 'No Worker',
} as const;
const usableLlm = {
	status: 'available',
	provider: 'openai',
	model: 'gpt-4',
} as const;
const signedOutLlm = { status: 'signed-out' } as const;
const loadingLlm = { status: 'loading' } as const;
const unconfiguredLlm = { status: 'unconfigured' } as const;

function resolve(input: ResolveSetupInput) {
	return resolveSetup(input);
}

describe('resolveSetup matrix', () => {
	test('no preference + signed out + supported engine resolves to engine', () => {
		expect(
			resolve({
				rememberedKind: null,
				enginePreflight: supportedEngine,
				llmUsability: signedOutLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({ kind: 'engine', automatic: true });
	});

	test('no preference + configured signed in + untouched setup resolves to LLM', () => {
		expect(
			resolve({
				rememberedKind: null,
				enginePreflight: supportedEngine,
				llmUsability: usableLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({ kind: 'llm', automatic: true });
	});

	test('remembered engine + supported resolves to engine', () => {
		expect(
			resolve({
				rememberedKind: 'engine',
				enginePreflight: supportedEngine,
				llmUsability: signedOutLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({ kind: 'engine', automatic: true });
	});

	test('remembered engine + unsupported + usable LLM resolves to LLM with engine-to-llm notice', () => {
		expect(
			resolve({
				rememberedKind: 'engine',
				enginePreflight: unsupportedEngine,
				llmUsability: usableLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({
			kind: 'llm',
			automatic: true,
			notice: 'engine-to-llm',
		});
	});

	test('remembered engine + unsupported + unusable LLM resolves to engine unavailable', () => {
		expect(
			resolve({
				rememberedKind: 'engine',
				enginePreflight: unsupportedEngine,
				llmUsability: signedOutLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({
			kind: 'engine',
			automatic: true,
			startBlockedReason: 'engine-unsupported',
		});
	});

	test('remembered LLM + loading resolves to provisional LLM with Start disabled', () => {
		expect(
			resolve({
				rememberedKind: 'llm',
				enginePreflight: supportedEngine,
				llmUsability: loadingLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({
			kind: 'llm',
			automatic: true,
			startBlockedReason: 'llm-loading',
		});
	});

	test('remembered LLM + usable resolves to LLM', () => {
		expect(
			resolve({
				rememberedKind: 'llm',
				enginePreflight: supportedEngine,
				llmUsability: usableLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({ kind: 'llm', automatic: true });
	});

	test('remembered LLM + unusable + supported engine resolves to engine with llm-to-engine notice', () => {
		expect(
			resolve({
				rememberedKind: 'llm',
				enginePreflight: supportedEngine,
				llmUsability: unconfiguredLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({
			kind: 'engine',
			automatic: true,
			notice: 'llm-to-engine',
		});
	});

	test('remembered LLM + unusable + unsupported engine resolves to engine unavailable', () => {
		expect(
			resolve({
				rememberedKind: 'llm',
				enginePreflight: unsupportedEngine,
				llmUsability: signedOutLlm,
				setupTouched: false,
				explicitKind: null,
			})
		).toEqual({
			kind: 'engine',
			automatic: true,
			startBlockedReason: 'engine-unsupported',
		});
	});

	test('explicit selections are not overridden by automatic fallback', () => {
		expect(
			resolve({
				rememberedKind: 'engine',
				enginePreflight: unsupportedEngine,
				llmUsability: usableLlm,
				setupTouched: false,
				explicitKind: 'engine',
			})
		).toEqual({
			kind: 'engine',
			automatic: false,
			startBlockedReason: 'engine-unsupported',
		});
	});

	test('first user interaction closes automatic resolution', () => {
		expect(
			resolve({
				rememberedKind: 'engine',
				enginePreflight: unsupportedEngine,
				llmUsability: usableLlm,
				setupTouched: true,
				explicitKind: null,
			})
		).toEqual({
			kind: 'engine',
			automatic: false,
			startBlockedReason: 'engine-unsupported',
		});
	});

	test('fallback never mutates the stored preference', () => {
		const input: ResolveSetupInput = {
			rememberedKind: 'engine',
			enginePreflight: unsupportedEngine,
			llmUsability: usableLlm,
			setupTouched: false,
			explicitKind: null,
		};

		const first = resolveSetup(input);
		const second = resolveSetup(input);

		expect(first).toEqual(second);
		expect(first.notice).toBe('engine-to-llm');
		// The input object must not be mutated by resolveSetup.
		expect(input.rememberedKind).toBe('engine');
		expect(input.setupTouched).toBe(false);
		expect(input.explicitKind).toBeNull();
	});
});
