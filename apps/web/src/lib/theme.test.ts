import {
	describe,
	test,
	expect,
	beforeEach,
	beforeAll,
	afterAll,
	mock,
} from 'bun:test';
import { Window } from 'happy-dom';
import {
	THEME_STORAGE_KEY,
	getStoredTheme,
	resolveInitialTheme,
	applyTheme,
	setTheme,
} from './theme';

let happyWindow: Window;

beforeAll(() => {
	happyWindow = new Window();
	const g = globalThis as unknown as Record<string | symbol, unknown>;
	g.document = happyWindow.document;
	g.window = happyWindow;
});

afterAll(() => {
	const g = globalThis as unknown as Record<string | symbol, unknown>;
	delete g.document;
	delete g.window;
	happyWindow.close();
});

describe('theme helpers', () => {
	beforeEach(() => {
		const fakeLocalStorage = {
			store: {} as Record<string, string>,
			getItem(k: string) {
				return this.store[k] ?? null;
			},
			setItem(k: string, v: string) {
				this.store[k] = v;
			},
			removeItem(k: string) {
				delete this.store[k];
			},
		};
		Object.defineProperty(window, 'localStorage', {
			value: fakeLocalStorage,
			configurable: true,
			writable: true,
		});
		document.documentElement.classList.remove('light', 'dark');
	});

	test('getStoredTheme returns null when unset', () => {
		expect(getStoredTheme()).toBeNull();
	});

	test('getStoredTheme returns stored value', () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
		expect(getStoredTheme()).toBe('light');
	});

	test('getStoredTheme ignores invalid values', () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, 'banana');
		expect(getStoredTheme()).toBeNull();
	});

	test('resolveInitialTheme prefers stored over system', () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
		expect(resolveInitialTheme()).toBe('dark');
	});

	test('resolveInitialTheme falls back to system', () => {
		mock.module('globalThis', () => ({
			matchMedia: () => ({ matches: true }),
		}));
		// getSystemTheme reads matchMedia('(prefers-color-scheme: light)')
		Object.defineProperty(window, 'matchMedia', {
			value: () => ({ matches: true }),
			configurable: true,
			writable: true,
		});
		expect(resolveInitialTheme()).toBe('light');
	});

	test('applyTheme sets exactly one class', () => {
		applyTheme('light');
		expect(document.documentElement.classList.contains('light')).toBe(true);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		applyTheme('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(document.documentElement.classList.contains('light')).toBe(false);
	});

	test('setTheme persists and applies', () => {
		setTheme('light');
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
		expect(document.documentElement.classList.contains('light')).toBe(true);
	});
});
