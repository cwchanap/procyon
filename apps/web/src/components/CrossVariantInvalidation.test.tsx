import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import ChessGame from './ChessGame';
import XiangqiGame from './XiangqiGame';
import ShogiGame from './ShogiGame';
import JungleGame from './JungleGame';
import { AUTH_CHANGE_EVENT } from '../lib/auth';
import { resetAIConfigStore, setConfig } from '../lib/ai/ai-config-store';

setupReactDom();

// Same auth/fetch strategy as ChessGame.test.tsx: do NOT mock.module auth
// (global leak across files). Drive identity via __PROCYON_INITIAL_AUTH_USER__
// and AUTH_CHANGE_EVENT. Default AI side is the second player for every
// variant, so the AI-turn effect never fires unless tests flip the select.

type GameCase = {
	name: string;
	Component: React.FC;
	selectId: string;
	/** First-moving color; used only when a test wants AI-on-turn semantics. */
	firstPlayerValue: string;
};

const GAMES: GameCase[] = [
	{
		name: 'XiangqiGame',
		Component: XiangqiGame,
		selectId: 'xiangqi-ai-side',
		firstPlayerValue: 'red',
	},
	{
		name: 'ShogiGame',
		Component: ShogiGame,
		selectId: 'shogi-ai-side',
		firstPlayerValue: 'sente',
	},
	{
		name: 'JungleGame',
		Component: JungleGame,
		selectId: 'jungle-ai-side',
		firstPlayerValue: 'red',
	},
];

/** Install fetch + global localStorage stubs so AI config hydrate can finish. */
function withHydrationEnv(run: () => Promise<void>): Promise<void> {
	const originalFetch = globalThis.fetch;
	const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
		globalThis,
		'localStorage'
	);
	(globalThis as unknown as { fetch: unknown }).fetch = (() =>
		Promise.resolve({
			ok: true,
			json: () => Promise.resolve({ configurations: [] }),
		})) as unknown as typeof fetch;
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: window.localStorage,
	});

	return run().finally(() => {
		(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
		if (originalLocalStorageDesc) {
			Object.defineProperty(
				globalThis,
				'localStorage',
				originalLocalStorageDesc
			);
		} else {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});
}

function setInitialAuthUser(user: Record<string, string>) {
	(window as unknown as Record<string, unknown>).__PROCYON_INITIAL_AUTH_USER__ =
		user;
}

function clearInitialAuthUser() {
	delete (window as unknown as Record<string, unknown>)
		.__PROCYON_INITIAL_AUTH_USER__;
}

describe.each(GAMES)(
	'$name — identity / mode / reset invalidation',
	({ Component, selectId, firstPlayerValue }) => {
		beforeEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		afterEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		test('select becomes disabled once a game is started', async () => {
			const { getByLabelText, getByRole } = render(<Component />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			expect(select.id).toBe(selectId);
			expect(select.disabled).toBe(false);

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});
		});

		test('identity change mid-game re-enables AI-side select (clears started state)', async () => {
			setInitialAuthUser({
				id: 'user-a',
				email: 'a@test.com',
				username: 'userA',
			});

			await withHydrationEnv(async () => {
				const { getByLabelText, getByRole } = render(<Component />);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				const startButton = await waitFor(() =>
					getByRole('button', { name: /start/i })
				);
				fireEvent.click(startButton);

				await waitFor(() => {
					expect(select.disabled).toBe(true);
				});

				act(() => {
					globalThis.dispatchEvent(
						new CustomEvent(AUTH_CHANGE_EVENT, {
							detail: {
								user: {
									id: 'user-b',
									email: 'b@test.com',
									username: 'userB',
								},
							},
						})
					);
				});

				await waitFor(() => {
					expect(select.disabled).toBe(false);
				});
			});
		});

		test('logout mid-game re-enables AI-side select', async () => {
			setInitialAuthUser({
				id: 'user-a',
				email: 'a@test.com',
				username: 'userA',
			});

			await withHydrationEnv(async () => {
				const { getByLabelText, getByRole } = render(<Component />);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				const startButton = await waitFor(() =>
					getByRole('button', { name: /start/i })
				);
				fireEvent.click(startButton);

				await waitFor(() => {
					expect(select.disabled).toBe(true);
				});

				act(() => {
					globalThis.dispatchEvent(
						new CustomEvent(AUTH_CHANGE_EVENT, {
							detail: { user: null },
						})
					);
				});

				await waitFor(() => {
					expect(select.disabled).toBe(false);
				});
			});
		});

		test('mode switch after start clears started state and re-enables select on return to AI', async () => {
			// Flip AI to the first-moving side so the AI-turn effect schedules
			// (1s setTimeout) — mode switch must invalidate that in-flight gen
			// path without throwing and leave UI ready for a fresh game.
			const { getByLabelText, getByRole } = render(<Component />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			fireEvent.change(select, { target: { value: firstPlayerValue } });
			expect(select.value).toBe(firstPlayerValue);

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// Mode switch to Tutorial: invalidate() + gameStarted=false.
			const tutorialButton = getByRole('button', { name: /^tutorial$/i });
			fireEvent.click(tutorialButton);

			// AI-side select unmounts in tutorial mode.
			await waitFor(() => {
				expect(() => getByLabelText(/AI plays/i)).toThrow();
			});

			// Back to Play vs AI: select returns enabled (started cleared).
			const playVsAiButton = getByRole('button', { name: /play vs ai/i });
			fireEvent.click(playVsAiButton);

			const selectAgain = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;
			expect(selectAgain.disabled).toBe(false);

			// Starting a new AI turn after invalidate must not throw.
			const startAgain = getByRole('button', { name: /start/i });
			fireEvent.click(startAgain);
			await waitFor(() => {
				expect(selectAgain.disabled).toBe(true);
			});
		});

		test('New Game re-enables AI-side select (reset invalidation path)', async () => {
			const { getByLabelText, getByRole } = render(<Component />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// "New Game" is the same Start/Reset control once hasGameStarted.
			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			await waitFor(() => {
				expect(select.disabled).toBe(false);
			});

			// Fresh start after reset still works.
			const startAgain = getByRole('button', { name: /start/i });
			fireEvent.click(startAgain);
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});
		});
	}
);

// Direct verification that a late makeAIMove callback is dropped after
// invalidate. The parameterized tests above prove invalidate fires on
// mode-switch/reset and the UI recovers, but the AI-turn setTimeout is
// cleared before it fires in those tests, so the stale-gen bail path in
// makeAIMove is never actually exercised. Here we hold the LLM fetch
// in-flight across the invalidate boundary so makeAIMove reaches its
// `if (gen !== genRef.current) return` check with a stale gen, then
// assert no move was applied and no error surfaced. Xiangqi stands in
// for all variants — the gen-check pattern is shared (useAiMoveGenerationToken).
//
// Two bail paths exist in makeAIMove: the catch path (reached when the rule
// guardian rejects the move) and the success path (reached when makeMove
// returns a valid move, before setGameState). The first test forces an invalid
// move to cover the catch path; the second resolves a VALID move so makeMove
// returns and the success-path `if (isStale(gen)) return` is exercised.

function setupControllableLLMMock() {
	const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
		globalThis,
		'localStorage'
	);
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: window.localStorage,
	});

	let resolveLLM!: (value: string) => void;
	const llmPromise = new Promise<string>(r => {
		resolveLLM = r;
	});
	let llmFetchCalled = false;
	const originalFetch = globalThis.fetch;

	(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
		if (url.includes('/auth/session')) {
			return Promise.resolve({
				ok: false,
				status: 401,
				json: () => Promise.resolve({}),
			});
		}
		// LLM call (gemini) — held in-flight so invalidate can race it.
		llmFetchCalled = true;
		return llmPromise.then(text => ({
			ok: true,
			status: 200,
			json: () =>
				Promise.resolve({
					candidates: [
						{ content: { parts: [{ text }] }, finishReason: 'STOP' },
					],
				}),
		}));
	}) as unknown as typeof fetch;

	return {
		get llmFetchCalled() {
			return llmFetchCalled;
		},
		resolveLLM,
		restore() {
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			if (originalLocalStorageDesc) {
				Object.defineProperty(
					globalThis,
					'localStorage',
					originalLocalStorageDesc
				);
			} else {
				delete (globalThis as Record<string, unknown>).localStorage;
			}
		},
	};
}

describe('XiangqiGame — late AI callback dropped after invalidate', () => {
	beforeEach(() => {
		clearInitialAuthUser();
		resetAIConfigStore();
	});

	afterEach(() => {
		clearInitialAuthUser();
		resetAIConfigStore();
	});

	test('in-flight makeAIMove bails on stale gen (no move, no error)', async () => {
		// setConfig → saveAIConfig touches localStorage, which only exists
		// on window in the test env — mirror withHydrationEnv's setup.
		const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
			globalThis,
			'localStorage'
		);
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: window.localStorage,
		});

		// Controllable LLM response so we can hold makeMove in-flight
		// across the invalidate boundary.
		let resolveLLM!: (value: string) => void;
		const llmPromise = new Promise<string>(r => {
			resolveLLM = r;
		});
		let llmFetchCalled = false;
		const originalFetch = globalThis.fetch;

		(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
			if (url.includes('/auth/session')) {
				return Promise.resolve({
					ok: false,
					status: 401,
					json: () => Promise.resolve({}),
				});
			}
			// LLM call (gemini) — hold in-flight so invalidate can race it.
			llmFetchCalled = true;
			return llmPromise.then(text => ({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						candidates: [
							{ content: { parts: [{ text }] }, finishReason: 'STOP' },
						],
					}),
			}));
		}) as unknown as typeof fetch;

		try {
			const { getByLabelText, getByRole, queryByRole, queryByText } = render(
				<XiangqiGame />
			);

			// Wait for the AI-side select to appear.
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			// The 401 from /auth/session triggers resetAIConfigStore()
			// (auth.ts:361-362), which wipes any config set before render.
			// Wait for that to settle, THEN enable the AI config so the
			// store update sticks. The service's updateConfig effect picks
			// up the new config on the next render.
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 150));
			});
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			// AI plays red (first-moving side) so the AI-turn effect fires
			// immediately on Start.
			fireEvent.change(select, { target: { value: 'red' } });

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			// Wait for the 1s setTimeout to fire and makeMove to reach the
			// LLM fetch — makeAIMove is now in-flight, past the effect
			// cleanup's clearTimeout.
			await waitFor(() => expect(llmFetchCalled).toBe(true), {
				timeout: 3000,
			});

			// New Game → handleResetGame calls invalidate (gen bumps),
			// setGameState(resetGame()), setGameStarted(false).
			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			// Resolve the in-flight LLM fetch. makeMove returns, but
			// makeAIMove's `if (gen !== genRef.current) return` bails
			// before setGameState / setErrorMsg.
			resolveLLM('{"move":{"from":"a0","to":"a0"},"thinking":"stale"}');

			// Let the promise microtask chain drain so the stale callback
			// settles (fetch .then → response.json → callLLM → makeMove →
			// gen check). 100ms is far more than the ~7 microtask hops.
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
			});

			// No error banner — the catch-block gen check also bailed.
			expect(queryByRole('alert')).toBeNull();

			// No move was applied: the Move History panel only renders when
			// moveHistory.length > 0. A stale callback that failed to bail
			// would have setGameState with a moved board (moveHistory 1).
			expect(queryByText(/Move History \(\d+\)/i)).toBeNull();
		} finally {
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			if (originalLocalStorageDesc) {
				Object.defineProperty(
					globalThis,
					'localStorage',
					originalLocalStorageDesc
				);
			} else {
				delete (globalThis as Record<string, unknown>).localStorage;
			}
		}
	});

	test('in-flight makeAIMove bails on stale gen via success path (valid move)', async () => {
		const env = setupControllableLLMMock();

		try {
			const { getByLabelText, getByRole, queryByRole, queryByText } = render(
				<XiangqiGame />
			);

			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			// The 401 from /auth/session triggers resetAIConfigStore()
			// (auth.ts:361-362), which wipes any config set before render.
			// Wait for that to settle, THEN enable the AI config.
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 150));
			});
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			// AI plays red (first-moving side) so the AI-turn effect fires
			// immediately on Start.
			fireEvent.change(select, { target: { value: 'red' } });

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			// Wait for makeMove to reach the LLM fetch (past the effect
			// cleanup's clearTimeout).
			await waitFor(() => expect(env.llmFetchCalled).toBe(true), {
				timeout: 3000,
			});

			// New Game → handleResetGame calls invalidate (gen bumps).
			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			// Valid opening move (red chariot a1→a2 clears the rule
			// guardian), so aiService.makeMove RETURNS instead of throwing.
			// makeAIMove then hits the success-path gen bail — the
			// `if (isStale(gen)) return` before setGameState — proving a
			// move that would otherwise be applied is dropped on stale gen.
			env.resolveLLM('{"move":{"from":"a1","to":"a2"},"thinking":"valid"}');

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
			});

			// No move applied and no error: the success-path bail returned
			// before setGameState, and the catch path was never entered.
			expect(queryByRole('alert')).toBeNull();
			expect(queryByText(/Move History \(\d+\)/i)).toBeNull();
		} finally {
			env.restore();
		}
	});
});

// Mode-switch late-callback coverage (plan §9.1b row "Mode switch (all
// four)"): the parameterized UI tests above prove mode-switch fires
// invalidate() and the UI recovers, but the AI-turn setTimeout is cleared
// before it fires — the stale-gen bail path in makeAIMove is never
// exercised. Here we hold the LLM fetch in-flight across the mode-switch
// (Tutorial button → toggleToMode → invalidate), then resolve with an
// invalid move so the catch-block gen check is reached with a stale gen.
//
// Chess/Xiangqi have an explicit `if (isStale(gen)) return` in the catch
// block, so the assertion (no 'AI move failed:' log, no error banner) is
// meaningful. Shogi/Jungle swallow catch errors unconditionally (pre-existing
// asymmetry — see review notes), so for those variants the test proves the
// in-flight LLM + mode-switch boundary works and no error surfaces, but does
// not distinguish gen-bail from swallow. The success-path gen bail for all
// variants is covered by the Xiangqi New Game tests above (same `if (isStale
// (gen)) return` code).

const LATE_CALLBACK_GAMES: GameCase[] = [
	{
		name: 'ChessGame',
		Component: ChessGame,
		selectId: 'chess-ai-side',
		firstPlayerValue: 'white',
	},
	{
		name: 'XiangqiGame',
		Component: XiangqiGame,
		selectId: 'xiangqi-ai-side',
		firstPlayerValue: 'red',
	},
	{
		name: 'ShogiGame',
		Component: ShogiGame,
		selectId: 'shogi-ai-side',
		firstPlayerValue: 'sente',
	},
	{
		name: 'JungleGame',
		Component: JungleGame,
		selectId: 'jungle-ai-side',
		firstPlayerValue: 'red',
	},
];

describe.each(LATE_CALLBACK_GAMES)(
	'$name — mode-switch late callback dropped after invalidate',
	({ Component, firstPlayerValue }) => {
		beforeEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		afterEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		test('in-flight makeAIMove bails on stale gen after mode switch (no error)', async () => {
			const env = setupControllableLLMMock();

			const originalError = console.error;
			const errorCalls: string[] = [];
			// eslint-disable-next-line no-console
			console.error = (...args: unknown[]) => {
				errorCalls.push(args.join(' '));
			};

			try {
				const { getByLabelText, getByRole, queryByRole } = render(
					<Component />
				);

				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				// The 401 from /auth/session triggers resetAIConfigStore(),
				// which wipes any config set before render. Wait for that to
				// settle, THEN enable the AI config so the store update sticks.
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 150));
				});
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				// AI plays the first-moving side so the AI-turn effect fires
				// immediately on Start.
				fireEvent.change(select, { target: { value: firstPlayerValue } });

				const startButton = getByRole('button', { name: /start/i });
				fireEvent.click(startButton);

				// Wait for the 1s setTimeout to fire and makeMove to reach the
				// LLM fetch — makeAIMove is now in-flight, past the effect
				// cleanup's clearTimeout.
				await waitFor(() => expect(env.llmFetchCalled).toBe(true), {
					timeout: 3000,
				});

				// Mode switch to Tutorial → toggleToMode calls invalidate()
				// (gen bumps), setGameMode('tutorial'), setGameStarted(false).
				const tutorialButton = getByRole('button', { name: /^tutorial$/i });
				fireEvent.click(tutorialButton);

				// Resolve the in-flight LLM fetch with an invalid move. The
				// rule guardian rejects it → makeMove throws → catch block.
				// For Chess/Xiangqi the catch block's `if (isStale(gen))
				// return` bails before console.error / setErrorMsg. For
				// Shogi/Jungle the catch swallows unconditionally.
				env.resolveLLM('{"move":{"from":"a0","to":"a0"},"thinking":"stale"}');

				// Let the promise microtask chain drain so the stale callback
				// settles.
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 100));
				});

				// No 'AI move failed:' logged — meaningful for Chess/Xiangqi
				// (catch bailed on stale gen); vacuously true for Shogi/Jungle
				// (catch swallows regardless).
				expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(false);

				// No error banner — meaningful for Xiangqi/Shogi/Jungle
				// (role='alert' errorBanner); vacuously true for Chess
				// (AIStatusPanel not rendered in tutorial mode).
				expect(queryByRole('alert')).toBeNull();

				// Mode-switch succeeded and wasn't corrupted by the stale
				// callback: the tutorial heading is visible.
				expect(
					getByRole('heading', { name: /Logic & Tutorials/i })
				).toBeTruthy();
			} finally {
				env.restore();
				// eslint-disable-next-line no-console
				console.error = originalError;
			}
		});
	}
);
