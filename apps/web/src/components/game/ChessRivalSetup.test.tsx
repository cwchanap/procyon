import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import type {
	EngineDifficulty,
	EnginePreflight,
	GameSetup,
	LlmUsability,
	RivalKind,
} from '../../lib/chess/rival/types';
import ChessRivalSetup from './ChessRivalSetup';

setupReactDom();

const supportedEngine = {
	status: 'supported',
} as const satisfies EnginePreflight;
const availableLlm = {
	status: 'available',
	provider: 'openai',
	model: 'gpt-4o-mini',
} as const satisfies LlmUsability;

function renderSetup(
	overrides: Partial<{
		setup: GameSetup;
		enginePreflight: EnginePreflight;
		llmUsability: LlmUsability;
		disabled: boolean;
		lockReason: string | null;
		fallbackNotice: string | null;
		onSelectRival: (kind: RivalKind) => void;
		onSelectHumanSide: (side: 'white' | 'black') => void;
		onSelectDifficulty: (difficulty: EngineDifficulty) => void;
	}> = {}
) {
	return render(
		<ChessRivalSetup
			setup={
				overrides.setup ?? {
					rivalKind: 'engine',
					humanSide: 'white',
					engineDifficulty: 'casual',
				}
			}
			enginePreflight={overrides.enginePreflight ?? supportedEngine}
			llmUsability={overrides.llmUsability ?? availableLlm}
			disabled={overrides.disabled ?? false}
			lockReason={overrides.lockReason ?? null}
			fallbackNotice={overrides.fallbackNotice ?? null}
			onSelectRival={overrides.onSelectRival ?? (() => {})}
			onSelectHumanSide={overrides.onSelectHumanSide ?? (() => {})}
			onSelectDifficulty={overrides.onSelectDifficulty ?? (() => {})}
		/>
	);
}

describe('ChessRivalSetup', () => {
	test('renders opponent choices as an accessible radio group with exact labels', () => {
		const { getByRole, getByText } = renderSetup();

		expect(getByRole('radiogroup', { name: /opponent/i })).toBeTruthy();
		expect(getByRole('radio', { name: /On-device computer/i })).toBeTruthy();
		expect(getByRole('radio', { name: /Language model/i })).toBeTruthy();
		expect(getByText('On-device computer')).toBeTruthy();
		expect(getByText('Language model')).toBeTruthy();
	});

	test('describes the engine as on-device, account-free, and unrated', () => {
		const { getAllByText, getByText } = renderSetup();

		expect(getByText(/Runs on this device/i)).toBeTruthy();
		expect(getByText(/No account or API key/i)).toBeTruthy();
		expect(getAllByText(/Unrated/i).length).toBeGreaterThan(0);
	});

	test('renders side controls under You play and emits side changes', () => {
		const onSelectHumanSide = mock(() => {});
		const { getByRole } = renderSetup({ onSelectHumanSide });

		expect(getByRole('radiogroup', { name: 'You play' })).toBeTruthy();
		fireEvent.click(getByRole('radio', { name: 'Black' }));

		expect(onSelectHumanSide).toHaveBeenCalledWith('black');
	});

	test('renders exactly the shared engine difficulty choices', () => {
		const { getByRole } = renderSetup();
		const group = getByRole('radiogroup', { name: /difficulty/i });
		expect(group).toBeTruthy();
		expect(getByRole('radio', { name: 'Casual' })).toBeTruthy();
		expect(getByRole('radio', { name: 'Normal' })).toBeTruthy();
		expect(getByRole('radio', { name: 'Strong' })).toBeTruthy();
	});

	test('difficulty is hidden for the language-model rival', () => {
		const { queryByRole } = renderSetup({
			setup: {
				rivalKind: 'llm',
				humanSide: 'white',
				engineDifficulty: 'strong',
			},
		});
		expect(queryByRole('radiogroup', { name: /difficulty/i })).toBeNull();
	});

	test('emits difficulty changes through onSelectDifficulty', () => {
		const onSelectDifficulty = mock(() => {});
		const { getByRole } = renderSetup({ onSelectDifficulty });
		fireEvent.click(getByRole('radio', { name: 'Strong' }));
		expect(onSelectDifficulty).toHaveBeenCalledWith('strong');
	});

	test('emits rival selection changes via onSelectRival', () => {
		const onSelectRival = mock(() => {});
		const { getByRole } = renderSetup({ onSelectRival });

		fireEvent.click(getByRole('radio', { name: /Language model/i }));

		expect(onSelectRival).toHaveBeenCalledWith('llm');
	});

	test('disables opponent and side selectors while setup is locked', () => {
		const { getByRole, getByText } = renderSetup({
			disabled: true,
			lockReason: 'Opponent settings are locked for the active game.',
		});

		expect(
			(getByRole('radio', { name: /On-device computer/i }) as HTMLInputElement)
				.disabled
		).toBe(true);
		expect(
			(getByRole('radio', { name: 'White' }) as HTMLInputElement).disabled
		).toBe(true);
		for (const label of ['Casual', 'Normal', 'Strong']) {
			expect(
				(getByRole('radio', { name: label }) as HTMLInputElement).disabled
			).toBe(true);
		}
		expect(
			getByText('Opponent settings are locked for the active game.')
		).toBeTruthy();
	});

	test('announces automatic fallback notices politely', () => {
		const { getByRole } = renderSetup({
			fallbackNotice:
				'Language model was unavailable, so on-device computer was selected.',
		});

		const notice = getByRole('status');
		expect(notice.getAttribute('aria-live')).toBe('polite');
		expect(notice.textContent).toContain('Language model was unavailable');
	});

	test('keeps an explicit unusable opponent selected', () => {
		const { getByRole, getByText } = renderSetup({
			setup: {
				rivalKind: 'llm',
				humanSide: 'black',
				engineDifficulty: 'casual',
			},
			llmUsability: { status: 'signed-out' },
		});

		expect(
			(getByRole('radio', { name: /Language model/i }) as HTMLInputElement)
				.checked
		).toBe(true);
		expect(getByText(/Sign in required/i)).toBeTruthy();
	});
});
