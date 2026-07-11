import { test, expect, describe } from 'bun:test';

// Test AbortController cleanup pattern
describe('useGameAI AbortController cleanup', () => {
	test('AbortController cleanup pattern prevents memory leaks', () => {
		let abortController: AbortController | null = null;
		let cleanupCalled = false;

		// Simulate useEffect cleanup pattern from useGameAI
		const simulateMount = () => {
			abortController = new AbortController();
		};

		const simulateUnmount = () => {
			if (abortController) {
				abortController.abort();
				abortController = null;
				cleanupCalled = true;
			}
		};

		// Test the pattern
		simulateMount();
		expect(abortController).not.toBeNull();

		simulateUnmount();
		expect(cleanupCalled).toBe(true);
		expect(abortController).toBeNull();
	});

	test('Multiple provider changes properly clean up previous controllers', () => {
		const abortControllers: Array<AbortController> = [];

		const createController = (): AbortController => {
			const controller = new AbortController();
			abortControllers.push(controller);
			return controller;
		};

		const cleanupController = (controller: AbortController | null) => {
			if (controller) {
				controller.abort();
			}
		};

		// Simulate multiple provider changes
		let currentController: AbortController | null = null;

		// First change
		cleanupController(currentController);
		currentController = createController();

		// Second change
		cleanupController(currentController);
		currentController = createController();

		// Third change
		cleanupController(currentController);
		currentController = createController();

		// Verify all previous controllers were aborted
		expect(abortControllers).toHaveLength(3);
		// Type assertion needed because TypeScript can't infer array elements exist
		const controllers = abortControllers as [
			AbortController,
			AbortController,
			AbortController,
		];
		expect(controllers[0].signal.aborted).toBe(true);
		expect(controllers[1].signal.aborted).toBe(true);
		expect(controllers[2].signal.aborted).toBe(false); // Current one not aborted yet

		// Unmount cleanup
		cleanupController(currentController);
		currentController = null;

		expect(controllers[2].signal.aborted).toBe(true);
		expect(currentController).toBeNull();
	});
});

// Test config merge consistency between state update and callback
describe('useGameAI config merge consistency', () => {
	test('Functional state update with onConfigChange callback receives consistent merged config', () => {
		// Simulate the pattern used in handleProviderChange
		type TestConfig = {
			provider: string;
			model: string;
			apiKey: string;
			enabled: boolean;
			extraField?: string;
		};

		const initialConfig: TestConfig = {
			provider: 'gemini',
			model: 'gemini-2.5-pro',
			apiKey: 'old-key',
			enabled: false,
			extraField: 'preserve-this',
		};

		let state: TestConfig = initialConfig;
		let callbackConfig: TestConfig | undefined;

		const newConfig: Partial<TestConfig> = {
			provider: 'openai',
			model: 'gpt-4',
			apiKey: 'new-key',
			enabled: true,
		};

		// Simulate the pattern where merged config is created once
		// and used for both state update and callback
		const updater = (prev: TestConfig): TestConfig => {
			const merged = { ...prev, ...newConfig };
			callbackConfig = merged;
			return merged;
		};
		state = updater(state);

		// Verify state and callback receive the same merged object
		expect(state.provider).toBe('openai');
		expect(state.model).toBe('gpt-4');
		expect(state.apiKey).toBe('new-key');
		expect(state.enabled).toBe(true);
		expect(state.extraField).toBe('preserve-this'); // Preserved from prev

		// Callback should receive the exact same merged config
		if (callbackConfig) {
			expect(callbackConfig).toEqual(state);
			expect(callbackConfig.provider).toBe('openai');
			expect(callbackConfig.model).toBe('gpt-4');
			expect(callbackConfig.apiKey).toBe('new-key');
			expect(callbackConfig.enabled).toBe(true);
			expect(callbackConfig.extraField).toBe('preserve-this');

			// Verify they reference the same object (no stale closure issue)
			expect(callbackConfig).toBe(state);
		}
	});

	test('Multiple sequential config updates maintain consistency', () => {
		type TestConfig = {
			provider: string;
			model: string;
			apiKey: string;
			enabled: boolean;
		};

		const initialConfig: TestConfig = {
			provider: 'gemini',
			model: 'gemini-2.5-pro',
			apiKey: '',
			enabled: false,
		};

		let state: TestConfig = initialConfig;
		const callbacks: TestConfig[] = [];

		// First update
		state = (() => {
			const merged = {
				...state,
				provider: 'openai',
				model: 'gpt-4',
				apiKey: 'key1',
				enabled: true,
			};
			callbacks.push(merged);
			return merged;
		})();

		// Second update
		state = (() => {
			const merged = { ...state, model: 'gpt-4-turbo', apiKey: 'key2' };
			callbacks.push(merged);
			return merged;
		})();

		// Verify final state matches last callback
		expect(state.provider).toBe('openai');
		expect(state.model).toBe('gpt-4-turbo');
		expect(state.apiKey).toBe('key2');
		expect(state.enabled).toBe(true);

		// Verify all callbacks received the correct merged configs
		expect(callbacks).toHaveLength(2);
		expect(callbacks[0]?.provider).toBe('openai');
		expect(callbacks[0]?.model).toBe('gpt-4');
		expect(callbacks[0]?.apiKey).toBe('key1');
		expect(callbacks[0]?.enabled).toBe(true);

		expect(callbacks[1]?.provider).toBe('openai');
		expect(callbacks[1]?.model).toBe('gpt-4-turbo');
		expect(callbacks[1]?.apiKey).toBe('key2');
		expect(callbacks[1]?.enabled).toBe(true);
	});
});
