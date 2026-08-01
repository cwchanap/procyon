import { describe, test, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import BoardSidePanel from './BoardSidePanel';

setupReactDom();

function renderDefault() {
	return render(<BoardSidePanel gameMode='ai' onModeChange={() => {}} />);
}

function renderWithLabel(aiModeLabel: string) {
	return render(
		<BoardSidePanel
			gameMode='ai'
			onModeChange={() => {}}
			aiModeLabel={aiModeLabel}
		/>
	);
}

describe('BoardSidePanel', () => {
	test('renders default AI mode label', () => {
		expect(
			renderDefault().getByRole('button', { name: 'Play vs AI' })
		).toBeTruthy();
	});

	test('renders custom AI mode label when provided', () => {
		expect(
			renderWithLabel('Play').getByRole('button', { name: 'Play' })
		).toBeTruthy();
	});

	test('clicking custom AI mode label still calls onModeChange with ai', () => {
		const onModeChange = mock();
		const { getByRole } = render(
			<BoardSidePanel
				gameMode='tutorial'
				onModeChange={onModeChange}
				aiModeLabel='Play'
			/>
		);
		fireEvent.click(getByRole('button', { name: 'Play' }));
		expect(onModeChange).toHaveBeenCalledWith('ai');
	});

	test('renders a Tutorial toggle and an AI toggle', () => {
		const { getByRole } = render(
			<BoardSidePanel gameMode='ai' onModeChange={() => {}} />
		);
		expect(getByRole('button', { name: /tutorial/i })).toBeTruthy();
		expect(getByRole('button', { name: /play vs ai/i })).toBeTruthy();
	});

	test('clicking Tutorial calls onModeChange', () => {
		const onModeChange = mock();
		const { getByRole } = render(
			<BoardSidePanel gameMode='ai' onModeChange={onModeChange} />
		);
		fireEvent.click(getByRole('button', { name: /tutorial/i }));
		expect(onModeChange).toHaveBeenCalledWith('tutorial');
	});

	test('clicking Play vs AI calls onModeChange', () => {
		const onModeChange = mock();
		const { getByRole } = render(
			<BoardSidePanel gameMode='tutorial' onModeChange={onModeChange} />
		);
		fireEvent.click(getByRole('button', { name: /play vs ai/i }));
		expect(onModeChange).toHaveBeenCalledWith('ai');
	});

	test('renders children', () => {
		const { getByText } = render(
			<BoardSidePanel gameMode='ai' onModeChange={() => {}}>
				<div>STATUS CHILD</div>
			</BoardSidePanel>
		);
		expect(getByText('STATUS CHILD')).toBeTruthy();
	});
});
