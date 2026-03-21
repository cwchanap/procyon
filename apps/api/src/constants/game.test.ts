import { describe, test, expect } from 'bun:test';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
	ALL_CHESS_VARIANT_IDS,
	ALL_GAME_RESULT_STATUSES,
	ALL_OPPONENT_LLM_IDS,
} from './game';

describe('ChessVariantId enum', () => {
	test('has the correct values', () => {
		expect(ChessVariantId.Chess).toBe('chess');
		expect(ChessVariantId.Xiangqi).toBe('xiangqi');
		expect(ChessVariantId.Shogi).toBe('shogi');
		expect(ChessVariantId.Jungle).toBe('jungle');
	});

	test('has exactly 4 variants', () => {
		expect(Object.values(ChessVariantId)).toHaveLength(4);
	});
});

describe('GameResultStatus enum', () => {
	test('has the correct values', () => {
		expect(GameResultStatus.Win).toBe('win');
		expect(GameResultStatus.Loss).toBe('loss');
		expect(GameResultStatus.Draw).toBe('draw');
	});

	test('has exactly 3 statuses', () => {
		expect(Object.values(GameResultStatus)).toHaveLength(3);
	});
});

describe('OpponentLlmId enum', () => {
	test('has the correct values', () => {
		expect(OpponentLlmId.Gpt4o).toBe('gpt-4o');
		expect(OpponentLlmId.Gemini25Flash).toBe('gemini-2.5-flash');
	});

	test('has exactly 2 opponent IDs', () => {
		expect(Object.values(OpponentLlmId)).toHaveLength(2);
	});
});

describe('ALL_CHESS_VARIANT_IDS', () => {
	test('contains all chess variant strings', () => {
		expect(ALL_CHESS_VARIANT_IDS).toContain('chess');
		expect(ALL_CHESS_VARIANT_IDS).toContain('xiangqi');
		expect(ALL_CHESS_VARIANT_IDS).toContain('shogi');
		expect(ALL_CHESS_VARIANT_IDS).toContain('jungle');
	});

	test('has the same length as ChessVariantId enum', () => {
		expect(ALL_CHESS_VARIANT_IDS).toHaveLength(
			Object.values(ChessVariantId).length
		);
	});
});

describe('ALL_GAME_RESULT_STATUSES', () => {
	test('contains all result status strings', () => {
		expect(ALL_GAME_RESULT_STATUSES).toContain('win');
		expect(ALL_GAME_RESULT_STATUSES).toContain('loss');
		expect(ALL_GAME_RESULT_STATUSES).toContain('draw');
	});

	test('has the same length as GameResultStatus enum', () => {
		expect(ALL_GAME_RESULT_STATUSES).toHaveLength(
			Object.values(GameResultStatus).length
		);
	});
});

describe('ALL_OPPONENT_LLM_IDS', () => {
	test('contains all opponent LLM ID strings', () => {
		expect(ALL_OPPONENT_LLM_IDS).toContain('gpt-4o');
		expect(ALL_OPPONENT_LLM_IDS).toContain('gemini-2.5-flash');
	});

	test('has the same length as OpponentLlmId enum', () => {
		expect(ALL_OPPONENT_LLM_IDS).toHaveLength(
			Object.values(OpponentLlmId).length
		);
	});
});
