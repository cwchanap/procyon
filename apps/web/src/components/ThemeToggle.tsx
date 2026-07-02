import React, { useEffect, useSyncExternalStore } from 'react';
import {
	applyTheme,
	subscribeTheme,
	getThemeSnapshot,
	toggleTheme,
} from '../lib/theme';
import { cn } from '../lib/utils';

const SunIcon = () => (
	<svg
		className='w-4 h-4'
		fill='none'
		stroke='currentColor'
		viewBox='0 0 24 24'
		strokeWidth={2}
		aria-hidden='true'
	>
		<circle cx='12' cy='12' r='4' />
		<path
			strokeLinecap='round'
			d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'
		/>
	</svg>
);

const MoonIcon = () => (
	<svg
		className='w-4 h-4'
		fill='none'
		stroke='currentColor'
		viewBox='0 0 24 24'
		strokeWidth={2}
		aria-hidden='true'
	>
		<path
			strokeLinecap='round'
			strokeLinejoin='round'
			d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
		/>
	</svg>
);

const ThemeToggle: React.FC = () => {
	// Subscribe to the shared theme store so the desktop rail and mobile
	// header toggles always reflect the same value. Toggling one updates the
	// other via the store's emit, so crossing the responsive breakpoint never
	// surfaces a stale label/icon or a no-op first click.
	const theme = useSyncExternalStore(
		subscribeTheme,
		getThemeSnapshot,
		getThemeSnapshot
	);

	useEffect(() => {
		// Apply the resolved theme to the DOM without persisting it. Writing to
		// localStorage here would stamp a user "choice" that didn't happen and
		// freeze out later OS-preference changes. Persistence is reserved for
		// the explicit toggle handler below.
		applyTheme(theme);
		// Mount-only: apply the resolved theme to the DOM once without
		// persisting it. Re-runs are unnecessary; the shared store drives
		// subsequent updates via useSyncExternalStore.
	}, []);

	const nextLabel = theme === 'dark' ? 'light' : 'dark';
	return (
		<button
			type='button'
			data-testid='theme-toggle'
			onClick={toggleTheme}
			aria-label={`Switch to ${nextLabel} mode`}
			title={`Switch to ${nextLabel} mode`}
			className={cn(
				'inline-flex h-9 w-9 items-center justify-center rounded-md border border-line',
				'text-ivory-dim transition-colors hover:bg-ink-600 hover:text-ivory'
			)}
		>
			{theme === 'dark' ? <SunIcon /> : <MoonIcon />}
		</button>
	);
};

export default ThemeToggle;
