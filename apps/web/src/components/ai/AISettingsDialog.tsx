import React, { useState, useEffect } from 'react';
import { env } from '../../lib/env';
import { getAuthHeaders } from '../../lib/auth';

interface AISettingsDialogProps {
	aiPlayer: string;
	onAIPlayerChange: (player: string) => void;
	provider: string;
	model: string;
	onProviderChange: (provider: string) => void;
	onModelChange: (model: string) => void;
	aiPlayerOptions: Array<{ value: string; label: string }>;
	isActive?: boolean;
	onActivate?: () => void;
}

// All available provider options
const ALL_PROVIDER_OPTIONS = [
	{ value: 'gemini', label: 'Google Gemini' },
	{ value: 'openrouter', label: 'OpenRouter' },
	{ value: 'openai', label: 'OpenAI' },
	{ value: 'chutes', label: 'Chutes.ai' },
];

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

const API_BASE_URL = env.PUBLIC_API_URL;

const AISettingsDialog: React.FC<AISettingsDialogProps> = ({
	aiPlayer,
	onAIPlayerChange,
	provider,
	model,
	onProviderChange,
	onModelChange,
	aiPlayerOptions,
	isActive = false,
	onActivate,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [availableProviders, setAvailableProviders] = useState<string[]>([]);

	// Fetch available providers (those with API keys configured)
	useEffect(() => {
		const fetchProviders = async () => {
			try {
				const authHeaders = await getAuthHeaders();
				const response = await fetch(`${API_BASE_URL}/ai-config`, {
					headers: {
						'Content-Type': 'application/json',
						...authHeaders,
					},
				});

				if (response.ok) {
					const data = await response.json();
					const configurations = data.configurations || [];
					// Get unique providers that have API keys
					type AiConfig = { provider: string; hasApiKey: boolean };
					const providers = (configurations as AiConfig[])
						.filter(config => config.hasApiKey)
						.map(config => config.provider);
					setAvailableProviders([...new Set<string>(providers)]);
				} else {
					setAvailableProviders([]);
				}
			} catch {
				setAvailableProviders([]);
			}
		};

		if (isOpen) {
			fetchProviders();
		}
	}, [isOpen]);

	// Filter providers to only show those with API keys
	const PROVIDER_OPTIONS = ALL_PROVIDER_OPTIONS.filter(p =>
		availableProviders.includes(p.value)
	);

	// Ensure provider is valid, fallback to first available
	const currentProvider = PROVIDER_OPTIONS.some(p => p.value === provider)
		? provider
		: PROVIDER_OPTIONS[0]?.value || 'gemini';

	// Get available models for current provider
	const availableModels =
		MODEL_OPTIONS[currentProvider] || MODEL_OPTIONS.gemini;

	// Ensure model is valid for current provider
	const currentModel = availableModels.some(m => m.value === model)
		? model
		: availableModels[0]?.value || '';

	const handleButtonClick = () => {
		if (!isActive) {
			onActivate?.();
		}
		setIsOpen(!isOpen);
	};

	return (
		<>
			<button
				onClick={handleButtonClick}
				className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
					isActive
						? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
						: 'text-white hover:bg-white hover:bg-opacity-20'
				}`}
			>
				⚙️ AI Settings
			</button>

			{isOpen && (
				<>
					{/* Backdrop */}
					<div
						className='fixed inset-0 bg-black bg-opacity-50 z-40'
						onClick={() => setIsOpen(false)}
					/>

					{/* Dialog */}
					<div className='fixed inset-0 flex items-center justify-center z-50 pointer-events-none'>
						<div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20 w-full max-w-md pointer-events-auto bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 bg-opacity-95'>
							<div className='flex justify-between items-center mb-6'>
								<h2 className='text-2xl font-bold text-white'>AI Settings</h2>
								<button
									onClick={() => setIsOpen(false)}
									className='text-white hover:text-gray-300 text-2xl leading-none'
								>
									×
								</button>
							</div>

							{PROVIDER_OPTIONS.length === 0 ? (
								<div className='text-center py-6'>
									<p className='text-yellow-300 mb-4'>
										⚠️ No AI providers configured
									</p>
									<p className='text-purple-200 text-sm'>
										Please configure an API key in the Profile page to enable AI
										gameplay.
									</p>
									<button
										onClick={() => (window.location.href = '/profile')}
										className='mt-4 glass-effect px-4 py-2 rounded-xl text-white bg-purple-500 bg-opacity-30 border border-white border-opacity-20 hover:bg-opacity-50 transition-all'
									>
										Go to Profile
									</button>
								</div>
							) : (
								<div className='space-y-4'>
									<div>
										<label className='block text-sm font-medium text-purple-200 mb-2'>
											AI Player
										</label>
										<select
											value={aiPlayer}
											onChange={e => onAIPlayerChange(e.target.value)}
											className='w-full glass-effect px-4 py-2 rounded-xl text-white bg-black bg-opacity-30 border border-white border-opacity-20 focus:outline-none focus:ring-2 focus:ring-purple-500'
										>
											{aiPlayerOptions.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>

									<div>
										<label className='block text-sm font-medium text-purple-200 mb-2'>
											AI Provider
										</label>
										<select
											value={currentProvider}
											onChange={e => {
												const newProvider = e.target.value;
												onProviderChange(newProvider);
												// Auto-select first model for new provider
												const models = MODEL_OPTIONS[newProvider];
												if (models && models.length > 0) {
													onModelChange(models[0].value);
												}
											}}
											className='w-full glass-effect px-4 py-2 rounded-xl text-white bg-black bg-opacity-30 border border-white border-opacity-20 focus:outline-none focus:ring-2 focus:ring-purple-500'
										>
											{PROVIDER_OPTIONS.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>

									<div>
										<label className='block text-sm font-medium text-purple-200 mb-2'>
											AI Model
										</label>
										<select
											value={currentModel}
											onChange={e => onModelChange(e.target.value)}
											className='w-full glass-effect px-4 py-2 rounded-xl text-white bg-black bg-opacity-30 border border-white border-opacity-20 focus:outline-none focus:ring-2 focus:ring-purple-500'
										>
											{availableModels.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								</div>
							)}

							<div className='mt-6 flex justify-end'>
								<button
									onClick={() => setIsOpen(false)}
									className='glass-effect px-6 py-2 rounded-xl text-white bg-purple-500 bg-opacity-30 border border-white border-opacity-20 hover:bg-opacity-50 transition-all'
								>
									Close
								</button>
							</div>
						</div>
					</div>
				</>
			)}
		</>
	);
};

export default AISettingsDialog;
