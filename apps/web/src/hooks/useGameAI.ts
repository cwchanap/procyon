import { useState, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import type { AIConfig, AIProvider } from '../lib/ai/types';
import { AI_PROVIDERS } from '../lib/ai/types';
import type { GameVariant } from '../lib/ai/game-variant-types';

const env = {
	PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL || 'http://localhost:3501',
};

export interface UseGameAIOptions {
	gameVariant: GameVariant;
	initialConfig: AIConfig;
	onConfigChange?: (config: AIConfig) => void;
}

export interface UseGameAIReturn {
	aiConfig: AIConfig;
	setAIConfig: React.Dispatch<React.SetStateAction<AIConfig>>;
	providerError: string | null;
	setProviderError: React.Dispatch<React.SetStateAction<string | null>>;
	isLoadingConfig: boolean;
	handleProviderChange: (newProvider: AIProvider) => Promise<void>;
	handleConfigChange: (newConfig: AIConfig) => void;
}

/**
 * Custom hook for managing AI configuration across game components.
 * Extracts common logic for handling provider changes, API key fetching,
 * and configuration updates.
 */
export function useGameAI({
	gameVariant,
	initialConfig,
	onConfigChange,
}: UseGameAIOptions): UseGameAIReturn {
	const { isAuthenticated, getAuthHeaders } = useAuth();

	const [aiConfig, setAIConfig] = useState<AIConfig>({
		...initialConfig,
		gameVariant,
	});
	const [providerError, setProviderError] = useState<string | null>(null);
	const [isLoadingConfig, setIsLoadingConfig] = useState(false);

	const handleProviderChange = useCallback(
		async (newProvider: AIProvider) => {
			const providerInfo = AI_PROVIDERS[newProvider];
			const fallbackModel =
				providerInfo.models[0] || providerInfo.defaultModel || aiConfig.model;

			setProviderError(null);

			try {
				if (!isAuthenticated) {
					setProviderError('Please sign in to manage your AI settings.');
					return;
				}

				setIsLoadingConfig(true);
				const authHeaders = await getAuthHeaders();
				const response = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
					headers: {
						'Content-Type': 'application/json',
						...authHeaders,
					},
				});

				if (!response.ok) {
					// eslint-disable-next-line no-console
					console.error(
						`Failed to fetch AI configurations for provider ${newProvider}:`,
						response.status,
						response.statusText
					);
					setProviderError(
						"We couldn't load your saved AI settings. Please try again from AI Settings."
					);
					return;
				}

				const data = await response.json();
				const configurations = (data.configurations || []) as Array<{
					id?: string;
					provider?: AIProvider;
					hasApiKey?: boolean;
				}>;
				const providerConfig = configurations.find(
					config => config.provider === newProvider && config.hasApiKey
				);

				if (!providerConfig?.id) {
					// eslint-disable-next-line no-console
					console.warn(
						'No stored API key found for provider; prompt user to add one:',
						newProvider
					);
					setProviderError(
						`No API key found for ${providerInfo.name}. Please add one in the AI Settings menu.`
					);
					// Still update provider but with empty key
					const newConfig: AIConfig = {
						...aiConfig,
						provider: newProvider,
						model: fallbackModel,
						apiKey: '',
						enabled: false,
						gameVariant,
					};
					setAIConfig(newConfig);
					onConfigChange?.(newConfig);
					return;
				}

				// Fetch full API key for this configuration
				const fullConfigResponse = await fetch(
					`${env.PUBLIC_API_URL}/ai-config/${providerConfig.id}/full`,
					{
						headers: {
							'Content-Type': 'application/json',
							...authHeaders,
						},
					}
				);

				if (!fullConfigResponse.ok) {
					// eslint-disable-next-line no-console
					console.error(
						`Failed to fetch full API key for config ${providerConfig.id}:`,
						fullConfigResponse.status,
						fullConfigResponse.statusText
					);
					setProviderError(
						"We couldn't load your API key. Please try again from AI Settings."
					);
					return;
				}

				const fullConfig = await fullConfigResponse.json();
				const newConfig: AIConfig = {
					...aiConfig,
					provider: newProvider,
					model: fullConfig.model || fallbackModel,
					apiKey: fullConfig.apiKey || '',
					enabled: true,
					gameVariant,
				};
				setAIConfig(newConfig);
				onConfigChange?.(newConfig);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error('Error fetching AI configuration:', error);
				setProviderError(
					'An error occurred while loading AI settings. Please try again.'
				);
			} finally {
				setIsLoadingConfig(false);
			}
		},
		[aiConfig, isAuthenticated, getAuthHeaders, gameVariant, onConfigChange]
	);

	const handleConfigChange = useCallback(
		(newConfig: AIConfig) => {
			const configWithVariant = {
				...newConfig,
				gameVariant,
			};
			setAIConfig(configWithVariant);
			onConfigChange?.(configWithVariant);
		},
		[gameVariant, onConfigChange]
	);

	return {
		aiConfig,
		setAIConfig,
		providerError,
		setProviderError,
		isLoadingConfig,
		handleProviderChange,
		handleConfigChange,
	};
}
