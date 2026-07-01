import { beforeAll, afterAll, afterEach } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { Window } from 'happy-dom';

let happyWindow: Window;

export function setupReactDom() {
	beforeAll(() => {
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
