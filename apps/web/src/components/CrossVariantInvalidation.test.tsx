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

/** Drain microtasks so React effects and promise chains settle without wall-clock sleeps. */
async function drainMicrotasks(rounds = 30) {
	await act(async () => {
		for (let i = 0; i < rounds; i++) {
			await Promise.resolve();
		}
	});
}

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
	let sessionSettled = false;
	const originalFetch = globalThis.fetch;

	(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
		if (url.includes('/auth/session')) {
			return Promise.resolve({
				ok: false,
				status: 401,
				json: () => Promise.resolve({}),
			}).finally(() => {
				sessionSettled = true;
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
		async waitForAuthSettled() {
			// Allow mount effects to issue the session fetch, then wait for it
			// if present. Some renders may not hit /auth/session.
			await drainMicrotasks(20);
			try {
				await waitFor(() => expect(sessionSettled).toBe(true), {
					timeout: 1000,
				});
			} catch {
				// No session fetch issued; continue after microtask drain.
			}
			await drainMicrotasks(15);
		},
		async resolveLLMAndSettle(text: string) {
			resolveLLM(text);
			await act(async () => {
				await llmPromise;
				for (let i = 0; i < 40; i++) {
					await Promise.resolve();
				}
			});
		},
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
		const env = setupControllableLLMMock();

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
			await env.waitForAuthSettled();
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
			await waitFor(() => expect(env.llmFetchCalled).toBe(true), {
				timeout: 3000,
			});

			// New Game → handleResetGame calls invalidate (gen bumps),
			// setGameState(resetGame()), setGameStarted(false).
			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			// Resolve the in-flight LLM fetch. makeMove returns, but
			// makeAIMove's `if (gen !== genRef.current) return` bails
			// before setGameState / setErrorMsg.
			await env.resolveLLMAndSettle(
				'{"move":{"from":"a0","to":"a0"},"thinking":"stale","confidence":0.1}'
			);

			// No error banner — the catch-block gen check also bailed.
			expect(queryByRole('alert')).toBeNull();

			// No move was applied: the Move History panel only renders when
			// moveHistory.length > 0. A stale callback that failed to bail
			// would have setGameState with a moved board (moveHistory 1).
			expect(queryByText(/Move History \(\d+\)/i)).toBeNull();
		} finally {
			env.restore();
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
			await env.waitForAuthSettled();
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
			await env.resolveLLMAndSettle(
				'{"move":{"from":"a1","to":"a2"},"thinking":"valid","confidence":0.9}'
			);

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
// (Tutorial button → toggleToMode → invalidate), then resolve with a
// VALID per-variant opening move so the success-path gen bail is exercised.
// Asserting no board/history mutation would fail if the stale move were
// applied despite the catch/success path.

type LateCallbackCase = GameCase & {
	/** Valid opening move JSON body for this variant's rule guardian. */
	validMoveBody: string;
};

const LATE_CALLBACK_GAMES: LateCallbackCase[] = [
	{
		name: 'ChessGame',
		Component: ChessGame,
		selectId: 'chess-ai-side',
		firstPlayerValue: 'white',
		validMoveBody:
			'{"move":{"from":"e2","to":"e4"},"thinking":"valid","confidence":0.9}',
	},
	{
		name: 'XiangqiGame',
		Component: XiangqiGame,
		selectId: 'xiangqi-ai-side',
		firstPlayerValue: 'red',
		validMoveBody:
			'{"move":{"from":"a1","to":"a2"},"thinking":"valid","confidence":0.9}',
	},
	{
		name: 'ShogiGame',
		Component: ShogiGame,
		selectId: 'shogi-ai-side',
		firstPlayerValue: 'sente',
		validMoveBody:
			'{"move":{"from":"7g","to":"7f"},"thinking":"valid","confidence":0.9}',
	},
	{
		name: 'JungleGame',
		Component: JungleGame,
		selectId: 'jungle-ai-side',
		firstPlayerValue: 'red',
		validMoveBody:
			'{"move":{"from":"a1","to":"a2"},"thinking":"valid","confidence":0.9}',
	},
];

describe.each(LATE_CALLBACK_GAMES)(
	'$name — mode-switch late callback dropped after invalidate',
	({ Component, firstPlayerValue, validMoveBody }) => {
		beforeEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		afterEach(() => {
			clearInitialAuthUser();
			resetAIConfigStore();
		});

		test('in-flight makeAIMove bails on stale gen after mode switch (no board mutation)', async () => {
			const env = setupControllableLLMMock();

			const originalError = console.error;
			const errorCalls: string[] = [];
			// eslint-disable-next-line no-console
			console.error = (...args: unknown[]) => {
				errorCalls.push(args.join(' '));
			};

			try {
				const { getByLabelText, getByRole, queryByRole, queryByText } = render(
					<Component />
				);

				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				// The 401 from /auth/session triggers resetAIConfigStore(),
				// which wipes any config set before render. Wait for that to
				// settle, THEN enable the AI config so the store update sticks.
				await env.waitForAuthSettled();
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

				// Resolve with a valid opening move. If the stale gen bail is
				// skipped, makeAIMove would apply the move and mutate board/
				// history out from under the tutorial state.
				await env.resolveLLMAndSettle(validMoveBody);

				// No 'AI move failed:' logged — catch path bailed on stale gen
				// (or was never entered on the success path).
				expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(false);

				// No error banner / AI error panel.
				expect(queryByRole('alert')).toBeNull();
				expect(queryByText(/❌ AI Error/i)).toBeNull();

				// No move history from a stale AI apply.
				expect(queryByText(/Move History \(\d+\)/i)).toBeNull();

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

// ChessGame-only: the debug-callback useEffect registers a callback on the
// AI service that fires for ai-debug (thinking) and ai-move (result) events
// during makeMove, each stamped with the request's gen as data.requestId.
// The callback's first statement is `if (isStale(data?.requestId)) return`
// so a late callback from a superseded request is dropped instead of
// appending to the new game's AI Move History. The mode-switch tests above
// cover the makeAIMove stale-gen bail but run WITHOUT debug mode, so the
// debug-callback stale bail is never exercised. Here we hold the LLM
// in-flight across a mode-switch with debug mode ON: the ai-debug (thinking)
// callback fires before the fetch with the current gen (appended), then the
// mode-switch invalidates; when the LLM resolves, the ai-move callback fires
// with the now-stale requestId and bails — so the "AI suggests" entry never
// appears in AI Move History.
describe('ChessGame — debug callback stale-requestId bail', () => {
	beforeEach(() => {
		clearInitialAuthUser();
		resetAIConfigStore();
	});

	afterEach(() => {
		clearInitialAuthUser();
		resetAIConfigStore();
	});

	test('ai-move debug callback is dropped after mode-switch invalidate (no "AI suggests" entry)', async () => {
		const env = setupControllableLLMMock();

		const originalError = console.error;
		const errorCalls: string[] = [];
		// eslint-disable-next-line no-console
		console.error = (...args: unknown[]) => {
			errorCalls.push(args.join(' '));
		};

		try {
			const { getByLabelText, getByRole, getByText, queryByText } = render(
				<ChessGame />
			);

			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			await env.waitForAuthSettled();
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			// Toggle debug mode ON so the debug-callback useEffect registers
			// a callback on the AI service.
			fireEvent.click(getByRole('button', { name: /Debug Mode/i }));

			// AI plays the first-moving side (white) so the AI-turn effect
			// fires immediately on Start.
			fireEvent.change(select, { target: { value: 'white' } });
			fireEvent.click(getByRole('button', { name: /start/i }));

			// Wait for the 1s setTimeout to fire and makeMove to reach the
			// LLM fetch. By now the ai-debug (thinking) callback has already
			// fired with the current gen and appended a thinking entry, so
			// "AI Move History" is visible.
			await waitFor(() => expect(env.llmFetchCalled).toBe(true), {
				timeout: 3000,
			});
			await waitFor(
				() => {
					expect(getByText(/AI Move History/i)).toBeTruthy();
				},
				{ timeout: 3000 }
			);

			// Mode switch to Tutorial → invalidate() bumps the gen.
			const tutorialButton = getByRole('button', { name: /^tutorial$/i });
			fireEvent.click(tutorialButton);

			// Resolve with a valid opening move. The ai-move callback now
			// fires with the stale requestId and must bail at
			// `if (isStale(data?.requestId)) return` — so the "AI suggests"
			// result entry is NOT appended to AI Move History.
			await env.resolveLLMAndSettle(
				'{"move":{"from":"e2","to":"e4"},"thinking":"valid","confidence":0.9}'
			);

			expect(queryByText(/AI suggests/i)).toBeNull();

			// No error surfaced from the dropped callback.
			expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(false);

			// Mode-switch succeeded and wasn't corrupted by the stale
			// callback: the tutorial heading is visible.
			expect(getByRole('heading', { name: /Logic & Tutorials/i })).toBeTruthy();
		} finally {
			env.restore();
			// eslint-disable-next-line no-console
			console.error = originalError;
		}
	});
});
