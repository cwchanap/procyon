import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import type {
	ActiveRivalSession,
	GameSetup,
} from '../../lib/chess/rival/types';
import RivalSetupSummary from './RivalSetupSummary';

setupReactDom();

describe('RivalSetupSummary', () => {
	test('summarizes engine setup with side and unrated status', () => {
		const setup: GameSetup = { rivalKind: 'engine', humanSide: 'white' };
		const { getByText } = render(<RivalSetupSummary setup={setup} />);

		expect(
			getByText('On-device computer · Computer plays Black · Unrated')
		).toBeTruthy();
	});

	test('summarizes language-model setup with model and side', () => {
		const setup: GameSetup = { rivalKind: 'llm', humanSide: 'black' };
		const { getByText } = render(
			<RivalSetupSummary setup={setup} llmModel='gpt-4o-mini' />
		);

		expect(
			getByText('Language model · gpt-4o-mini · Computer plays White')
		).toBeTruthy();
	});

	test('freezes active engine summary from the active session', () => {
		const session: ActiveRivalSession = {
			id: 7,
			opponent: { kind: 'engine', id: 'stockfish' },
			humanSide: 'black',
			rivalSide: 'white',
			startedByUserId: null,
		};
		const { getByText } = render(<RivalSetupSummary activeSession={session} />);

		expect(
			getByText('On-device computer · Computer plays White · Unrated')
		).toBeTruthy();
	});

	test('freezes active LLM summary from the active session opponent', () => {
		const session: ActiveRivalSession = {
			id: 8,
			opponent: { kind: 'llm', provider: 'openai', model: 'gpt-4o' },
			humanSide: 'white',
			rivalSide: 'black',
			startedByUserId: 'user-1',
		};
		const { getByText } = render(
			<RivalSetupSummary activeSession={session} llmModel='stale-model' />
		);

		expect(
			getByText('Language model · gpt-4o · Computer plays Black')
		).toBeTruthy();
	});
});
