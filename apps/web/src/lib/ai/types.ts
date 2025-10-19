import type { GameVariant } from './game-variant-types';

export type AIProvider = 'gemini' | 'openrouter' | 'openai';

export interface AIConfig {
	provider: AIProvider;
	apiKey: string;
	model: string;
	enabled: boolean;
	debug?: boolean;
	gameVariant?: GameVariant;
}

export interface AIProviderInfo {
	name: string;
	defaultModel: string;
	models: string[];
	requiresApiKey: boolean;
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderInfo> = {
	gemini: {
		name: 'Google Gemini',
		defaultModel: 'gemini-2.5-flash-lite',
		models: ['gemini-2.5-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
		requiresApiKey: true,
	},
	openrouter: {
		name: 'OpenRouter',
		defaultModel: 'gpt-oss-120b',
		models: ['gpt-oss-120b', 'claude-3-haiku', 'llama-3.1-70b'],
		requiresApiKey: true,
	},
	openai: {
		name: 'OpenAI',
		defaultModel: 'gpt-4o-mini',
		models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
		requiresApiKey: true,
	},
};

export interface AIMove {
	from: string;
	to: string;
	reasoning?: string;
}

export interface AIResponse {
	move: AIMove;
	confidence: number;
	thinking?: string;
}
