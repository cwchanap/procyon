import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	afterEach,
	mock,
} from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Window } from 'happy-dom';
import React from 'react';
import ShogiHand from './ShogiHand';
import type { ShogiPiece } from '../lib/shogi';

// happy-dom is not auto-loaded under `bun test`, so the DOM globals that
// @testing-library/react depends on must be installed manually. This mirrors
// the setup used in src/lib/auth.test.ts.
//
// Note: we deliberately avoid the `screen` helper — its queries bind to
// `document.body` at module-import time, which runs before beforeAll. The
// queries returned by render() bind at call time and work correctly.
let happyWindow: Window;

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

// RTL auto-cleanup registers `afterEach(cleanup)` only when `afterEach` is
// available as a global at module-load time. Under some bun:test versions used
// in CI that hook does not fire, so containers from prior tests accumulate in
// `document.body` (the `baseElement` that render()'s queries bind to). The
// accumulated duplicate buttons then cause `getByLabelText` to throw
// "Found multiple elements". Registering cleanup explicitly here guarantees
// test isolation regardless of whether RTL's auto-cleanup hook fires.
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

const pawn: ShogiPiece = { type: 'pawn', color: 'sente' };
const rook: ShogiPiece = { type: 'rook', color: 'sente' };

describe('ShogiHand', () => {
	test('renders a grouped button per captured piece type', () => {
		const { getByLabelText, getByText } = render(
			<ShogiHand
				pieces={[pawn, pawn, rook]}
				color='sente'
				selectedPiece={null}
				onPieceClick={() => {}}
			/>
		);

		// Two distinct piece types -> two buttons, plus the count badge for pawn.
		expect(getByLabelText('Hand piece pawn')).toBeTruthy();
		expect(getByLabelText('Hand piece rook')).toBeTruthy();
		expect(getByText('2')).toBeTruthy();
	});

	test('buttons are enabled and fire onPieceClick by default', () => {
		const onPieceClick = mock();
		const { getByLabelText } = render(
			<ShogiHand
				pieces={[pawn]}
				color='sente'
				selectedPiece={null}
				onPieceClick={onPieceClick}
			/>
		);

		const button = getByLabelText('Hand piece pawn') as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		fireEvent.click(button);
		expect(onPieceClick).toHaveBeenCalledTimes(1);
		expect(onPieceClick).toHaveBeenCalledWith(pawn);
	});

	test('disabled prop removes buttons from interaction and tab order', () => {
		const onPieceClick = mock();
		const { getByLabelText } = render(
			<ShogiHand
				pieces={[pawn, rook]}
				color='sente'
				selectedPiece={null}
				onPieceClick={onPieceClick}
				disabled
			/>
		);

		const pawnButton = getByLabelText('Hand piece pawn') as HTMLButtonElement;
		const rookButton = getByLabelText('Hand piece rook') as HTMLButtonElement;

		// Native disabled attribute -> removed from tab order, no activation.
		expect(pawnButton.disabled).toBe(true);
		expect(rookButton.disabled).toBe(true);

		fireEvent.click(pawnButton);
		expect(onPieceClick).not.toHaveBeenCalled();
	});

	test('the selected piece is reflected in the selected variant', () => {
		const { container, getByLabelText } = render(
			<ShogiHand
				pieces={[pawn, rook]}
				color='sente'
				selectedPiece={pawn}
				onPieceClick={() => {}}
			/>
		);

		const pawnButton = getByLabelText('Hand piece pawn');
		// Selected button receives the ring styling from pieceButtonVariants.
		expect(pawnButton.className).toContain('ring-2');

		const buttons = container.querySelectorAll('button');
		const rookButton = Array.from(buttons).find(
			b => b.getAttribute('aria-label') === 'Hand piece rook'
		);
		expect(rookButton?.className ?? '').not.toContain('ring-2');
	});

	test('shows the empty-hand placeholder when there are no pieces', () => {
		const { getByText } = render(
			<ShogiHand
				pieces={[]}
				color='sente'
				selectedPiece={null}
				onPieceClick={() => {}}
			/>
		);

		expect(getByText('持ち駒なし')).toBeTruthy();
	});
});
