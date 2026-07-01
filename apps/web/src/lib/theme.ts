export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'procyon-theme';

export function getStoredTheme(): Theme | null {
	if (typeof window === 'undefined') return null;
	const v = window.localStorage.getItem(THEME_STORAGE_KEY);
	return v === 'light' || v === 'dark' ? v : null;
}

export function getSystemTheme(): Theme {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return 'dark';
	}
	return window.matchMedia('(prefers-color-scheme: light)').matches
		? 'light'
		: 'dark';
}

export function resolveInitialTheme(): Theme {
	return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	const cl = document.documentElement.classList;
	cl.add(theme);
	cl.remove(theme === 'light' ? 'dark' : 'light');
}

export function setTheme(theme: Theme): void {
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	}
	applyTheme(theme);
}
