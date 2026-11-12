import {
	describe,
	test,
	expect,
	beforeEach,
	afterEach,
	jest,
	mock,
} from 'bun:test';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import { env } from '../lib/env';
import { GoogleSignInButton } from './GoogleSignInButton';

setupReactDom();

const TEST_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

/**
 * Advance fake timers inside act (Bun's `jest` exposes no typed
 * advanceTimersByTime; AeroplaneGame/ChessGame pattern). Timer callbacks
 * call setState, so they must run inside act.
 */
function advanceTimers(ms: number): void {
	act(() => {
		(
			jest as unknown as { advanceTimersByTime(ms: number): void }
		).advanceTimersByTime(ms);
	});
}

interface StubOptions {
	initializeThrows?: boolean;
	renderButtonThrows?: boolean;
}

/** Install a stubbed `window.google.accounts.id` (no real GIS script). */
function stubGoogle(options?: StubOptions) {
	const initialize = mock(() => {
		if (options?.initializeThrows) throw new Error('initialize exploded');
	});
	const renderButton = mock(() => {
		if (options?.renderButtonThrows) throw new Error('renderButton exploded');
	});
	(window as unknown as Record<string, unknown>).google = {
		accounts: { id: { initialize, renderButton } },
	};
	return { initialize, renderButton };
}

describe('GoogleSignInButton loading & error experience', () => {
	beforeEach(() => {
		// The component reads the client ID from the live `env` object at
		// effect/render time, so mutating the exported object (no mock.module —
		// it leaks process-wide, see ChessGame.test.tsx) is deterministic.
		env.PUBLIC_GOOGLE_CLIENT_ID = TEST_CLIENT_ID;
		delete (window as unknown as Record<string, unknown>).google;
		// Give useAuth a server snapshot so it skips its background
		// fetchSession() — otherwise the async fetch rejection resolves after
		// the test body and logs act() warnings (ChessGame.test.tsx pattern).
		(
			window as unknown as Record<string, unknown>
		).__PROCYON_INITIAL_AUTH_USER__ = {
			username: 'gis-test-user',
		};
		jest.useFakeTimers();
	});

	afterEach(() => {
		// reactSetup's afterEach also runs RTL cleanup() and useRealTimers.
		env.PUBLIC_GOOGLE_CLIENT_ID = '';
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
	});

	test('shows an accessible pending status overlaid on the reserved widget space while the GIS script loads', () => {
		const { getByRole } = render(<GoogleSignInButton />);
		const status = getByRole('status');
		expect(status.textContent).toMatch(/loading google sign-in/i);
		// The reserved height must live on the widget container and the status
		// must overlay that same space: a status as a sibling flex item would
		// add a gap-4 (16px) that vanishes when the status is removed — a
		// layout shift. Absolute positioning keeps it out of the flex flow.
		expect(status.style.position).toBe('absolute');
		const space = status.parentElement as HTMLElement;
		expect(space.style.minHeight).toBe('40px');
	});

	test('clears the pending status once the Google button renders', () => {
		const view = render(<GoogleSignInButton />);
		expect(view.getByRole('status')).toBeTruthy();
		const { initialize, renderButton } = stubGoogle(); // script arrives
		advanceTimers(100); // next poll tick finds it
		expect(initialize).toHaveBeenCalledTimes(1);
		expect(renderButton).toHaveBeenCalledTimes(1);
		expect(view.queryByRole('status')).toBeNull();
		// The reserved space stays on the widget container after the status is
		// removed, so clearing the pending state cannot shift the layout.
		const space = view.getByTestId('google-signin-widget-space');
		expect(space.style.minHeight).toBe('40px');
	});

	test('shows the GIS error with a Reload button after the script fails to load', () => {
		const { getByText, getByRole, queryByRole } = render(
			<GoogleSignInButton />
		);
		advanceTimers(6000); // exceed the ~5s bounded poll (50 × 100ms)
		expect(queryByRole('status')).toBeNull();
		expect(getByText(/not loaded/i)).toBeTruthy();
		expect(getByRole('button', { name: /reload/i })).toBeTruthy();
	});

	test('shows the existing error UI instead of a blank card when id.initialize throws', () => {
		const { renderButton } = stubGoogle({ initializeThrows: true });
		const { getByText, queryByRole } = render(<GoogleSignInButton />);
		advanceTimers(100);
		expect(renderButton).not.toHaveBeenCalled();
		expect(queryByRole('status')).toBeNull();
		expect(getByText(/failed to initialize/i)).toBeTruthy();
		expect(queryByRole('button', { name: /reload/i })).toBeTruthy();
	});

	test('shows the existing error UI instead of a blank card when renderButton throws', () => {
		const { initialize, renderButton } = stubGoogle({
			renderButtonThrows: true,
		});
		const { getByText, queryByRole } = render(<GoogleSignInButton />);
		advanceTimers(100);
		expect(initialize).toHaveBeenCalledTimes(1);
		expect(renderButton).toHaveBeenCalledTimes(1);
		expect(queryByRole('status')).toBeNull();
		expect(getByText(/failed to initialize/i)).toBeTruthy();
		expect(queryByRole('button', { name: /reload/i })).toBeTruthy();
	});

	test('Reload performs an actual page reload (the GIS script is injected only by Layout.astro)', () => {
		// Installing window.google after clicking cannot recover a failed
		// Layout.astro script request — only a real reload retries it.
		const originalReload = window.location.reload;
		const reload = mock(() => {});
		(window.location as unknown as { reload: () => void }).reload = reload;
		try {
			const view = render(<GoogleSignInButton />);
			advanceTimers(6000); // script fails to load
			fireEvent.click(view.getByRole('button', { name: /reload/i }));
			expect(reload).toHaveBeenCalledTimes(1);
		} finally {
			(window.location as unknown as { reload: () => void }).reload =
				originalReload;
		}
	});

	test('stops polling after unmount (cleanup retained)', () => {
		const view = render(<GoogleSignInButton />);
		view.unmount();
		const { initialize } = stubGoogle(); // script arrives after unmount
		advanceTimers(5000);
		expect(initialize).not.toHaveBeenCalled();
	});
});
