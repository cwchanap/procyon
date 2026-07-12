import React, { useState } from 'react';
import {
	useAIConfig,
	setProvider,
	setModel,
	rehydrate,
} from '../../lib/ai/ai-config-store';
import type { AIProvider } from '../../lib/ai/types';
import { useAuth } from '../../lib/auth';

const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
	gemini: [
		{ value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
		{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
		{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
		{ value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
	],
	openrouter: [
		{ value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
		{ value: 'gpt-4o', label: 'GPT-4o' },
		{ value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
		{ value: 'llama-3.1-70b', label: 'Llama 3.1 70B' },
		{ value: 'gpt-oss-120b', label: 'GPT OSS 120B' },
	],
	openai: [
		{ value: 'gpt-4o', label: 'GPT-4o' },
		{ value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
		{ value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
		{ value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
	],
	chutes: [
		{ value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1' },
		{ value: 'zai-org/GLM-4.6-FP8', label: 'GLM 4.6 FP8' },
		{ value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
		{
			value: 'meta-llama/Llama-3.3-70B-Instruct',
			label: 'Llama 3.3 70B Instruct',
		},
	],
};

const ALL_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
	{ value: 'gemini', label: 'Google Gemini' },
	{ value: 'openrouter', label: 'OpenRouter' },
	{ value: 'openai', label: 'OpenAI' },
	{ value: 'chutes', label: 'Chutes.ai' },
];

/**
 * Resolve the provider dropdown options from the store's hydration state.
 *
 * Before hydration completes we show every provider so users aren't shown a
 * false "no providers" state while the fetch is in flight. Once hydrated, an
 * empty `availableProviders` means the user has no API keys configured and
 * the caller surfaces the dedicated empty-state prompt (so we return []).
 * Otherwise we filter the full list down to the providers that have keys.
 */
function resolveProviderOptions(
	availableProviders: AIProvider[],
	hydrated: boolean
): Array<{ value: AIProvider; label: string }> {
	if (hydrated && availableProviders.length === 0) return [];
	if (availableProviders.length === 0) return ALL_PROVIDER_OPTIONS;
	return ALL_PROVIDER_OPTIONS.filter(p => availableProviders.includes(p.value));
}

const SidebarAIConfig: React.FC = () => {
	const { config, availableProviders, hydrated, hydrateError } = useAIConfig();
	const { isAuthenticated, loading } = useAuth();
	const [error, setError] = useState<string | null>(null);
	// Tracks an in-flight provider switch so the model select can be
	// disabled until setProvider finishes — otherwise a model pick made
	// before setProvider's setConfigSlice resolves is silently overwritten
	// by the saved provider's model (setProvider writes `full.model ||
	// fallbackModel` into the store). Mirrors AISettingsDialog's
	// isProviderSwitching guard.
	const [isProviderSwitching, setIsProviderSwitching] = useState(false);

	// `availableProviders` is populated once by the store's hydrate() (called
	// from AppShell on mount), which fetches /ai-config. Reading it from the
	// store avoids a redundant second /ai-config request on every game page.
	const providerOptions = resolveProviderOptions(availableProviders, hydrated);

	const models = MODEL_OPTIONS[config.provider] || MODEL_OPTIONS.gemini;
	const currentModel = models.some(m => m.value === config.model)
		? config.model
		: models[0]?.value || '';

	const onProviderChange = async (provider: AIProvider) => {
		setError(null);
		if (!isAuthenticated) {
			setError('Please sign in to manage your AI settings.');
			return;
		}
		setIsProviderSwitching(true);
		try {
			const err = await setProvider(provider);
			if (err) setError(err);
		} finally {
			setIsProviderSwitching(false);
		}
	};

	return (
		<div className='space-y-4'>
			<h2 className='text-xs font-semibold uppercase tracking-wide text-ivory-dim'>
				AI Config
			</h2>

			{!loading && !isAuthenticated ? (
				// Signed-out visitors never hydrate the AI config store (AppShell
				// gates hydrate() on isAuthenticated, since /ai-config is protected
				// and would 401). Without this branch, `hydrated` stays false and
				// resolveProviderOptions returns every provider, rendering controls
				// that onProviderChange then rejects after the fact. Surface the
				// sign-in prompt directly instead.
				<div className='text-sm text-ivory-dim'>
					<p className='mb-2'>
						Sign in to configure your AI provider and API keys.
					</p>
					<a href='/login' className='text-brass hover:underline'>
						Sign in →
					</a>
				</div>
			) : hydrated && hydrateError ? (
				<div className='text-sm text-ivory-dim' role='alert'>
					<p className='mb-2'>
						We couldn&rsquo;t load your AI settings. Check your connection and
						try again.
					</p>
					<button
						type='button'
						onClick={() => {
							setError(null);
							void rehydrate();
						}}
						className='text-brass hover:underline'
					>
						Retry
					</button>
				</div>
			) : providerOptions.length === 0 ? (
				<div className='text-sm text-ivory-dim'>
					<p className='mb-2'>No AI providers configured.</p>
					<a href='/profile' className='text-brass hover:underline'>
						Manage API keys →
					</a>
				</div>
			) : (
				<>
					<div>
						<label className='mb-1 block text-xs font-medium text-ivory-dim'>
							AI Provider
						</label>
						<select
							aria-label='AI Provider'
							value={config.provider}
							onChange={e => onProviderChange(e.target.value as AIProvider)}
							disabled={isProviderSwitching || !hydrated}
							className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50'
						>
							{providerOptions.map(o => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className='mb-1 block text-xs font-medium text-ivory-dim'>
							AI Model
						</label>
						<select
							aria-label='AI Model'
							value={currentModel}
							disabled={isProviderSwitching || !hydrated}
							onChange={e => setModel(e.target.value)}
							className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50'
						>
							{models.map(o => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</div>

					<a
						href='/profile'
						className='block text-xs text-brass hover:underline'
					>
						Manage API keys →
					</a>
				</>
			)}

			{error && (
				<p className='text-xs text-destructive' role='alert'>
					{error}
				</p>
			)}
		</div>
	);
};

export default SidebarAIConfig;
