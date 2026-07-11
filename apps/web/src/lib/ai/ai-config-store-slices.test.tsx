import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, act } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import {
	useAIConfig,
	useAIPlayer,
	setConfig,
	setModel,
	setAIPlayer,
	resetAIConfigStore,
} from './ai-config-store';
import { defaultAIConfig } from './storage';

setupReactDom();

/**
 * Verifies that components subscribing to a single slice (config or aiPlayer)
 * do NOT re-render when the other slice changes. This is the component-level
 * complement to the subscriber-notification test in ai-config-store.test.ts.
 */
describe('ai-config-store slice re-render isolation', () => {
	beforeEach(() => {
		resetAIConfigStore();
		// storage.ts references bare `localStorage` (globalThis.localStorage),
		// which happy-dom doesn't expose as a global. Point it at window.localStorage
		// for the duration (same pattern as SidebarAIConfig.test.tsx).
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: window.localStorage,
		});
		setConfig(defaultAIConfig);
		setAIPlayer('black');
	});

	afterEach(() => {
		delete (globalThis as Partial<typeof globalThis>).localStorage;
	});

	test('useAIConfig component does not re-render on aiPlayer-only change', () => {
		let renderCount = 0;
		const ConfigOnly: React.FC = () => {
			const { config } = useAIConfig();
			renderCount++;
			return <span data-testid='model'>{config.model}</span>;
		};

		render(<ConfigOnly />);
		const rendersAfterMount = renderCount;

		// Flip aiPlayer — config slice is untouched, so the component must not
		// re-render.
		act(() => {
			setAIPlayer('white');
		});
		expect(renderCount).toBe(rendersAfterMount);

		// Change config — this slice's subscriber should fire.
		act(() => {
			setModel('gpt-4o');
		});
		expect(renderCount).toBe(rendersAfterMount + 1);
	});

	test('useAIPlayer component does not re-render on config-only change', () => {
		let renderCount = 0;
		const PlayerOnly: React.FC = () => {
			const player = useAIPlayer();
			renderCount++;
			return <span data-testid='player'>{player}</span>;
		};

		render(<PlayerOnly />);
		const rendersAfterMount = renderCount;

		// Change config — aiPlayer slice is untouched, so no re-render.
		act(() => {
			setModel('gpt-4o');
		});
		expect(renderCount).toBe(rendersAfterMount);

		// Flip aiPlayer — this slice's subscriber should fire.
		act(() => {
			setAIPlayer('white');
		});
		expect(renderCount).toBe(rendersAfterMount + 1);
	});
});
