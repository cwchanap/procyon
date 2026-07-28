import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import ChessGame from './ChessGame';
import { AUTH_CHANGE_EVENT } from '../lib/auth';
import { resetAIConfigStore } from '../lib/ai/ai-config-store';
import { defaultAIConfig } from '../lib/ai/storage';

setupReactDom();

// NOTE on mocking strategy: Bun's `mock.module` is process-global
// (oven-sh/bun#12823) and leaks across test files. Mocking `../lib/auth`
// here would replace the real auth module for `src/lib/auth.test.ts` (which
// exercises the real `useAuth`/`AUTH_CHANGE_EVENT`), breaking that suite.
// We therefore mock NOTHING and instead drive auth state through the real
// `useAuth`'s `window.__PROCYON_INITIAL_AUTH_USER__` hook
// (`getInitialAuthState` reads it). Setting it to a user object makes
// `useAuth` return `isAuthenticated: true` with no network fetch; leaving it
// unset yields `isAuthenticated: false` (the failed `fetchSession` is
// try/caught and resolves to null asynchronously, after the assertions).
//
// The real AI service, config store, and play-history hook make no network
// calls during these tests: chess starts on White (the default AI side is
// Black, so the AI-turn effect never fires) and no game reaches a game-over
// status, so `usePlayHistory`'s save effect never fetches.

interface InitialAuthUser {
	username: string;
}

describe('ChessGame — inline "AI plays" select', () => {
	beforeEach(() => {
		// Default to an unauthenticated visitor so `aiStarting` is false and
		// the Start button is enabled (letting tests drive gameActive).
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		// Reset the AI config store so each test starts from a clean slate
		// (prior tests may have hydrated or set a config).
		resetAIConfigStore();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	test('renders the AI-plays select with Black and White options, defaulting to Black', async () => {
		const { getByLabelText } = render(<ChessGame />);
		const select = (await waitFor(() =>
			getByLabelText(/AI plays/i)
		)) as HTMLSelectElement;

		expect(select).toBeTruthy();
		expect(select.id).toBe('chess-ai-side');
		expect(select.value).toBe('black');
		expect(select.options).toHaveLength(2);
		expect(select.options[0]?.value).toBe('black');
		expect(select.options[0]?.textContent).toBe('Black');
		expect(select.options[1]?.value).toBe('white');
		expect(select.options[1]?.textContent).toBe('White');
	});

	test('select is enabled while no game is active', async () => {
		const { getByLabelText } = render(<ChessGame />);
		const select = (await waitFor(() =>
			getByLabelText(/AI plays/i)
		)) as HTMLSelectElement;

		expect(select.disabled).toBe(false);
	});

	test('changing the select updates the AI side to White', async () => {
		const { getByLabelText } = render(<ChessGame />);
		const select = (await waitFor(() =>
			getByLabelText(/AI plays/i)
		)) as HTMLSelectElement;

		fireEvent.change(select, { target: { value: 'white' } });
		expect(select.value).toBe('white');
	});

	test('select becomes disabled once a game is started (gameActive true)', async () => {
		const { getByLabelText, getByRole } = render(<ChessGame />);
		const select = (await waitFor(() =>
			getByLabelText(/AI plays/i)
		)) as HTMLSelectElement;

		// Before starting: enabled.
		expect(select.disabled).toBe(false);

		// Click Start (unauthenticated => aiStarting is false => Start proceeds
		// and sets gameActive=true for an AI game).
		const startButton = getByRole('button', { name: /start/i });
		fireEvent.click(startButton);

		// After starting: the AI-plays select is locked.
		await waitFor(() => {
			expect(select.disabled).toBe(true);
		});
	});

	test('select stays enabled pre-game for an authenticated user', async () => {
		// Authenticated visitor via the real useAuth's initial-user window hook.
		// The store starts un-hydrated, so aiStarting is true and the Start
		// button is disabled — but the AI-plays select is gated on
		// `gameActive` (still false), so it remains enabled pre-game.
		(
			window as unknown as Record<string, InitialAuthUser>
		).__PROCYON_INITIAL_AUTH_USER__ = { username: 'tester' };

		const { getByLabelText } = render(<ChessGame />);
		const select = (await waitFor(() =>
			getByLabelText(/AI plays/i)
		)) as HTMLSelectElement;

		expect(select.disabled).toBe(false);
	});

	test('select is re-enabled when auth is lost mid-game (logout resets local game state)', async () => {
		// Start authenticated so the game can begin, then simulate logout by
		// dispatching the real AUTH_CHANGE_EVENT with user: null. The local
		// gameActive/aiPlayer state must reset so the AI-plays select is
		// re-enabled and the game doesn't continue against the reset default
		// (no-key) AI config.
		(
			window as unknown as Record<string, InitialAuthUser>
		).__PROCYON_INITIAL_AUTH_USER__ = { username: 'tester' };

		// Hydrate makes a fetch to /ai-config; mock it to return an empty
		// list so hydrate succeeds (hydrated=true, hydrateError=false) and
		// aiStarting clears, enabling the Start button. Also point
		// globalThis.localStorage at window.localStorage so
		// readLocalConfig/saveAIConfig don't throw (reactSetup only
		// exposes window.localStorage, not the global slot).
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

		try {
			const { getByLabelText, getByRole } = render(<ChessGame />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			// Wait for hydration to finish: aiStarting clears and Start
			// becomes enabled.
			const startButton = await waitFor(() =>
				getByRole('button', { name: /start/i })
			);
			fireEvent.click(startButton);

			// After starting: select is locked (gameActive true).
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// Simulate logout: dispatch the real auth-change event with
			// null user. The ChessGame effect should reset local game
			// state (gameActive=false), re-enabling the select.
			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, {
					detail: { user: null },
				})
			);

			await waitFor(() => {
				expect(select.disabled).toBe(false);
			});
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

	test('select is re-enabled when the authenticated user identity changes mid-game (account switch resets local game state)', async () => {
		// Start authenticated as user A so the game can begin, then
		// simulate an account switch by dispatching AUTH_CHANGE_EVENT
		// with a different authenticated user B. isAuthenticated stays
		// true throughout, so the true→false-only logout guard does not
		// fire — the identity-change check must reset the game so the old
		// board is discarded and usePlayHistory cannot record A's result
		// under B's id.
		(
			window as unknown as Record<string, unknown>
		).__PROCYON_INITIAL_AUTH_USER__ = {
			id: 'user-a',
			email: 'a@test.com',
			username: 'userA',
		};

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

		try {
			const { getByLabelText, getByRole } = render(<ChessGame />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			// Wait for hydration to finish: aiStarting clears and Start
			// becomes enabled.
			const startButton = await waitFor(() =>
				getByRole('button', { name: /start/i })
			);
			fireEvent.click(startButton);

			// After starting: select is locked (gameActive true).
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// Simulate account switch: dispatch the real auth-change event
			// with a different authenticated user. The ChessGame effect
			// should detect the identity change and reset local game
			// state (gameActive=false), re-enabling the select.
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

			await waitFor(() => {
				expect(select.disabled).toBe(false);
			});
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

	test('completes an underpromotion from the tutorial only after a choice', async () => {
		const view = render(<ChessGame />);
		fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
		fireEvent.click(view.getByRole('button', { name: 'Pawn Promotion' }));
		fireEvent.click(view.getByRole('button', { name: 'Square 1-3' }));
		fireEvent.click(view.getByRole('button', { name: 'Square 0-3' }));

		expect(
			view.getByRole('dialog', { name: 'Choose promotion piece' })
		).toBeTruthy();
		expect(view.getByRole('button', { name: 'Square 0-3' }).textContent).toBe(
			''
		);

		fireEvent.click(view.getByRole('button', { name: 'Promote to knight' }));
		await waitFor(() => {
			expect(view.queryByRole('dialog')).toBeNull();
			expect(
				view.getByRole('button', { name: 'Square 0-3' }).textContent
			).toContain('♘');
		});
	});

	test('cancels promotion without moving the pawn or retaining selection', () => {
		const view = render(<ChessGame />);
		fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
		fireEvent.click(view.getByRole('button', { name: 'Pawn Promotion' }));
		fireEvent.click(view.getByRole('button', { name: 'Square 1-3' }));
		fireEvent.click(view.getByRole('button', { name: 'Square 0-3' }));

		fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

		expect(view.queryByRole('dialog')).toBeNull();
		expect(
			view.getByRole('button', { name: 'Square 1-3' }).textContent
		).toContain('♙');
		expect(view.getByRole('button', { name: 'Square 0-3' }).textContent).toBe(
			''
		);
		expect(
			view.getByRole('button', { name: 'Square 1-3' }).className
		).not.toContain('ring-brass');
		expect(
			view.getByRole('button', { name: 'Square 0-3' }).hasAttribute('disabled')
		).toBe(false);
	});

	test('switches own-piece selection and clears it after an illegal empty click', () => {
		const view = render(<ChessGame />);
		fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));

		const e2 = view.getByRole('button', { name: 'Square 6-4' });
		const d2 = view.getByRole('button', { name: 'Square 6-3' });
		const d5 = view.getByRole('button', { name: 'Square 3-3' });

		fireEvent.click(e2);
		expect(e2.className).toContain('ring-brass');

		fireEvent.click(d2);
		expect(e2.className).not.toContain('ring-brass');
		expect(d2.className).toContain('ring-brass');

		fireEvent.click(d5);
		expect(d2.className).not.toContain('ring-brass');
	});

	// AI move gen checks: when AI plays white and the game starts,
	// makeAIMoveAsync fires after the 1-second delay. With defaultAIConfig
	// (enabled=false, apiKey=''), makeMove returns null — the try block's
	// gen check (ChessGame.tsx ~line 333) and finally block's gen check
	// (~lines 417-419) are covered. To cover the catch block's gen check
	// (~line 402), we mutate defaultAIConfig to enabled=true +
	// apiKey='fake' and mock fetch to reject for LLM API calls, so
	// makeMove throws. NOTE: this test exercises the gen-MATCHES path
	// (no invalidate races the callback) — the error IS surfaced. The
	// stale-gen bail (invalidate while LLM in-flight) is covered by the
	// "in-flight makeAIMove bails on stale gen" test below.
	test('AI move catch block handles error when LLM fetch fails', async () => {
		// Mutate defaultAIConfig so the AI service's makeMove calls callLLM
		// instead of short-circuiting to null. The service is created with
		// useState(() => createChessAI(defaultAIConfig)), so mutating
		// defaultAIConfig before render affects the service's config.
		const originalEnabled = defaultAIConfig.enabled;
		const originalApiKey = defaultAIConfig.apiKey;
		defaultAIConfig.enabled = true;
		defaultAIConfig.apiKey = 'fake-key';

		const originalFetch = globalThis.fetch;

		const originalError = console.error;
		const errorCalls: string[] = [];

		(globalThis as unknown as { fetch: unknown }).fetch = mock(
			(url: string) => {
				if (url.includes('/auth/session')) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
						json: () => Promise.resolve({}),
					});
				}
				// LLM API call — reject to trigger makeMove's catch,
				// which re-throws to makeAIMoveAsync's catch (line 393).
				return Promise.reject(new Error('Network error'));
			}
		) as unknown as typeof fetch;

		// eslint-disable-next-line no-console
		console.error = (...args: unknown[]) => {
			errorCalls.push(args.join(' '));
		};

		try {
			const { getByLabelText, getByRole } = render(<ChessGame />);

			// Set AI to play white so the AI move effect fires immediately
			// on Start (white moves first).
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;
			fireEvent.change(select, { target: { value: 'white' } });

			// Start the game (unauthenticated => aiStarting is false).
			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			// Wait for the AI move to fire (1-second setTimeout delay)
			// and fail. The catch block calls console.error('AI move failed:').
			await waitFor(
				() => {
					expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(
						true
					);
				},
				{ timeout: 3000 }
			);
		} finally {
			defaultAIConfig.enabled = originalEnabled;
			defaultAIConfig.apiKey = originalApiKey;
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			// eslint-disable-next-line no-console
			console.error = originalError;
		}
	});

	test('applies the rival promotion selected in a mocked AI response', async () => {
		const originalEnabled = defaultAIConfig.enabled;
		const originalApiKey = defaultAIConfig.apiKey;
		defaultAIConfig.enabled = true;
		defaultAIConfig.apiKey = 'fake-key';

		const rivalMoves = [
			{ from: 'b7', to: 'b5' },
			{ from: 'b5', to: 'b4' },
			{ from: 'a7', to: 'a5' },
			{ from: 'a5', to: 'a4' },
			{ from: 'a4', to: 'a3' },
			{ from: 'a3', to: 'a2' },
			{ from: 'a2', to: 'b1', promotion: 'rook' },
		];
		let rivalMoveCount = 0;
		const originalFetch = globalThis.fetch;
		(globalThis as unknown as { fetch: unknown }).fetch = mock(
			(url: string) => {
				if (url.includes('/auth/session')) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
						json: () => Promise.resolve({}),
					});
				}
				const move = rivalMoves[rivalMoveCount++];
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							candidates: [
								{
									content: {
										parts: [
											{
												text: JSON.stringify({
													move,
													reasoning: 'Advance the passed pawn',
													confidence: 90,
												}),
											},
										],
									},
									finishReason: 'STOP',
								},
							],
						}),
				});
			}
		) as unknown as typeof fetch;

		try {
			const { getByLabelText, getByRole, queryByText } = render(<ChessGame />);
			const moveHumanPiece = async (
				from: string,
				to: string,
				expectedRivalMoves: number
			) => {
				fireEvent.click(getByLabelText(from));
				fireEvent.click(getByLabelText(to));
				await waitFor(() => expect(rivalMoveCount).toBe(expectedRivalMoves), {
					timeout: 3000,
				});
				await act(async () => {
					for (let i = 0; i < 20; i++) await Promise.resolve();
				});
			};

			fireEvent.click(getByRole('button', { name: /start/i }));

			await moveHumanPiece('Square 6-0', 'Square 5-0', 1); // a2-a3, b7-b5
			await moveHumanPiece('Square 7-6', 'Square 5-5', 2); // Ng1-f3, b5-b4
			await moveHumanPiece('Square 5-0', 'Square 4-1', 3); // a3xb4, a7-a5
			await moveHumanPiece('Square 5-5', 'Square 3-6', 4); // Nf3-g5, a5-a4
			await moveHumanPiece('Square 3-6', 'Square 4-4', 5); // Ng5-e4, a4-a3
			await moveHumanPiece('Square 4-4', 'Square 5-2', 6); // Ne4-c3, a3-a2
			await moveHumanPiece('Square 5-2', 'Square 3-1', 7); // Nc3-b5, a2xb1=R

			expect(getByLabelText('Square 7-1').textContent).toBe('♜');
			expect(queryByText(/❌ AI Error/i)).toBeNull();
		} finally {
			defaultAIConfig.enabled = originalEnabled;
			defaultAIConfig.apiKey = originalApiKey;
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
		}
	}, 15_000);

	// Mid-flight stale-gen bail: hold the LLM fetch in-flight across a
	// New Game (resetGame → invalidate), then resolve with an invalid
	// move. The catch block's `if (isStale(gen)) return` must bail
	// BEFORE console.error('AI move failed:') / setAiError / setIsAiPaused
	// — otherwise the stale callback resurrects an error on the reset
	// board. Mirrors the Xiangqi late-callback tests in
	// CrossVariantInvalidation.test.tsx but for Chess (which uses
	// defaultAIConfig mutation + AIStatusPanel instead of setConfig +
	// errorBanner role='alert').
	test('in-flight makeAIMove bails on stale gen after New Game (no error surfaced)', async () => {
		const originalEnabled = defaultAIConfig.enabled;
		const originalApiKey = defaultAIConfig.apiKey;
		defaultAIConfig.enabled = true;
		defaultAIConfig.apiKey = 'fake-key';

		// Controllable LLM fetch — held in-flight so invalidate can race it.
		let resolveLLM!: (value: string) => void;
		const llmPromise = new Promise<string>(r => {
			resolveLLM = r;
		});
		let llmFetchCalled = false;
		const originalFetch = globalThis.fetch;

		(globalThis as unknown as { fetch: unknown }).fetch = mock(
			(url: string) => {
				if (url.includes('/auth/session')) {
					return Promise.resolve({
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
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
								{
									content: { parts: [{ text }] },
									finishReason: 'STOP',
								},
							],
						}),
				}));
			}
		) as unknown as typeof fetch;

		const originalError = console.error;
		const errorCalls: string[] = [];
		// eslint-disable-next-line no-console
		console.error = (...args: unknown[]) => {
			errorCalls.push(args.join(' '));
		};

		try {
			const { getByLabelText, getByRole, queryByText } = render(<ChessGame />);

			// AI plays white (first-moving side) so the AI-turn effect
			// fires immediately on Start.
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;
			fireEvent.change(select, { target: { value: 'white' } });

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			// Wait for the 1s setTimeout to fire and makeMove to reach the
			// LLM fetch — makeAIMoveAsync is now in-flight, past the
			// effect cleanup's clearTimeout.
			await waitFor(() => expect(llmFetchCalled).toBe(true), {
				timeout: 3000,
			});

			// New Game → resetGame calls invalidate (gen bumps),
			// setGameState(createInitialGameState()), setGameStarted(false).
			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			// Resolve the in-flight LLM fetch with an invalid move. The
			// rule guardian rejects it → makeMove throws → catch block.
			// The catch block's `if (isStale(gen)) return` bails BEFORE
			// console.error / setAiError / setIsAiPaused.
			resolveLLM(
				'{"move":{"from":"a0","to":"a0"},"thinking":"stale","confidence":0.1}'
			);

			// Drain the promise microtask chain so the stale callback
			// settles (fetch .then → response.json → callLLM → makeMove →
			// catch → gen check).
			await act(async () => {
				await llmPromise;
				for (let i = 0; i < 40; i++) {
					await Promise.resolve();
				}
			});

			// No 'AI move failed:' logged — the catch block bailed on
			// stale gen before reaching the console.error line.
			expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(false);

			// No AI Error panel rendered — setAiError was never called.
			expect(queryByText(/❌ AI Error/i)).toBeNull();
		} finally {
			defaultAIConfig.enabled = originalEnabled;
			defaultAIConfig.apiKey = originalApiKey;
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			// eslint-disable-next-line no-console
			console.error = originalError;
		}
	});
});
