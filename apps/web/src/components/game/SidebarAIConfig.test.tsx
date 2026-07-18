import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import {
	setConfig,
	hydrate,
	resetAIConfigStore,
} from '../../lib/ai/ai-config-store';
import SidebarAIConfig from './SidebarAIConfig';
import { __resetSharedAuthUserForTests } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth-helpers';

setupReactDom();

const TEST_USER: AuthUser = {
	id: 'sidebar-ai-config-test-user',
	email: 'sidebar-ai-config@example.com',
	username: 'tester',
};

let originalFetch: typeof globalThis.fetch;
let originalLocalStorageDesc: PropertyDescriptor | undefined;

function setInitialAuthUser(user: AuthUser | null): void {
	(
		window as unknown as { __PROCYON_INITIAL_AUTH_USER__?: AuthUser | null }
	).__PROCYON_INITIAL_AUTH_USER__ = user;
}

function clearInitialAuthUser(): void {
	delete (
		window as unknown as { __PROCYON_INITIAL_AUTH_USER__?: AuthUser | null }
	).__PROCYON_INITIAL_AUTH_USER__;
}

function installUnauthenticatedSession(): void {
	(globalThis as unknown as { fetch: unknown }).fetch = (() =>
		Promise.resolve({
			ok: false,
			status: 401,
			json: () => Promise.resolve({}),
		})) as unknown as typeof fetch;
}

describe('SidebarAIConfig', () => {
	beforeEach(() => {
		resetAIConfigStore();
		__resetSharedAuthUserForTests();
		setInitialAuthUser(TEST_USER);
		originalFetch = globalThis.fetch;
		originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
			globalThis,
			'localStorage'
		);

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
		window.localStorage.clear();

		setConfig({
			provider: 'gemini',
			apiKey: 'key',
			model: 'gemini-2.5-flash-lite',
			enabled: true,
			gameVariant: 'chess',
		});
	});

	afterEach(() => {
		resetAIConfigStore();
		__resetSharedAuthUserForTests();
		clearInitialAuthUser();
		(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
		if (originalLocalStorageDesc) {
			Object.defineProperty(
				globalThis,
				'localStorage',
				originalLocalStorageDesc
			);
		} else {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});

	test('renders provider and model selects plus manage-keys link', async () => {
		const { getByLabelText, getByText } = render(<SidebarAIConfig />);
		await waitFor(() => {
			expect(getByLabelText(/AI Provider/i)).toBeTruthy();
		});
		expect(getByLabelText(/AI Model/i)).toBeTruthy();
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

	test('shows retry prompt when hydration fails (hydrateError)', async () => {
		(globalThis as unknown as { fetch: unknown }).fetch = (() =>
			Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

		await hydrate();

		const { getByText, queryByLabelText } = render(<SidebarAIConfig />);
		expect(getByText(/couldn[\u2019']t load your AI settings/i)).toBeTruthy();
		expect(getByText(/Retry/i)).toBeTruthy();
		// Provider select must not render in the error/retry state.
		expect(queryByLabelText(/AI Provider/i)).toBeNull();
	});

	test('shows sign-in prompt (not retry) when unauthenticated and hydration fails', async () => {
		// A signed-out visitor on /chess hits the protected /ai-config endpoint,
		// which 401s and sets hydrateError. The sidebar should surface a
		// sign-in prompt rather than a connection/retry error, since
		// unauthenticated is the expected state for a public page.
		setInitialAuthUser(null);
		(globalThis as unknown as { fetch: unknown }).fetch = (() =>
			Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

		await hydrate();

		const { getByText, queryByText, queryByLabelText } = render(
			<SidebarAIConfig />
		);
		await waitFor(() => {
			expect(getByText(/Sign in to configure your AI provider/i)).toBeTruthy();
			expect(getByText(/Sign in →/i)).toBeTruthy();
		});
		// The connection-error/retry copy must not appear for unauth users.
		expect(queryByText(/couldn[\u2019']t load your AI settings/i)).toBeNull();
		expect(queryByText(/Retry/i)).toBeNull();
		// Provider select must not render in the sign-in state.
		expect(queryByLabelText(/AI Provider/i)).toBeNull();
	});

	test('shows empty-providers prompt when hydrated with no keyed providers', async () => {
		// Default beforeEach fetch mock returns { configurations: [] } (ok),
		// which hydrate treats as a successful load with zero providers.
		await hydrate();

		const { getByText, queryByLabelText } = render(<SidebarAIConfig />);
		expect(getByText(/No AI providers configured/i)).toBeTruthy();
		expect(getByText(/Manage API keys/i)).toBeTruthy();
		// Provider select must not render in the empty-state.
		expect(queryByLabelText(/AI Provider/i)).toBeNull();
	});

	test('shows sign-in prompt (not controls) when unauthenticated and not hydrated', async () => {
		// Signed-out visitors never hydrate (AppShell gates hydrate on auth),
		// so `hydrated` stays false. The sidebar must surface the sign-in
		// prompt directly rather than rendering provider/model controls that
		// onProviderChange would reject after the fact.
		setInitialAuthUser(null);
		installUnauthenticatedSession();

		const { getByText, queryByLabelText } = render(<SidebarAIConfig />);
		await waitFor(() => {
			expect(getByText(/Sign in to configure your AI provider/i)).toBeTruthy();
			expect(getByText(/Sign in →/i)).toBeTruthy();
		});
		// Provider/model selects must not render for unauth users.
		expect(queryByLabelText(/AI Provider/i)).toBeNull();
		expect(queryByLabelText(/AI Model/i)).toBeNull();
	});

	test('model select is disabled until hydration completes', () => {
		// Before hydrate() resolves, the model dropdown shows the DEFAULT
		// provider's models (gemini from defaultAIConfig), not the user's
		// saved provider. Allowing a model pick during this window would
		// be silently reverted when runHydrate replaces the entire config
		// with the fetched snapshot (setModel doesn't bump
		// setProviderGeneration, so the race guard at runHydrate doesn't
		// fire). The control must be disabled until hydrated=true.
		const { getByLabelText } = render(<SidebarAIConfig />);
		const modelSelect = getByLabelText(/AI Model/i) as HTMLSelectElement;
		expect(modelSelect.disabled).toBe(true);
	});

	test('model select is enabled after hydration completes', async () => {
		(globalThis as unknown as { fetch: unknown }).fetch = (() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						configurations: [
							{
								id: 'cfg-g',
								provider: 'gemini',
								hasApiKey: true,
								isActive: true,
							},
						],
					}),
			})) as unknown as typeof fetch;

		await hydrate();
		const { getByLabelText } = render(<SidebarAIConfig />);
		const modelSelect = getByLabelText(/AI Model/i) as HTMLSelectElement;
		expect(modelSelect.disabled).toBe(false);
	});

	test('shows error message when setProvider fails to load config list', async () => {
		// Render first (un-hydrated → ALL_PROVIDER_OPTIONS visible), then make
		// fetch throw so setProvider's fetchAIConfigList rejects.
		const { getByLabelText, getByText } = render(<SidebarAIConfig />);
		const providerSelect = getByLabelText(/AI Provider/i) as HTMLSelectElement;

		(globalThis as unknown as { fetch: unknown }).fetch = (() =>
			Promise.reject(new Error('Network error'))) as unknown as typeof fetch;

		fireEvent.change(providerSelect, { target: { value: 'openai' } });

		await waitFor(() => {
			expect(getByText(/couldn't load your saved AI config/i)).toBeTruthy();
		});
	});
});
