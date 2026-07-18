import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
	render,
	fireEvent,
	waitFor,
	cleanup,
	act,
} from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import ChessGame from '../ChessGame';
import XiangqiGame from '../XiangqiGame';
import ShogiGame from '../ShogiGame';
import JungleGame from '../JungleGame';
import { resetAIConfigStore } from '../../lib/ai/ai-config-store';
import { __resetSharedAuthUserForTests } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth-helpers';

setupReactDom();

// These tests cover two convergent patch behaviors shared across all four
// game variants:
//   1. The same-mode guard in toggleToMode (`if (newMode === gameMode)
//      return;`) — re-clicking the active mode button after a game starts
//      must NOT reset the board/history.
//   2. The DEV-only <DebugOutcomeButtons> rendering block, gated on
//      `import.meta.env.DEV && showDebugWinButton && gameStarted &&
//      !isGameOver`. Shift+D toggles showDebugWinButton (useGameDebugOutcomes).
//
// Auth/fetch strategy mirrors ChessGame.test.tsx / CrossVariantInvalidation:
// do NOT mock.module auth (global leak). Drive state via the real useAuth
// unauthenticated path (no __PROCYON_INITIAL_AUTH_USER__); the failed
// fetchSession is try/caught. Default AI side is the second player for every
// variant, so the AI-turn effect never fires and no game reaches a
// game-over status — usePlayHistory's save effect never fetches.

type GameCase = {
	name: string;
	Component: React.FC;
	selectId: string;
	debugVariantKey: string;
};

const GAMES: GameCase[] = [
	{
		name: 'ChessGame',
		Component: ChessGame,
		selectId: 'chess-ai-side',
		debugVariantKey: 'CHESS',
	},
	{
		name: 'XiangqiGame',
		Component: XiangqiGame,
		selectId: 'xiangqi-ai-side',
		debugVariantKey: 'XIANGQI',
	},
	{
		name: 'ShogiGame',
		Component: ShogiGame,
		selectId: 'shogi-ai-side',
		debugVariantKey: 'SHOGI',
	},
	{
		name: 'JungleGame',
		Component: JungleGame,
		selectId: 'jungle-ai-side',
		debugVariantKey: 'JUNGLE',
	},
];

type MutableEnv = { DEV: boolean };
const env = import.meta.env as unknown as MutableEnv;
const originalDev = env.DEV;

// IMPORTANT: We intentionally avoid `describe.each(GAMES)(...)` here.
// Bun 1.3.1 on Linux x64 has a bug where `describe.each` with an array of
// objects passes a SHIFTED element to the callback (iteration N's callback
// receives element N+1) while the `$name` title template still uses element
// N. The result: each suite renders the WRONG game component (ChessGame's
// suite renders XiangqiGame, etc.), and the per-iteration hooks leak across
// suites, so the Start button / hydrateError banner never appear and the
// tests time out. The bug is Linux-specific — the same file passes on macOS
// with both bun 1.3.1 and 1.3.14 — so it cannot be reproduced locally.
// Expanding the parametrized suites into plain `describe` blocks inside a
// `for...of` loop sidesteps the buggy `describe.each` argument-passing
// codepath entirely. Each loop iteration creates an independent describe
// scope with its own `const`-bound `Component`/`selectId`/`debugVariantKey`
// and its own beforeEach/afterEach, so there is no cross-iteration leakage.
for (const game of GAMES) {
	const { Component, selectId } = game;
	describe(`${game.name} — same-mode guard`, () => {
		beforeEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
		});

		afterEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
			cleanup();
		});

		test('re-clicking the active "Play vs AI" mode does not reset the started game', async () => {
			const { getByLabelText, getByRole } = render(<Component />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			expect(select.id).toBe(selectId);
			expect(select.disabled).toBe(false);

			// Start the game (unauthenticated => aiStarting is false => Start
			// proceeds and locks the AI-side select via gameActive). Wait for
			// the Start button to be ready before clicking, in case auth/config
			// initialization transiently renders it as "Loading AI config…"
			// (which would not match /start/i).
			const startButton = await waitFor(() =>
				getByRole('button', { name: /start/i })
			);
			fireEvent.click(startButton);
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// Re-click the active "Play vs AI" toggle. The same-mode guard must
			// short-circuit toggleToMode so the game is NOT reset — the AI-side
			// select stays locked (gameActive remains true).
			fireEvent.click(getByRole('button', { name: /play vs ai/i }));

			// Allow any pending state updates to flush, then assert the game
			// is still active (select still disabled). A guard-less toggle would
			// have set gameStarted=false and re-enabled the select.
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});
		});
	});
}

for (const game of GAMES) {
	const { Component, debugVariantKey } = game;
	describe(`${game.name} — DEV debug outcome buttons`, () => {
		// DEV=true makes usePlayHistory attempt a save on game-over (the
		// `isAuthenticated || DEV` guard does not short-circuit). Stub fetch +
		// global localStorage so the save POST resolves cleanly instead of
		// making a real network call to a dev server that isn't running.
		let originalFetch: typeof globalThis.fetch;
		let originalLocalStorageDesc: PropertyDescriptor | undefined;

		beforeEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
			env.DEV = true;
			originalFetch = globalThis.fetch;
			originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
				globalThis,
				'localStorage'
			);
			(globalThis as unknown as { fetch: unknown }).fetch = (() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({}),
					text: () => Promise.resolve(''),
				})) as unknown as typeof fetch;
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: window.localStorage,
			});
		});

		afterEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
			env.DEV = originalDev;
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
			cleanup();
		});

		test('renders DebugOutcomeButtons after Shift+D + Start, and clicking Win ends the game', async () => {
			const { getByLabelText, getByRole, getByTitle, queryByTitle } = render(
				<Component />
			);

			// Pre-game: no debug buttons rendered (gameStarted is false).
			expect(queryByTitle('Debug: Win')).toBeNull();

			// Shift+D toggles showDebugWinButton on (useGameDebugOutcomes).
			const KE = (window as unknown as { KeyboardEvent: typeof KeyboardEvent })
				.KeyboardEvent;
			act(() => {
				window.dispatchEvent(new KE('keydown', { key: 'd', shiftKey: true }));
			});

			// Still no buttons until a game starts.
			expect(queryByTitle('Debug: Win')).toBeNull();

			// Start the game (unauthenticated => Start proceeds).
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;
			fireEvent.click(getByRole('button', { name: /start/i }));
			await waitFor(() => {
				expect(select.disabled).toBe(true);
			});

			// Now the DEV-only DebugOutcomeButtons block renders.
			const winButton = await waitFor(() => getByTitle('Debug: Win'));
			expect(getByTitle('Debug: Loss')).toBeTruthy();
			expect(getByTitle('Debug: Draw')).toBeTruthy();

			// Clicking Win triggers triggerDebugWin -> setOutcome(checkmate),
			// ending the game. After game-over, !isGameOver is false so the
			// debug buttons unmount. Drain async effects (the DEV-mode
			// play-history save) so no state update leaks outside act.
			fireEvent.click(winButton);
			await waitFor(() => {
				expect(queryByTitle('Debug: Win')).toBeNull();
			});
			await act(async () => {
				for (let i = 0; i < 10; i++) {
					await Promise.resolve();
				}
			});
		});

		test('global trigger function calls onPrepareTriggerWin -> game starts + win', async () => {
			// The useGameDebugOutcomes hook registers a global function at
			// window.__PROCYON_DEBUG_<KEY>_TRIGGER_WIN__ that runs the full
			// prepare -> show -> win sequence. This is the ONLY path that
			// calls onPrepareTriggerWin (triggerDebugWin itself does not).
			// Calling it covers the onPrepareTriggerWin callback body in
			// each game component.
			const { getByRole, queryByTitle } = render(<Component />);

			// Precondition: the game has not started, so the "Play Again"
			// button (which only renders when isGameOver is true) is absent.
			// This establishes that the postcondition below is a real state
			// transition, not the initial state.
			expect(queryByTitle('Debug: Win')).toBeNull();
			expect(() => getByRole('button', { name: /Play Again/i })).toThrow();

			const triggerKey = `__PROCYON_DEBUG_${debugVariantKey}_TRIGGER_WIN__`;
			const trigger = (
				window as unknown as Record<string, (() => void) | undefined>
			)[triggerKey];
			expect(trigger).toBeDefined();

			act(() => {
				trigger!();
			});

			// onPrepareTriggerWin sets gameStarted=true, then
			// showDebugWinButton=true, then triggerDebugWin sets the win
			// outcome (checkmate). isGameOver becomes true, which renders the
			// "🎮 Play Again" button — a state that differs from the initial
			// pre-game state, so a no-op trigger would fail this assertion.
			await waitFor(() => {
				expect(getByRole('button', { name: /Play Again/i })).toBeTruthy();
			});
			// After game-over the debug buttons also unmount.
			await waitFor(() => {
				expect(queryByTitle('Debug: Win')).toBeNull();
			});
			await act(async () => {
				for (let i = 0; i < 10; i++) {
					await Promise.resolve();
				}
			});
		});
	});
}

// Covers the hydrateError banner rendering across variants. When the user
// is authenticated but the /ai-config fetch fails, useAIConfigHydration
// sets hydrateError=true. The errorBanner block renders a "We couldn't
// load your AI settings" message with a Retry button. ChessGame does NOT
// have this banner (it uses a different error UI), so it's excluded.
const GAMES_WITH_HYDRATE_BANNER = GAMES.filter(g => g.name !== 'ChessGame');

for (const game of GAMES_WITH_HYDRATE_BANNER) {
	const { Component } = game;
	describe(`${game.name} — hydrateError banner`, () => {
		let originalFetch: typeof globalThis.fetch;
		let originalLocalStorageDesc: PropertyDescriptor | undefined;

		beforeEach(() => {
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
			env.DEV = true;
			originalFetch = globalThis.fetch;
			originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
				globalThis,
				'localStorage'
			);

			// Set an initial auth user so the auth snapshot starts
			// authenticated and revalidated.
			const mockUser: AuthUser = {
				id: 'test-user-id',
				email: 'test@example.com',
				username: 'testuser',
			};
			(
				window as unknown as Record<string, unknown>
			).__PROCYON_INITIAL_AUTH_USER__ = mockUser;

			// Mock fetch: /auth/session returns a valid user, /ai-config
			// returns 500 (triggers hydrateError). All other fetches (e.g.
			// play-history save) return 200.
			(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
				if (url.includes('/auth/session')) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ user: mockUser }),
					});
				}
				if (url.includes('/ai-config')) {
					return Promise.resolve({
						ok: false,
						status: 500,
						json: () => Promise.resolve({}),
						text: () => Promise.resolve(''),
					});
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({}),
					text: () => Promise.resolve(''),
				});
			}) as unknown as typeof fetch;

			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: window.localStorage,
			});
			// Clear localStorage so readLocalConfig returns null — the
			// hydrate fallback sets fromFallback=true -> hydrateError=true.
			window.localStorage.clear();
		});

		afterEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			__resetSharedAuthUserForTests();
			resetAIConfigStore();
			env.DEV = originalDev;
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
			cleanup();
		});

		test('renders hydrateError banner with Retry button when AI config fetch fails', async () => {
			const { getByText, getByRole } = render(<Component />);

			// Wait for the hydrateError banner to appear. The banner text
			// includes "We couldn't load your AI settings" and a Retry
			// button.
			await waitFor(
				() => {
					expect(getByText(/We couldn.*t load your AI settings/i)).toBeTruthy();
				},
				{ timeout: 5000 }
			);
			expect(getByRole('button', { name: /Retry/i })).toBeTruthy();
		});
	});
}
