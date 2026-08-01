import { describe, test, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import GameControls from './GameControls';

setupReactDom();

const defaultProps = {
	hasGameStarted: false,
	isGameOver: false,
	aiConfigured: true,
	isDebugMode: false,
	canExport: false,
	onStartOrReset: mock(),
	onReset: mock(),
	onToggleDebug: mock(),
};

describe('GameControls', () => {
	test('renders default start label before game begins', () => {
		const { getByRole } = render(<GameControls {...defaultProps} />);
		expect(getByRole('button', { name: '▶️ Start' })).toBeTruthy();
	});

	test('renders new game label when game has started', () => {
		const { getByRole } = render(
			<GameControls {...defaultProps} hasGameStarted />
		);
		expect(getByRole('button', { name: '🆕 New Game' })).toBeTruthy();
	});

	test('renders play again when game is over', () => {
		const { getByRole } = render(<GameControls {...defaultProps} isGameOver />);
		expect(getByRole('button', { name: '🎮 Play Again' })).toBeTruthy();
	});

	test('startDisabled without override renders loading label', () => {
		const { getByRole } = render(
			<GameControls {...defaultProps} startDisabled />
		);
		expect(getByRole('button', { name: '⏳ Loading AI config…' })).toBeTruthy();
	});

	test('startLabel renders verbatim even when disabled', () => {
		const { getByRole } = render(
			<GameControls
				{...defaultProps}
				startDisabled
				startLabel={<span>Custom Start</span>}
			/>
		);
		expect(getByRole('button', { name: 'Custom Start' })).toBeTruthy();
	});

	test('showLlmTools overrides aiConfigured for debug and export tools', () => {
		const onExport = mock();
		const { queryByRole } = render(
			<GameControls
				{...defaultProps}
				aiConfigured={false}
				showLlmTools
				canExport
				onExport={onExport}
			/>
		);
		expect(queryByRole('button', { name: /debug mode/i })).toBeTruthy();
		expect(queryByRole('button', { name: /export game/i })).toBeTruthy();
	});

	test('omitted showLlmTools falls back to aiConfigured', () => {
		const hidden = render(
			<GameControls {...defaultProps} aiConfigured={false} />
		);
		expect(hidden.queryByRole('button', { name: /debug mode/i })).toBeNull();

		const shown = render(<GameControls {...defaultProps} aiConfigured />);
		expect(shown.queryByRole('button', { name: /debug mode/i })).toBeTruthy();
	});

	test('export button requires canExport and onExport', () => {
		const onExport = mock();
		const missingOnExport = render(
			<GameControls {...defaultProps} canExport />
		);
		expect(
			missingOnExport.queryByRole('button', { name: /export game/i })
		).toBeNull();

		const missingCanExport = render(
			<GameControls {...defaultProps} onExport={onExport} />
		);
		expect(
			missingCanExport.queryByRole('button', { name: /export game/i })
		).toBeNull();

		const { getByRole } = render(
			<GameControls {...defaultProps} canExport onExport={onExport} />
		);
		fireEvent.click(getByRole('button', { name: /export game/i }));
		expect(onExport).toHaveBeenCalled();
	});
});
