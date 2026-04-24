import { test, expect, describe } from 'bun:test';
import type { GameVariant } from '../lib/ai/game-variant-types';

// ─── Opponent LLM ID mapping logic ───────────────────────────────────────────
// Mirrors the getOpponentLlmId() logic inside usePlayHistory

function getOpponentLlmId(
	provider: string,
	model: string
): 'gpt-4o' | 'gemini-2.5-flash' {
	const providerModel = `${provider}/${model}`.toLowerCase();
	if (providerModel.includes('gpt-4o')) {
		return 'gpt-4o';
	}
	return 'gemini-2.5-flash';
}

describe('getOpponentLlmId mapping logic', () => {
	test('returns gpt-4o when provider is openai and model is gpt-4o', () => {
		expect(getOpponentLlmId('openai', 'gpt-4o')).toBe('gpt-4o');
	});

	test('returns gpt-4o when model contains gpt-4o-mini (case insensitive)', () => {
		expect(getOpponentLlmId('openai', 'gpt-4o-mini')).toBe('gpt-4o');
	});

	test('returns gpt-4o when combined provider/model contains gpt-4o', () => {
		expect(getOpponentLlmId('openrouter', 'gpt-4o')).toBe('gpt-4o');
	});

	test('returns gemini-2.5-flash for gemini provider', () => {
		expect(getOpponentLlmId('gemini', 'gemini-2.5-flash')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('returns gemini-2.5-flash for chutes provider', () => {
		expect(getOpponentLlmId('chutes', 'deepseek-ai/DeepSeek-R1')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('returns gemini-2.5-flash for openrouter with non-gpt-4o model', () => {
		expect(getOpponentLlmId('openrouter', 'claude-3-haiku')).toBe(
			'gemini-2.5-flash'
		);
	});

	test('is case-insensitive for gpt-4o detection', () => {
		expect(getOpponentLlmId('OpenAI', 'GPT-4O')).toBe('gpt-4o');
	});

	test('returns gemini-2.5-flash for unknown provider and model', () => {
		expect(getOpponentLlmId('unknown', 'unknown-model')).toBe(
			'gemini-2.5-flash'
		);
	});
});

// ─── Game result determination logic ─────────────────────────────────────────
// Mirrors the result determination inside savePlayHistory()

type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

function determineResult(
	gameStatus: GameStatus,
	aiPlayer: string,
	getWinnerColor: () => string | null
): 'win' | 'loss' | 'draw' | null {
	const isGameOver =
		gameStatus === 'checkmate' ||
		gameStatus === 'stalemate' ||
		gameStatus === 'draw';

	if (!isGameOver) return null;

	if (gameStatus === 'draw' || gameStatus === 'stalemate') {
		return 'draw';
	}

	// checkmate
	const winnerColor = getWinnerColor();
	if (winnerColor === null) return null;

	if (winnerColor === aiPlayer) {
		return 'loss'; // AI won, player lost
	}
	return 'win'; // Player won
}

describe('game result determination logic', () => {
	test('returns null when game is still playing', () => {
		expect(determineResult('playing', 'black', () => null)).toBeNull();
	});

	test('returns null when game is in check', () => {
		expect(determineResult('check', 'black', () => null)).toBeNull();
	});

	test('returns draw for draw status', () => {
		expect(determineResult('draw', 'black', () => null)).toBe('draw');
	});

	test('returns draw for stalemate status', () => {
		expect(determineResult('stalemate', 'black', () => null)).toBe('draw');
	});

	test('returns win when player wins (AI is black, white wins)', () => {
		expect(determineResult('checkmate', 'black', () => 'white')).toBe('win');
	});

	test('returns loss when AI wins (AI is white, white wins)', () => {
		expect(determineResult('checkmate', 'white', () => 'white')).toBe('loss');
	});

	test('returns loss when AI wins (AI is black, black wins)', () => {
		expect(determineResult('checkmate', 'black', () => 'black')).toBe('loss');
	});

	test('returns win when player wins (AI is white, black wins)', () => {
		expect(determineResult('checkmate', 'white', () => 'black')).toBe('win');
	});

	test('returns null for checkmate when winner color cannot be determined', () => {
		expect(determineResult('checkmate', 'black', () => null)).toBeNull();
	});
});

// ─── Save guard logic ─────────────────────────────────────────────────────────
// Mirrors the savedRef.current check to prevent duplicate saves

describe('save deduplication guard', () => {
	test('prevents saving twice for the same completed game', () => {
		let savedRef = false;
		let saveCount = 0;

		const trySave = () => {
			if (savedRef) return;
			savedRef = true;
			saveCount++;
		};

		trySave();
		trySave();
		trySave();

		expect(saveCount).toBe(1);
	});

	test('resets after a new game starts (playing + moveCount 0)', () => {
		let savedRef = false;
		let saveCount = 0;

		const trySave = () => {
			if (savedRef) return;
			savedRef = true;
			saveCount++;
		};

		const resetOnNewGame = (gameStatus: GameStatus, moveCount: number) => {
			if (gameStatus === 'playing' && moveCount === 0) {
				savedRef = false;
			}
		};

		// First game: save once
		trySave();
		expect(saveCount).toBe(1);

		// New game starts
		resetOnNewGame('playing', 0);

		// Second game: save again
		trySave();
		expect(saveCount).toBe(2);
	});

	test('does not reset if game is playing but has moves (mid-game)', () => {
		let savedRef = true; // already saved
		let saveCount = 1;

		const trySave = () => {
			if (savedRef) return;
			savedRef = true;
			saveCount++;
		};

		const resetOnNewGame = (gameStatus: GameStatus, moveCount: number) => {
			if (gameStatus === 'playing' && moveCount === 0) {
				savedRef = false;
			}
		};

		// mid-game, not a fresh start
		resetOnNewGame('playing', 5);

		trySave();
		expect(saveCount).toBe(1); // still 1, no new save
	});

	test('resets savedRef to false on fetch failure to allow retry', () => {
		let savedRef = false;

		const trySave = (ok: boolean) => {
			if (savedRef) return;
			savedRef = true; // optimistic set before fetch
			if (!ok) {
				savedRef = false; // reset on failure so retry is possible
			}
		};

		trySave(false);
		expect(savedRef).toBe(false); // retry allowed after failure

		trySave(true);
		expect(savedRef).toBe(true); // stays set after success
	});
});

// ─── isGameOver predicate ─────────────────────────────────────────────────────

function isGameOver(status: GameStatus): boolean {
	return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

describe('isGameOver predicate', () => {
	test('returns true for checkmate', () => {
		expect(isGameOver('checkmate')).toBe(true);
	});

	test('returns true for stalemate', () => {
		expect(isGameOver('stalemate')).toBe(true);
	});

	test('returns true for draw', () => {
		expect(isGameOver('draw')).toBe(true);
	});

	test('returns false for playing', () => {
		expect(isGameOver('playing')).toBe(false);
	});

	test('returns false for check', () => {
		expect(isGameOver('check')).toBe(false);
	});
});

// ─── Save preconditions ───────────────────────────────────────────────────────
// Mirrors the early-return guards in savePlayHistory()

interface SaveGuardOptions {
	isAuthenticated: boolean;
	aiPlayer: string | null | undefined;
	aiEnabled: boolean;
	savedRef: boolean;
}

function shouldProceedWithSave(opts: SaveGuardOptions): boolean {
	if (!opts.isAuthenticated) return false;
	if (!opts.aiPlayer) return false;
	if (!opts.aiEnabled) return false;
	if (opts.savedRef) return false;
	return true;
}

describe('save preconditions', () => {
	const base: SaveGuardOptions = {
		isAuthenticated: true,
		aiPlayer: 'black',
		aiEnabled: true,
		savedRef: false,
	};

	test('allows save when all preconditions met', () => {
		expect(shouldProceedWithSave(base)).toBe(true);
	});

	test('blocks save when user is not authenticated', () => {
		expect(shouldProceedWithSave({ ...base, isAuthenticated: false })).toBe(
			false
		);
	});

	test('blocks save when aiPlayer is null', () => {
		expect(shouldProceedWithSave({ ...base, aiPlayer: null })).toBe(false);
	});

	test('blocks save when aiPlayer is undefined', () => {
		expect(shouldProceedWithSave({ ...base, aiPlayer: undefined })).toBe(false);
	});

	test('blocks save when AI is disabled', () => {
		expect(shouldProceedWithSave({ ...base, aiEnabled: false })).toBe(false);
	});

	test('blocks save when already saved', () => {
		expect(shouldProceedWithSave({ ...base, savedRef: true })).toBe(false);
	});

	test('blocks save when aiPlayer is empty string', () => {
		expect(shouldProceedWithSave({ ...base, aiPlayer: '' })).toBe(false);
	});
});

// ─── GameVariant type validation ──────────────────────────────────────────────

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
