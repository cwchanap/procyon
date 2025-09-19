export type AIProvider = 'gemini' | 'openrouter';

export interface AIConfig {
    provider: AIProvider;
    apiKey: string;
    model: string;
    enabled: boolean;
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
