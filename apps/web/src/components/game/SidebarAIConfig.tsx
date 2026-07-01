import React, { useEffect, useState } from 'react';
import {
	useAIConfigStore,
	setProvider,
	setModel,
	setAIPlayer,
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

const AI_PLAYER_OPTIONS = [
	{ value: 'black', label: 'AI plays Black' },
	{ value: 'white', label: 'AI plays White' },
];

const SidebarAIConfig: React.FC = () => {
	const { config, aiPlayer } = useAIConfigStore();
	const { isAuthenticated } = useAuth();
	const [availableProviders, setAvailableProviders] = useState<AIProvider[]>(
		[]
	);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`${import.meta.env.PUBLIC_API_URL}/ai-config`, {
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
				});
				if (!res.ok) return;
				const data = await res.json();
				const providers = (
					(data.configurations || []) as Array<{
						provider: AIProvider;
						hasApiKey: boolean;
					}>
				)
					.filter(c => c.hasApiKey)
					.map(c => c.provider);
				if (!cancelled) setAvailableProviders([...new Set(providers)]);
			} catch {
				/* leave empty */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const providerOptions =
		availableProviders.length > 0
			? ALL_PROVIDER_OPTIONS.filter(p => availableProviders.includes(p.value))
			: ALL_PROVIDER_OPTIONS;

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
		const err = await setProvider(provider);
		if (err) setError(err);
	};

	return (
		<div className='space-y-4'>
			<h2 className='text-xs font-semibold uppercase tracking-wide text-ivory-dim'>
				AI Config
			</h2>

			{providerOptions.length === 0 ? (
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
							className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
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
							onChange={e => setModel(e.target.value)}
							className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
						>
							{models.map(o => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className='mb-1 block text-xs font-medium text-ivory-dim'>
							AI plays
						</label>
						<select
							aria-label='AI plays'
							value={aiPlayer}
							onChange={e => setAIPlayer(e.target.value as 'white' | 'black')}
							className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
						>
							{AI_PLAYER_OPTIONS.map(o => (
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
						Manage API keys
					</a>
				</>
			)}

			{error && (
				<p className='text-xs text-xiangqi' role='alert'>
					{error}
				</p>
			)}
		</div>
	);
};

export default SidebarAIConfig;
