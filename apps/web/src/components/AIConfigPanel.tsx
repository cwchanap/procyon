import React, { useState, useEffect } from 'react';
import type { AIConfig, AIProvider } from '../lib/ai/types';
import { AI_PROVIDERS } from '../lib/ai/types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface AIConfigPanelProps {
	config: AIConfig;
	onConfigChange: (config: AIConfig) => void;
	className?: string;
}

const AIConfigPanel: React.FC<AIConfigPanelProps> = ({
	config,
	onConfigChange,
	className = '',
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [tempConfig, setTempConfig] = useState<AIConfig>(config);

	useEffect(() => {
		setTempConfig(config);
	}, [config]);

	const handleProviderChange = (provider: AIProvider) => {
		const providerInfo = AI_PROVIDERS[provider];
		setTempConfig(prev => ({
			...prev,
			provider,
			model: providerInfo.defaultModel,
		}));
	};

	const handleModelChange = (model: string) => {
		setTempConfig(prev => ({
			...prev,
			model,
		}));
	};

	const handleApiKeyChange = (apiKey: string) => {
		setTempConfig(prev => ({
			...prev,
			apiKey,
		}));
	};

	const handleEnabledChange = (enabled: boolean) => {
		const updatedConfig = {
			...tempConfig,
			enabled,
		};
		setTempConfig(updatedConfig);
		onConfigChange(updatedConfig);
	};

	const handleSaveConfig = () => {
		onConfigChange(tempConfig);
		setIsExpanded(false);
	};

	const currentProvider = AI_PROVIDERS[tempConfig.provider];

	return (
		<div className={`bg-ink-700 border border-line rounded-xl ${className}`}>
			{/* Header */}
			<div className='p-4 border-b border-line'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<span className='text-2xl'>🤖</span>
						<div>
							<h3 className='text-lg font-semibold text-ivory'>AI Opponent</h3>
							<p className='text-sm text-ivory-dim'>
								{config.enabled
									? `${currentProvider.name} - ${config.model}`
									: 'Disabled'}
							</p>
						</div>
					</div>
					<div className='flex items-center gap-3'>
						<label className='flex items-center gap-2 cursor-pointer'>
							<input
								type='checkbox'
								checked={tempConfig.enabled}
								onChange={e => handleEnabledChange(e.target.checked)}
								className='w-4 h-4 rounded border-2 border-brass bg-transparent checked:bg-brass focus-visible:ring-brass'
							/>
							<span className='text-sm text-ivory-dim'>Enable AI</span>
						</label>
						<Button
							onClick={() => setIsExpanded(!isExpanded)}
							variant='ghost'
							size='sm'
							className='text-ivory-dim hover:text-ivory'
						>
							{isExpanded ? '▲' : '▼'}
						</Button>
					</div>
				</div>
			</div>

			{/* Expanded Configuration */}
			{isExpanded && (
				<div className='p-4 space-y-4'>
					{/* Provider Selection */}
					<div className='space-y-2'>
						<label className='block text-sm font-medium text-ivory'>
							AI Provider
						</label>
						<div className='grid grid-cols-2 gap-2'>
							{Object.entries(AI_PROVIDERS).map(([key, provider]) => (
								<button
									key={key}
									onClick={() => handleProviderChange(key as AIProvider)}
									className={`p-3 rounded-lg border-2 transition-colors duration-150 ${
										tempConfig.provider === key
											? 'border-brass bg-brass/20 text-ivory'
											: 'border-line text-ivory-dim hover:border-brass'
									}`}
								>
									<div className='text-sm font-medium'>{provider.name}</div>
									<div className='text-xs opacity-70'>
										{provider.defaultModel}
									</div>
								</button>
							))}
						</div>
					</div>

					{/* Model Selection */}
					<div className='space-y-2'>
						<label className='block text-sm font-medium text-ivory'>
							Model
						</label>
						<select
							value={tempConfig.model}
							onChange={e => handleModelChange(e.target.value)}
							className='w-full p-2 rounded-lg bg-ink-800 border border-line text-ivory focus-visible:border-brass focus-visible:ring-1 focus-visible:ring-brass'
						>
							{currentProvider.models.map(model => (
								<option key={model} value={model} className='bg-ink-800'>
									{model}
								</option>
							))}
						</select>
					</div>

					{/* API Key */}
					<div className='space-y-2'>
						<label className='block text-sm font-medium text-ivory'>
							API Key
						</label>
						<Input
							type='password'
							value={tempConfig.apiKey}
							onChange={e => handleApiKeyChange(e.target.value)}
							placeholder={`Enter your ${currentProvider.name} API key`}
							className='bg-ink-800 border-line text-ivory'
						/>
						<p className='text-xs text-ivory-dim'>
							Your API key is stored locally and never sent to our servers.
						</p>
					</div>

					{/* Action Buttons */}
					<div className='flex gap-2 pt-2'>
						<Button
							onClick={handleSaveConfig}
							className='flex-1 bg-brass text-ink-900 hover:bg-brass-bright font-medium'
						>
							Save Configuration
						</Button>
						<Button
							onClick={() => {
								setTempConfig(config);
								setIsExpanded(false);
							}}
							variant='ghost'
							className='text-ivory-dim hover:text-ivory'
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{/* AI Status Indicator */}
			{config.enabled && (
				<div className='px-4 pb-4'>
					<div className='flex items-center gap-2 text-sm'>
						<div
							className={`w-2 h-2 rounded-full ${
								config.apiKey ? 'bg-jungle' : 'bg-xiangqi'
							}`}
						/>
						<span className='text-ivory-dim'>
							{config.apiKey ? 'Ready to play' : 'API key required'}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default AIConfigPanel;
