/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AIConfig } from './types';
import { env } from '../env';
import { getAuthHeaders } from '../auth';

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

export async function loadAIConfig(): Promise<AIConfig> {
	if (typeof window === 'undefined') {
		return defaultAIConfig;
	}

	try {
		const authHeaders = await getAuthHeaders();
		// Try to load from backend API using authorization headers
		const response = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
			},
		});

		if (response.ok) {
			const data = await response.json();
			const configurations = data.configurations || [];
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
							...authHeaders,
						},
					}
				);

				if (fullConfigResponse.ok) {
					const fullConfig = await fullConfigResponse.json();
					return {
						provider: fullConfig.provider,
						apiKey: fullConfig.apiKey,
						model: fullConfig.modelName,
						enabled: true,
						gameVariant: fullConfig.gameVariant,
					};
				}
			}
		}

		// Fallback to localStorage for backward compatibility
		const saved = localStorage.getItem(AI_CONFIG_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return { ...defaultAIConfig, ...parsed };
		}
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error('Failed to load AI config:', error);
	}

	return defaultAIConfig;
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
