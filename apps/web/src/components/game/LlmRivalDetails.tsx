import React from 'react';
import type { LlmUsability } from '../../lib/chess/rival/types';
import type { AIMove } from '../ai/AIDebugDialog';
import AIGameInstructions from './AIGameInstructions';
import AIStatusPanel from './AIStatusPanel';

interface LlmRivalDetailsProps {
	llmUsability: LlmUsability;
	hasGameStarted: boolean;
	isAIThinking: boolean;
	isAIPaused: boolean;
	aiError: string | null;
	aiDebugMoves: AIMove[];
	isDebugMode: boolean;
	onRetry: () => void;
}

function statusGuidance(llmUsability: LlmUsability): string | null {
	switch (llmUsability.status) {
		case 'loading':
			return 'Checking language-model configuration...';
		case 'signed-out':
			return 'Sign in to configure your AI provider.';
		case 'unconfigured':
		case 'available':
			return null;
	}
}

const LlmRivalDetails: React.FC<LlmRivalDetailsProps> = ({
	llmUsability,
	hasGameStarted,
	isAIThinking,
	isAIPaused,
	aiError,
	aiDebugMoves,
	isDebugMode,
	onRetry,
}) => {
	const aiConfigured = llmUsability.status === 'available';
	const guidance = statusGuidance(llmUsability);
	const providerName = aiConfigured ? llmUsability.provider : undefined;
	const modelName = aiConfigured ? llmUsability.model : undefined;

	return (
		<div className='space-y-4'>
			{guidance && (
				<div className='rounded-lg border border-line bg-ink-700 p-4 text-center text-sm text-ivory-dim'>
					{guidance}
				</div>
			)}

			<AIStatusPanel
				aiConfigured={aiConfigured}
				hasGameStarted={hasGameStarted}
				isAIThinking={isAIThinking}
				isAIPaused={isAIPaused}
				aiError={aiError}
				aiDebugMoves={aiDebugMoves}
				isDebugMode={isDebugMode}
				onRetry={onRetry}
			/>

			<AIGameInstructions
				variant='chess'
				providerName={providerName}
				modelName={modelName}
				aiConfigured={aiConfigured}
			/>
		</div>
	);
};

export default LlmRivalDetails;
