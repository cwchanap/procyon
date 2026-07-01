import React, { useEffect, useState } from 'react';
import { resolveInitialTheme, setTheme, type Theme } from '../lib/theme';
import { cn } from '../lib/utils';

const ThemeToggle: React.FC = () => {
	const [theme, setThemeState] = useState<Theme>('dark');

	useEffect(() => {
		const initial = resolveInitialTheme();
		setThemeState(initial);
		setTheme(initial);
	}, []);

	const toggle = () => {
		const next: Theme = theme === 'dark' ? 'light' : 'dark';
		setThemeState(next);
		setTheme(next);
	};

	const nextLabel = theme === 'dark' ? 'light' : 'dark';
	return (
		<button
			type='button'
			onClick={toggle}
			aria-label={`Switch to ${nextLabel} mode`}
			title={`Switch to ${nextLabel} mode`}
			className={cn(
				'inline-flex h-9 w-9 items-center justify-center rounded-md border border-line',
				'text-ivory-dim transition-colors hover:bg-ink-600 hover:text-ivory'
			)}
		>
			<span aria-hidden='true'>{theme === 'dark' ? '\u2600' : '\u263E'}</span>
		</button>
	);
};

export default ThemeToggle;
