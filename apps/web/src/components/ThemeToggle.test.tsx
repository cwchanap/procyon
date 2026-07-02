import { describe, test, expect, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import { THEME_STORAGE_KEY, resetThemeStore } from '../lib/theme';
import ThemeToggle from './ThemeToggle';

setupReactDom();

describe('ThemeToggle', () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.classList.remove('light', 'dark');
		// The theme store caches its resolved value at module scope; reset it
		// so each test starts from a clean slate regardless of execution order.
		resetThemeStore();
		// happy-dom defaults `matchMedia('(prefers-color-scheme: light)').matches`
		// to true, which would make resolveInitialTheme() return 'light'. Pin the
		// system preference to dark so the component starts deterministically in
		// dark mode and the toggle test can flip dark -> light as written.
		// matchMedia is a readonly accessor on happy-dom's Window, so redefine it
		// via defineProperty (see AGENTS.md Task-1 convention note).
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: (query: string): MediaQueryList =>
				({
					matches: false,
					media: query,
					onchange: null,
					addListener: () => {},
					removeListener: () => {},
					addEventListener: () => {},
					removeEventListener: () => {},
					dispatchEvent: () => false,
				}) as unknown as MediaQueryList,
		});
	});

	test('renders an accessible button', () => {
		const { getByRole } = render(<ThemeToggle />);
		expect(getByRole('button', { name: /switch to/i })).toBeTruthy();
	});

	test('clicking toggles the html class and persists', () => {
		// start dark
		document.documentElement.classList.add('dark');
		const { getByRole } = render(<ThemeToggle />);
		const btn = getByRole('button', {
			name: /switch to/i,
		}) as HTMLButtonElement;
		fireEvent.click(btn);
		expect(document.documentElement.classList.contains('light')).toBe(true);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
	});

	test('two toggles stay in sync via the shared store', () => {
		// AppShell renders a desktop and a mobile ThemeToggle. Each used to
		// hold its own local state, so toggling one left the other stale.
		// Both now subscribe to the same store, so clicking one updates the
		// other's label/icon on the next render.
		document.documentElement.classList.add('dark');
		const { getAllByRole } = render(
			<>
				<ThemeToggle />
				<ThemeToggle />
			</>
		);
		const buttons = getAllByRole('button', {
			name: /switch to/i,
		}) as HTMLButtonElement[];
		expect(buttons.length).toBe(2);
		const first = buttons[0]!;
		const second = buttons[1]!;
		// Both start in dark mode, offering to switch to light.
		expect(first.getAttribute('aria-label')).toBe('Switch to light mode');
		expect(second.getAttribute('aria-label')).toBe('Switch to light mode');
		fireEvent.click(first);
		// After toggling the first, the second must also reflect light mode
		// (now offering to switch back to dark) without being clicked itself.
		expect(second.getAttribute('aria-label')).toBe('Switch to dark mode');
		expect(first.getAttribute('aria-label')).toBe('Switch to dark mode');
	});
});
