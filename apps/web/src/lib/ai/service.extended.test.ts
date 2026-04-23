import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { UniversalAIService } from './service';
import { ChessAdapter } from './chess-adapter';
import type { AIConfig } from './types';
import type { GameState } from '../chess/types';
import { createInitialBoard } from '../chess/board';

function makeGameState(): GameState {
	return {
		board: createInitialBoard(),
		currentPlayer: 'white',
		status: 'playing',
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		mode: 'human-vs-ai',
	};
}

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
	return {
		provider: 'gemini',
		apiKey: 'test-key',
		model: 'gemini-2.5-flash-lite',
		enabled: true,
		...overrides,
	};
}

function makeGeminiResponse(text: string) {
	return {
		candidates: [
			{
				content: { parts: [{ text }] },
				finishReason: 'STOP',
			},
		],
	};
}

function makeOpenAIResponse(content: string) {
	return {
		choices: [{ message: { content } }],
	};
}

const VALID_MOVE_JSON = JSON.stringify({
	move: { from: 'e2', to: 'e4' },
	reasoning: 'Open with king pawn',
	confidence: 80,
});

describe('UniversalAIService - callGemini (via makeMove)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
	});

	test('returns parsed move on successful Gemini response', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeGeminiResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.from).toBe('e2');
		expect(result?.move.to).toBe('e4');
	});

	test('throws on non-ok Gemini response', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('Gemini API error');
	});

	test('throws when Gemini blocks response via promptFeedback', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
				{ status: 200 }
			)
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('Gemini blocked');
	});

	test('throws when Gemini returns no candidates', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify({ candidates: [] }), { status: 200 })
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('no candidates');
	});

	test('throws when Gemini candidate finishReason is SAFETY', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
				}),
				{ status: 200 }
			)
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('safety filters');
	});

	test('returns partial text when Gemini hits MAX_TOKENS with content', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					candidates: [
						{
							finishReason: 'MAX_TOKENS',
							content: { parts: [{ text: VALID_MOVE_JSON }] },
						},
					],
				}),
				{ status: 200 }
			)
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.from).toBe('e2');
	});

	test('throws when Gemini hits MAX_TOKENS with no content', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					candidates: [
						{
							finishReason: 'MAX_TOKENS',
							content: { parts: [] },
						},
					],
				}),
				{ status: 200 }
			)
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('truncated');
	});

	test('throws when Gemini candidate has no content parts', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					candidates: [{ finishReason: 'STOP', content: { parts: [] } }],
				}),
				{ status: 200 }
			)
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('no content parts');
	});

	test('throws when Gemini returns empty text', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					candidates: [
						{
							finishReason: 'STOP',
							content: { parts: [{ text: '' }] },
						},
					],
				}),
				{ status: 200 }
			)
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('empty text');
	});
});

describe('UniversalAIService - callOpenRouter (via makeMove)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
		// Mock window.location which callOpenRouter accesses
		(globalThis as Record<string, unknown>).window = {
			location: { origin: 'http://localhost:3500' },
		};
	});

	test('returns parsed move on successful OpenRouter response', async () => {
		const config = makeConfig({ provider: 'openrouter' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeOpenAIResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.from).toBe('e2');
	});

	test('throws on non-ok OpenRouter response', async () => {
		const config = makeConfig({ provider: 'openrouter' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response('Bad Request', { status: 400, statusText: 'Bad Request' })
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('OpenRouter API error');
	});
});

describe('UniversalAIService - callOpenAI (via makeMove)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
	});

	test('returns parsed move on successful OpenAI response', async () => {
		const config = makeConfig({ provider: 'openai' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeOpenAIResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.to).toBe('e4');
	});

	test('throws on non-ok OpenAI response', async () => {
		const config = makeConfig({ provider: 'openai' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('OpenAI API error');
	});
});

describe('UniversalAIService - callChutes (via makeMove)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
	});

	test('returns parsed move on successful Chutes response', async () => {
		const config = makeConfig({ provider: 'chutes' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeOpenAIResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.from).toBe('e2');
	});

	test('uses reasoning_content when content is empty', async () => {
		const config = makeConfig({ provider: 'chutes' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: { content: '', reasoning_content: VALID_MOVE_JSON },
						},
					],
				}),
				{ status: 200 }
			)
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.from).toBe('e2');
	});

	test('throws on non-ok Chutes response', async () => {
		const config = makeConfig({ provider: 'chutes' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response('Service Unavailable', {
				status: 503,
				statusText: 'Service Unavailable',
			})
		);

		await expect(service.makeMove(gameState)).rejects.toThrow('Chutes API error');
	});
});

describe('UniversalAIService - unsupported provider', () => {
	test('throws for unknown provider', async () => {
		const adapter = new ChessAdapter();
		const config = makeConfig({ provider: 'unknown-provider' as 'gemini' });
		const service = new UniversalAIService(config, adapter);

		const gameState = makeGameState();

		await expect(service.makeMove(gameState)).rejects.toThrow('Unsupported AI provider');
	});
});

describe('UniversalAIService - parseAIResponse edge cases (via makeMove)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
	});

	test('throws when AI response contains no JSON', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify(makeGeminiResponse('This is plain text, no JSON here')),
				{ status: 200 }
			)
		);

		// parseAIResponse returns null, which is returned from makeMove
		const result = await service.makeMove(gameState);
		expect(result).toBeNull();
	});

	test('throws when AI response JSON lacks required move fields', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify(
					makeGeminiResponse(JSON.stringify({ reasoning: 'no move here' }))
				),
				{ status: 200 }
			)
		);

		const result = await service.makeMove(gameState);
		expect(result).toBeNull();
	});

	test('includes promote and pieceType fields from response', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		const responseWithExtras = JSON.stringify({
			move: { from: 'e2', to: 'e4', pieceType: 'pawn', promote: false },
			reasoning: 'Control center',
			confidence: 75,
		});

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify(makeGeminiResponse(responseWithExtras)),
				{ status: 200 }
			)
		);

		const result = await service.makeMove(gameState);
		expect(result).not.toBeNull();
		expect(result?.move.pieceType).toBe('pawn');
		expect(result?.move.promote).toBe(false);
	});

	test('defaults confidence to 50 when not provided', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		const responseNoConfidence = JSON.stringify({
			move: { from: 'e2', to: 'e4' },
			reasoning: 'Opening move',
		});

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify(makeGeminiResponse(responseNoConfidence)),
				{ status: 200 }
			)
		);

		const result = await service.makeMove(gameState);
		expect(result?.confidence).toBe(50);
	});
});

describe('UniversalAIService - debug mode', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = makeGameState();
	});

	test('fires debug callback for successful move', async () => {
		const config = makeConfig({ provider: 'gemini', debug: true });
		const service = new UniversalAIService(config, adapter);

		const debugEvents: string[] = [];
		service.setDebugCallback((type) => debugEvents.push(type));

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeGeminiResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		await service.makeMove(gameState);
		expect(debugEvents).toContain('ai-debug');
		expect(debugEvents).toContain('ai-move');
	});

	test('fires ai-error debug event when response cannot be parsed', async () => {
		const config = makeConfig({ provider: 'gemini', debug: true });
		const service = new UniversalAIService(config, adapter);

		const debugEvents: string[] = [];
		service.setDebugCallback((type) => debugEvents.push(type));

		globalThis.fetch = mock(async () =>
			new Response(
				JSON.stringify(makeGeminiResponse('no json here')),
				{ status: 200 }
			)
		);

		await service.makeMove(gameState);
		expect(debugEvents).toContain('ai-error');
	});

	test('stores last interaction after successful call', async () => {
		const config = makeConfig({ provider: 'gemini' });
		const service = new UniversalAIService(config, adapter);

		globalThis.fetch = mock(async () =>
			new Response(JSON.stringify(makeGeminiResponse(VALID_MOVE_JSON)), {
				status: 200,
			})
		);

		await service.makeMove(gameState);
		const interaction = service.getLastInteraction();
		expect(interaction).toBeDefined();
		expect(interaction?.prompt).toBeDefined();
		expect(interaction?.rawResponse).toBeDefined();
		expect(interaction?.parsedResponse).not.toBeNull();
	});
});
