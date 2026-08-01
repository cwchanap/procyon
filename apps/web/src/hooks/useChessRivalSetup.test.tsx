import { describe, expect, mock, test } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import {
	RIVAL_PREFERENCES_STORAGE_KEY,
	type RivalPreferenceStorage,
	type RivalPreferencesV1,
} from '../lib/chess/rival/preferences';
import type { EngineCapabilityEnvironment } from '../lib/chess/rival/engine-preflight';
import type { EnginePreflight } from '../lib/chess/rival/types';
import {
	useChessRivalSetup,
	type ChessRivalAIConfigSnapshot,
	type UseChessRivalSetupOptions,
	type UseChessRivalSetupResult,
} from './useChessRivalSetup';

setupReactDom();

const supportedEngine = {
	status: 'supported',
} as const satisfies EnginePreflight;
const unsupportedEngine = {
	status: 'unsupported',
	message: 'Engine unsupported',
} as const satisfies EnginePreflight;

const signedOutAuth = {
	isAuthenticated: false,
	loading: false,
	revalidated: true,
};

const signedInAuth = {
	isAuthenticated: true,
	loading: false,
	revalidated: true,
};

const loadingAiConfig = {
	config: {
		provider: 'openai',
		model: '',
		apiKey: '',
		enabled: false,
	},
	hydrated: false,
	hydrateError: false,
	configPending: true,
} satisfies ChessRivalAIConfigSnapshot;

const unconfiguredAiConfig = {
	config: {
		provider: 'openai',
		model: '',
		apiKey: '',
		enabled: false,
	},
	hydrated: true,
	hydrateError: false,
	configPending: false,
} satisfies ChessRivalAIConfigSnapshot;

const availableAiConfig = {
	config: {
		provider: 'openai',
		model: 'gpt-4o-mini',
		apiKey: 'sk-test',
		enabled: true,
	},
	hydrated: true,
	hydrateError: false,
	configPending: false,
} satisfies ChessRivalAIConfigSnapshot;

function storedPreferences(
	overrides: Partial<RivalPreferencesV1> = {}
): RivalPreferencesV1 {
	return {
		version: 1,
		lastRivalKind: 'engine',
		...overrides,
		humanSideByRival: {
			engine: 'white',
			llm: 'white',
			...overrides.humanSideByRival,
		},
	};
}

function createStorage(initial?: RivalPreferencesV1) {
	const store = new Map<string, string>();
	if (initial) {
		store.set(RIVAL_PREFERENCES_STORAGE_KEY, JSON.stringify(initial));
	}
	let getItemCount = 0;
	let setItemCount = 0;
	const storage: RivalPreferenceStorage = {
		getItem: key => {
			getItemCount += 1;
			return store.get(key) ?? null;
		},
		setItem: (key, value) => {
			setItemCount += 1;
			store.set(key, value);
		},
	};

	return {
		storage,
		getItemCount: () => getItemCount,
		setItemCount: () => setItemCount,
		read: () =>
			JSON.parse(
				store.get(RIVAL_PREFERENCES_STORAGE_KEY) ?? 'null'
			) as RivalPreferencesV1 | null,
	};
}

function createOptions(
	overrides: Partial<UseChessRivalSetupOptions> = {}
): UseChessRivalSetupOptions {
	return {
		auth: signedOutAuth,
		aiConfig: unconfiguredAiConfig,
		enginePreflight: supportedEngine,
		...overrides,
	};
}

async function waitForResolved(result: { current: UseChessRivalSetupResult }) {
	await waitFor(() => {
		expect(result.current.resolved).toBe(true);
	});
}

describe('useChessRivalSetup', () => {
	test('reads preferences once after client mount', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'engine',
				humanSideByRival: { engine: 'black', llm: 'white' },
			})
		);

		const { result } = renderHook(() =>
			useChessRivalSetup(createOptions({ storage: memory.storage }))
		);

		await waitForResolved(result);

		expect(memory.getItemCount()).toBe(1);
		expect(result.current.setup).toEqual({
			rivalKind: 'engine',
			humanSide: 'black',
		});
	});

	test('exposes unresolved setup before client preference read', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'white', llm: 'black' },
			})
		);

		const { result } = renderHook(() =>
			useChessRivalSetup(createOptions({ storage: memory.storage }))
		);

		expect(result.current.resolved).toBe(false);
		expect(result.current.setup).toEqual({
			rivalKind: 'engine',
			humanSide: 'white',
		});

		await waitForResolved(result);
	});

	test('defaults signed-out visitors to engine as White', async () => {
		const memory = createStorage();

		const { result } = renderHook(() =>
			useChessRivalSetup(createOptions({ storage: memory.storage }))
		);

		await waitForResolved(result);

		expect(result.current.setup).toEqual({
			rivalKind: 'engine',
			humanSide: 'white',
		});
		expect(result.current.startBlockedReason).toBeNull();
	});

	test('resolves signed-in configured users with no preference to LLM before interaction', async () => {
		const memory = createStorage();

		const { result } = renderHook(() =>
			useChessRivalSetup(
				createOptions({
					auth: signedInAuth,
					aiConfig: availableAiConfig,
					storage: memory.storage,
				})
			)
		);

		await waitForResolved(result);

		expect(result.current.setup).toEqual({
			rivalKind: 'llm',
			humanSide: 'white',
		});
		expect(result.current.llmUsability).toEqual({
			status: 'available',
			provider: 'openai',
			model: 'gpt-4o-mini',
		});
	});

	test('keeps a remembered LLM selected while AI config is loading', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'llm',
				humanSideByRival: { engine: 'white', llm: 'black' },
			})
		);

		const { result } = renderHook(() =>
			useChessRivalSetup(
				createOptions({
					auth: signedInAuth,
					aiConfig: loadingAiConfig,
					storage: memory.storage,
				})
			)
		);

		await waitForResolved(result);

		expect(result.current.setup).toEqual({
			rivalKind: 'llm',
			humanSide: 'black',
		});
		expect(result.current.startBlockedReason).toContain('loading');
	});

	test('selecting a rival persists the deliberate rival kind', async () => {
		const memory = createStorage();
		const { result } = renderHook(() =>
			useChessRivalSetup(createOptions({ storage: memory.storage }))
		);
		await waitForResolved(result);

		act(() => {
			result.current.selectRival('llm');
		});

		expect(result.current.setup.rivalKind).toBe('llm');
		expect(memory.read()?.lastRivalKind).toBe('llm');
		expect(memory.setItemCount()).toBe(1);
	});

	test('selecting a side persists it separately per rival', async () => {
		const memory = createStorage();
		const { result } = renderHook(() =>
			useChessRivalSetup(createOptions({ storage: memory.storage }))
		);
		await waitForResolved(result);

		act(() => {
			result.current.selectHumanSide('black');
		});
		act(() => {
			result.current.selectRival('llm');
		});

		expect(result.current.setup).toEqual({
			rivalKind: 'llm',
			humanSide: 'white',
		});

		act(() => {
			result.current.selectHumanSide('black');
		});

		expect(memory.read()?.humanSideByRival).toEqual({
			engine: 'black',
			llm: 'black',
		});
	});

	test('automatic fallback emits a notice without persisting the rival kind', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'llm',
			})
		);

		const { result } = renderHook(() =>
			useChessRivalSetup(
				createOptions({
					aiConfig: unconfiguredAiConfig,
					storage: memory.storage,
				})
			)
		);

		await waitForResolved(result);

		expect(result.current.setup.rivalKind).toBe('engine');
		expect(result.current.fallbackNotice).toBe('llm-to-engine');
		expect(memory.read()?.lastRivalKind).toBe('llm');
		expect(memory.setItemCount()).toBe(0);
	});

	test('first interaction closes automatic resolution', async () => {
		const memory = createStorage();
		const initial = createOptions({
			auth: signedInAuth,
			aiConfig: availableAiConfig,
			storage: memory.storage,
		});
		const { result, rerender } = renderHook(
			(props: UseChessRivalSetupOptions) => useChessRivalSetup(props),
			{ initialProps: initial }
		);
		await waitForResolved(result);
		expect(result.current.setup.rivalKind).toBe('llm');

		act(() => {
			result.current.selectHumanSide('black');
		});
		rerender(createOptions({ storage: memory.storage }));

		expect(result.current.setup).toEqual({
			rivalKind: 'llm',
			humanSide: 'black',
		});
		expect(result.current.fallbackNotice).toBeNull();
	});

	test('automatic changes are skipped while a game is active', async () => {
		const memory = createStorage();
		const initial = createOptions({ storage: memory.storage });
		const { result, rerender } = renderHook(
			(props: UseChessRivalSetupOptions) => useChessRivalSetup(props),
			{ initialProps: initial }
		);
		await waitForResolved(result);
		expect(result.current.setup.rivalKind).toBe('engine');

		rerender(
			createOptions({
				auth: signedInAuth,
				aiConfig: availableAiConfig,
				storage: memory.storage,
				isGameActive: true,
			})
		);

		expect(result.current.setup.rivalKind).toBe('engine');
	});

	test('preflight performs no fetch or Worker creation', async () => {
		const fetchSpy = mock(() =>
			Promise.resolve(new Response('', { status: 200 }))
		);
		const workerSpy = mock(() => {
			throw new Error('Worker must not be constructed');
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		const environment: EngineCapabilityEnvironment = {
			Worker: workerSpy as unknown as EngineCapabilityEnvironment['Worker'],
			WebAssembly: {
				validate: () => true,
			},
		};

		try {
			const { result } = renderHook(() =>
				useChessRivalSetup(
					createOptions({
						enginePreflight: undefined,
						engineEnvironment: environment,
						storage: createStorage().storage,
					})
				)
			);
			await waitForResolved(result);

			expect(result.current.enginePreflight).toEqual({ status: 'supported' });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(workerSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('switching opponent or side emits setup-change callbacks', async () => {
		const memory = createStorage();
		const onSetupChange = mock(() => {});
		const { result } = renderHook(() =>
			useChessRivalSetup(
				createOptions({
					storage: memory.storage,
					onSetupChange,
				})
			)
		);
		await waitForResolved(result);

		act(() => {
			result.current.selectRival('llm');
		});
		act(() => {
			result.current.selectHumanSide('black');
		});

		expect(onSetupChange).toHaveBeenNthCalledWith(1, {
			rivalKind: 'llm',
			humanSide: 'white',
		});
		expect(onSetupChange).toHaveBeenNthCalledWith(2, {
			rivalKind: 'llm',
			humanSide: 'black',
		});
	});

	test('fallback notices can be cleared', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'engine',
			})
		);
		const { result } = renderHook(() =>
			useChessRivalSetup(
				createOptions({
					auth: signedInAuth,
					aiConfig: availableAiConfig,
					enginePreflight: unsupportedEngine,
					storage: memory.storage,
				})
			)
		);
		await waitForResolved(result);
		expect(result.current.fallbackNotice).toBe('engine-to-llm');

		act(() => {
			result.current.clearFallbackNotice();
		});

		expect(result.current.fallbackNotice).toBeNull();
	});

	test('cleared fallback notices stay hidden across equivalent rerenders', async () => {
		const memory = createStorage(
			storedPreferences({
				lastRivalKind: 'engine',
			})
		);
		const fallbackOptions = createOptions({
			auth: signedInAuth,
			aiConfig: availableAiConfig,
			enginePreflight: unsupportedEngine,
			storage: memory.storage,
		});
		const { result, rerender } = renderHook(
			(props: UseChessRivalSetupOptions) => useChessRivalSetup(props),
			{ initialProps: fallbackOptions }
		);
		await waitForResolved(result);
		expect(result.current.fallbackNotice).toBe('engine-to-llm');

		act(() => {
			result.current.clearFallbackNotice();
		});
		rerender({
			...fallbackOptions,
			auth: { ...signedInAuth },
		});

		expect(result.current.fallbackNotice).toBeNull();
	});
});
