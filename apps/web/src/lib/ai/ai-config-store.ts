import { useSyncExternalStore } from 'react';
import type { AIConfig, AIProvider } from './types';
import {
	defaultAIConfig,
	loadAIConfigWithProviders,
	saveAIConfig,
	fetchAIConfigList,
	fetchFullAIConfig,
} from './storage';

/**
 * Config-side slice of the store. Changes to this slice (via `setConfig`,
 * `setModel`, `setProvider`, or `hydrate`) only notify config subscribers,
 * not components that solely read `aiPlayer`.
 */
export interface AIConfigSlice {
	config: AIConfig;
	availableProviders: AIProvider[];
	hydrated: boolean;
	hydrateError: boolean;
}

const initialConfigSlice: AIConfigSlice = {
	config: defaultAIConfig,
	availableProviders: [],
	hydrated: false,
	hydrateError: false,
};

let configSlice: AIConfigSlice = initialConfigSlice;
let aiPlayer: 'white' | 'black' = 'black';
let hydrated = false;
/**
 * True while a chess AI game is in progress. Set by ChessGame on start and
 * cleared on reset/end/mode-switch. SidebarAIConfig reads this to disable
 * the "AI plays" select mid-game — switching sides after `gameState.aiPlayer`
 * has been captured at start desynchronizes the store `aiPlayer` from
 * `gameState.aiPlayer` (used by `isAITurn`), stalling the AI move effect.
 */
let gameActive = false;

const configListeners = new Set<() => void>();
const aiPlayerListeners = new Set<() => void>();
const gameActiveListeners = new Set<() => void>();

export function subscribeConfig(cb: () => void): () => void {
	configListeners.add(cb);
	return () => {
		configListeners.delete(cb);
	};
}

export function subscribeAIPlayer(cb: () => void): () => void {
	aiPlayerListeners.add(cb);
	return () => {
		aiPlayerListeners.delete(cb);
	};
}

export function subscribeGameActive(cb: () => void): () => void {
	gameActiveListeners.add(cb);
	return () => {
		gameActiveListeners.delete(cb);
	};
}

export function getConfigSlice(): AIConfigSlice {
	return configSlice;
}

export function getAIPlayer(): 'white' | 'black' {
	return aiPlayer;
}

export function getGameActive(): boolean {
	return gameActive;
}

function emitConfig(): void {
	for (const cb of configListeners) cb();
}

function emitAIPlayer(): void {
	for (const cb of aiPlayerListeners) cb();
}

function emitGameActive(): void {
	for (const cb of gameActiveListeners) cb();
}

function setConfigSlice(next: AIConfigSlice): void {
	configSlice = next;
	emitConfig();
}

export function setConfig(patch: Partial<AIConfig>): void {
	const merged = { ...configSlice.config, ...patch };
	setConfigSlice({ ...configSlice, config: merged });
	saveAIConfig(merged);
}

export function setModel(model: string): void {
	setConfig({ model });
}

export function setAIPlayer(next: 'white' | 'black'): void {
	if (next === aiPlayer) return;
	aiPlayer = next;
	emitAIPlayer();
}

export function setGameActive(next: boolean): void {
	if (next === gameActive) return;
	gameActive = next;
	emitGameActive();
}

let inFlight: Promise<void> | null = null;

export async function hydrate(): Promise<void> {
	if (hydrated) return;
	if (inFlight) return inFlight;
	inFlight = runHydrate().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

/**
 * Force a fresh hydrate regardless of prior state. Used by the UI retry
 * button after a failed hydrate; safe to call multiple times. If a hydrate
 * is already in flight, wait for it to resolve before starting a fresh load
 * so the two fetches don't race and clobber each other's setConfigSlice
 * with stale state.
 */
export async function rehydrate(): Promise<void> {
	if (inFlight) await inFlight;
	hydrated = false;
	inFlight = runHydrate().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

async function runHydrate(): Promise<void> {
	hydrated = true;
	try {
		const { config, availableProviders, fromFallback } =
			await loadAIConfigWithProviders();
		setConfigSlice({
			...configSlice,
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
		setConfigSlice({ ...configSlice, hydrated: true, hydrateError: true });
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
			model: full.model || configSlice.config.model,
			apiKey: full.apiKey || '',
			enabled: true,
		});
		return null;
	} catch {
		return "We couldn't load your saved API key details. Please try again.";
	}
}

/** Subscribe to config-slice changes only (config, providers, hydration). */
export function useAIConfig(): AIConfigSlice {
	return useSyncExternalStore(subscribeConfig, getConfigSlice, getConfigSlice);
}

/** Subscribe to aiPlayer changes only. */
export function useAIPlayer(): 'white' | 'black' {
	return useSyncExternalStore(subscribeAIPlayer, getAIPlayer, getAIPlayer);
}

/** Subscribe to gameActive changes only. */
export function useGameActive(): boolean {
	return useSyncExternalStore(
		subscribeGameActive,
		getGameActive,
		getGameActive
	);
}

/**
 * Reset the store to its initial (un-hydrated) state. Intended for tests so
 * each test file starts from a clean slate regardless of execution order or
 * whether the module registry is shared across files (e.g. under coverage).
 */
export function resetAIConfigStore(): void {
	hydrated = false;
	inFlight = null;
	aiPlayer = 'black';
	gameActive = false;
	setConfigSlice({ ...initialConfigSlice });
	emitAIPlayer();
	emitGameActive();
}
