import { expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import type { PromotionPiece } from '../lib/chess/types';
import ChessPromotionDialog from './ChessPromotionDialog';

setupReactDom();

function DismissiblePromotionDialog({
	onChoose,
	onCancel,
}: {
	onChoose: (promotion: PromotionPiece) => void;
	onCancel: () => void;
}) {
	const [open, setOpen] = React.useState(true);
	if (!open) return null;

	return (
		<ChessPromotionDialog
			color='white'
			choices={['queen', 'rook', 'bishop', 'knight']}
			onChoose={promotion => {
				onChoose(promotion);
				setOpen(false);
			}}
			onCancel={() => {
				onCancel();
				setOpen(false);
			}}
		/>
	);
}

test('offers four labelled choices and supports escape cancellation', () => {
	const choices: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];
	const onChoose = mock(() => {});
	const onCancel = mock(() => {});
	const view = render(
		<ChessPromotionDialog
			color='white'
			choices={choices}
			onChoose={onChoose}
			onCancel={onCancel}
		/>
	);

	expect(
		view.getByRole('dialog', { name: 'Choose promotion piece' })
	).toBeTruthy();
	expect(document.activeElement).toBe(
		view.getByRole('button', { name: 'Promote to queen' })
	);
	fireEvent.click(view.getByRole('button', { name: 'Promote to rook' }));
	expect(onChoose).toHaveBeenCalledWith('rook');
	fireEvent.keyDown(document, { key: 'Escape' });
	expect(onCancel).toHaveBeenCalledTimes(1);
});

test('restores the invoking focus after choosing a promotion', () => {
	const trigger = document.createElement('button');
	document.body.append(trigger);
	trigger.focus();
	const onChoose = mock(() => {});
	const onCancel = mock(() => {});
	const view = render(
		<DismissiblePromotionDialog onChoose={onChoose} onCancel={onCancel} />
	);

	expect(document.activeElement).toBe(
		view.getByRole('button', { name: 'Promote to queen' })
	);
	fireEvent.click(view.getByRole('button', { name: 'Promote to rook' }));

	expect(onChoose).toHaveBeenCalledWith('rook');
	expect(document.activeElement).toBe(trigger);
	trigger.remove();
});

test('restores the invoking focus after cancelling promotion', () => {
	const trigger = document.createElement('button');
	document.body.append(trigger);
	trigger.focus();
	const onChoose = mock(() => {});
	const onCancel = mock(() => {});
	const view = render(
		<DismissiblePromotionDialog onChoose={onChoose} onCancel={onCancel} />
	);

	fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

	expect(onCancel).toHaveBeenCalledTimes(1);
	expect(document.activeElement).toBe(trigger);
	trigger.remove();
});

test('Tab cycles through every choice and cancel, wrapping at both ends', () => {
	const choices: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];
	const onChoose = mock(() => {});
	const onCancel = mock(() => {});
	const view = render(
		<ChessPromotionDialog
			color='white'
			choices={choices}
			onChoose={onChoose}
			onCancel={onCancel}
		/>
	);

	const queen = view.getByRole('button', { name: 'Promote to queen' });
	const rook = view.getByRole('button', { name: 'Promote to rook' });
	const bishop = view.getByRole('button', { name: 'Promote to bishop' });
	const knight = view.getByRole('button', { name: 'Promote to knight' });
	const cancel = view.getByRole('button', { name: 'Cancel' });

	// Initial focus on queen (first choice)
	expect(document.activeElement).toBe(queen);

	// Tab forward: queen → rook → bishop → knight → cancel → wrap to queen
	fireEvent.keyDown(document, { key: 'Tab' });
	expect(document.activeElement).toBe(rook);
	fireEvent.keyDown(document, { key: 'Tab' });
	expect(document.activeElement).toBe(bishop);
	fireEvent.keyDown(document, { key: 'Tab' });
	expect(document.activeElement).toBe(knight);
	fireEvent.keyDown(document, { key: 'Tab' });
	expect(document.activeElement).toBe(cancel);
	// Tab on cancel (last) wraps to queen (first)
	fireEvent.keyDown(document, { key: 'Tab' });
	expect(document.activeElement).toBe(queen);

	// Shift+Tab on queen (first) wraps to cancel (last)
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
	expect(document.activeElement).toBe(cancel);
	// Shift+Tab backward: cancel → knight → bishop → rook → queen
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
	expect(document.activeElement).toBe(knight);
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
	expect(document.activeElement).toBe(bishop);
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
	expect(document.activeElement).toBe(rook);
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
	expect(document.activeElement).toBe(queen);
});
