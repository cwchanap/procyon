import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import DebugOutcomeButtons from './DebugOutcomeButtons';

setupReactDom();

type MutableEnv = { DEV: boolean };
const env = import.meta.env as unknown as MutableEnv;
const originalDev = env.DEV;

describe('DebugOutcomeButtons', () => {
	beforeEach(() => {
		env.DEV = true;
	});

	afterEach(() => {
		env.DEV = originalDev;
		cleanup();
	});

	test('renders nothing in production (DEV false)', () => {
		env.DEV = false;
		const { container } = render(
			<DebugOutcomeButtons
				onWin={() => {}}
				onLoss={() => {}}
				onDraw={() => {}}
			/>
		);
		expect(container.innerHTML).toBe('');
	});

	test('renders Win, Loss, and Draw buttons in DEV', () => {
		const { getByTitle } = render(
			<DebugOutcomeButtons
				onWin={() => {}}
				onLoss={() => {}}
				onDraw={() => {}}
			/>
		);
		expect(getByTitle('Debug: Win')).toBeTruthy();
		expect(getByTitle('Debug: Loss')).toBeTruthy();
		expect(getByTitle('Debug: Draw')).toBeTruthy();
	});

	test('clicking Win calls onWin', () => {
		const onWin = mock(() => {});
		const { getByTitle } = render(
			<DebugOutcomeButtons onWin={onWin} onLoss={() => {}} onDraw={() => {}} />
		);
		fireEvent.click(getByTitle('Debug: Win'));
		expect(onWin).toHaveBeenCalledTimes(1);
	});

	test('clicking Loss calls onLoss', () => {
		const onLoss = mock(() => {});
		const { getByTitle } = render(
			<DebugOutcomeButtons onWin={() => {}} onLoss={onLoss} onDraw={() => {}} />
		);
		fireEvent.click(getByTitle('Debug: Loss'));
		expect(onLoss).toHaveBeenCalledTimes(1);
	});

	test('clicking Draw calls onDraw', () => {
		const onDraw = mock(() => {});
		const { getByTitle } = render(
			<DebugOutcomeButtons onWin={() => {}} onLoss={() => {}} onDraw={onDraw} />
		);
		fireEvent.click(getByTitle('Debug: Draw'));
		expect(onDraw).toHaveBeenCalledTimes(1);
	});
});
