import { describe, test, expect } from 'bun:test';
import {
	ChessVariantId,
	GameId,
	GameResultStatus,
	OpponentLlmId,
	OpponentEngineId,
	ALL_CHESS_VARIANT_IDS,
	ALL_GAME_RESULT_STATUSES,
	ALL_OPPONENT_LLM_IDS,
	ALL_OPPONENT_ENGINE_IDS,
	getRatedVariantId,
} from './game';

describe('GameId enum', () => {
	test('has exactly the five API game values', () => {
		expect(Object.values(GameId) as string[]).toEqual([
			'chess',
			'xiangqi',
			'shogi',
			'jungle',
			'aeroplane',
		]);
	});
});

describe('getRatedVariantId', () => {
	test.each([
		[GameId.Chess, ChessVariantId.Chess],
		[GameId.Xiangqi, ChessVariantId.Xiangqi],
		[GameId.Shogi, ChessVariantId.Shogi],
		[GameId.Jungle, ChessVariantId.Jungle],
		[GameId.Aeroplane, null],
	] as const)('%s maps to %s', (gameId, expected) => {
		expect(getRatedVariantId(gameId)).toBe(expected);
	});
});

describe('ChessVariantId enum', () => {
	test('has the correct values', () => {
		expect(ChessVariantId.Chess as string).toBe('chess');
		expect(ChessVariantId.Xiangqi as string).toBe('xiangqi');
		expect(ChessVariantId.Shogi as string).toBe('shogi');
		expect(ChessVariantId.Jungle as string).toBe('jungle');
	});

	test('has exactly 4 variants', () => {
		expect(Object.values(ChessVariantId)).toHaveLength(4);
	});
});

describe('GameResultStatus enum', () => {
	test('has the correct values', () => {
		expect(GameResultStatus.Win as string).toBe('win');
		expect(GameResultStatus.Loss as string).toBe('loss');
		expect(GameResultStatus.Draw as string).toBe('draw');
	});

	test('has exactly 3 statuses', () => {
		expect(Object.values(GameResultStatus)).toHaveLength(3);
	});
});

describe('OpponentLlmId enum', () => {
	test('has the correct values', () => {
		expect(OpponentLlmId.Gpt4o as string).toBe('gpt-4o');
		expect(OpponentLlmId.Gemini25Flash as string).toBe('gemini-2.5-flash');
	});

	test('has exactly 2 opponent IDs', () => {
		expect(Object.values(OpponentLlmId)).toHaveLength(2);
	});
});

describe('ALL_CHESS_VARIANT_IDS', () => {
	test('contains all chess variant strings', () => {
		expect(ALL_CHESS_VARIANT_IDS).toContain(ChessVariantId.Chess);
		expect(ALL_CHESS_VARIANT_IDS).toContain(ChessVariantId.Xiangqi);
		expect(ALL_CHESS_VARIANT_IDS).toContain(ChessVariantId.Shogi);
		expect(ALL_CHESS_VARIANT_IDS).toContain(ChessVariantId.Jungle);
	});

	test('has the same length as ChessVariantId enum', () => {
		expect(ALL_CHESS_VARIANT_IDS).toHaveLength(
			Object.values(ChessVariantId).length
		);
	});
});

describe('ALL_GAME_RESULT_STATUSES', () => {
	test('contains all result status strings', () => {
		expect(ALL_GAME_RESULT_STATUSES).toContain(GameResultStatus.Win);
		expect(ALL_GAME_RESULT_STATUSES).toContain(GameResultStatus.Loss);
		expect(ALL_GAME_RESULT_STATUSES).toContain(GameResultStatus.Draw);
	});

	test('has the same length as GameResultStatus enum', () => {
		expect(ALL_GAME_RESULT_STATUSES).toHaveLength(
			Object.values(GameResultStatus).length
		);
	});
});

describe('ALL_OPPONENT_LLM_IDS', () => {
	test('contains all opponent LLM ID strings', () => {
		expect(ALL_OPPONENT_LLM_IDS).toContain(OpponentLlmId.Gpt4o);
		expect(ALL_OPPONENT_LLM_IDS).toContain(OpponentLlmId.Gemini25Flash);
	});

	test('has the same length as OpponentLlmId enum', () => {
		expect(ALL_OPPONENT_LLM_IDS).toHaveLength(
			Object.values(OpponentLlmId).length
		);
	});
});

describe('OpponentEngineId enum', () => {
	test('has the correct values', () => {
		expect(OpponentEngineId.Stockfish as string).toBe('stockfish');
		expect(OpponentEngineId.AeroplaneTrioV1 as string).toBe(
			'aeroplane-trio-v1'
		);
	});

	test('has exactly 2 engine IDs', () => {
		expect(Object.values(OpponentEngineId)).toHaveLength(2);
	});
});

describe('ALL_OPPONENT_ENGINE_IDS', () => {
	test('contains all opponent engine ID strings', () => {
		expect(ALL_OPPONENT_ENGINE_IDS).toContain(OpponentEngineId.Stockfish);
		expect(ALL_OPPONENT_ENGINE_IDS).toContain(OpponentEngineId.AeroplaneTrioV1);
	});

	test('has the same length as OpponentEngineId enum', () => {
		expect(ALL_OPPONENT_ENGINE_IDS).toHaveLength(
			Object.values(OpponentEngineId).length
		);
	});
});
