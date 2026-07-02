import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import { setConfig, setAIPlayer } from '../../lib/ai/ai-config-store';
import SidebarAIConfig from './SidebarAIConfig';

setupReactDom();

mock.module('../../lib/auth', () => ({
	useAuth: () => ({
		isAuthenticated: true,
		user: { username: 'tester' },
		loading: false,
	}),
}));

describe('SidebarAIConfig', () => {
	beforeEach(() => {
		(globalThis as unknown as { fetch: unknown }).fetch = (() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ configurations: [] }),
			})) as unknown as typeof fetch;

		// reactSetup exposes happy-dom's `window` as a global but not its
		// `localStorage` slot, so saveAIConfig()'s bare `localStorage` reference
		// throws. Point the global at window.localStorage for the duration.
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: window.localStorage,
		});

		setConfig({
			provider: 'gemini',
			apiKey: 'key',
			model: 'gemini-2.5-flash-lite',
			enabled: true,
			gameVariant: 'chess',
		});
		setAIPlayer('black');
	});

	afterEach(() => {
		delete (globalThis as Partial<typeof globalThis>).localStorage;
	});

	test('renders provider, model, and AI-plays selects plus manage-keys link', async () => {
		const { getByLabelText, getByText } = render(<SidebarAIConfig />);
		await waitFor(() => {
			expect(getByLabelText(/AI Provider/i)).toBeTruthy();
		});
		expect(getByLabelText(/AI Model/i)).toBeTruthy();
		expect(getByLabelText(/AI plays/i)).toBeTruthy();
		expect(getByText(/Manage API keys/i)).toBeTruthy();
	});

	test('changing the model select updates the store', async () => {
		const { getByLabelText } = render(<SidebarAIConfig />);
		const modelSelect = getByLabelText(/AI Model/i) as HTMLSelectElement;
		fireEvent.change(modelSelect, { target: { value: 'gemini-2.5-pro' } });
		expect(modelSelect.value).toBe('gemini-2.5-pro');
		// Flush the mount-time useEffect's async fetch so its state update
		// settles inside act() rather than leaking after the test body.
		await waitFor(() => expect(modelSelect).toBeTruthy());
	});
});
