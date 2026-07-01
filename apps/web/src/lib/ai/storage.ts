/* eslint-disable @typescript-eslint/no-explicit-any */
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
}

export async function loadAIConfigWithProviders(): Promise<AIConfigLoadResult> {
	if (typeof window === 'undefined') {
		return { config: defaultAIConfig, availableProviders: [] };
	}

	try {
		// Try to load from backend API
		const response = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'include',
		});

		if (response.ok) {
			const data = await response.json();
			const configurations = (data.configurations || []) as Array<{
				id?: string;
				provider?: AIProvider;
				isActive?: boolean;
				hasApiKey?: boolean;
			}>;
			const availableProviders = [
				...new Set(
					configurations
						.filter(c => c.hasApiKey && c.provider)
						.map(c => c.provider as AIProvider)
				),
			];
			const activeConfig = configurations.find(
				(config: any) => config.isActive
			);

			if (activeConfig && activeConfig.hasApiKey) {
				// Get the full config with API key
				const fullConfigResponse = await fetch(
					`${env.PUBLIC_API_URL}/ai-config/${activeConfig.id}/full`,
					{
						headers: {
							'Content-Type': 'application/json',
						},
						credentials: 'include',
					}
				);

				if (fullConfigResponse.ok) {
					const fullConfig = await fullConfigResponse.json();
					return {
						config: {
							provider: fullConfig.provider,
							apiKey: fullConfig.apiKey,
							model: fullConfig.modelName,
							enabled: true,
							gameVariant: fullConfig.gameVariant,
						},
						availableProviders,
					};
				}
			}

			// No active config with a key; fall through to localStorage but
			// still surface the providers that have keys configured.
			const saved = localStorage.getItem(AI_CONFIG_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				return {
					config: { ...defaultAIConfig, ...parsed },
					availableProviders,
				};
			}

			return { config: defaultAIConfig, availableProviders };
		}

		// Fallback to localStorage for backward compatibility
		const saved = localStorage.getItem(AI_CONFIG_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				config: { ...defaultAIConfig, ...parsed },
				availableProviders: [],
			};
		}
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Failed to load AI config:', error);
	}

	return { config: defaultAIConfig, availableProviders: [] };
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
