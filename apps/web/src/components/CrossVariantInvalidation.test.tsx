import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import XiangqiGame from './XiangqiGame';
import ShogiGame from './ShogiGame';
import JungleGame from './JungleGame';
import { AUTH_CHANGE_EVENT } from '../lib/auth';
import { resetAIConfigStore } from '../lib/ai/ai-config-store';

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

				globalThis.dispatchEvent(
					new CustomEvent(AUTH_CHANGE_EVENT, {
						detail: { user: null },
					})
				);

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
