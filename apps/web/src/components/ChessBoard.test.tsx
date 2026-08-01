import { expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import type { ChessPiece } from '../lib/chess/types';
import { BOARD_SIZE } from '../lib/chess/types';
import { setupReactDom } from '../test/reactSetup';
import ChessBoard from './ChessBoard';

setupReactDom();

function createCornerBoard(): (ChessPiece | null)[][] {
	const board: (ChessPiece | null)[][] = Array.from(
		{ length: BOARD_SIZE },
		() => Array(BOARD_SIZE).fill(null)
	);
	board[0]![0] = { type: 'king', color: 'white' };
	board[0]![7] = { type: 'queen', color: 'white' };
	board[7]![0] = { type: 'king', color: 'black' };
	board[7]![7] = { type: 'queen', color: 'black' };
	return board;
}

function getSquareLabels(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll('button[aria-label^="Square"]')
	).map(button => button.getAttribute('aria-label') ?? '');
}

function renderBoard(
	board: (ChessPiece | null)[][],
	options?: {
		orientation?: 'white' | 'black';
		disabled?: boolean;
		onSquareClick?: (position: { row: number; col: number }) => void;
	}
) {
	const onSquareClick = options?.onSquareClick ?? mock(() => {});
	const view = render(
		<ChessBoard
			board={board}
			selectedSquare={null}
			possibleMoves={[]}
			onSquareClick={onSquareClick}
			orientation={options?.orientation}
			disabled={options?.disabled}
		/>
	);
	return { ...view, onSquareClick };
}

test('default white orientation preserves current visual order', () => {
	const board = createCornerBoard();
	const { container } = renderBoard(board);

	expect(getSquareLabels(container)).toEqual([
		'Square 0-0',
		'Square 0-1',
		'Square 0-2',
		'Square 0-3',
		'Square 0-4',
		'Square 0-5',
		'Square 0-6',
		'Square 0-7',
		'Square 1-0',
		'Square 1-1',
		'Square 1-2',
		'Square 1-3',
		'Square 1-4',
		'Square 1-5',
		'Square 1-6',
		'Square 1-7',
		'Square 2-0',
		'Square 2-1',
		'Square 2-2',
		'Square 2-3',
		'Square 2-4',
		'Square 2-5',
		'Square 2-6',
		'Square 2-7',
		'Square 3-0',
		'Square 3-1',
		'Square 3-2',
		'Square 3-3',
		'Square 3-4',
		'Square 3-5',
		'Square 3-6',
		'Square 3-7',
		'Square 4-0',
		'Square 4-1',
		'Square 4-2',
		'Square 4-3',
		'Square 4-4',
		'Square 4-5',
		'Square 4-6',
		'Square 4-7',
		'Square 5-0',
		'Square 5-1',
		'Square 5-2',
		'Square 5-3',
		'Square 5-4',
		'Square 5-5',
		'Square 5-6',
		'Square 5-7',
		'Square 6-0',
		'Square 6-1',
		'Square 6-2',
		'Square 6-3',
		'Square 6-4',
		'Square 6-5',
		'Square 6-6',
		'Square 6-7',
		'Square 7-0',
		'Square 7-1',
		'Square 7-2',
		'Square 7-3',
		'Square 7-4',
		'Square 7-5',
		'Square 7-6',
		'Square 7-7',
	]);
});

test('black orientation reverses rows and columns', () => {
	const board = createCornerBoard();
	const { container } = renderBoard(board, { orientation: 'black' });

	expect(getSquareLabels(container)[0]).toBe('Square 7-7');
	expect(getSquareLabels(container)[7]).toBe('Square 7-0');
	expect(getSquareLabels(container)[56]).toBe('Square 0-7');
	expect(getSquareLabels(container)[63]).toBe('Square 0-0');
});

test('visual top-left under black orientation reports canonical coordinates on click', () => {
	const board = createCornerBoard();
	const onSquareClick = mock(() => {});
	const { container } = renderBoard(board, {
		orientation: 'black',
		onSquareClick,
	});

	const topLeft = container.querySelector('button[aria-label^="Square"]');
	expect(topLeft?.getAttribute('aria-label')).toBe('Square 7-7');
	fireEvent.click(topLeft!);
	expect(onSquareClick).toHaveBeenCalledWith({ row: 7, col: 7 });
});

test('black orientation does not mutate the board array', () => {
	const board = createCornerBoard();
	const snapshot = board.map(row => [...row]);

	renderBoard(board, { orientation: 'black' });

	expect(board).toEqual(snapshot);
});

test('disabled behavior is unchanged under black orientation', () => {
	const board = createCornerBoard();
	const onSquareClick = mock(() => {});
	const { container } = renderBoard(board, {
		orientation: 'black',
		disabled: true,
		onSquareClick,
	});

	const topLeft = container.querySelector('button[aria-label^="Square"]');
	expect((topLeft as HTMLButtonElement | null)?.disabled).toBe(true);
	fireEvent.click(topLeft!);
	expect(onSquareClick).not.toHaveBeenCalled();
});
