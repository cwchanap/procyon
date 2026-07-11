import { useSyncExternalStore } from 'react';
import type { AIConfig, AIProvider } from './types';
import { AI_PROVIDERS } from './types';
import {
	defaultAIConfig,
	loadAIConfigWithProviders,
	saveAIConfig,
	fetchAIConfigList,
	fetchFullAIConfig,
} from './storage';

/**
 * Config-side slice of the store. Changes to this slice (via `setConfig`,
 * `setModel`, `setProvider`, or `hydrate`) only notify config subscribers.
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
let hydrated = false;

const configListeners = new Set<() => void>();

export function subscribeConfig(cb: () => void): () => void {
	configListeners.add(cb);
	return () => {
		configListeners.delete(cb);
	};
}

export function getConfigSlice(): AIConfigSlice {
	return configSlice;
}

function emitConfig(): void {
	for (const cb of configListeners) cb();
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

let inFlight: Promise<void> | null = null;
/**
 * Monotonic generation token. Incremented by `resetAIConfigStore` (logout) so
 * any `runHydrate` still in flight from the previous session can detect it is
 * stale and skip its `setConfigSlice` call. Without this, clearing `inFlight`
 * only drops the reference — the underlying promise still resolves and writes
 * the old user's config (including the raw API key fetched by hydrate) back
 * into the store after the reset has already cleared it.
 */
let hydrateGeneration = 0;

/**
 * Monotonic generation token for `setProvider`. Incremented at the start of
 * each `setProvider` call (and by `resetAIConfigStore`) so that if a user
 * switches providers twice before the first request finishes, the older
 * in-flight call can detect it is stale and skip its `setConfig` write —
 * otherwise the older response would resolve last and clobber the newer
 * provider/model in the shared store.
 */
let setProviderGeneration = 0;

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
	const gen = hydrateGeneration;
	// Capture the provider generation at the start so we can detect a
	// setProvider call that began while the hydrate fetch was in flight.
	// Without this, a hydrate resolving after a provider switch would
	// overwrite the newer provider/model/api-key with the stale config
	// fetched before the switch.
	const providerGen = setProviderGeneration;
	hydrated = true;
	try {
		const { config, availableProviders, fromFallback } =
			await loadAIConfigWithProviders();
		// A reset/logout (or a newer rehydrate) bumped the generation while
		// the fetch was in flight — drop this result so a stale session's
		// config (incl. API key) can't clobber the freshly-cleared store.
		if (gen !== hydrateGeneration) return;
		// A setProvider started (or completed) while the fetch was in
		// flight — the user's newer provider choice is already in the
		// store (or being written); don't clobber it with the stale
		// pre-switch config.
		if (providerGen !== setProviderGeneration) return;
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
		if (gen !== hydrateGeneration) return;
		if (providerGen !== setProviderGeneration) return;
		setConfigSlice({ ...configSlice, hydrated: true, hydrateError: true });
	}
}

export async function setProvider(
	provider: AIProvider
): Promise<string | null> {
	const gen = ++setProviderGeneration;
	let configurations;
	try {
		configurations = await fetchAIConfigList();
	} catch {
		// A newer setProvider call started while we were awaiting the list
		// fetch — suppress this error so a stale failure doesn't clobber
		// the newer switch's success or display a misleading alert after
		// the user has already moved on.
		if (gen !== setProviderGeneration) return null;
		return "We couldn't load your saved AI settings. Please try again from AI Settings.";
	}
	// A newer setProvider call started while we were awaiting the list
	// fetch — drop this result so the older provider doesn't clobber the
	// newer one in the store.
	if (gen !== setProviderGeneration) return null;
	const providerConfig = configurations.find(
		c => c.provider === provider && c.hasApiKey
	);
	if (!providerConfig?.id) {
		return 'Add an API key for this provider in AI Settings to reuse it here.';
	}
	try {
		const full = await fetchFullAIConfig(providerConfig.id);
		// A newer setProvider call started while we were awaiting the full
		// config fetch — drop this result for the same reason as above.
		if (gen !== setProviderGeneration) return null;
		// Derive a provider-specific default model rather than reusing the
		// prior provider's model. If `full.model` is empty (e.g. a legacy
		// backend row with no model) the previous fallback
		// (`configSlice.config.model`) would carry the *old* provider's model
		// into the new provider's config — the model dropdown then shows the
		// new provider's first model (SidebarAIConfig falls back to
		// `models[0]` when `config.model` isn't in the new provider's list)
		// while the AI service still receives the stale model, which can fail
		// against the new provider's endpoint. AI_PROVIDERS guarantees a
		// `models[0]`/`defaultModel` for every provider.
		const providerInfo = AI_PROVIDERS[provider];
		const fallbackModel = providerInfo.models[0] || providerInfo.defaultModel;
		// Clear hydrateError on success: a failed hydrate leaves this flag set,
		// which blocks Start in all game components. If the user recovers by
		// switching to a provider with a valid API key, the error is stale —
		// we now have working credentials, so clear it. setConfig alone would
		// preserve hydrateError via its `...configSlice` spread.
		//
		// Also set hydrated=true: if setProvider wins the race against an
		// in-flight runHydrate (the user switched providers while the initial
		// hydrate fetch was pending), runHydrate's generation guard discards
		// its result without writing hydrated=true to the config slice. The
		// module-level `hydrated` flag is already true (set at the start of
		// runHydrate), so later hydrate() calls short-circuit — but
		// configSlice.hydrated stays false, disabling every game's Start
		// control with no retry UI (hydrateError is false, so no retry button).
		// Setting hydrated=true here completes the hydration state that the
		// stale runHydrate would have written.
		const merged = {
			...configSlice.config,
			provider,
			model: full.model || fallbackModel,
			apiKey: full.apiKey || '',
			enabled: true,
		};
		setConfigSlice({
			...configSlice,
			config: merged,
			hydrated: true,
			hydrateError: false,
		});
		saveAIConfig(merged);
		return null;
	} catch {
		// Same stale guard as the list-fetch catch above.
		if (gen !== setProviderGeneration) return null;
		return "We couldn't load your saved API key details. Please try again.";
	}
}

/** Subscribe to config-slice changes only (config, providers, hydration). */
export function useAIConfig(): AIConfigSlice {
	return useSyncExternalStore(subscribeConfig, getConfigSlice, getConfigSlice);
}

/**
 * Reset the store to its initial (un-hydrated) state. Used on logout (so the
 * in-memory config — including the raw API key fetched by hydrate — is dropped
 * and a later hydrate for a new user re-fetches instead of short-circuiting
 * on the previous user's stale state) and in tests so each test file starts
 * from a clean slate regardless of execution order or whether the module
 * registry is shared across files (e.g. under coverage).
 */
export function resetAIConfigStore(): void {
	// Bump the generation tokens first so any runHydrate() or setProvider()
	// still in flight from the previous session sees a stale `gen` and skips
	// its setConfigSlice/setConfig call.
	hydrateGeneration++;
	setProviderGeneration++;
	hydrated = false;
	inFlight = null;
	setConfigSlice({ ...initialConfigSlice });
}
