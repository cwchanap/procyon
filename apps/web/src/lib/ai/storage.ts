import type { AIConfig, AIProvider } from './types';
import { env } from '../env';

const AI_CONFIG_KEY = 'procyon_ai_config';

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
		localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
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
				// Full load failed; fall through to localStorage below.
			}
		}

		// No active config with a key; fall through to localStorage but
		// still surface the providers that have keys configured. The list
		// fetch itself succeeded, so this is not a fallback.
		const local = readLocalConfig(availableProviders, false);
		if (local) return local;

		return {
			config: defaultAIConfig,
			availableProviders,
			fromFallback: false,
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
