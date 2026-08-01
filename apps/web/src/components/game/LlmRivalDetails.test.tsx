import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import type { LlmUsability } from '../../lib/chess/rival/types';
import LlmRivalDetails from './LlmRivalDetails';

setupReactDom();

const availableLlm = {
	status: 'available',
	provider: 'openai',
	model: 'gpt-4o-mini',
} as const satisfies LlmUsability;

describe('LlmRivalDetails', () => {
	test('preserves sign-in guidance for signed-out players', () => {
		const { getByText, queryByText } = render(
			<LlmRivalDetails
				llmUsability={{ status: 'signed-out' }}
				hasGameStarted={false}
				isAIThinking={false}
				isAIPaused={false}
				aiError={null}
				aiDebugMoves={[]}
				isDebugMode={false}
				onRetry={() => {}}
			/>
		);

		expect(getByText(/Sign in to configure your AI provider/i)).toBeTruthy();
		expect(queryByText(/on-device engine/i)).toBeNull();
	});

	test('preserves configuration guidance for unconfigured AI', () => {
		const { getByText, queryByText } = render(
			<LlmRivalDetails
				llmUsability={{ status: 'unconfigured' }}
				hasGameStarted={true}
				isAIThinking={false}
				isAIPaused={false}
				aiError={null}
				aiDebugMoves={[]}
				isDebugMode={false}
				onRetry={() => {}}
			/>
		);

		expect(
			getByText(/Configure API key in Profile to enable AI/i)
		).toBeTruthy();
		expect(queryByText(/Runs on this device/i)).toBeNull();
	});

	test('wraps current instructions for an available LLM opponent', () => {
		const { getByText, queryByText } = render(
			<LlmRivalDetails
				llmUsability={availableLlm}
				hasGameStarted={true}
				isAIThinking={false}
				isAIPaused={false}
				aiError={null}
				aiDebugMoves={[]}
				isDebugMode={false}
				onRetry={() => {}}
			/>
		);

		expect(getByText('Playing against openai (gpt-4o-mini)')).toBeTruthy();
		expect(getByText(/Possible moves/i)).toBeTruthy();
		expect(queryByText(/No account or API key/i)).toBeNull();
	});

	test('preserves LLM retry and debug copy', () => {
		const onRetry = mock(() => {});
		const { getByRole, getByText } = render(
			<LlmRivalDetails
				llmUsability={availableLlm}
				hasGameStarted={true}
				isAIThinking={false}
				isAIPaused={true}
				aiError='Model returned an invalid move.'
				aiDebugMoves={[
					{
						moveNumber: 1,
						player: 'AI',
						move: 'e7-e5',
						timestamp: 1_700_000_000,
						isAI: true,
						thinking: 'I should contest the center.',
					},
				]}
				isDebugMode={true}
				onRetry={onRetry}
			/>
		);

		expect(getByText(/AI Error/i)).toBeTruthy();
		expect(getByText(/Model returned an invalid move/i)).toBeTruthy();
		expect(getByText(/AI Move History/i)).toBeTruthy();
		fireEvent.click(getByRole('button', { name: /Retry/i }));
		expect(onRetry).toHaveBeenCalled();
	});
});
