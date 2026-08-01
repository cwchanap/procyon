import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import ChessGame from './ChessGame';
import { AUTH_CHANGE_EVENT } from '../lib/auth';
import { resetAIConfigStore } from '../lib/ai/ai-config-store';
import { defaultAIConfig } from '../lib/ai/storage';
import { RIVAL_PREFERENCES_STORAGE_KEY } from '../lib/chess/rival/preferences';

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
// Rival setup preference hydration is client-mount-only and reads
// `window.localStorage` (see `useChessRivalSetup`). We clear that key in
// beforeEach/afterEach so each test starts from a clean, no-preference slate.

interface InitialAuthUser {
	id?: string;
	email?: string;
	username: string;
}

function clearRivalPreferences(): void {
	try {
		window.localStorage?.removeItem(RIVAL_PREFERENCES_STORAGE_KEY);
		window.localStorage?.removeItem('procyon_ai_config');
	} catch {
		/* localStorage may be unavailable in some environments */
	}
}

/** Wait for client-side preference hydration to resolve (setup revealed). */
async function waitForSetupResolved(view: RenderResult): Promise<HTMLElement> {
	return waitFor(() => view.getByRole('radiogroup', { name: /opponent/i }));
}

/** All board square buttons, in DOM (render) order. */
function squareButtons(view: RenderResult): HTMLElement[] {
	return view.queryAllByLabelText(/^Square \d+-\d+$/);
}

describe('ChessGame — rival setup & preview', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
	});

	test('hides the rival setup and interactive board until preference hydration resolves', async () => {
		const view = render(<ChessGame />);

		// Synchronously (before the client-mount microtask), the setup is not
		// revealed and no interactive board is mounted — only a neutral
		// skeleton — so nothing flashes a White-oriented board or announces
		// an opponent fallback.
		expect(view.queryByRole('radiogroup', { name: /opponent/i })).toBeNull();
		expect(view.queryByRole('status')).toBeNull();
		expect(squareButtons(view)).toHaveLength(0);
		expect(view.queryByTestId('board-loading-skeleton')).toBeTruthy();

		// After resolution the setup and board appear.
		await waitForSetupResolved(view);
		await waitFor(() => expect(squareButtons(view).length).toBeGreaterThan(0));
		expect(view.queryByTestId('board-loading-skeleton')).toBeNull();
	});

	test('signed-out visitor with no preference previews the on-device engine', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		const engine = view.getByRole('radio', {
			name: /On-device computer/i,
		}) as HTMLInputElement;
		expect(engine.checked).toBe(true);
		// Derived rival side: human plays White, so the computer plays Black.
		expect(
			view.getByText(/On-device computer · Computer plays Black · Unrated/i)
		).toBeTruthy();
	});

	test('configured signed-in visitor previews the language model before interacting', async () => {
		(
			window as unknown as Record<string, InitialAuthUser>
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
		(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
			if (url.includes('/ai-config/') && url.includes('/full')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							provider: 'openai',
							apiKey: 'sk-test',
							modelName: 'gpt-4o-mini',
							gameVariant: 'chess',
						}),
				});
			}
			if (url.includes('/ai-config')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							configurations: [
								{
									id: 'c1',
									provider: 'openai',
									isActive: true,
									hasApiKey: true,
								},
							],
						}),
				});
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({}),
			});
		}) as unknown as typeof fetch;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: window.localStorage,
		});

		try {
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);

			// After AI-config hydration completes, the untouched setup resolves
			// to the language model.
			await waitFor(() => {
				expect(
					(
						view.getByRole('radio', {
							name: /Language model/i,
						}) as HTMLInputElement
					).checked
				).toBe(true);
			});
			expect(
				view.getByText(/gpt-4o-mini · Computer plays Black/i)
			).toBeTruthy();
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

	test('labels the standard game mode "Play"', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		expect(view.getByRole('button', { name: 'Play' })).toBeTruthy();
		expect(view.queryByRole('button', { name: /Play vs AI/i })).toBeNull();
	});

	test('selecting a side flips the board orientation immediately', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		// White-oriented preview renders Square 0-0 first (Black back rank on top).
		await waitFor(() => expect(squareButtons(view).length).toBeGreaterThan(0));
		expect(squareButtons(view)[0]?.getAttribute('aria-label')).toBe(
			'Square 0-0'
		);

		fireEvent.click(view.getByRole('radio', { name: 'Black' }));

		// Black-oriented preview renders Square 7-7 first (White back rank on top).
		await waitFor(() =>
			expect(squareButtons(view)[0]?.getAttribute('aria-label')).toBe(
				'Square 7-7'
			)
		);
	});

	test('changing the side produces a fresh human-vs-ai preview with the derived rival side', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		// Human plays White by default: computer (rival) plays Black, White (the
		// human) is to move, so the preview board is interactable.
		await waitFor(() => expect(squareButtons(view).length).toBeGreaterThan(0));
		const humanWhiteSquare = view.getByLabelText(
			'Square 6-0'
		) as HTMLButtonElement;
		expect(humanWhiteSquare.disabled).toBe(false);

		// Switch to playing Black: the derived rival side becomes White, which
		// moves first, so the fresh human-vs-ai preview is not interactable
		// (it is the AI's turn).
		fireEvent.click(view.getByRole('radio', { name: 'Black' }));
		await waitFor(() => {
			expect(
				(view.getByLabelText('Square 6-0') as HTMLButtonElement).disabled
			).toBe(true);
		});
		expect(view.getByText(/Computer plays White/i)).toBeTruthy();
	});

	test('constructs no Worker before the game starts', async () => {
		const originalWorker = (globalThis as Record<string, unknown>).Worker;
		const workerSpy = mock(function WorkerSpy() {
			throw new Error('Worker must not be constructed before Start');
		});
		(globalThis as Record<string, unknown>).Worker = workerSpy;

		try {
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);
			// Exercise a preview change (opponent + side) which must remain a
			// pure preview — no engine Worker / provider construction.
			fireEvent.click(view.getByRole('radio', { name: /Language model/i }));
			fireEvent.click(view.getByRole('radio', { name: 'Black' }));

			expect(workerSpy).not.toHaveBeenCalled();
		} finally {
			if (originalWorker === undefined) {
				delete (globalThis as Record<string, unknown>).Worker;
			} else {
				(globalThis as Record<string, unknown>).Worker = originalWorker;
			}
		}
	});

	test('locks the opponent/side selectors once a game is active', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		const sideWhite = view.getByRole('radio', {
			name: 'White',
		}) as HTMLInputElement;
		expect(sideWhite.disabled).toBe(false);

		const startButton = view.getByRole('button', { name: /start/i });
		fireEvent.click(startButton);

		await waitFor(() => {
			expect(
				(view.getByRole('radio', { name: 'White' }) as HTMLInputElement)
					.disabled
			).toBe(true);
		});
	});

	test('switching to Tutorial hides the rival setup and restores it (with a clean preview) on return', async () => {
		const view = render(<ChessGame />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
		expect(view.queryByRole('radiogroup', { name: /opponent/i })).toBeNull();

		fireEvent.click(view.getByRole('button', { name: 'Play' }));
		await waitForSetupResolved(view);
		expect(
			(
				view.getByRole('radio', {
					name: /On-device computer/i,
				}) as HTMLInputElement
			).checked
		).toBe(true);
	});

	test('re-enables the selectors when auth is lost mid-game (logout resets local game state)', async () => {
		(
			window as unknown as Record<string, InitialAuthUser>
		).__PROCYON_INITIAL_AUTH_USER__ = { username: 'tester' };

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
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);

			const startButton = await waitFor(() =>
				view.getByRole('button', { name: /start/i })
			);
			fireEvent.click(startButton);

			await waitFor(() => {
				expect(
					(view.getByRole('radio', { name: 'White' }) as HTMLInputElement)
						.disabled
				).toBe(true);
			});

			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, {
					detail: { user: null },
				})
			);

			await waitFor(() => {
				expect(
					(view.getByRole('radio', { name: 'White' }) as HTMLInputElement)
						.disabled
				).toBe(false);
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
});

describe('ChessGame — tutorial interactions', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
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
});

// The following AI-move-path tests exercise the live combat/LLM machinery,
// which still relies on the pre-session preview bridge. Full session
// integration (Task 14) will replace this bridge; until then these tests
// drive the AI by choosing the human side (which derives the rival side).
describe('ChessGame — AI move bridge (pre-session)', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		clearRivalPreferences();
	});

	test('AI move catch block handles error when LLM fetch fails', async () => {
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
				return Promise.reject(new Error('Network error'));
			}
		) as unknown as typeof fetch;

		// eslint-disable-next-line no-console
		console.error = (...args: unknown[]) => {
			errorCalls.push(args.join(' '));
		};

		try {
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);

			// Human plays Black => the derived rival side is White, which moves
			// first, so the AI-move effect fires immediately on Start.
			fireEvent.click(view.getByRole('radio', { name: 'Black' }));

			const startButton = view.getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

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
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);
			const { getByLabelText, getByRole, queryByText } = view;
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
				const rivalMove = rivalMoves[expectedRivalMoves - 1]!;
				const rivalCol = rivalMove.to.charCodeAt(0) - 'a'.charCodeAt(0);
				const rivalRow = 8 - parseInt(rivalMove.to.slice(1), 10);
				const rivalSymbol =
					'promotion' in rivalMove && rivalMove.promotion === 'rook'
						? '♜'
						: '♟';
				await waitFor(
					() =>
						expect(
							getByLabelText(`Square ${rivalRow}-${rivalCol}`).textContent
						).toBe(rivalSymbol),
					{ timeout: 3000 }
				);
			};

			// Human plays White by default (rival plays Black).
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

	test('in-flight makeAIMove bails on stale gen after New Game (no error surfaced)', async () => {
		const originalEnabled = defaultAIConfig.enabled;
		const originalApiKey = defaultAIConfig.apiKey;
		defaultAIConfig.enabled = true;
		defaultAIConfig.apiKey = 'fake-key';

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
			const view = render(<ChessGame />);
			await waitForSetupResolved(view);
			const { getByRole, queryByText } = view;

			// Human plays Black => rival (White) moves first.
			fireEvent.click(getByRole('radio', { name: 'Black' }));

			const startButton = getByRole('button', { name: /start/i });
			fireEvent.click(startButton);

			await waitFor(() => expect(llmFetchCalled).toBe(true), {
				timeout: 3000,
			});

			const newGameButton = getByRole('button', { name: /new game/i });
			fireEvent.click(newGameButton);

			resolveLLM(
				'{"move":{"from":"a0","to":"a0"},"thinking":"stale","confidence":0.1}'
			);

			await act(async () => {
				await llmPromise;
				for (let i = 0; i < 40; i++) {
					await Promise.resolve();
				}
			});

			expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(false);
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
