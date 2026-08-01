import { beforeAll, afterAll, afterEach, jest } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { Window } from 'happy-dom';

let happyWindow: Window;
let timerCleanupInstalled = false;

function clearFakeTimerMarker(): void {
	delete (
		globalThis.setTimeout as typeof setTimeout & { clock?: unknown }
	).clock;
}

function installTimerCleanup(): void {
	if (timerCleanupInstalled) return;

	const useRealTimers = jest.useRealTimers.bind(jest);
	jest.useRealTimers = (() => {
		const result = useRealTimers();
		clearFakeTimerMarker();
		return result;
	}) as typeof jest.useRealTimers;
	timerCleanupInstalled = true;
}

export function setupReactDom() {
	beforeAll(() => {
		installTimerCleanup();
		happyWindow = new Window();
		const g = globalThis as unknown as Record<string, unknown>;
		g.document = happyWindow.document;
		g.window = happyWindow;
		g.HTMLElement = happyWindow.HTMLElement;
		g.HTMLDivElement = happyWindow.HTMLDivElement;
		g.HTMLButtonElement = happyWindow.HTMLButtonElement;
		g.Element = happyWindow.Element;
		g.Node = happyWindow.Node;
		g.DocumentFragment = happyWindow.DocumentFragment;
		g.Text = happyWindow.Text;
		g.Comment = happyWindow.Comment;
		g.Selection = happyWindow.Selection;
		g.Range = happyWindow.Range;
		g.DOMRect = happyWindow.DOMRect;
		g.MutationObserver = happyWindow.MutationObserver;
		g.NodeFilter = happyWindow.NodeFilter;
		g.getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow);
	});

	afterEach(() => {
		cleanup();
		// Bun can restore the real timer implementation while leaving its
		// `clock` compatibility marker on setTimeout. Testing Library treats
		// that marker as proof fake timers are still active and then attempts
		// to advance an inactive clock. Normalize both pieces of state between
		// tests so one timer-focused suite cannot poison every later render.
		jest.useRealTimers();
	});

	afterAll(() => {
		const g = globalThis as unknown as Record<string, unknown>;
		for (const key of [
			'document',
			'window',
			'HTMLElement',
			'HTMLDivElement',
			'HTMLButtonElement',
			'Element',
			'Node',
			'DocumentFragment',
			'Text',
			'Comment',
			'Selection',
			'Range',
			'DOMRect',
			'MutationObserver',
			'NodeFilter',
			'getComputedStyle',
		]) {
			delete g[key];
		}
		happyWindow.close();
	});
}
