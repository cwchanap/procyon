import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import type { GameVariant } from '../lib/ai/game-variant-types';
import type { AIConfig } from '../lib/ai/types';
import { resolveOpponentLlmId } from '../lib/ai/opponent';
import { setupReactDom } from '../test/reactSetup';
import { usePlayHistory } from './usePlayHistory';

setupReactDom();

describe('resolveOpponentLlmId mapping logic', () => {
	test('returns gpt-4o when provider is openai and model is gpt-4o', () => {
		expect(resolveOpponentLlmId('openai', 'gpt-4o')).toBe('gpt-4o');
	});

	test('returns gpt-4o for gpt-4o-mini variant', () => {
		expect(resolveOpponentLlmId('openai', 'gpt-4o-mini')).toBe('gpt-4o');
	});

	test('returns gpt-4o when combined provider/model contains gpt-4o', () => {
		expect(resolveOpponentLlmId('openrouter', 'gpt-4o')).toBe('gpt-4o');
	});

	test('returns gemini-2.5-flash for gemini provider', () => {
		expect(resolveOpponentLlmId('gemini', 'gemini-2.5-flash')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('returns gemini-2.5-flash for chutes provider', () => {
		expect(resolveOpponentLlmId('chutes', 'deepseek-ai/DeepSeek-R1')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('returns gemini-2.5-flash for openrouter with non-gpt-4o model', () => {
		expect(resolveOpponentLlmId('openrouter', 'claude-3-haiku')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('is case-insensitive for gpt-4o detection', () => {
		expect(resolveOpponentLlmId('OpenAI', 'GPT-4O')).toBe('gpt-4o');
	});

	test('returns gemini-2.5-flash for unknown provider and model', () => {
		expect(resolveOpponentLlmId('unknown', 'unknown-model')).toBe(
			'gemini-2.5-flash'
		);
	});
});

describe('GameVariant values used in usePlayHistory', () => {
	const validVariants: GameVariant[] = ['chess', 'xiangqi', 'shogi', 'jungle'];

	test('all four game variants are valid GameVariant values', () => {
		expect(validVariants).toHaveLength(4);
		expect(validVariants).toContain('chess');
		expect(validVariants).toContain('xiangqi');
		expect(validVariants).toContain('shogi');
		expect(validVariants).toContain('jungle');
	});
});

const testAIConfig: AIConfig = {
	provider: 'gemini',
	apiKey: 'test-key',
	model: 'gemini-2.5-flash-lite',
	enabled: true,
};

type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

interface HookProps {
	gameVariant: GameVariant;
	gameStatus: GameStatus;
	aiPlayer: string | null;
	aiConfig: AIConfig;
	moveCount: number;
	getWinnerColor: () => string;
	enabled: boolean;
	isAuthenticated: boolean;
	userId: string | null | undefined;
	debugVariantKey?: string;
}

const stableGetWinnerColor = () => 'white';

function makeProps(overrides: Partial<HookProps> = {}): HookProps {
	return {
		gameVariant: 'chess',
		gameStatus: 'playing',
		aiPlayer: 'black',
		aiConfig: testAIConfig,
		// Kept to pin the public strategy-hook contract. The shared policy does
		// not inspect this value.
		moveCount: 0,
		getWinnerColor: stableGetWinnerColor,
		enabled: true,
		isAuthenticated: true,
		userId: 'user-a',
		...overrides,
	};
}

describe('usePlayHistory strategy payload derivation', () => {
	let originalFetch: typeof globalThis.fetch;
	let capturedBodies: Array<Record<string, unknown>>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		capturedBodies = [];
		globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history') && init?.body) {
				capturedBodies.push(
					JSON.parse(String(init.body)) as Record<string, unknown>
				);
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('LLM checkmate payload preserves game id, result, and opponent id', async () => {
		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiConfig: {
					...testAIConfig,
					provider: 'openai',
					model: 'gpt-4o-mini',
				},
				getWinnerColor: () => 'white',
			}),
		});

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]).toMatchObject({
			gameId: 'chess',
			status: 'win',
			opponentLlmId: 'gpt-4o',
		});
		expect(capturedBodies[0]).not.toHaveProperty('opponentEngineId');
	});

	test('LLM checkmate payload records a loss when the AI wins', async () => {
		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: 'white',
				getWinnerColor: () => 'white',
			}),
		});

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		expect(capturedBodies[0]).toMatchObject({
			status: 'loss',
			opponentLlmId: 'gemini-2.5-flash',
		});
	});

	test.each(['draw', 'stalemate'] as const)(
		'uses draw status for %s games',
		async gameStatus => {
			renderHook(props => usePlayHistory(props), {
				initialProps: makeProps({ gameStatus, moveCount: 10 }),
			});

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 0));
			});

			expect(capturedBodies[0]).toMatchObject({
				gameId: 'chess',
				status: 'draw',
				opponentLlmId: 'gemini-2.5-flash',
			});
		}
	);

	test('engine descriptor sends engine id and omits LLM id', async () => {
		const { unmount } = renderHook(() =>
			usePlayHistory({
				gameVariant: 'chess',
				gameStatus: 'checkmate',
				aiPlayer: 'black',
				aiConfig: undefined,
				opponentDescriptor: { kind: 'engine', id: 'stockfish' },
				moveCount: 12,
				getWinnerColor: stableGetWinnerColor,
				enabled: true,
				isAuthenticated: true,
				userId: 'user-a',
			})
		);

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});
		unmount();

		expect(capturedBodies[0]).toMatchObject({
			gameId: 'chess',
			status: 'win',
			opponentEngineId: 'stockfish',
		});
		expect(capturedBodies[0]).not.toHaveProperty('opponentLlmId');
	});

	test('nonterminal or disabled strategy states do not derive a payload', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ enabled: false }),
		});
		rerender(makeProps({ gameStatus: 'check', enabled: true }));

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		expect(capturedBodies).toHaveLength(0);
	});

	test('a missing AI player does not permanently consume a terminal save', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: null,
			}),
		});

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});
		expect(capturedBodies).toHaveLength(0);

		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: 'black',
			})
		);
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		expect(capturedBodies).toHaveLength(1);
	});

	test('LLM save without aiConfig logs a DEV warning and skips the payload', async () => {
		const originalError = console.error;
		const warnings: string[] = [];
		console.error = (message: string) => warnings.push(message);
		const devEnv = import.meta.env as unknown as { DEV: boolean };
		const originalDev = devEnv.DEV;
		devEnv.DEV = true;

		try {
			const { unmount } = renderHook(() =>
				usePlayHistory({
					gameVariant: 'chess',
					gameStatus: 'checkmate',
					aiPlayer: 'black',
					aiConfig: undefined,
					opponentDescriptor: { kind: 'llm', id: 'gpt-4o' },
					moveCount: 10,
					getWinnerColor: stableGetWinnerColor,
					enabled: true,
					isAuthenticated: true,
					userId: 'user-a',
				} as unknown as Parameters<typeof usePlayHistory>[0])
			);

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 0));
			});
			unmount();

			expect(capturedBodies).toHaveLength(0);
			expect(warnings).toContain(
				'[usePlayHistory] LLM save attempted without aiConfig; skipping.'
			);
		} finally {
			console.error = originalError;
			devEnv.DEV = originalDev;
		}
	});
});
