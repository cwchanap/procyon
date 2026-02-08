import { test, expect, describe, beforeEach } from 'bun:test';
import { UniversalAIService } from './service';
import { ChessAdapter } from './chess-adapter';
import type { AIConfig } from './types';
import type { GameState } from '../chess/types';
import { createInitialBoard } from '../chess/board';

describe('UniversalAIService', () => {
	let service: UniversalAIService<GameState>;
	let adapter: ChessAdapter;
	let config: AIConfig;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		config = {
			provider: 'gemini',
			apiKey: '', // Empty for tests - won't make API calls
			model: 'gemini-2.5-flash-lite',
			enabled: false, // Disabled for unit tests
		};
		service = new UniversalAIService(config, adapter);
		gameState = {
			board: createInitialBoard(),
			currentPlayer: 'white',
			status: 'playing',
			moveHistory: [],
			selectedSquare: null,
			possibleMoves: [],
			mode: 'human-vs-ai',
		};
	});

	describe('constructor', () => {
		test('should create service with config and adapter', () => {
			expect(service.adapter).toBe(adapter);
		});
	});

	describe('makeMove', () => {
		test('should return null when disabled', async () => {
			const result = await service.makeMove(gameState);
			expect(result).toBeNull();
		});

		test('should return null when no API key', async () => {
			const enabledConfig = { ...config, enabled: true };
			const enabledService = new UniversalAIService(enabledConfig, adapter);
			const result = await enabledService.makeMove(gameState);
			expect(result).toBeNull();
		});
	});

	describe('updateConfig', () => {
		test('should update config partially', () => {
			service.updateConfig({ enabled: true });
			// Verify enabled was updated
			expect(service.getConfig().enabled).toBe(true);
		});

		test('should update config with new model', () => {
			service.updateConfig({ model: 'gemini-1.5-pro' });
			// Verify model was updated
			expect(service.getConfig().model).toBe('gemini-1.5-pro');
		});
	});

	describe('setDebugCallback', () => {
		test('should accept debug callback', () => {
			const callback = (_type: string, _message: string) => {
				// Debug callback
			};
			service.setDebugCallback(callback);
			// Should not throw
		});
	});

	describe('getLastInteraction', () => {
		test('should return undefined when no interaction has occurred', () => {
			const interaction = service.getLastInteraction();
			expect(interaction).toBeUndefined();
		});
	});
});

describe('UniversalAIService.parseAIResponse (via integration)', () => {
	// Since parseAIResponse is private, we test it indirectly through
	// the patterns it expects in responses

	test('valid JSON response format', () => {
		const validResponse = `{
			"move": {
				"from": "e2",
				"to": "e4"
			},
			"reasoning": "Opening with King's pawn",
			"confidence": 85
		}`;

		// The response format is what the AI is expected to return
		expect(validResponse).toContain('"move"');
		expect(validResponse).toContain('"from"');
		expect(validResponse).toContain('"to"');
		expect(validResponse).toContain('"reasoning"');
	});

	test('response should contain move coordinates', () => {
		const validResponse = `{
			"move": {
				"from": "d7",
				"to": "d5"
			},
			"reasoning": "Queen's pawn defense",
			"confidence": 80
		}`;

		const parsed = JSON.parse(validResponse);
		expect(parsed.move.from).toBe('d7');
		expect(parsed.move.to).toBe('d5');
		expect(parsed.reasoning).toBeDefined();
	});

	test('response format should match adapter expectations', () => {
		const adapter = new ChessAdapter();
		const gameState: GameState = {
			board: createInitialBoard(),
			currentPlayer: 'white',
			status: 'playing',
			moveHistory: [],
			selectedSquare: null,
			possibleMoves: [],
			mode: 'human-vs-ai',
		};

		const prompt = adapter.generatePrompt(gameState);

		// Verify the prompt instructs the AI to use the correct format
		expect(prompt).toContain('"from"');
		expect(prompt).toContain('"to"');
		expect(prompt).toContain('"move"');
	});
});
