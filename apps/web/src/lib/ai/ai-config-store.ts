import { useSyncExternalStore } from 'react';
import type { AIConfig, AIProvider } from './types';
import {
	defaultAIConfig,
	loadAIConfigWithProviders,
	saveAIConfig,
	fetchAIConfigList,
	fetchFullAIConfig,
} from './storage';

export interface AIConfigState {
	config: AIConfig;
	aiPlayer: 'white' | 'black';
	availableProviders: AIProvider[];
	/** True once hydrate() has resolved (success or failure). */
	hydrated: boolean;
	/** True when hydrate() failed to load the provider list. Distinct from
	 * `hydrated && availableProviders.length === 0` (no keys configured) so
	 * the UI can show an error/retry state instead of an empty-state prompt. */
	hydrateError: boolean;
}

const initialState: AIConfigState = {
	config: defaultAIConfig,
	aiPlayer: 'black',
	availableProviders: [],
	hydrated: false,
	hydrateError: false,
};

let state: AIConfigState = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

export function getSnapshot(): AIConfigState {
	return state;
}

function emit(): void {
	for (const cb of listeners) cb();
}

function setState(next: AIConfigState): void {
	state = next;
	emit();
}

export function setConfig(patch: Partial<AIConfig>): void {
	const merged = { ...state.config, ...patch };
	setState({ ...state, config: merged });
	saveAIConfig(merged);
}

export function setModel(model: string): void {
	setConfig({ model });
}

export function setAIPlayer(aiPlayer: 'white' | 'black'): void {
	setState({ ...state, aiPlayer });
}

export async function hydrate(): Promise<void> {
	if (hydrated) return;
	await runHydrate();
}

/**
 * Force a fresh hydrate regardless of prior state. Used by the UI retry
 * button after a failed hydrate; safe to call multiple times.
 */
export async function rehydrate(): Promise<void> {
	hydrated = false;
	await runHydrate();
}

async function runHydrate(): Promise<void> {
	hydrated = true;
	try {
		const { config, availableProviders, fromFallback } =
			await loadAIConfigWithProviders();
		setState({
			...state,
			config,
			availableProviders,
			hydrated: true,
			hydrateError: fromFallback,
		});
	} catch {
		// loadAIConfigWithProviders normally swallows backend errors and
		// returns defaults with fromFallback=true. This catch only fires if
		// something beyond the network layer throws (e.g. a corrupted
		// localStorage cache parse) — treat it the same as a failed hydrate.
		setState({ ...state, hydrated: true, hydrateError: true });
	}
}

export async function setProvider(
	provider: AIProvider
): Promise<string | null> {
	let configurations;
	try {
		configurations = await fetchAIConfigList();
	} catch {
		return "We couldn't load your saved AI settings. Please try again from AI Settings.";
	}
	const providerConfig = configurations.find(
		c => c.provider === provider && c.hasApiKey
	);
	if (!providerConfig?.id) {
		return 'Add an API key for this provider in AI Settings to reuse it here.';
	}
	try {
		const full = await fetchFullAIConfig(providerConfig.id);
		setConfig({
			provider,
			model: full.model || state.config.model,
			apiKey: full.apiKey || '',
			enabled: true,
		});
		return null;
	} catch {
		return "We couldn't load your saved API key details. Please try again.";
	}
}

export function useAIConfigStore(): AIConfigState {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Reset the store to its initial (un-hydrated) state. Intended for tests so
 * each test file starts from a clean slate regardless of execution order or
 * whether the module registry is shared across files (e.g. under coverage).
 */
export function resetAIConfigStore(): void {
	hydrated = false;
	setState({ ...initialState });
}
