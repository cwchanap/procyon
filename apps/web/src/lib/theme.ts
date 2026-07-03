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

/**
 * Shared, module-level theme store so every ThemeToggle instance (desktop
 * rail + mobile header in AppShell) tracks the same value. Without this, each
 * toggle holds its own local state: toggling on mobile then crossing the
 * desktop breakpoint leaves the newly visible toggle showing a stale
 * label/icon, and its first click toggles from the stale value back to the
 * theme that is already applied (a no-op). The store is read via
 * `useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot)`
 * (see ThemeToggle.tsx) and mutated via {@link toggleTheme}.
 */
const themeListeners = new Set<() => void>();
let cachedTheme: Theme | null = null;

function resolveCachedTheme(): Theme {
	if (cachedTheme === null) cachedTheme = resolveInitialTheme();
	return cachedTheme;
}

function emitTheme(): void {
	for (const cb of themeListeners) cb();
}

export function subscribeTheme(cb: () => void): () => void {
	themeListeners.add(cb);
	return () => {
		themeListeners.delete(cb);
	};
}

export function getThemeSnapshot(): Theme {
	return resolveCachedTheme();
}

/** Flip the shared theme to the opposite value and persist it. */
export function toggleTheme(): void {
	const next: Theme = resolveCachedTheme() === 'dark' ? 'light' : 'dark';
	cachedTheme = next;
	setTheme(next);
	emitTheme();
}

/** Reset the shared store cache. Intended for tests so each file starts from
 * a clean slate regardless of execution order. */
export function resetThemeStore(): void {
	cachedTheme = null;
	themeListeners.clear();
}
