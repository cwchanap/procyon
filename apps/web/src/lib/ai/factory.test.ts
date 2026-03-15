import { test, expect, describe } from 'bun:test';
import {
	createAIService,
	createChessAI,
	createXiangqiAI,
	createShogiAI,
	createJungleAI,
} from './factory';
import { UniversalAIService } from './service';
import type { AIConfig } from './types';

const baseConfig: AIConfig = {
	provider: 'gemini',
	apiKey: 'test-api-key',
	model: 'gemini-2.5-flash-lite',
	enabled: true,
};

describe('AI Factory', () => {
	describe('createAIService', () => {
		test('should create a chess AI service by default', () => {
			const service = createAIService(baseConfig);
			expect(service).toBeInstanceOf(UniversalAIService);
		});

		test('should create a chess AI service when variant is chess', () => {
			const service = createAIService(baseConfig, 'chess');
			expect(service).toBeInstanceOf(UniversalAIService);
		});

		test('should create a xiangqi AI service', () => {
			const service = createAIService(baseConfig, 'xiangqi');
			expect(service).toBeInstanceOf(UniversalAIService);
		});

		test('should create a shogi AI service', () => {
			const service = createAIService(baseConfig, 'shogi');
			expect(service).toBeInstanceOf(UniversalAIService);
		});

		test('should create a jungle AI service', () => {
			const service = createAIService(baseConfig, 'jungle');
			expect(service).toBeInstanceOf(UniversalAIService);
		});

		test('should throw for unsupported game variant', () => {
			expect(() =>
				createAIService(baseConfig, 'unknown' as never)
			).toThrow('Unsupported game variant: unknown');
		});

		test('should wire the correct adapter for the requested variant', () => {
			const service = createAIService(baseConfig, 'shogi');
			expect(service.adapter.gameVariant).toBe('shogi');
		});

		test('should forward debug flag to the adapter', () => {
			const debugConfig = { ...baseConfig, debug: true };
			const service = createAIService(debugConfig, 'chess');
			expect(service.adapter.gameVariant).toBe('chess');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((service.adapter as any).debugMode).toBe(true);
		});
	});

	describe('createChessAI', () => {
		test('should create a UniversalAIService instance', () => {
			const service = createChessAI(baseConfig);
			expect(service).toBeInstanceOf(UniversalAIService);
		});
	});

	describe('createXiangqiAI', () => {
		test('should create a UniversalAIService instance', () => {
			const service = createXiangqiAI(baseConfig);
			expect(service).toBeInstanceOf(UniversalAIService);
		});
	});

	describe('createShogiAI', () => {
		test('should create a UniversalAIService instance', () => {
			const service = createShogiAI(baseConfig);
			expect(service).toBeInstanceOf(UniversalAIService);
		});
	});

	describe('createJungleAI', () => {
		test('should create a UniversalAIService instance', () => {
			const service = createJungleAI(baseConfig);
			expect(service).toBeInstanceOf(UniversalAIService);
		});
	});

	describe('all variants produce distinct services', () => {
		test('each variant creates an independent service instance', () => {
			const chess = createAIService(baseConfig, 'chess');
			const xiangqi = createAIService(baseConfig, 'xiangqi');
			const shogi = createAIService(baseConfig, 'shogi');
			const jungle = createAIService(baseConfig, 'jungle');

			expect(chess).not.toBe(xiangqi);
			expect(chess).not.toBe(shogi);
			expect(chess).not.toBe(jungle);
			expect(xiangqi).not.toBe(shogi);
			expect(xiangqi).not.toBe(jungle);
			expect(shogi).not.toBe(jungle);
		});
	});
});
