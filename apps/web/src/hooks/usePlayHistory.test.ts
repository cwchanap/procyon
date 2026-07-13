import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
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

	test('keeps savedRef true on 5xx failure to prevent duplicate retries', () => {
		let savedRef = false;

		const trySave = (status: number) => {
			if (savedRef) return;
			savedRef = true; // optimistic set before fetch
			// 5xx: keep savedRef=true — the transaction may have committed,
			// retrying would insert a duplicate. Only 401 clears savedRef.
			if (status === 401) {
				savedRef = false;
			}
		};

		trySave(500);
		expect(savedRef).toBe(true); // no retry on 5xx

		savedRef = false;
		trySave(401);
		expect(savedRef).toBe(false); // 401 allows auth-recovery retry

		trySave(200);
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
	debugVariantKey?: string;
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
	// Captured in beforeEach so afterEach can restore setTimeout/clearTimeout
	// unconditionally — even when a test's assertions fail before its inline
	// restoration runs, leaving the mock in place for subsequent tests.
	let originalSetTimeout: typeof globalThis.setTimeout;
	let originalClearTimeout: typeof globalThis.clearTimeout;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		fetchCallCount = 0;
		fetchShouldSucceed = true;
		fetchFailStatus = 500;
		unmountHook = undefined;
		originalSetTimeout = globalThis.setTimeout;
		originalClearTimeout = globalThis.clearTimeout;

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
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
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

	test('5xx response does not retry — only one fetch call', async () => {
		fetchShouldSucceed = false; // all /play-history responses are 500

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		// Initial save attempt fires and gets 5xx.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Wait beyond any potential retry window — 5xx must not retry
		// because the POST is non-idempotent (the transaction may have
		// committed before the 5xx was returned).
		await act(async () => {
			await new Promise(r => setTimeout(r, 300));
		});
		expect(fetchCallCount).toBe(1);
	});

	test('new game gets exactly one save attempt after prior game 5xx', async () => {
		fetchShouldSucceed = false; // all /play-history responses are 500

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
		});
		unmountHook = unmount;

		// Game A: one save attempt (5xx, no retry).
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// New game starts — savedRef resets.
		rerender(makeProps({ gameStatus: 'playing', moveCount: 0 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		// Game B ends — one save attempt (5xx, no retry).
		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);

		// Wait to ensure no further retries fire for either game.
		await act(async () => {
			await new Promise(r => setTimeout(r, 300));
		});
		expect(fetchCallCount).toBe(2);
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
		// Game B's save) — the 5xx path keeps savedRef=true and does not
		// retry, so the stale resolution is a no-op.
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
		// savedRef.
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
	// side, provider, or model, the single save attempt must use the
	// snapshotted result/opponentLlmId from game-over. Since 5xx no longer
	// retries, this verifies the first (and only) attempt captures the
	// correct values and dep changes don't trigger a second fetch.
	test('5xx save uses snapshotted result; dep changes do not re-fire', async () => {
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

		// Wait for the first (and only) save attempt (5xx).
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]!.status).toBe('win');
		expect(capturedBodies[0]!.opponentLlmId).toBe('gemini-2.5-flash');

		// Now change the provider and AI side. savedRef is true (set
		// optimistically before the fetch), so the effect guard blocks
		// re-fires — no second fetch should occur.
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiPlayer: 'white',
				aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o' },
				getWinnerColor: () => 'white',
			})
		);

		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// Only one fetch — the 5xx did not retry and dep changes did not
		// re-fire (savedRef=true blocks the effect guard).
		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toHaveLength(1);
	});

	// [P2] After a 5xx, savedRef stays true, so rapid dependency changes
	// (provider, model, AI side) must not trigger additional fetches.
	// The effect guard checks !savedRef.current, which blocks all re-runs.
	test('5xx failure blocks re-fires from rapid dependency changes', async () => {
		fetchShouldSucceed = false; // all /play-history responses are 5xx

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				aiConfig: { ...testAIConfig, provider: 'gemini' },
			}),
		});
		unmountHook = unmount;

		// Wait for the first save attempt (5xx) to fire.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Rapidly change the provider multiple times. Each change rebuilds
		// savePlayHistory (new identity) and reruns the effect, but
		// savedRef=true blocks the guard — no new fetches should fire.
		for (let i = 0; i < 5; i++) {
			rerender(
				makeProps({
					gameStatus: 'checkmate',
					moveCount: 10,
					aiConfig: {
						...testAIConfig,
						provider: i % 2 === 0 ? 'openai' : 'gemini',
					},
				})
			);
			await act(async () => {
				await new Promise(r => setTimeout(r, 0));
			});
		}

		// Wait beyond any potential retry window.
		await act(async () => {
			await new Promise(r => setTimeout(r, 300));
		});

		// Only the initial attempt — no retries, no dep-change re-fires.
		expect(fetchCallCount).toBe(1);
	});

	// [P2] When the play-history POST returns 401 (e.g. session cookie
	// expired as the game ended), savedRef must be cleared so that if the
	// user reauthenticates while the terminal game is still mounted, the
	// auth change reruns the effect and the save fires again. Without the
	// fix, savedRef stays true and the guard suppresses the retry, so no
	// history or rating row is recorded.
	test('401 clears savedRef so save retries after auth recovery', async () => {
		// First fetch returns 401 (auth expired), second returns 200.
		let fetchCallIdx = 0;
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				fetchCallIdx++;
				if (fetchCallIdx === 1) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
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
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// First save attempt fires — gets 401.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// Wait to ensure no delayed retry fires within this window
		// (RETRY_401_DELAY_MS is 5s, well beyond 100ms).
		await act(async () => {
			await new Promise(r => setTimeout(r, 100));
		});
		expect(fetchCallCount).toBe(1);

		// User reauthenticates — isAuthenticated goes false then true.
		// The false→true transition gives savePlayHistory a new identity,
		// rerunning the effect. With savedRef cleared, the guard passes
		// and the save fires again.
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: false,
			})
		);
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			})
		);

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		// Second save attempt fires after auth recovery — gets 200.
		expect(fetchCallCount).toBe(2);
	});

	// [P2] When a 401 response occurs and isAuthenticated stays true (the
	// client doesn't know the cookie expired), clearing savedRef alone
	// doesn't trigger a re-render or effect re-run. The hook must schedule
	// a state-based retry that forces the effect to re-fire.
	test('401 schedules delayed retry that fires even when isAuthenticated stays true', async () => {
		let fetchCallIdx = 0;
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				fetchCallIdx++;
				if (fetchCallIdx === 1) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
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
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		// Capture long-delay setTimeout callbacks (the 401 retry) so we
		// can fire them without waiting 5 seconds.
		let retryCallback: (() => void) | null = null;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				retryCallback = fn;
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// First save attempt fires — gets 401.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);

		// The 401 should have scheduled a delayed retry.
		expect(retryCallback).not.toBeNull();

		// Fire the retry callback to simulate the delay elapsing.
		// isAuthenticated is still true (no auth state change), but the
		// retryTrigger state bump forces a re-render and effect re-run.
		await act(async () => {
			retryCallback!();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);
	});

	// [P2] The 401 retry count is bounded by MAX_401_RETRIES to avoid
	// hammering the server when the session is truly expired.
	test('401 retry count is bounded — stops after MAX_401_RETRIES attempts', async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
					json: () => Promise.resolve({}),
				}) as unknown as Response;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		// Fire long-delay timers immediately to simulate all retries.
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				fn();
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		const { unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// Wait for all retries to fire (initial + MAX_401_RETRIES).
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// 1 initial attempt + 3 retries = 4 total fetch calls.
		expect(fetchCallCount).toBe(4);

		// Wait more to ensure no further retries fire.
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(4);
	});

	// [P2] The 401 retry count resets when a new game starts, so a
	// subsequent game gets a full retry budget.
	test('401 retry count resets when a new game starts', async () => {
		let fetchCallIdx = 0;
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				fetchCallIdx++;
				// Game A: all 401. Game B: first attempt 200.
				if (fetchCallIdx <= 4) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
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
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				fn();
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// Game A: 1 initial + 3 retries = 4 fetch calls (all 401).
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(4);

		// New game starts — retry count resets.
		rerender(makeProps({ gameStatus: 'playing', moveCount: 0 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		// Game B ends — save fires (200 this time).
		rerender(makeProps({ gameStatus: 'checkmate', moveCount: 10 }));
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// 4 from Game A + 1 from Game B = 5 total.
		expect(fetchCallCount).toBe(5);
	});

	// [P2] After the 401 retry budget is exhausted, a provider/model dep
	// change must NOT bypass the retry bound. Previously the budget was
	// checked only when scheduling the retry timer, so changing the AI
	// config (which recreates savePlayHistory and reruns the effect) would
	// fire an unbounded stream of POSTs — one per dep change — even though
	// no more timers were scheduled.
	test('provider/model change after 401 budget exhaustion does not bypass retry bound', async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
					json: () => Promise.resolve({}),
				}) as unknown as Response;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		// Fire long-delay timers immediately to exhaust the budget.
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				fn();
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// 1 initial + 3 retries = 4 fetch calls (all 401, budget exhausted).
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(4);

		// Change provider — recreates savePlayHistory, reruns the effect.
		// The save-entry guard must block this since the budget is exhausted.
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
				aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o' },
			})
		);
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});

		// No additional fetch — the guard prevented the bypass.
		expect(fetchCallCount).toBe(4);

		// Change model too — same expectation.
		rerender(
			makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
				aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o-mini' },
			})
		);
		await act(async () => {
			await new Promise(r => setTimeout(r, 50));
		});
		expect(fetchCallCount).toBe(4);
	});

	// [P2] A provider/model dep change during the 401 retry window must
	// not cause the total fetch count to exceed the retry budget. The
	// pending retry timer is cancelled before scheduling a new one, and
	// the save-entry guard caps the total at 1 + MAX_401_RETRIES.
	test('provider/model change during 401 retry window stays within budget', async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
					json: () => Promise.resolve({}),
				}) as unknown as Response;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		// Capture retry callbacks so we can fire them in controlled order.
		const retryCallbacks: Array<() => void> = [];
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				retryCallbacks.push(fn);
				return 0 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// Save 1 (initial) — gets 401, captures retry callback 0.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
		expect(retryCallbacks).toHaveLength(1);

		// Change provider — dep change reruns effect, fires save 2.
		// Save 2 gets 401, clears the old timer, captures callback 1.
		await act(async () => {
			rerender(
				makeProps({
					gameStatus: 'checkmate',
					moveCount: 10,
					isAuthenticated: true,
					aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o' },
				})
			);
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);
		expect(retryCallbacks).toHaveLength(2);

		// Fire callback 1 (from save 2) — save 3 gets 401, captures callback 2.
		await act(async () => {
			retryCallbacks[1]!();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(3);

		// Fire callback 2 (from save 3) — save 4 gets 401, no more callbacks.
		await act(async () => {
			retryCallbacks[2]!();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(4);

		// Fire the orphaned callback 0 (from save 1, should have been cleared).
		// Even if it fires, the save-entry guard blocks since count > MAX.
		await act(async () => {
			retryCallbacks[0]!();
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(4);
	});

	// Draw/stalemate status: the hook's snapshot block must record 'draw'
	// for both stalemate and draw statuses (not just checkmate). The
	// existing tests only exercise 'checkmate'; this covers the
	// gameStatus === 'draw' || gameStatus === 'stalemate' branch.
	test('save uses status "draw" for draw game status', async () => {
		const capturedBodies: Array<{ status: string }> = [];

		globalThis.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input.toString();
				if (url.includes('/play-history') && init?.body) {
					capturedBodies.push(JSON.parse(init.body as string));
				}
				if (url.includes('/play-history')) {
					fetchCallCount++;
					return Promise.resolve({
						ok: true,
						status: 200,
						statusText: 'OK',
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

		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'draw', moveCount: 10 }),
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]!.status).toBe('draw');
	});

	test('save uses status "draw" for stalemate game status', async () => {
		const capturedBodies: Array<{ status: string }> = [];

		globalThis.fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input.toString();
				if (url.includes('/play-history') && init?.body) {
					capturedBodies.push(JSON.parse(init.body as string));
				}
				if (url.includes('/play-history')) {
					fetchCallCount++;
					return Promise.resolve({
						ok: true,
						status: 200,
						statusText: 'OK',
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

		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({ gameStatus: 'stalemate', moveCount: 10 }),
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]!.status).toBe('draw');
	});

	// Debug counter: when debugVariantKey is set, the hook bumps
	// window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. This
	// covers the isFirstAttempt + debugVariantKey block.
	test('debugVariantKey bumps window debug save counter on first attempt', async () => {
		const w = window as unknown as Record<string, number | undefined>;
		const key = '__PROCYON_DEBUG_TESTVARIANT_SAVE_COUNT__';
		delete w[key];

		renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				debugVariantKey: 'TESTVARIANT',
			}),
		});

		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});

		expect(w[key]).toBe(1);
		delete w[key];
	});

	// DEV-only console.warn: when import.meta.env.DEV is true and the
	// save response is not ok, the hook logs a warning. This covers the
	// DEV-gated console.warn block (lines 181-183).
	test('DEV mode logs console.warn on non-ok save response', async () => {
		fetchShouldSucceed = false;
		fetchFailStatus = 500;

		const originalDev = import.meta.env.DEV;
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		import.meta.env.DEV = true;
		console.warn = (...args: unknown[]) => {
			warnCalls.push(args.join(' '));
		};

		try {
			const { unmount } = renderHook(props => usePlayHistory(props), {
				initialProps: makeProps({ gameStatus: 'checkmate', moveCount: 10 }),
			});
			unmountHook = unmount;

			await act(async () => {
				await new Promise(r => setTimeout(r, 0));
			});

			expect(fetchCallCount).toBe(1);
			expect(
				warnCalls.some(s => s.includes('Play-history save failed: 500'))
			).toBe(true);
		} finally {
			import.meta.env.DEV = originalDev;
			console.warn = originalWarn;
		}
	});

	// 401 retry timer cancellation: when a 401 schedules a retry timer
	// and a dep change triggers a second save that also gets 401, the
	// pending timer must be cleared before scheduling a new one. The
	// existing tests use setTimeout mocks that return 0 (falsy), so
	// retryTimerRef.current is never truthy and the clearTimeout branch
	// is skipped. This test returns a truthy timer ID to exercise the
	// clearTimeout path.
	test('401 retry clears pending timer before scheduling a new one', async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
					json: () => Promise.resolve({}),
				}) as unknown as Response;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Response;
		}) as unknown as typeof fetch;

		let timerIdCounter = 1;
		const clearedTimerIds: number[] = [];
		const retryCallbacks: Array<() => void> = [];

		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay && delay >= 1000) {
				retryCallbacks.push(fn);
				return timerIdCounter++ as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof globalThis.setTimeout;

		globalThis.clearTimeout = mock((id: ReturnType<typeof setTimeout>) => {
			const num = id as unknown as number;
			if (typeof num === 'number') {
				clearedTimerIds.push(num);
			}
			return originalClearTimeout(id);
		}) as unknown as typeof globalThis.clearTimeout;

		const { rerender, unmount } = renderHook(props => usePlayHistory(props), {
			initialProps: makeProps({
				gameStatus: 'checkmate',
				moveCount: 10,
				isAuthenticated: true,
			}),
		});
		unmountHook = unmount;

		// First save gets 401, schedules retry timer with ID 1.
		await act(async () => {
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(1);
		expect(retryCallbacks).toHaveLength(1);

		// Dep change (provider) triggers second save, also gets 401.
		// The pending timer (ID 1) must be cleared before scheduling
		// the new timer (ID 2).
		await act(async () => {
			rerender(
				makeProps({
					gameStatus: 'checkmate',
					moveCount: 10,
					isAuthenticated: true,
					aiConfig: { ...testAIConfig, provider: 'openai', model: 'gpt-4o' },
				})
			);
			await new Promise(r => setTimeout(r, 0));
		});
		expect(fetchCallCount).toBe(2);
		expect(retryCallbacks).toHaveLength(2);

		// The first timer (ID 1) must have been cleared.
		expect(clearedTimerIds).toContain(1);
	});
});
