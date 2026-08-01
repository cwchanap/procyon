import { describe, expect, test } from 'bun:test';
import { createInitialGameState } from '../game';
import type { GameState } from '../types';
import type { AIConfig, AIResponse } from '../../ai/types';
import {
	createLlmRivalProvider,
	type LlmAiService,
	type RivalDebugEvent,
} from './llm-provider';

const baseConfig: AIConfig = {
	provider: 'gemini',
	apiKey: 'test-key',
	model: 'gemini-2.5-flash-lite',
	enabled: true,
	debug: false,
};

class FakeLlmService implements LlmAiService {
	readonly moveCalls: Array<{ state: GameState; requestToken?: number }> = [];
	debugCallback:
		| ((type: string, message: string, data?: Record<string, unknown>) => void)
		| undefined;
	nextResponse: AIResponse | null = {
		move: { from: 'e7', to: 'e5' },
		thinking: 'Challenge the center',
		confidence: 82,
	};
	nextError: Error | null = null;
	lastInteraction:
		| {
				prompt: string;
				rawResponse: string;
				parsedResponse: AIResponse | null;
		  }
		| undefined = {
		prompt: 'Chess prompt',
		rawResponse: '{"move":{"from":"e7","to":"e5"}}',
		parsedResponse: this.nextResponse,
	};

	async makeMove(
		state: GameState,
		requestToken?: number
	): Promise<AIResponse | null> {
		this.moveCalls.push({ state, requestToken });
		if (this.nextError) {
			throw this.nextError;
		}
		return this.nextResponse;
	}

	getLastInteraction() {
		return this.lastInteraction;
	}

	setDebugCallback(
		callback: (
			type: string,
			message: string,
			data?: Record<string, unknown>
		) => void
	): void {
		this.debugCallback = callback;
	}

	emitDebug(event: RivalDebugEvent): void {
		this.debugCallback?.(event.type, event.message, event.data);
	}
}

class Deferred<T> {
	readonly promise: Promise<T>;
	resolve!: (value: T | PromiseLike<T>) => void;

	constructor() {
		this.promise = new Promise<T>(resolve => {
			this.resolve = resolve;
		});
	}
}

function createHarness(options: { service?: FakeLlmService } = {}) {
	const service = options.service ?? new FakeLlmService();
	const capturedConfigs: AIConfig[] = [];
	const debugEvents: RivalDebugEvent[] = [];
	const provider = createLlmRivalProvider({
		config: baseConfig,
		onDebugEvent: event => debugEvents.push(event),
		createService: config => {
			capturedConfigs.push(config);
			return service;
		},
	});

	return { provider, service, capturedConfigs, debugEvents };
}

describe('createLlmRivalProvider', () => {
	test('initialize and beginGame resolve without touching the service', async () => {
		const { provider, service } = createHarness();

		await expect(provider.initialize()).resolves.toBeUndefined();
		await expect(provider.beginGame()).resolves.toBeUndefined();

		expect(provider.kind).toBe('llm');
		expect(service.moveCalls).toHaveLength(0);
	});

	test('freezes a cloned service config at construction', async () => {
		const config = { ...baseConfig };
		const capturedConfigs: AIConfig[] = [];
		const provider = createLlmRivalProvider({
			config,
			createService: capturedConfig => {
				capturedConfigs.push(capturedConfig);
				return new FakeLlmService();
			},
		});

		config.apiKey = 'mutated-key';
		config.model = 'mutated-model';
		config.debug = false;
		await provider.makeMove(createInitialGameState('human-vs-ai', 'white'), 7);

		expect(capturedConfigs).toHaveLength(1);
		expect(capturedConfigs[0]).not.toBe(config);
		// The service always runs with diagnostics enabled so its debug events
		// flow continuously (the UI filters them); provider/model/key are frozen.
		expect(capturedConfigs[0]).toEqual({
			...baseConfig,
			debug: true,
		});
		expect(Object.isFrozen(capturedConfigs[0])).toBe(true);
	});

	test('maps a valid service response and last interaction metadata', async () => {
		const { provider, service } = createHarness();
		const state = createInitialGameState('human-vs-ai', 'white');

		const result = await provider.makeMove(state, 42);

		expect(result).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
			meta: {
				thinking: service.nextResponse?.thinking,
				confidence: service.nextResponse?.confidence,
				interaction: {
					prompt: service.lastInteraction?.prompt,
					response: service.lastInteraction?.rawResponse,
				},
			},
		});
		expect(service.moveCalls).toEqual([{ state, requestToken: 42 }]);
	});

	// Export metadata is independent of debug mode: a game started with Debug
	// Mode off must still retain prompt/response/thinking/confidence for export.
	test('maps interaction metadata even when the config debug flag is off', async () => {
		const { provider, service } = createHarness();
		const state = createInitialGameState('human-vs-ai', 'white');

		const result = await provider.makeMove(state, 42);

		expect(result).toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
			meta: {
				thinking: service.nextResponse?.thinking,
				confidence: service.nextResponse?.confidence,
				interaction: {
					prompt: service.lastInteraction?.prompt,
					response: service.lastInteraction?.rawResponse,
				},
			},
		});
		expect(service.moveCalls).toEqual([{ state, requestToken: 42 }]);
	});

	test('maps a null or missing move response to no-move', async () => {
		const nullResponse = createHarness();
		nullResponse.service.nextResponse = null;
		await expect(
			nullResponse.provider.makeMove(createInitialGameState('human-vs-ai'), 1)
		).resolves.toEqual({ ok: false, reason: 'no-move' });

		const missingMove = createHarness();
		missingMove.service.nextResponse = {
			move: undefined as unknown as AIResponse['move'],
			confidence: 20,
		};
		await expect(
			missingMove.provider.makeMove(createInitialGameState('human-vs-ai'), 2)
		).resolves.toEqual({ ok: false, reason: 'no-move' });
	});

	test('lets thrown service errors remain thrown', async () => {
		const { provider, service } = createHarness();
		service.nextError = new Error('provider exploded');

		await expect(
			provider.makeMove(createInitialGameState('human-vs-ai'), 3)
		).rejects.toThrow('provider exploded');
	});

	test('delivers debug callbacks as typed rival debug events', () => {
		const { service, debugEvents } = createHarness();

		service.emitDebug({
			type: 'ai-debug',
			message: 'thinking',
			data: { requestId: 5 },
		});

		expect(debugEvents).toEqual([
			{
				type: 'ai-debug',
				message: 'thinking',
				data: { requestId: 5 },
			},
		]);
	});

	test('dispose clears debug callbacks and rejects late move results', async () => {
		const deferred = new Deferred<AIResponse | null>();
		const service = new FakeLlmService();
		service.makeMove = () => deferred.promise;
		const { provider, debugEvents } = createHarness({ service });

		const pending = provider.makeMove(createInitialGameState('human-vs-ai'), 4);
		provider.dispose();
		service.emitDebug({ type: 'ai-move', message: 'late move' });
		deferred.resolve({
			move: { from: 'g8', to: 'f6' },
			thinking: 'Develop a knight',
			confidence: 90,
		});

		await expect(pending).rejects.toThrow('disposed');
		expect(debugEvents).toEqual([]);
		await expect(
			provider.makeMove(createInitialGameState('human-vs-ai'), 5)
		).rejects.toThrow('disposed');
	});
});
