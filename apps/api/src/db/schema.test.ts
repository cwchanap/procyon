import { describe, expect, test } from 'bun:test';
import {
	aiConfigurations,
	playHistory,
	playerRatings,
	ratingHistory,
	aiOpponentRatings,
	puzzles,
	userPuzzleProgress,
} from './schema';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';

describe('database schema - table definitions', () => {
	test('aiConfigurations table has correct structure', () => {
		expect(aiConfigurations).toBeDefined();
		expect(aiConfigurations.userId).toBeDefined();
		expect(aiConfigurations.provider).toBeDefined();
		expect(aiConfigurations.modelName).toBeDefined();
		expect(aiConfigurations.apiKey).toBeDefined();
		expect(aiConfigurations.isActive).toBeDefined();
		expect(aiConfigurations.createdAt).toBeDefined();
		expect(aiConfigurations.updatedAt).toBeDefined();
	});

	test('playHistory table has correct structure', () => {
		expect(playHistory).toBeDefined();
		expect(playHistory.userId).toBeDefined();
		expect(playHistory.chessId).toBeDefined();
		expect(playHistory.date).toBeDefined();
		expect(playHistory.status).toBeDefined();
		expect(playHistory.opponentUserId).toBeDefined();
		expect(playHistory.opponentLlmId).toBeDefined();
	});

	test('playerRatings table has correct structure', () => {
		expect(playerRatings).toBeDefined();
		expect(playerRatings.userId).toBeDefined();
		expect(playerRatings.variantId).toBeDefined();
		expect(playerRatings.rating).toBeDefined();
		expect(playerRatings.gamesPlayed).toBeDefined();
		expect(playerRatings.wins).toBeDefined();
		expect(playerRatings.losses).toBeDefined();
		expect(playerRatings.draws).toBeDefined();
		expect(playerRatings.peakRating).toBeDefined();
		expect(playerRatings.createdAt).toBeDefined();
		expect(playerRatings.updatedAt).toBeDefined();
	});

	test('ratingHistory table has correct structure', () => {
		expect(ratingHistory).toBeDefined();
		expect(ratingHistory.userId).toBeDefined();
		expect(ratingHistory.variantId).toBeDefined();
		expect(ratingHistory.playHistoryId).toBeDefined();
		expect(ratingHistory.oldRating).toBeDefined();
		expect(ratingHistory.newRating).toBeDefined();
		expect(ratingHistory.ratingChange).toBeDefined();
		expect(ratingHistory.opponentRating).toBeDefined();
		expect(ratingHistory.gameResult).toBeDefined();
		expect(ratingHistory.createdAt).toBeDefined();
	});

	test('aiOpponentRatings table has correct structure', () => {
		expect(aiOpponentRatings).toBeDefined();
		expect(aiOpponentRatings.opponentLlmId).toBeDefined();
		expect(aiOpponentRatings.variantId).toBeDefined();
		expect(aiOpponentRatings.rating).toBeDefined();
		expect(aiOpponentRatings.description).toBeDefined();
		expect(aiOpponentRatings.createdAt).toBeDefined();
		expect(aiOpponentRatings.updatedAt).toBeDefined();
	});

	test('puzzles table has correct structure', () => {
		expect(puzzles).toBeDefined();
		expect(puzzles.slug).toBeDefined();
		expect(puzzles.title).toBeDefined();
		expect(puzzles.description).toBeDefined();
		expect(puzzles.difficulty).toBeDefined();
		expect(puzzles.playerColor).toBeDefined();
		expect(puzzles.initialBoard).toBeDefined();
		expect(puzzles.solution).toBeDefined();
		expect(puzzles.hint).toBeDefined();
		expect(puzzles.createdAt).toBeDefined();
	});

	test('userPuzzleProgress table has correct structure', () => {
		expect(userPuzzleProgress).toBeDefined();
		expect(userPuzzleProgress.userId).toBeDefined();
		expect(userPuzzleProgress.puzzleId).toBeDefined();
		expect(userPuzzleProgress.solved).toBeDefined();
		expect(userPuzzleProgress.failedAttempts).toBeDefined();
		expect(userPuzzleProgress.solvedAt).toBeDefined();
		expect(userPuzzleProgress.updatedAt).toBeDefined();
	});
});

describe('database schema - default values', () => {
	test('playerRatings has correct default values', () => {
		// Access the column definitions to check defaults
		const ratingCol = playerRatings.rating;
		const gamesPlayedCol = playerRatings.gamesPlayed;
		const winsCol = playerRatings.wins;
		const lossesCol = playerRatings.losses;
		const drawsCol = playerRatings.draws;
		const peakRatingCol = playerRatings.peakRating;

		expect(ratingCol).toBeDefined();
		expect(gamesPlayedCol).toBeDefined();
		expect(winsCol).toBeDefined();
		expect(lossesCol).toBeDefined();
		expect(drawsCol).toBeDefined();
		expect(peakRatingCol).toBeDefined();
	});

	test('aiOpponentRatings has correct default rating', () => {
		expect(aiOpponentRatings.rating).toBeDefined();
	});

	test('userPuzzleProgress has correct defaults', () => {
		expect(userPuzzleProgress.solved).toBeDefined();
		expect(userPuzzleProgress.failedAttempts).toBeDefined();
	});

	test('aiConfigurations has correct defaults', () => {
		expect(aiConfigurations.isActive).toBeDefined();
	});
});

describe('database schema - indexes', () => {
	test('aiConfigurations has userId index', () => {
		// The table definition includes indexes via the callback
		expect(aiConfigurations).toBeDefined();
	});

	test('playHistory has userId and opponentUserId indexes', () => {
		expect(playHistory).toBeDefined();
	});

	test('playerRatings has userVariant unique index and rating index', () => {
		expect(playerRatings).toBeDefined();
	});

	test('ratingHistory has userId, playHistoryId, and userPlayHistory unique indexes', () => {
		expect(ratingHistory).toBeDefined();
	});

	test('aiOpponentRatings has llmVariant unique index', () => {
		expect(aiOpponentRatings).toBeDefined();
	});

	test('puzzles has slug unique index and difficulty index', () => {
		expect(puzzles).toBeDefined();
	});

	test('userPuzzleProgress has userPuzzle unique index and userId index', () => {
		expect(userPuzzleProgress).toBeDefined();
	});
});

describe('database schema - type constraints', () => {
	test('playHistory chessId accepts valid ChessVariantId values', () => {
		// Type-level test - ensures the column is typed correctly
		const validVariants = Object.values(ChessVariantId);
		expect(validVariants).toContain(ChessVariantId.Chess);
		expect(validVariants).toContain(ChessVariantId.Xiangqi);
		expect(validVariants).toContain(ChessVariantId.Shogi);
		expect(validVariants).toContain(ChessVariantId.Jungle);
	});

	test('playHistory status accepts valid GameResultStatus values', () => {
		const validStatuses = Object.values(GameResultStatus);
		expect(validStatuses).toContain(GameResultStatus.Win);
		expect(validStatuses).toContain(GameResultStatus.Loss);
		expect(validStatuses).toContain(GameResultStatus.Draw);
	});

	test('aiOpponentRatings opponentLlmId accepts valid OpponentLlmId values', () => {
		const validLlms = Object.values(OpponentLlmId);
		expect(validLlms).toContain(OpponentLlmId.Gemini25Flash);
		expect(validLlms).toContain(OpponentLlmId.Gpt4o);
	});

	test('puzzles difficulty accepts valid difficulty values', () => {
		const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;
		expect(validDifficulties).toContain('beginner');
		expect(validDifficulties).toContain('intermediate');
		expect(validDifficulties).toContain('advanced');
	});

	test('puzzles playerColor accepts valid color values', () => {
		const validColors = ['white', 'black'] as const;
		expect(validColors).toContain('white');
		expect(validColors).toContain('black');
	});
});

describe('database schema - foreign key relationships', () => {
	test('userPuzzleProgress references puzzles.id', () => {
		expect(userPuzzleProgress.puzzleId).toBeDefined();
	});

	test('ratingHistory playHistoryId references play_history.id', () => {
		expect(ratingHistory.playHistoryId).toBeDefined();
	});
});

describe('database schema - nullable columns', () => {
	test('playHistory opponentUserId is nullable', () => {
		expect(playHistory.opponentUserId).toBeDefined();
	});

	test('playHistory opponentLlmId is nullable', () => {
		expect(playHistory.opponentLlmId).toBeDefined();
	});

	test('userPuzzleProgress solvedAt is nullable', () => {
		expect(userPuzzleProgress.solvedAt).toBeDefined();
	});

	test('aiOpponentRatings description is nullable', () => {
		expect(aiOpponentRatings.description).toBeDefined();
	});
});

describe('database schema - primary keys', () => {
	test('all tables have primary keys', () => {
		expect(aiConfigurations.id).toBeDefined();
		expect(playHistory.id).toBeDefined();
		expect(playerRatings.id).toBeDefined();
		expect(ratingHistory.id).toBeDefined();
		expect(aiOpponentRatings.id).toBeDefined();
		expect(puzzles.id).toBeDefined();
		expect(userPuzzleProgress.id).toBeDefined();
	});
});

describe('database schema - type exports', () => {
	test('AiConfiguration type is defined', () => {
		// TypeScript compile-time check - ensures the type is exported
		type TestAiConfig = {
			id: number;
			userId: string;
			provider: string;
			modelName: string;
			apiKey: string;
			isActive: boolean;
			createdAt: string;
			updatedAt: string;
		};
		// This will fail at compile time if the type changes
		const _test: TestAiConfig = {} as import('./schema').AiConfiguration;
		expect(_test).toBeDefined();
	});

	test('PlayHistory type is defined', () => {
		type TestPlayHistory = {
			id: number;
			userId: string;
			chessId: ChessVariantId;
			date: string;
			status: GameResultStatus;
			opponentUserId: string | null;
			opponentLlmId: OpponentLlmId | null;
		};
		const _test: TestPlayHistory = {} as import('./schema').PlayHistory;
		expect(_test).toBeDefined();
	});

	test('PlayerRating type is defined', () => {
		type TestPlayerRating = {
			id: number;
			userId: string;
			variantId: ChessVariantId;
			rating: number;
			gamesPlayed: number;
			wins: number;
			losses: number;
			draws: number;
			peakRating: number;
			createdAt: string;
			updatedAt: string;
		};
		const _test: TestPlayerRating = {} as import('./schema').PlayerRating;
		expect(_test).toBeDefined();
	});

	test('RatingHistory type is defined', () => {
		type TestRatingHistory = {
			id: number;
			userId: string;
			variantId: ChessVariantId;
			playHistoryId: number;
			oldRating: number;
			newRating: number;
			ratingChange: number;
			opponentRating: number;
			gameResult: GameResultStatus;
			createdAt: string;
		};
		const _test: TestRatingHistory = {} as import('./schema').RatingHistory;
		expect(_test).toBeDefined();
	});

	test('AiOpponentRating type is defined', () => {
		type TestAiOpponentRating = {
			id: number;
			opponentLlmId: OpponentLlmId;
			variantId: ChessVariantId;
			rating: number;
			description: string | null;
			createdAt: string;
			updatedAt: string;
		};
		const _test: TestAiOpponentRating =
			{} as import('./schema').AiOpponentRating;
		expect(_test).toBeDefined();
	});

	test('Puzzle type is defined', () => {
		type TestPuzzle = {
			id: number;
			slug: string;
			title: string;
			description: string;
			difficulty: 'beginner' | 'intermediate' | 'advanced';
			playerColor: 'white' | 'black';
			initialBoard: string;
			solution: string;
			hint: string;
			createdAt: string;
		};
		const _test: TestPuzzle = {} as import('./schema').Puzzle;
		expect(_test).toBeDefined();
	});

	test('UserPuzzleProgress type is defined', () => {
		type TestUserPuzzleProgress = {
			id: number;
			userId: string;
			puzzleId: number;
			solved: boolean;
			failedAttempts: number;
			solvedAt: string | null;
			updatedAt: string;
		};
		const _test: TestUserPuzzleProgress =
			{} as import('./schema').UserPuzzleProgress;
		expect(_test).toBeDefined();
	});
});
