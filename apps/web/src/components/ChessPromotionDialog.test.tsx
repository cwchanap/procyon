import { expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import type { PromotionPiece } from '../lib/chess/types';
import ChessPromotionDialog from './ChessPromotionDialog';

setupReactDom();

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
