import {
	describe,
	test,
	expect,
	beforeEach,
	afterEach,
	mock,
	jest,
} from 'bun:test';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import ChessGame from './ChessGame';
import { AUTH_CHANGE_EVENT, __resetSharedAuthUserForTests } from '../lib/auth';
import { resetAIConfigStore, setConfig } from '../lib/ai/ai-config-store';
import {
	deferred,
	engineOptions,
	FakeRivalProvider,
	clearRivalPreferences as sharedClearRivalPreferences,
	installRivalTestEnv,
	type InitialAuthUser as SharedInitialAuthUser,
	type RivalTestEnv,
} from '../test/fakeRival';

setupReactDom();

// Injectable fake rival providers (`../test/fakeRival`) let these tests
// exercise Start, rival moves, and disposal without constructing a real
// Stockfish Worker or hitting the LLM network. Production renders
// `<ChessGame />` with no props and uses the real providers.

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

type InitialAuthUser = SharedInitialAuthUser;
const clearRivalPreferences = sharedClearRivalPreferences;

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
		// The engine details panel must not announce "Ready to load" before the
		// remembered/configured setup is known.
		expect(view.queryByText(/Ready to load/i)).toBeNull();

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
			view.getByText(
				/On-device computer · Casual · Computer plays Black · Unrated/i
			)
		).toBeTruthy();
		// Once the resolved setup is revealed, the engine panel shows its status.
		expect(view.getByText(/Ready to load/i)).toBeTruthy();
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
			// Exercise preview changes (opponent + difficulty + side) which
			// must remain pure previews — no engine Worker / provider
			// construction. Difficulty radios are engine-only, so select
			// Strong while the engine rival is still selected.
			fireEvent.click(view.getByRole('radio', { name: 'Strong' }));
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
		const { options } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
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

	test('keeps an active engine session locked when auth is lost mid-game (engine continues)', async () => {
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
			const { options } = engineOptions();
			const view = render(<ChessGame rivalSessionOptions={options} />);
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

			// A committed engine session is device-local and unrated, so it
			// continues across the logout — the selectors stay locked.
			await act(async () => {
				for (let i = 0; i < 20; i++) {
					await Promise.resolve();
				}
			});
			expect(
				(view.getByRole('radio', { name: 'White' }) as HTMLInputElement)
					.disabled
			).toBe(true);
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

// Authenticated AI-config environment for the LLM-path tests. Delegates to
// the shared `installRivalTestEnv` harness (see `../test/fakeRival`).
// `aiConfigOk: true` hydrates a usable OpenAI config (LLM becomes selectable);
// `false` fails hydration so the setup falls back to the engine.
function installAuthedEnv(aiConfigOk: boolean): RivalTestEnv {
	return installRivalTestEnv({
		capturePlayHistory: true,
		aiConfig: aiConfigOk ? 'success' : 'failure',
	});
}

// Task 14: atomic Start commits a fresh human-vs-AI game only after the
// injected rival provider is ready; all turn ownership then reads from the
// frozen active session. These tests inject deterministic fake providers so
// they never construct a real Worker or hit the network.
describe('ChessGame — atomic Start & rival session', () => {
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

	test('engine Start shows the loading label and locks selectors while starting', async () => {
		const init = deferred<void>();
		const { options, instances } = engineOptions(() => ({
			initialize: () => init.promise,
		}));
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));

		// The engine load is in flight: the Start control shows the loading
		// copy and the selectors are locked.
		await waitFor(() => {
			expect(
				view.getByRole('button', { name: /Loading on-device computer/i })
			).toBeTruthy();
		});
		expect(
			(view.getByRole('radio', { name: 'White' }) as HTMLInputElement).disabled
		).toBe(true);
		expect(instances.length).toBe(1);
		// No session committed yet.
		expect(view.queryByRole('button', { name: /new game/i })).toBeNull();

		// Completing the load commits the session.
		await act(async () => {
			init.resolve();
			for (let i = 0; i < 20; i++) {
				await Promise.resolve();
			}
		});
		await waitFor(() => {
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
		});
	});

	test('a failed engine Start leaves a clean editable preview and disposes the candidate', async () => {
		const { options, instances } = engineOptions(() => ({
			initialize: () => Promise.reject(new Error('engine boom')),
		}));
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));

		// Load failed → Try again affordance, no committed session, selectors
		// editable again, and the failed candidate is disposed.
		await waitFor(() => {
			expect(view.getByRole('button', { name: /try again/i })).toBeTruthy();
		});
		expect(
			(view.getByRole('radio', { name: 'White' }) as HTMLInputElement).disabled
		).toBe(false);
		expect(view.queryByRole('button', { name: /new game/i })).toBeNull();
		expect(instances[0]?.disposeCount).toBe(1);
	});

	test('Try again after a failed Start builds a fresh engine provider', async () => {
		const { options, instances } = engineOptions(index =>
			index === 0
				? { initialize: () => Promise.reject(new Error('engine boom')) }
				: {}
		);
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));
		const retry = await waitFor(() =>
			view.getByRole('button', { name: /try again/i })
		);
		fireEvent.click(retry);

		await waitFor(() => {
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
		});
		// A second, independent provider was constructed for the retry.
		expect(instances.length).toBe(2);
		expect(instances[1]?.disposeCount).toBe(0);
	});

	test('a successful Start freezes the opponent and side and hides the exporter for the engine', async () => {
		const { options } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));
		await waitFor(() => {
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
		});

		expect(
			(view.getByRole('radio', { name: 'White' }) as HTMLInputElement).disabled
		).toBe(true);
		expect(
			(
				view.getByRole('radio', {
					name: /On-device computer/i,
				}) as HTMLInputElement
			).disabled
		).toBe(true);
		// The engine carries no prompt/response, so no exporter is created.
		expect(view.queryByRole('button', { name: /Export Game/i })).toBeNull();
	});

	test('the engine takes its move only after the session commits', async () => {
		const { options, instances } = engineOptions(() => ({
			makeMove: async () => ({ ok: true, move: { from: 'e2', to: 'e4' } }),
		}));
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		// Human plays Black → the engine (White) moves first, but only after
		// the session is committed.
		fireEvent.click(view.getByRole('radio', { name: 'Black' }));
		await waitFor(() =>
			expect(
				(view.getByRole('radio', { name: 'Black' }) as HTMLInputElement).checked
			).toBe(true)
		);
		expect(instances.length).toBe(0); // no provider before Start

		fireEvent.click(view.getByRole('button', { name: /start/i }));
		await waitFor(() => expect(instances.length).toBe(1));
		await waitFor(() => expect(instances[0]?.makeMoveCount).toBe(1), {
			timeout: 3000,
		});
		// The engine's e2→e4 was applied, handing the turn back to the human.
		await waitFor(() => expect(view.getByText(/Black to move/i)).toBeTruthy());
	});

	test('a mid-game engine move failure does not retry the same position', async () => {
		const { options, instances } = engineOptions(() => ({
			makeMove: async () => ({
				ok: false,
				reason: 'no-move',
				message: 'The engine could not find a legal move.',
			}),
		}));
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: /start/i }));
		});
		await waitFor(() =>
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
		);

		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: 'Square 6-4' }));
		});
		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: 'Square 4-4' }));
		});
		await waitFor(() => expect(instances[0]?.makeMoveCount).toBe(1), {
			timeout: 3000,
		});

		await waitFor(() =>
			expect(view.getByText(/Start a New Game to reset/i)).toBeTruthy()
		);
		// Freeze delayed retries, flush only queued microtasks, then assert no
		// retry occurred without awaiting a timer that is itself frozen.
		jest.useFakeTimers();
		try {
			await act(async () => {
				await Promise.resolve();
			});
		} finally {
			jest.useRealTimers();
		}

		expect(instances[0]?.makeMoveCount).toBe(1);
	});

	test('an illegal successful engine move halts instead of retrying the same position', async () => {
		const { options, instances } = engineOptions(() => ({
			makeMove: async () => ({
				ok: true,
				move: { from: 'e2', to: 'e4' },
			}),
		}));
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: /start/i }));
		});
		await waitFor(() =>
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
		);

		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: 'Square 6-4' }));
		});
		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: 'Square 4-4' }));
		});
		await waitFor(() => expect(instances[0]?.makeMoveCount).toBe(1), {
			timeout: 3000,
		});

		await waitFor(() =>
			expect(view.getByText(/Start a New Game to reset/i)).toBeTruthy()
		);
		jest.useFakeTimers();
		try {
			await act(async () => {
				await Promise.resolve();
			});
		} finally {
			jest.useRealTimers();
		}

		expect(instances[0]?.makeMoveCount).toBe(1);
		expect(view.getByRole('button', { name: 'Square 6-4' }).textContent).toBe(
			''
		);
		expect(
			view.getByRole('button', { name: 'Square 4-4' }).textContent
		).toContain('♙');

		await act(async () => {
			fireEvent.click(view.getByRole('button', { name: /new game/i }));
		});
		await waitFor(() => {
			expect(view.getByRole('button', { name: /start/i })).toBeTruthy();
		});
		expect(instances[0]?.disposeCount).toBe(1);
		expect(
			view.getByRole('button', { name: 'Square 6-4' }).textContent
		).toContain('♙');
		expect(view.getByRole('button', { name: 'Square 4-4' }).textContent).toBe(
			''
		);
		expect(
			(view.getByRole('button', { name: 'Square 6-4' }) as HTMLButtonElement)
				.disabled
		).toBe(false);
	});

	test('an LLM Start is blocked until the model is configured', async () => {
		const llmCreated = { count: 0 };
		const options = {
			createLlmProvider: () => {
				llmCreated.count += 1;
				return new FakeRivalProvider({ kind: 'llm' });
			},
		};
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('radio', { name: /Language model/i }));
		await waitFor(() =>
			expect(
				(
					view.getByRole('radio', {
						name: /Language model/i,
					}) as HTMLInputElement
				).checked
			).toBe(true)
		);

		const startButton = view.getByRole('button', {
			name: /start/i,
		}) as HTMLButtonElement;
		expect(startButton.disabled).toBe(true);
		fireEvent.click(startButton);
		await act(async () => {
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}
		});
		// Blocked: no provider constructed, no committed session.
		expect(llmCreated.count).toBe(0);
		expect(view.queryByRole('button', { name: /new game/i })).toBeNull();
	});

	test('an engine Start ignores an LLM hydration failure', async () => {
		const env = installAuthedEnv(false);
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await waitForSetupResolved(view);

			// LLM hydration failed → the setup falls back to the engine.
			await waitFor(() =>
				expect(
					(
						view.getByRole('radio', {
							name: /On-device computer/i,
						}) as HTMLInputElement
					).checked
				).toBe(true)
			);
			const startButton = (await waitFor(() =>
				view.getByRole('button', { name: /start/i })
			)) as HTMLButtonElement;
			expect(startButton.disabled).toBe(false);

			fireEvent.click(startButton);
			await waitFor(() => {
				expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
			});
		} finally {
			env.restore();
		}
	});

	test('New Game disposes the provider and restores an editable preview', async () => {
		const { options, instances } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));
		await waitFor(() =>
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
		);

		fireEvent.click(view.getByRole('button', { name: /new game/i }));
		await waitFor(() =>
			expect(
				(view.getByRole('radio', { name: 'White' }) as HTMLInputElement)
					.disabled
			).toBe(false)
		);
		expect(instances[0]?.disposeCount).toBe(1);
		expect(view.getByRole('button', { name: /start/i })).toBeTruthy();
	});

	test('switching to Tutorial disposes the provider', async () => {
		const { options, instances } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await waitForSetupResolved(view);

		fireEvent.click(view.getByRole('button', { name: /start/i }));
		await waitFor(() =>
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
		);

		fireEvent.click(view.getByRole('button', { name: 'Tutorial' }));
		await waitFor(() =>
			expect(view.queryByRole('radiogroup', { name: /opponent/i })).toBeNull()
		);
		expect(instances[0]?.disposeCount).toBe(1);
	});

	test('initializes the exporter only for an LLM session', async () => {
		const env = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await waitForSetupResolved(view);

			// Once AI-config hydrates, the untouched setup resolves to the LLM.
			await waitFor(() =>
				expect(
					(
						view.getByRole('radio', {
							name: /Language model/i,
						}) as HTMLInputElement
					).checked
				).toBe(true)
			);

			fireEvent.click(
				await waitFor(() => view.getByRole('button', { name: /start/i }))
			);
			await waitFor(() =>
				expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
			);
			// The LLM session carries prompt/response, so the exporter exists.
			expect(view.getByRole('button', { name: /Export Game/i })).toBeTruthy();
		} finally {
			env.restore();
		}
	});
});

// Task 15: identity-reset policy, engine history eligibility, the Unrated
// engine rating display, and the debug/export visibility differences between
// an engine and an LLM session.
describe('ChessGame — identity policy, history & tools', () => {
	const devEnv = import.meta.env as unknown as { DEV: boolean };
	const originalDev = devEnv.DEV;

	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		__resetSharedAuthUserForTests();
		resetAIConfigStore();
		clearRivalPreferences();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		__resetSharedAuthUserForTests();
		resetAIConfigStore();
		clearRivalPreferences();
		devEnv.DEV = originalDev;
	});

	function whiteRadio(view: RenderResult): HTMLInputElement {
		return view.getByRole('radio', { name: 'White' }) as HTMLInputElement;
	}

	async function flushEffects(): Promise<void> {
		await act(async () => {
			for (let i = 0; i < 20; i++) {
				await Promise.resolve();
			}
			await new Promise(r => setTimeout(r, 0));
		});
	}

	// Installs DEV mode + a fetch mock that captures /play-history POST
	// bodies, resolves an unconfigured (engine-default) AI config, and
	// treats /auth/session as unauthenticated. `initialUser` seeds the
	// authenticated `useAuth` snapshot (or leaves the visitor anonymous).
	// Delegates to the shared `installRivalTestEnv` harness.
	function installSaveEnv(initialUser: InitialAuthUser | null): RivalTestEnv {
		return installRivalTestEnv({
			user: initialUser,
			session: 'unauth',
			aiConfig: 'empty',
			capturePlayHistory: true,
			devFlag: true,
		});
	}

	async function startEngine(view: RenderResult): Promise<void> {
		await waitForSetupResolved(view);
		await waitFor(() =>
			expect(
				(
					view.getByRole('radio', {
						name: /On-device computer/i,
					}) as HTMLInputElement
				).checked
			).toBe(true)
		);
		fireEvent.click(
			await waitFor(() => view.getByRole('button', { name: /start/i }))
		);
		await waitFor(() => expect(whiteRadio(view).disabled).toBe(true));
	}

	async function startLlm(view: RenderResult): Promise<void> {
		await waitForSetupResolved(view);
		await waitFor(() =>
			expect(
				(
					view.getByRole('radio', {
						name: /Language model/i,
					}) as HTMLInputElement
				).checked
			).toBe(true)
		);
		fireEvent.click(
			await waitFor(() => view.getByRole('button', { name: /start/i }))
		);
		await waitFor(() => expect(whiteRadio(view).disabled).toBe(true));
	}

	// DEV-only: Shift+D reveals the debug outcome buttons; clicking Win forces
	// a terminal (checkmate) position, which is the save trigger.
	async function forceWin(view: RenderResult): Promise<void> {
		const KE = (window as unknown as { KeyboardEvent: typeof KeyboardEvent })
			.KeyboardEvent;
		act(() => {
			window.dispatchEvent(new KE('keydown', { key: 'd', shiftKey: true }));
		});
		fireEvent.click(await waitFor(() => view.getByTitle('Debug: Win')));
		await flushEffects();
	}

	function signInEvent(user: InitialAuthUser): void {
		globalThis.dispatchEvent(
			new CustomEvent(AUTH_CHANGE_EVENT, { detail: { user } })
		);
	}

	test('an active LLM session resets local game state when auth is lost (re-enables selectors)', async () => {
		const authed = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startLlm(view);

			// Logout mid-game: the active LLM session must reset, re-enabling
			// the opponent/side selectors.
			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, { detail: { user: null } })
			);
			await waitFor(() => expect(whiteRadio(view).disabled).toBe(false));
		} finally {
			authed.restore();
		}
	});

	test('an active LLM session resets local game state on account change (re-enables selectors)', async () => {
		const authed = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startLlm(view);

			signInEvent({ id: 'user-b', email: 'b@test.com', username: 'userB' });
			await waitFor(() => expect(whiteRadio(view).disabled).toBe(false));
		} finally {
			authed.restore();
		}
	});

	test('an active engine session continues (stays locked) when auth is lost mid-game', async () => {
		const authed = installAuthedEnv(false); // LLM unconfigured -> engine default
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);

			globalThis.dispatchEvent(
				new CustomEvent(AUTH_CHANGE_EVENT, { detail: { user: null } })
			);
			await flushEffects();

			// The engine session is unaffected by the logout — still locked.
			expect(whiteRadio(view).disabled).toBe(true);
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
		} finally {
			authed.restore();
		}
	});

	test('an active engine session continues (stays locked) through an account change', async () => {
		const authed = installAuthedEnv(false);
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);

			signInEvent({ id: 'user-b', email: 'b@test.com', username: 'userB' });
			await flushEffects();

			expect(whiteRadio(view).disabled).toBe(true);
			expect(view.getByRole('button', { name: /new game/i })).toBeTruthy();
		} finally {
			authed.restore();
		}
	});

	test('an active engine session hides the prompt-oriented debug/export controls', async () => {
		const authed = installAuthedEnv(true); // LLM configured (tools would show)
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await waitForSetupResolved(view);

			// Switch to the engine even though the language model is configured.
			fireEvent.click(view.getByRole('radio', { name: /On-device computer/i }));
			await waitFor(() =>
				expect(
					(
						view.getByRole('radio', {
							name: /On-device computer/i,
						}) as HTMLInputElement
					).checked
				).toBe(true)
			);
			fireEvent.click(
				await waitFor(() => view.getByRole('button', { name: /start/i }))
			);
			await waitFor(() => expect(whiteRadio(view).disabled).toBe(true));

			// The engine carries no prompts — no Debug Mode toggle, no export.
			expect(view.queryByRole('button', { name: /Debug Mode/i })).toBeNull();
			expect(view.queryByRole('button', { name: /Export Game/i })).toBeNull();
		} finally {
			authed.restore();
		}
	});

	test('an active LLM session keeps the debug/export controls', async () => {
		const authed = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await waitForSetupResolved(view);
			await waitFor(() =>
				expect(
					(
						view.getByRole('radio', {
							name: /Language model/i,
						}) as HTMLInputElement
					).checked
				).toBe(true)
			);
			fireEvent.click(
				await waitFor(() => view.getByRole('button', { name: /start/i }))
			);
			await waitFor(() => expect(whiteRadio(view).disabled).toBe(true));

			expect(view.getByRole('button', { name: /Debug Mode/i })).toBeTruthy();
			expect(view.getByRole('button', { name: /Export Game/i })).toBeTruthy();
		} finally {
			authed.restore();
		}
	});

	test('LLM play history uses the config frozen at Start, not the live config after Start', async () => {
		const authed = installAuthedEnv(true);
		devEnv.DEV = true;
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startLlm(view);

			act(() => {
				setConfig({
					provider: 'gemini',
					model: 'gemini-2.5-flash',
					apiKey: 'gem-key',
					enabled: true,
				});
			});
			await flushEffects();

			await forceWin(view);
			expect(authed.playHistoryCount()).toBe(1);
			expect(authed.bodies[0]).toHaveProperty('opponentLlmId', 'gpt-4o');
		} finally {
			authed.restore();
		}
	});

	test('an active LLM session keeps New Game enabled when the live config becomes unavailable', async () => {
		const authed = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startLlm(view);

			const newGame = view.getByRole('button', {
				name: /New Game/i,
			}) as HTMLButtonElement;
			expect(newGame.disabled).toBe(false);

			// The live config becomes unusable mid-game (provider disabled).
			// The frozen LLM session continues, but Start gating must not
			// leak into the reset control: New Game stays enabled and keeps
			// its label instead of flipping to "Loading AI config…".
			act(() => {
				setConfig({
					provider: 'gemini',
					model: '',
					apiKey: '',
					enabled: false,
				});
			});
			await flushEffects();

			expect(
				(
					view.getByRole('button', {
						name: /New Game/i,
					}) as HTMLButtonElement
				).disabled
			).toBe(false);
			expect(
				view.queryByRole('button', { name: /Loading AI config/i })
			).toBeNull();
		} finally {
			authed.restore();
		}
	});

	test('an active engine session presents the opponent as Unrated', async () => {
		const { options } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await startEngine(view);
		// The rating summary marks the on-device engine opponent as Unrated.
		expect(view.getByText(/Computer plays \w+ · Unrated/i)).toBeTruthy();
	});

	test('a signed-in engine terminal game saves with the engine descriptor (same starting user)', async () => {
		const env = installSaveEnv({
			id: 'user-a',
			email: 'a@test.com',
			username: 'userA',
		});
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);
			await forceWin(view);

			expect(env.playHistoryCount()).toBe(1);
			expect(env.bodies[0]).toHaveProperty('opponentEngineId', 'stockfish');
			expect(env.bodies[0]).not.toHaveProperty('opponentLlmId');
			expect(env.bodies[0]).toHaveProperty('gameId', 'chess');
		} finally {
			env.restore();
		}
	});

	test('an engine game started anonymously never saves after a later sign-in', async () => {
		const env = installSaveEnv(null); // anonymous visitor
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);

			// Sign in AFTER starting anonymously (startedByUserId was null).
			signInEvent({ id: 'user-a', email: 'a@test.com', username: 'userA' });
			await flushEffects();
			expect(whiteRadio(view).disabled).toBe(true); // engine continues

			await forceWin(view);
			expect(env.playHistoryCount()).toBe(0);
		} finally {
			env.restore();
		}
	});

	test('an account switch disables the engine save without attributing to the new user', async () => {
		const env = installSaveEnv({
			id: 'user-a',
			email: 'a@test.com',
			username: 'userA',
		});
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);

			// Account switch A -> B mid-game; the engine session continues but
			// its save must not be attributed to B.
			signInEvent({ id: 'user-b', email: 'b@test.com', username: 'userB' });
			await flushEffects();
			expect(whiteRadio(view).disabled).toBe(true);

			await forceWin(view);
			expect(env.playHistoryCount()).toBe(0);
		} finally {
			env.restore();
		}
	});

	test('a signed-out engine game shows no LLM-only UI', async () => {
		const { options } = engineOptions();
		const view = render(<ChessGame rivalSessionOptions={options} />);
		await startEngine(view);

		// LlmRivalDetails (sign-in guidance, AI status panel, AI instructions)
		// is reserved for a language-model opponent; an engine game must not
		// surface any of its copy.
		expect(view.queryByText(/Click on a piece to select it/i)).toBeNull();
		expect(
			view.queryByText(/Sign in to configure your AI provider/i)
		).toBeNull();
		expect(view.queryByText(/AI not configured/i)).toBeNull();
		expect(view.queryByText(/Playing against/i)).toBeNull();
	});

	test('an active LLM session keeps the provider/model copy frozen at Start', async () => {
		const authed = installAuthedEnv(true);
		const options = {
			createLlmProvider: () =>
				new FakeRivalProvider({
					kind: 'llm',
					makeMove: async () => ({ ok: true, move: { from: 'e7', to: 'e5' } }),
				}),
		};
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startLlm(view);
			expect(
				view.getByText(/Playing against openai \(gpt-4o-mini\)/i)
			).toBeTruthy();

			// A config change mid-game must not swap the shown opponent: the
			// details copy stays frozen to the session that is actually playing.
			act(() => {
				setConfig({
					provider: 'gemini',
					model: 'gemini-2.5-flash',
					apiKey: 'gem-key',
					enabled: true,
				});
			});
			await flushEffects();

			expect(
				view.getByText(/Playing against openai \(gpt-4o-mini\)/i)
			).toBeTruthy();
			expect(view.queryByText(/Playing against gemini/i)).toBeNull();

			// The disabled opponent card shows the frozen identity too — the
			// live config change must not swap the displayed provider/model.
			expect(view.getByText('openai · gpt-4o-mini')).toBeTruthy();
			expect(view.queryByText('gemini · gemini-2.5-flash')).toBeNull();
		} finally {
			authed.restore();
		}
	});

	test('a terminal untouched engine game stays frozen to the engine once LLM becomes usable', async () => {
		const env = installSaveEnv(null); // anonymous signed-out visitor
		const { options } = engineOptions();
		try {
			const view = render(<ChessGame rivalSessionOptions={options} />);
			await startEngine(view);

			// Terminal: force a win clears `gameActive` but the frozen session
			// stays committed. Sign in and obtain a usable LLM config — the
			// mutable setup must not drift from the engine.
			await forceWin(view);
			signInEvent({ id: 'user-a', email: 'a@test.com', username: 'userA' });
			act(() => {
				setConfig({
					provider: 'openai',
					model: 'gpt-4o-mini',
					apiKey: 'sk-test',
					enabled: true,
				});
			});
			await flushEffects();

			const engineRadio = view.getByRole('radio', {
				name: /On-device computer/i,
			}) as HTMLInputElement;
			expect(engineRadio.checked).toBe(true);
			const llmRadio = view.getByRole('radio', {
				name: /Language model/i,
			}) as HTMLInputElement;
			expect(llmRadio.checked).toBe(false);
			// The summary still reflects the frozen engine session.
			expect(view.getByText(/Computer plays \w+ · Unrated/i)).toBeTruthy();
		} finally {
			env.restore();
		}
	});
});
