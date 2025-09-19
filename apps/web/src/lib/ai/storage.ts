import type { AIConfig } from './types';

const AI_CONFIG_KEY = 'procyon_ai_config';

export const defaultAIConfig: AIConfig = {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-2.5-flash-lite',
    enabled: false,
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

export function loadAIConfig(): AIConfig {
    if (typeof window === 'undefined') {
        return defaultAIConfig;
    }

    try {
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
