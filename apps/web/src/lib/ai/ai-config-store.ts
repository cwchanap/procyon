import { useSyncExternalStore } from 'react';
import type { AIConfig, AIProvider } from './types';
import {
	defaultAIConfig,
	loadAIConfigWithProviders,
	saveAIConfig,
} from './storage';
import { env } from '../env';

export interface AIConfigState {
	config: AIConfig;
	aiPlayer: 'white' | 'black';
	availableProviders: AIProvider[];
	/** True once hydrate() has resolved (success or failure). */
	hydrated: boolean;
}

const initialState: AIConfigState = {
	config: defaultAIConfig,
	aiPlayer: 'black',
	availableProviders: [],
	hydrated: false,
};

let state: AIConfigState = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

export function getSnapshot(): AIConfigState {
	return state;
}

function emit(): void {
	for (const cb of listeners) cb();
}

function setState(next: AIConfigState): void {
	state = next;
	emit();
}

export function setConfig(patch: Partial<AIConfig>): void {
	setState({ ...state, config: { ...state.config, ...patch } });
	saveAIConfig(state.config);
}

export function setModel(model: string): void {
	setConfig({ model });
}

export function setAIPlayer(aiPlayer: 'white' | 'black'): void {
	setState({ ...state, aiPlayer });
}

export async function hydrate(): Promise<void> {
	if (hydrated) return;
	hydrated = true;
	try {
		const { config, availableProviders } = await loadAIConfigWithProviders();
		setState({ ...state, config, availableProviders, hydrated: true });
	} catch {
		// keep defaults, but mark hydrated so consumers can distinguish
		// "still loading" from "loaded with no configured providers".
		setState({ ...state, hydrated: true });
	}
}

export async function setProvider(
	provider: AIProvider
): Promise<string | null> {
	try {
		const res = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
		});
		if (!res.ok) {
			return "We couldn't load your saved AI settings. Please try again from AI Settings.";
		}
		const data = await res.json();
		const configurations = (data.configurations || []) as Array<{
			id?: string;
			provider?: AIProvider;
			hasApiKey?: boolean;
		}>;
		const providerConfig = configurations.find(
			c => c.provider === provider && c.hasApiKey
		);
		if (!providerConfig?.id) {
			return 'Add an API key for this provider in AI Settings to reuse it here.';
		}
		const fullRes = await fetch(
			`${env.PUBLIC_API_URL}/ai-config/${providerConfig.id}/full`,
			{
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
			}
		);
		if (!fullRes.ok) {
			return "We couldn't load your saved API key details. Please try again.";
		}
		const full = await fullRes.json();
		setConfig({
			provider,
			model: full.modelName || state.config.model,
			apiKey: full.apiKey || '',
			enabled: true,
		});
		return null;
	} catch {
		return 'Something went wrong loading AI settings. Please try again.';
	}
}

export function useAIConfigStore(): AIConfigState {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
