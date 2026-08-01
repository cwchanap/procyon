import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import type { EnginePreflight } from '../../lib/chess/rival/types';
import type { RivalSessionError } from '../../hooks/useChessRivalSession';
import EngineRivalDetails from './EngineRivalDetails';

setupReactDom();

const supportedEngine = {
	status: 'supported',
} as const satisfies EnginePreflight;

describe('EngineRivalDetails', () => {
	test('shows ready-to-load guidance before Start', () => {
		const { getByText } = render(
			<EngineRivalDetails
				enginePreflight={supportedEngine}
				startState='idle'
				rivalThinking={false}
				rivalError={null}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/Ready to load/i)).toBeTruthy();
		expect(getByText(/on-device engine/i)).toBeTruthy();
	});

	test('shows unsupported engine preflight message', () => {
		const { getByText } = render(
			<EngineRivalDetails
				enginePreflight={{
					status: 'unsupported',
					message: 'WebAssembly threads are unavailable.',
				}}
				startState='idle'
				rivalThinking={false}
				rivalError={null}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/WebAssembly threads are unavailable/i)).toBeTruthy();
	});

	test('shows loading state while the engine starts', () => {
		const { getByText } = render(
			<EngineRivalDetails
				enginePreflight={supportedEngine}
				startState='starting'
				rivalThinking={false}
				rivalError={null}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/Loading on-device engine/i)).toBeTruthy();
	});

	test('shows load failure with Try again action', () => {
		const onRetry = mock(() => {});
		const { getByRole, getByText } = render(
			<EngineRivalDetails
				enginePreflight={supportedEngine}
				startState='load-failed'
				rivalThinking={false}
				rivalError={null}
				onRetry={onRetry}
			/>
		);

		expect(getByText(/Engine load failed/i)).toBeTruthy();
		fireEvent.click(getByRole('button', { name: 'Try again' }));
		expect(onRetry).toHaveBeenCalled();
	});

	test('shows thinking state for active engine turns', () => {
		const { getByText } = render(
			<EngineRivalDetails
				enginePreflight={supportedEngine}
				startState='idle'
				rivalThinking={true}
				rivalError={null}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/Computer is thinking/i)).toBeTruthy();
	});

	test('shows active failure with New Game guidance', () => {
		const rivalError: RivalSessionError = {
			kind: 'move-failed',
			reason: 'invalid-move',
			message: 'The engine attempted an invalid move.',
		};
		const { getByText } = render(
			<EngineRivalDetails
				enginePreflight={supportedEngine}
				startState='idle'
				rivalThinking={false}
				rivalError={rivalError}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/The engine attempted an invalid move/i)).toBeTruthy();
		expect(getByText(/New Game/i)).toBeTruthy();
	});
});
