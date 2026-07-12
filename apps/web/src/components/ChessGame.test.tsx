import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import ChessGame from './ChessGame';
import { AUTH_CHANGE_EVENT } from '../lib/auth';
import { resetAIConfigStore } from '../lib/ai/ai-config-store';

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
});
