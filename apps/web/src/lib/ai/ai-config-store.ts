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
	/**
	 * True while a `rehydrate()` fetch is in flight. `rehydrate()` only
	 * resets the module-level `hydrated` flag, not `configSlice.hydrated`
	 * (which stays true from the prior hydrate), so without this flag the
	 * model/provider selects stay enabled during a rehydrate — and since
	 * `setModel()` doesn't bump `setProviderGeneration`, the race guard in
	 * `runHydrate` never fires for model-only changes, letting the
	 * resolving rehydrate overwrite the user's model pick with the backend
	 * value.
	 */
	isRehydrating: boolean;
}

const initialConfigSlice: AIConfigSlice = {
	config: defaultAIConfig,
	availableProviders: [],
	hydrated: false,
	hydrateError: false,
	isRehydrating: false,
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

/**
 * Generation token recorded when `setProvider` successfully writes to the
 * store. `runHydrate` compares this against the `providerGen` it captured
 * at the start of the fetch (not against the current `setProviderGeneration`)
 * to determine whether any setProvider that raced with the hydrate actually
 * succeeded — checking `configSlice.hydrated` is unreliable because a prior
 * hydrate (or rehydrate) may have already set it to `true`, causing a failed
 * setProvider to be mistaken for a successful one. Comparing against
 * `providerGen` instead of `setProviderGeneration` also handles the case
 * where a successful switch is followed by a failed one: the failed switch
 * bumps `setProviderGeneration` without recording here, so an equality
 * check against the latest generation would miss the earlier success.
 */
let setProviderSucceededGen = 0;

export async function hydrate(): Promise<void> {
	if (hydrated) return;
	if (inFlight) return inFlight;
	// Capture the generation so this request's finally only clears
	// inFlight if no reset/logout (which bumps hydrateGeneration) has
	// occurred since. Without this, a reset that clears inFlight
	// followed by a new hydrate()/rehydrate() leaves the old promise's
	// finally clearing the newer request's inFlight reference.
	const gen = hydrateGeneration;
	inFlight = runHydrate().finally(() => {
		if (gen === hydrateGeneration) inFlight = null;
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
	// Capture the generation before the await so we can detect a
	// reset/logout that bumped hydrateGeneration while we were waiting
	// for the older in-flight request. Without this, the continuation
	// resumes after resetAIConfigStore() cleared the store and
	// unconditionally starts another runHydrate() — the post-logout
	// runHydrate sets the module-level `hydrated = true`, causing the
	// next login's automatic hydrate() to short-circuit on stale state.
	const genBeforeAwait = hydrateGeneration;
	if (inFlight) await inFlight;
	if (genBeforeAwait !== hydrateGeneration) return;
	hydrated = false;
	// Mark the slice as rehydrating so consumers can disable edits while
	// the fetch is in flight. configSlice.hydrated stays true from the
	// prior hydrate (rehydrate only resets the module-level flag above),
	// so without isRehydrating the model select stays enabled and a
	// setModel() call — which doesn't bump setProviderGeneration — would
	// be silently overwritten when runHydrate resolves and applies the
	// backend snapshot.
	setConfigSlice({ ...configSlice, isRehydrating: true });
	// Capture the generation so this request's finally cleanup only
	// runs if no reset/logout (which bumps hydrateGeneration) has
	// occurred since. Without this, a reset followed by a new
	// rehydrate() leaves the old promise's finally clearing the new
	// request's inFlight and isRehydrating — re-enabling provider/model
	// controls while the newer fetch is still pending, so a subsequent
	// setModel() (which doesn't bump setProviderGeneration) can be
	// overwritten when the newer runHydrate resolves.
	const gen = hydrateGeneration;
	inFlight = runHydrate().finally(() => {
		// A reset/logout bumped the generation while this fetch was
		// in flight — don't touch inFlight or isRehydrating, which
		// now belong to a newer request (or were already cleared by
		// resetAIConfigStore).
		if (gen !== hydrateGeneration) return;
		inFlight = null;
		// Clear isRehydrating after runHydrate settles. runHydrate's own
		// setConfigSlice calls spread ...configSlice (which has
		// isRehydrating: true from above), so we must explicitly clear it
		// here. Guard the emit so resetAIConfigStore (which already sets
		// isRehydrating: false via initialConfigSlice) doesn't trigger a
		// redundant re-render.
		if (configSlice.isRehydrating) {
			setConfigSlice({ ...configSlice, isRehydrating: false });
		}
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
		// pre-switch config. But still populate availableProviders and
		// mark the slice hydrated: if setProvider failed (unconfigured
		// provider or fetch error), it bumped setProviderGeneration
		// without writing hydrated=true, and the module-level `hydrated`
		// flag is already true so later hydrate() calls short-circuit —
		// without this write the config slice stays un-hydrated forever
		// with no retry path (hydrateError is false). If setProvider
		// succeeded, it already wrote hydrated=true; this write is a
		// no-op on that field but still supplies availableProviders
		// (which setProvider's success path doesn't populate, leaving
		// the sidebar with an empty provider list).
		//
		// The first disjunct (providerGen !== setProviderGeneration)
		// catches a setProvider that started DURING the fetch (bumped
		// the generation after runHydrate captured providerGen). The
		// second disjunct catches a setProvider that predates this
		// hydrate — setProvider incremented setProviderGeneration BEFORE
		// runHydrate captured providerGen (same value), then succeeded
		// during the fetch, recording setProviderSucceededGen ===
		// providerGen. Without this second disjunct, providerGen ===
		// setProviderGeneration skips the race branch and the normal
		// success path below overwrites the user's just-selected
		// provider/key with the stale pre-switch backend config.
		const providerRaced =
			providerGen !== setProviderGeneration ||
			(setProviderSucceededGen > 0 && setProviderSucceededGen >= providerGen);
		if (providerRaced) {
			if (gen !== hydrateGeneration) return;
			// setProvider succeeded if it recorded its generation in
			// setProviderSucceededGen. On failure (unconfigured provider or
			// fetch error) it bumps setProviderGeneration without recording,
			// so setProviderSucceededGen stays at the last successful gen.
			// Check whether any setProvider succeeded at or after the gen
			// the hydrate captured as providerGen. Using ===
			// setProviderGeneration would miss the case where a successful
			// switch (gen N) was followed by a failed switch (gen N+1):
			// setProviderSucceededGen would be N while
			// setProviderGeneration is N+1, so the equality would fail and
			// the hydrate would clobber the successful provider choice with
			// stale data. Using > alone misses the case where a successful
			// switch (gen N) happened *before* the hydrate captured
			// providerGen=N, and a later switch (gen N+1) failed during
			// the hydrate: setProviderSucceededGen stays N, providerGen is
			// N, so N > N is false and the hydrate clobbers the successful
			// switch even though the later failure wrote nothing. The >=
			// check covers both. The `> 0` guard distinguishes "no
			// setProvider ever succeeded" (setProviderSucceededGen stays 0
			// because ++setProviderGeneration starts at 1, so a recorded
			// success is always >= 1) from "a setProvider at gen N
			// succeeded" — without it, the initial state (0 >= 0) would
			// falsely report success and preserve default config instead
			// of applying the hydrate's fetched backend snapshot. If it
			// failed, apply the hydrate's config so the user's saved
			// backend configuration isn't lost — without this, the store
			// ends up with default credentials and no error, leaving AI
			// gameplay unusable. If it succeeded, preserve
			// configSlice.config (the user's newer choice). We can't use
			// configSlice.hydrated as the success signal because a prior
			// hydrate/rehydrate may have already set it to true, causing a
			// failed setProvider to be mistaken for a successful one.
			const providerSucceeded =
				setProviderSucceededGen > 0 && setProviderSucceededGen >= providerGen;
			setConfigSlice({
				...configSlice,
				config: providerSucceeded ? configSlice.config : config,
				// Only preserve setProvider's list when the hydrate itself
				// fell back (fromFallback=true) AND returned no providers —
				// the fallback couldn't reach the backend, so setProvider's
				// fresher list is the best we have. If the hydrate succeeded
				// (fromFallback=false) it reflects the current backend state:
				// use its list even when empty, otherwise the sidebar keeps
				// offering providers whose keys no longer exist. If hydrate
				// got a non-empty list (even on a partial fallback where the
				// list fetch succeeded but the active full load failed), use
				// it — those providers are real.
				availableProviders:
					fromFallback && availableProviders.length === 0
						? configSlice.availableProviders
						: availableProviders,
				hydrated: true,
				// If setProvider succeeded, preserve its hydrateError
				// (false). If setProvider failed, surface the hydrate's
				// fallback state so the user gets a Retry button when the
				// hydrate itself also fell back.
				hydrateError: providerSucceeded
					? configSlice.hydrateError
					: fromFallback,
			});
			return;
		}
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
		// Same second-disjunct rationale as the success-path guard above:
		// a setProvider that predates this hydrate (same generation) may
		// have succeeded during the fetch, recording setProviderSucceededGen
		// === providerGen. Without the disjunct, the catch path's normal
		// branch sets hydrateError=true even though setProvider gave the
		// user working credentials.
		const providerRaced =
			providerGen !== setProviderGeneration ||
			(setProviderSucceededGen > 0 && setProviderSucceededGen >= providerGen);
		if (providerRaced) {
			// Same rationale as the success-path guard above: mark
			// hydrated so the UI isn't stuck. We don't have
			// availableProviders (the fetch threw), so just mark
			// hydrated and set the error if setProvider didn't succeed.
			setConfigSlice({
				...configSlice,
				hydrated: true,
				hydrateError:
					setProviderSucceededGen > 0 && setProviderSucceededGen >= providerGen
						? configSlice.hydrateError
						: true,
			});
			return;
		}
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
		// hydrate fetch was pending), the user needs hydrated=true immediately
		// — can't wait for runHydrate to resolve. runHydrate's generation guard
		// now also writes hydrated=true (and availableProviders) when it
		// detects the race, but setProvider's own write ensures the slice is
		// marked without depending on the stale hydrate's resolution timing.
		const merged = {
			...configSlice.config,
			provider,
			model: full.model || fallbackModel,
			apiKey: full.apiKey || '',
			enabled: true,
		};
		// Derive availableProviders from the fetched configurations list
		// (the same data loadAIConfigWithProviders uses) so the sidebar
		// shows every configured provider — not just the selected one. If
		// the concurrent hydrate's list fetch fails (its catch path doesn't
		// populate availableProviders), the sidebar would otherwise hide
		// the user's other keyed providers until a later successful hydrate.
		// If hydrate later succeeds, it overwrites with its own list.
		const configuredProviders = [
			...new Set(
				configurations
					.filter(c => c.hasApiKey && c.provider)
					.map(c => c.provider as AIProvider)
			),
		];
		setConfigSlice({
			...configSlice,
			config: merged,
			availableProviders: configuredProviders,
			hydrated: true,
			hydrateError: false,
		});
		// Also set the module-level `hydrated` guard. Without this, if
		// setProvider succeeds before the first hydrate() has started, the
		// module-level flag stays false and a later hydrate() proceeds.
		// runHydrate then captures providerGen === setProviderGeneration
		// (no new setProvider during the fetch), so the providerGen race
		// guard doesn't fire, and the hydrate overwrites the user's newly
		// selected provider/model/key with the stale active backend config.
		hydrated = true;
		// Record the generation so a concurrent runHydrate can detect that
		// this setProvider succeeded (not just that the slice was already
		// hydrated from a prior hydrate/rehydrate).
		setProviderSucceededGen = gen;
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
	setProviderSucceededGen = 0;
	hydrated = false;
	inFlight = null;
	setConfigSlice({ ...initialConfigSlice });
}
