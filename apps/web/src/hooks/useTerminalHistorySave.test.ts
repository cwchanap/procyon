import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import type { SubmitPlayHistoryInput } from '../lib/play-history';
import { useTerminalHistorySave } from './useTerminalHistorySave';

setupReactDom();

const firstPayload: SubmitPlayHistoryInput = {
	gameId: 'chess',
	status: 'win',
	date: '2026-08-09T00:00:00.000Z',
	opponentLlmId: 'gpt-4o',
};

interface HookProps {
	enabled: boolean;
	isTerminal: boolean;
	isAuthenticated: boolean;
	userId: string | null | undefined;
	buildPayload: () => SubmitPlayHistoryInput | null;
	debugKey?: string;
}

function makeProps(overrides: Partial<HookProps> = {}): HookProps {
	return {
		enabled: true,
		isTerminal: false,
		isAuthenticated: true,
		userId: 'user-a',
		buildPayload: () => firstPayload,
		...overrides,
	};
}

function waitForEffects(ms = 0): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

describe('useTerminalHistorySave', () => {
	let originalFetch: typeof globalThis.fetch;
	let originalSetTimeout: typeof globalThis.setTimeout;
	let originalClearTimeout: typeof globalThis.clearTimeout;
	let fetchCallCount: number;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		originalSetTimeout = globalThis.setTimeout;
		originalClearTimeout = globalThis.clearTimeout;
		fetchCallCount = 0;
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
	});

	test('submits one frozen terminal payload only once', async () => {
		const capturedBodies: unknown[] = [];
		globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				capturedBodies.push(JSON.parse(String(init?.body)));
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;

		const { rerender } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps(),
		});

		rerender(makeProps({ isTerminal: true }));
		rerender(makeProps({ isTerminal: true }));
		await act(async () => {
			await waitForEffects();
		});

		expect(fetchCallCount).toBe(1);
		expect(capturedBodies).toEqual([firstPayload]);
	});

	test('provider changes after terminal do not change frozen payload', async () => {
		const retryBodies: unknown[] = [];
		let fetchCallIndex = 0;
		let retryCallback: (() => void) | null = null;
		globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallIndex++;
				retryBodies.push(JSON.parse(String(init?.body)));
				return Promise.resolve({
					ok: fetchCallIndex !== 1,
					status: fetchCallIndex === 1 ? 401 : 200,
					statusText: fetchCallIndex === 1 ? 'Unauthorized' : 'OK',
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay === 5_000) {
				retryCallback = fn;
				return 1 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof setTimeout;

		let currentPayload = firstPayload;
		const { rerender } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({
				isTerminal: true,
				buildPayload: () => currentPayload,
			}),
		});

		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(1);

		currentPayload = {
			...firstPayload,
			status: 'loss',
			opponentLlmId: 'gemini-2.5-flash',
		};
		rerender(
			makeProps({
				isTerminal: true,
				buildPayload: () => currentPayload,
			})
		);
		await act(async () => {
			await waitForEffects();
		});

		expect(fetchCallIndex).toBe(1);
		expect(retryCallback).not.toBeNull();

		await act(async () => {
			retryCallback?.();
			await waitForEffects();
		});

		expect(fetchCallIndex).toBe(2);
		expect(retryBodies).toEqual([firstPayload, firstPayload]);
	});

	test('account switch abandons a pending save', async () => {
		let retryCallback: (() => void) | null = null;
		let fetchCallIndex = 0;
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallIndex++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay === 5_000) {
				retryCallback = fn;
				return 1 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof setTimeout;

		const { rerender } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(1);
		expect(retryCallback).not.toBeNull();

		rerender(makeProps({ isTerminal: true, userId: 'user-b' }));
		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(1);

		await act(async () => {
			retryCallback?.();
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(1);
	});

	test('previous-user guard abandons a first terminal save after identity change', async () => {
		const { rerender } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: false, userId: 'user-a' }),
		});

		rerender(makeProps({ isTerminal: true, userId: 'user-b' }));
		await act(async () => {
			await waitForEffects();
		});

		expect(fetchCallCount).toBe(0);
	});

	test('401 retries are bounded to three delayed retries', async () => {
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay === 5_000) {
				fn();
				return 1 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof setTimeout;

		const { unmount } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});

		await act(async () => {
			await waitForEffects(50);
		});
		unmount();

		expect(fetchCallCount).toBe(4);
	});

	test('new game generation makes old 401 response stale', async () => {
		let resolveFirst: (response: Response) => void = () => {};
		let fetchCallIndex = 0;
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (!url.includes('/play-history')) {
				return Promise.resolve({
					ok: true,
					status: 200,
				}) as unknown as Promise<Response>;
			}
			fetchCallIndex++;
			if (fetchCallIndex === 1) {
				return new Promise<Response>(resolve => {
					resolveFirst = resolve;
				});
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
			}) as Promise<Response>;
		}) as unknown as typeof fetch;

		const { rerender } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(1);

		rerender(makeProps({ isTerminal: false }));
		await act(async () => {
			await waitForEffects();
		});
		rerender(
			makeProps({
				isTerminal: true,
				buildPayload: () => ({ ...firstPayload, status: 'loss' }),
			})
		);
		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(2);

		await act(async () => {
			resolveFirst({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
			} as Response);
			await waitForEffects();
		});
		expect(fetchCallIndex).toBe(2);
	});

	test('500 is not retried', async () => {
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 500,
					statusText: 'Error',
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;

		const { unmount } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects(100);
		});
		unmount();

		expect(fetchCallCount).toBe(1);
	});

	test('network timeout/error is not retried', async () => {
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.reject(new Error('Network error'));
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;

		const { unmount } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects(100);
		});
		unmount();

		expect(fetchCallCount).toBe(1);
	});

	test('unmount clears a pending 401 timer', async () => {
		let retryCallback: (() => void) | null = null;
		const clearedTimerIds: unknown[] = [];
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return Promise.resolve({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
				}) as unknown as Promise<Response>;
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay === 5_000) {
				retryCallback = fn;
				return 42 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = mock((id: ReturnType<typeof setTimeout>) => {
			clearedTimerIds.push(id);
		}) as unknown as typeof clearTimeout;

		const { unmount } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects();
		});
		expect(retryCallback).not.toBeNull();

		unmount();

		expect(clearedTimerIds).toContain(42);
		expect(fetchCallCount).toBe(1);
	});

	test('late 401 after unmount does not schedule a retry', async () => {
		let resolveFirst: (response: Response) => void = () => {};
		let retryTimerCount = 0;
		let retryCallback: (() => void) | null = null;
		globalThis.fetch = mock((input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/play-history')) {
				fetchCallCount++;
				return new Promise<Response>(resolve => {
					resolveFirst = resolve;
				});
			}
			return Promise.resolve({
				ok: true,
				status: 200,
			}) as unknown as Promise<Response>;
		}) as unknown as typeof fetch;
		globalThis.setTimeout = mock((fn: () => void, delay?: number) => {
			if (delay === 5_000) {
				retryTimerCount++;
				retryCallback = fn;
				return 42 as unknown as ReturnType<typeof setTimeout>;
			}
			return originalSetTimeout(fn, delay);
		}) as unknown as typeof setTimeout;

		const { unmount } = renderHook(props => useTerminalHistorySave(props), {
			initialProps: makeProps({ isTerminal: true }),
		});
		await act(async () => {
			await waitForEffects();
		});
		expect(fetchCallCount).toBe(1);

		unmount();
		await act(async () => {
			resolveFirst({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
			} as Response);
			await waitForEffects();
		});

		expect(retryTimerCount).toBe(0);
		expect(retryCallback).toBeNull();
		expect(fetchCallCount).toBe(1);
	});
});
