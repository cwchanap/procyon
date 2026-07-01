import { describe, test, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import BoardSidePanel from './BoardSidePanel';

setupReactDom();

describe('BoardSidePanel', () => {
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

	test('renders children', () => {
		const { getByText } = render(
			<BoardSidePanel gameMode='ai' onModeChange={() => {}}>
				<div>STATUS CHILD</div>
			</BoardSidePanel>
		);
		expect(getByText('STATUS CHILD')).toBeTruthy();
	});
});
