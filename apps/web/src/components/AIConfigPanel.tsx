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
		<div
			className={`glass-effect rounded-xl border border-white border-opacity-20 ${className}`}
		>
			{/* Header */}
			<div className='p-4 border-b border-white border-opacity-10'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<span className='text-2xl'>🤖</span>
						<div>
							<h3 className='text-lg font-semibold text-white'>AI Opponent</h3>
							<p className='text-sm text-purple-200'>
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
								className='w-4 h-4 rounded border-2 border-purple-400 bg-transparent checked:bg-purple-500 focus:ring-2 focus:ring-purple-400'
							/>
							<span className='text-sm text-purple-200'>Enable AI</span>
						</label>
						<Button
							onClick={() => setIsExpanded(!isExpanded)}
							variant='ghost'
							size='sm'
							className='text-purple-200 hover:text-white'
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
						<label className='block text-sm font-medium text-white'>
							AI Provider
						</label>
						<div className='grid grid-cols-2 gap-2'>
							{Object.entries(AI_PROVIDERS).map(([key, provider]) => (
								<button
									key={key}
									onClick={() => handleProviderChange(key as AIProvider)}
									className={`p-3 rounded-lg border-2 transition-all duration-200 ${
										tempConfig.provider === key
											? 'border-purple-400 bg-purple-500 bg-opacity-20 text-white'
											: 'border-white border-opacity-20 text-purple-200 hover:border-purple-400'
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
						<label className='block text-sm font-medium text-white'>
							Model
						</label>
						<select
							value={tempConfig.model}
							onChange={e => handleModelChange(e.target.value)}
							className='w-full p-2 rounded-lg bg-black bg-opacity-30 border border-white border-opacity-20 text-white focus:border-purple-400 focus:ring-1 focus:ring-purple-400'
						>
							{currentProvider.models.map(model => (
								<option key={model} value={model} className='bg-gray-800'>
									{model}
								</option>
							))}
						</select>
					</div>

					{/* API Key */}
					<div className='space-y-2'>
						<label className='block text-sm font-medium text-white'>
							API Key
						</label>
						<Input
							type='password'
							value={tempConfig.apiKey}
							onChange={e => handleApiKeyChange(e.target.value)}
							placeholder={`Enter your ${currentProvider.name} API key`}
							className='bg-black bg-opacity-30 border-white border-opacity-20 text-white'
						/>
						<p className='text-xs text-purple-300'>
							Your API key is stored locally and never sent to our servers.
						</p>
					</div>

					{/* Action Buttons */}
					<div className='flex gap-2 pt-2'>
						<Button
							onClick={handleSaveConfig}
							className='flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
						>
							Save Configuration
						</Button>
						<Button
							onClick={() => {
								setTempConfig(config);
								setIsExpanded(false);
							}}
							variant='ghost'
							className='text-purple-200 hover:text-white'
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
								config.apiKey ? 'bg-green-400' : 'bg-red-400'
							}`}
						/>
						<span className='text-purple-200'>
							{config.apiKey ? 'Ready to play' : 'API key required'}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default AIConfigPanel;
