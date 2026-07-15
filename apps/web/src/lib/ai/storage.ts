import type { AIConfig, AIProvider } from './types';
import { env } from '../env';

const AI_CONFIG_KEY = 'procyon_ai_config';

/**
 * Timeout for AI config fetches (/ai-config list and /ai-config/:id/full).
 * Prevents `setProvider` and `hydrate` from hanging indefinitely on a stalled
 * connection — without this, a hung fetch leaves `isProviderSwitching` stuck
 * true in SidebarAIConfig (both selects permanently disabled) because the
 * `await onProviderChange(...)` never resolves and the `finally` never runs.
 * The resulting AbortError throws and is caught by the callers' catch blocks.
 */
const AI_CONFIG_FETCH_TIMEOUT_MS = 10_000;

export const defaultAIConfig: AIConfig = {
	provider: 'gemini',
	apiKey: '',
	model: 'gemini-2.5-flash-lite',
	enabled: false,
	gameVariant: 'chess',
};

export function saveAIConfig(config: AIConfig): void {
	if (typeof window === 'undefined') return;

	try {
		// Never persist the provider API key to localStorage. The key is
		// fetched from the protected `/ai-config/:id/full` endpoint on
		// hydrate and held in memory for the current session; writing it to
		// localStorage would let a later anonymous/shared-browser session
		// reuse the previous user's provider key (logout does clear the
		// cache, but tab-close without logout would leave it behind). We
		// still cache the non-secret preferences (provider/model/enabled/
		// gameVariant) so the fallback path can surface them.
		const sanitized: AIConfig = { ...config, apiKey: '' };
		localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(sanitized));
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Failed to save AI config:', error);
	}
}

export interface AIConfigLoadResult {
	config: AIConfig;
	availableProviders: AIProvider[];
	/** True when the backend fetch failed and we fell back to defaults or
	 * the localStorage cache. Lets callers (e.g. hydrate) distinguish a
	 * real load failure from a successful fetch that simply returned no
	 * configured providers. */
	fromFallback: boolean;
}

/** A single row from the `/ai-config` list endpoint. */
export interface AIConfigListItem {
	id?: string;
	provider?: AIProvider;
	isActive?: boolean;
	hasApiKey?: boolean;
}

/** The full config + key returned by `/ai-config/:id/full`. */
export type FullAIConfig = Pick<
	AIConfig,
	'provider' | 'apiKey' | 'model' | 'gameVariant'
>;

/**
 * Read the locally-cached AI config from localStorage and merge it with
 * defaults. Returns null when nothing is cached. Used by the fallback paths
 * in {@link loadAIConfigWithProviders} so the "no active keyed config" and
 * "backend request failed" branches share one read/parse/merge implementation.
 */
function readLocalConfig(
	availableProviders: AIProvider[],
	fromFallback = true
): AIConfigLoadResult | null {
	const saved = localStorage.getItem(AI_CONFIG_KEY);
	if (!saved) return null;
	try {
		const parsed = JSON.parse(saved);
		// Drop any cached API key from a legacy entry written before
		// saveAIConfig started sanitizing. Re-save the sanitized form so
		// the stale key is evicted from localStorage on the next read.
		if (parsed && typeof parsed === 'object' && parsed.apiKey) {
			parsed.apiKey = '';
			localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(parsed));
		}
		return {
			config: { ...defaultAIConfig, ...parsed },
			availableProviders,
			fromFallback,
		};
	} catch (error) {
		// Corrupt cache: drop it so subsequent loads fall through to defaults
		// instead of re-throwing on every retry and trapping the user in the
		// error state. Logging mirrors saveAIConfig/clearAIConfig's behavior.
		// eslint-disable-next-line no-console
		console.error('Corrupt AI config in localStorage, removing:', error);
		localStorage.removeItem(AI_CONFIG_KEY);
		return null;
	}
}

/**
 * Fetch the user's AI configuration list from the backend. Throws on a
 * non-OK response or network failure so callers can branch on the error.
 */
export async function fetchAIConfigList(): Promise<AIConfigListItem[]> {
	const res = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		signal: AbortSignal.timeout(AI_CONFIG_FETCH_TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`/ai-config returned ${res.status}`);
	}
	const data = await res.json();
	return (data.configurations || []) as AIConfigListItem[];
}

/**
 * Fetch the full config (including API key) for a single configuration id.
 * Throws on a non-OK response or network failure.
 */
export async function fetchFullAIConfig(id: string): Promise<FullAIConfig> {
	const res = await fetch(`${env.PUBLIC_API_URL}/ai-config/${id}/full`, {
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		signal: AbortSignal.timeout(AI_CONFIG_FETCH_TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`/ai-config/${id}/full returned ${res.status}`);
	}
	const full = await res.json();
	return {
		provider: full.provider,
		apiKey: full.apiKey,
		model: full.modelName,
		gameVariant: full.gameVariant,
	};
}

export async function loadAIConfigWithProviders(): Promise<AIConfigLoadResult> {
	if (typeof window === 'undefined') {
		return {
			config: defaultAIConfig,
			availableProviders: [],
			fromFallback: false,
		};
	}

	try {
		const configurations = await fetchAIConfigList();
		const availableProviders = [
			...new Set(
				configurations
					.filter(c => c.hasApiKey && c.provider)
					.map(c => c.provider as AIProvider)
			),
		];
		const activeConfig = configurations.find(c => c.isActive);

		// True when the list fetch succeeded but the subsequent
		// `/ai-config/:id/full` call for the active keyed config failed. The
		// fall-through below then serves localStorage/defaults, but callers
		// (e.g. hydrate) must still see `fromFallback: true` so the sidebar
		// surfaces a retry/error state instead of treating a stale or
		// disabled-key cache as a clean load.
		let fullLoadFailed = false;

		if (activeConfig?.id && activeConfig.hasApiKey) {
			try {
				const full = await fetchFullAIConfig(activeConfig.id);
				return {
					config: {
						provider: full.provider,
						apiKey: full.apiKey,
						model: full.model,
						enabled: true,
						gameVariant: full.gameVariant,
					},
					availableProviders,
					fromFallback: false,
				};
			} catch {
				// Full load failed; fall through to localStorage below, but
				// mark it as a fallback so callers don't mistake a stale
				// cache/default for a clean load.
				fullLoadFailed = true;
			}
		}

		// No active config with a key (or the full load failed); fall through
		// to localStorage but still surface the providers that have keys
		// configured. The list fetch itself succeeded, so the no-active-config
		// branch is not a fallback; the full-load-failed branch is.
		const local = readLocalConfig(availableProviders, fullLoadFailed);
		if (local) return local;

		return {
			config: defaultAIConfig,
			availableProviders,
			fromFallback: fullLoadFailed,
		};
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Failed to load AI config:', error);
		// Fallback to localStorage for backward compatibility
		const fallback = readLocalConfig([]);
		if (fallback) return fallback;
	}

	return {
		config: defaultAIConfig,
		availableProviders: [],
		fromFallback: true,
	};
}

export async function loadAIConfig(): Promise<AIConfig> {
	return (await loadAIConfigWithProviders()).config;
}

export function clearAIConfig(): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem(AI_CONFIG_KEY);
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Failed to clear AI config:', error);
	}
}
