import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { GameVariant } from '../lib/ai/game-variant-types';
import type { AIConfig } from '../lib/ai/types';
import { resolveOpponentLlmId } from '../lib/ai/opponent-llm';
import { setupReactDom } from '../test/reactSetup';
import { usePlayHistory } from './usePlayHistory';

setupReactDom();

// ─── Opponent LLM ID mapping logic ───────────────────────────────────────────
// Imported from the shared helper (formerly mirrored here).

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

// ─── Game result determination logic ─────────────────────────────────────────
// Mirrors the result determination inside savePlayHistory()

type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

function determineResult(
	gameStatus: GameStatus,
	aiPlayer: string,
	getWinnerColor: () => string
): 'win' | 'loss' | 'draw' | null {
	const isGameOver =
		gameStatus === 'checkmate' ||
		gameStatus === 'stalemate' ||
		gameStatus === 'draw';

	if (!isGameOver) return null;

	if (gameStatus === 'draw' || gameStatus === 'stalemate') {
		return 'draw';
	}

	// checkmate — winner is the side opposite the checkmated player.
	// All four game variants pass a non-null color (the hook's contract is
	// `() => string`, not `() => string | null`), so no null-guard here.
	const winnerColor = getWinnerColor();

	if (winnerColor === aiPlayer) {
		return 'loss'; // AI won, player lost
	}
	return 'win'; // Player won
}

describe('game result determination logic', () => {
	test('returns null when game is still playing', () => {
		expect(determineResult('playing', 'black', () => 'white')).toBeNull();
	});

	test('returns null when game is in check', () => {
		expect(determineResult('check', 'black', () => 'white')).toBeNull();
	});

	test('returns draw for draw status', () => {
		expect(determineResult('draw', 'black', () => 'white')).toBe('draw');
	});

	test('returns draw for stalemate status', () => {
		expect(determineResult('stalemate', 'black', () => 'white')).toBe('draw');
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

// ─── Retry trigger bound ──────────────────────────────────────────────────────
// Mirrors the retryTrigger state + MAX_SAVE_ATTEMPTS guard in usePlayHistory:
// a failed save increments the trigger up to the bound, then retries stop.

const MAX_SAVE_ATTEMPTS = 3;

describe('retry trigger bound', () => {
	test('increments retry trigger on each failure up to MAX_SAVE_ATTEMPTS', () => {
		let retryTrigger = 0;
		const onFailure = () => {
			retryTrigger =
				retryTrigger < MAX_SAVE_ATTEMPTS ? retryTrigger + 1 : retryTrigger;
		};

		onFailure();
		expect(retryTrigger).toBe(1);
		onFailure();
		expect(retryTrigger).toBe(2);
		onFailure();
		expect(retryTrigger).toBe(3);
		// Bound reached — further failures do not increment.
		onFailure();
		expect(retryTrigger).toBe(3);
	});

	test('effect re-runs only while retryTrigger is below the bound', () => {
		let retryTrigger = 0;
		let saveCalls = 0;
		const isGameOver = true;
		const savedRef = () => false; // never saved (always failing)

		const runEffect = () => {
			if (isGameOver && !savedRef() && retryTrigger < MAX_SAVE_ATTEMPTS) {
				saveCalls++;
			}
		};
		const onFailure = () => {
			retryTrigger =
				retryTrigger < MAX_SAVE_ATTEMPTS ? retryTrigger + 1 : retryTrigger;
		};

		// Initial attempt at retryTrigger=0, plus retries at 1 and 2 = 3
		// total save attempts; at retryTrigger=3 the guard blocks further runs.
		runEffect(); // attempt 1 (retryTrigger=0)
		onFailure(); // retryTrigger=1
		runEffect(); // attempt 2 (retryTrigger=1)
		onFailure(); // retryTrigger=2
		runEffect(); // attempt 3 (retryTrigger=2)
		onFailure(); // retryTrigger=3
		runEffect(); // guard blocks (3 not < 3)
		runEffect();

		expect(saveCalls).toBe(3);
		expect(retryTrigger).toBe(3);
	});

	test('resets retry trigger to 0 when a new game starts', () => {
		let retryTrigger = 2;
		const resetOnNewGame = (gameStatus: GameStatus, moveCount: number) => {
			if (gameStatus === 'playing' && moveCount === 0) {
				retryTrigger = 0;
			}
		};

		resetOnNewGame('playing', 0);
		expect(retryTrigger).toBe(0);
	});

	test('does not reset retry trigger mid-game', () => {
		let retryTrigger = 2;
		const resetOnNewGame = (gameStatus: GameStatus, moveCount: number) => {
			if (gameStatus === 'playing' && moveCount === 0) {
				retryTrigger = 0;
			}
		};

		resetOnNewGame('playing', 5);
		expect(retryTrigger).toBe(2);
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

// ─── React integration tests (renderHook) ────────────────────────────────────
// Exercises the real hook with @testing-library/react's renderHook to verify
// the auto-save useEffect, savedRef dedup/reset, and bounded retry behavior.
// Auth state is passed directly via the `isAuthenticated` prop (the hook no
// longer calls useAuth() internally, so no window.__PROCYON_INITIAL_AUTH_USER__
// setup is needed).

const testAIConfig: AIConfig = {
	provider: 'gemini',
	apiKey: 'test-key',
	model: 'gemini-2.5-flash-lite',
	enabled: true,
};

const stableGetWinnerColor = () => 'white';

interface HookProps {
	gameVariant: GameVariant;
	gameStatus: GameStatus;
	aiPlayer: string | null;
	aiConfig: AIConfig;
	moveCount: number;
	getWinnerColor: () => string;
	enabled: boolean;
	isAuthenticated: boolean;
}

function makeProps(overrides: Partial<HookProps> = {}): HookProps {
	return {
		gameVariant: 'chess',
		gameStatus: 'playing',
		aiPlayer: 'black',
		aiConfig: testAIConfig,
		moveCount: 0,
		getWinnerColor: stableGetWinnerColor,
		enabled: true,
		isAuthenticated: true,
		...overrides,
	};
}

describe('usePlayHistory — React integration (renderHook)', () => {
	let originalFetch: typeof globalThis.fetch;
	let fetchCallCount: number;
	let fetchShouldSucceed: boolean;
	// When set, overrides the default 500 status for failed responses so
	// tests can exercise 4xx no-retry behavior.
	let fetchFailStatus: number;
	// Captured from renderHook so afterEach can unmount and
	// clear any pending retry timers between tests.
	let unmountHook: (() => void) | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		fetchCallCount = 0;
		fetchShouldSucceed = true;
		fetchFailStatus = 500;
		unmountHook = undefined;

		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
			}
			return Promise.resolve({
				ok: fetchShouldSucceed,
				status: fetchShouldSucceed ? 200 : fetchFailStatus,
				statusText: fetchShouldSucceed ? 'OK' : 'Error',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		unmountHook?.();
		globalThis.fetch = originalFetch;
	});

	test('auto-save fires when game ends', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'playing', moveCount: 0 }),
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(0);

		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
	});

	test('savedRef prevents duplicate saves on re-render with same props', async () => {
		const props = makeProps({ gameStatus: 'checkmate', moveCount: 10 });
		const { rerender } = renderHook(p => usePlayHistory(p), {
			initialProps: props,
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		rerender(props);
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
	});

	test('savedRef resets when a new game starts', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		rerender(makeProps({ gameStatus: 'playing', moveCount: 0 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);
	});

	test('retry re-fires on fetch failure up to MAX_SAVE_ATTEMPTS', async () => {
		fetchShouldSucceed = false;

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		await waitFor(() => {
			expect(fetchCallCount).toBe(3);
		});
	});

	test('retry stops at MAX_SAVE_ATTEMPTS and does not exceed it', async () => {
		fetchShouldSucceed = false;

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		await waitFor(() => {
			expect(fetchCallCount).toBe(3);
		});

		// Wait a bit more to ensure no further retries fire
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(3);
	});

	test('retry trigger resets when a new game starts', async () => {
		fetchShouldSucceed = false;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		await waitFor(() => {
			expect(fetchCallCount).toBe(3);
		});

		rerender(makeProps({ gameStatus: 'playing', moveCount: 0 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));

		await waitFor(() => {
			expect(fetchCallCount).toBe(6);
		});
	});

	test('does not save when enabled is false', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'playing', enabled: false }),
		});

		rerender(makeProps({ gameStatus: 'checkmate', enabled: false }));

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(0);
	});

	test('does not save when aiPlayer is null', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'playing', aiPlayer: null }),
		});

		rerender(makeProps({ gameStatus: 'checkmate', aiPlayer: null }));

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(0);
	});

	test('does not save when isAuthenticated is false', async () => {
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'playing',
				isAuthenticated: false,
			}),
		});

		rerender(makeProps({ gameStatus: 'checkmate', isAuthenticated: false }));

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(0);
	});

	test('fetch rejection does not retry — only one fetch call', async () => {
		// Replace the default fetch mock with one that rejects (network error)
		// so we can verify the catch block suppresses retries.
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
			}
			return Promise.reject(new Error('Network error'));
		}) as unknown as typeof fetch;

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		// Wait for the initial save attempt to fire and reject.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Wait beyond the retry window to ensure no retries fire (network
		// errors are not retried to avoid duplicate play-history rows).
		await act(async () => {
			await new Promise(r => setTimeout(r, 300));
		});
		expect(fetchCallCount).toBe(1);
	});

	test('4xx response does not retry — only one fetch call', async () => {
		fetchShouldSucceed = false;
		fetchFailStatus = 401;

		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});

		// Wait for the initial save attempt to fire.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Wait longer to ensure no retries fire.
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(1);
	});

	test('stale 5xx from prior game does not clobber new game save', async () => {
		// Scenario: Game A's save gets a 5xx (held pending), then the user
		// resets and finishes Game B (which saves successfully). When Game
		// A's stale 5xx resolves, it must NOT set savedRef=false (clobbering
		// Game B's save), increment attemptsRef, or schedule a retry —
		// otherwise the retry submits an overlapping duplicate record.
		let resolveGameAFetch: (v: unknown) => void = () => {};
		const gameAFetchPending = new Promise(r => {
			resolveGameAFetch = r;
		});

		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				// First call (Game A): hold pending with a 5xx response.
				// Second call (Game B): resolve immediately with 200.
				if (fetchCallCount === 1) {
					return gameAFetchPending.then(() => ({
						ok: false,
						status: 500,
						statusText: 'Internal Server Error',
						json: () => Promise.resolve({}),
					})) as unknown as Promise<Response>;
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					statusText: 'OK',
					json: () => Promise.resolve({}),
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;

		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});

		// Game A's save fires (fetchCallCount=1), held pending.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Reset: new game starts. This bumps gameGenerationRef and clears
		// savedRef/attemptsRef.
		rerender(makeProps({ gameStatus: 'playing', moveCount: 0 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		// Game B ends — save fires (fetchCallCount=2), succeeds immediately.
		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);

		// Now release Game A's stale 5xx response.
		resolveGameAFetch(undefined);
		// Wait for the stale 5xx to resolve and any potential side effects.
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// The stale 5xx must NOT have triggered a retry for Game B.
		// fetchCallCount should still be 2 (Game A + Game B), not 3+.
		expect(fetchCallCount).toBe(2);
	});

	// [P2] When a terminal save gets a 5xx and the player changes the AI
	// side, provider, or model before the backoff fires, the retry must
	// use the snapshotted result/opponentLlmId from game-over — not the
	// new settings. Otherwise the same completed game can be recorded
	// with the opposite win/loss or a different opponentLlmId.
	test('retry uses snapshotted result/opponentLlmId across provider change', async () => {
		// Capture the request bodies so we can verify the snapshot.
		const capturedBodies: Array<{
			chessId: string;
			status: string;
			opponentLlmId: string;
		}> = [];

		globalThis.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input.toString();
				if (url.includes('/play-history') && init?.body) {
					capturedBodies.push(JSON.parse(init.body as string));
				}
				if (url.includes('/play-history')) {
					fetchCallCount++;
					return Promise.resolve({
						ok: false,
						status: 500,
						statusText: 'Internal Server Error',
						json: () => Promise.resolve({}),
					}) as unknown as Response;
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					statusText: 'OK',
					json: () => Promise.resolve({}),
				}) as unknown as Response;
			}
		) as unknown as typeof fetch;

		// Start with gemini provider, AI plays black, white wins → player wins.
		const { rerender } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: 'black',
				aiConfig: {
					...testAIConfig,
					provider: 'gemini',
					model: 'gemini-2.5-flash',
				},
				getWinnerColor: () => 'white',
			}),
		});

		// Wait for the first save attempt (5xx).
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]!.status).toBe('win');
		expect(capturedBodies[0]!.opponentLlmId).toBe('gemini-2.5-flash');

		// Now change the provider and AI side before the backoff fires.
		// If the retry used the new settings, the result would flip to
		// 'loss' (aiPlayer='white', winnerColor='white' → AI wins) and
		// opponentLlmId would become 'gpt-4o'.
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: 'white',
				aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o' },
				getWinnerColor: () => 'white',
			})
		);

		// Wait for the retry to fire (deps change triggers immediate re-run).
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// The retry must use the snapshotted values: status='win',
		// opponentLlmId='gemini-2.5-flash' — NOT 'loss'/'gpt-4o'.
		expect(capturedBodies.length).toBeGreaterThan(1);
		for (const body of capturedBodies) {
			expect(body.status).toBe('win');
			expect(body.opponentLlmId).toBe('gemini-2.5-flash');
		}
	});
});
