import React from 'react';
import AIDebugDialog, { type AIMove } from '../ai/AIDebugDialog';

interface AIStatusPanelProps {
	aiConfigured: boolean;
	hasGameStarted: boolean;
	isAIThinking: boolean;
	isAIPaused: boolean;
	aiError: string | null;
	aiDebugMoves: AIMove[];
	isDebugMode: boolean;
	onRetry: () => void;
}

const AIStatusPanel: React.FC<AIStatusPanelProps> = ({
	aiConfigured,
	hasGameStarted,
	isAIThinking,
	isAIPaused,
	aiError,
	aiDebugMoves,
	isDebugMode,
	onRetry,
}) => {
	return (
		<div className='flex flex-col gap-4 max-w-2xl mx-auto'>
			<div className='text-center'>
				{!aiConfigured ? (
					hasGameStarted && (
						<div className='text-brass text-sm'>
							⚠ AI not configured - Configure API key in Profile to enable AI
							gameplay
						</div>
					)
				) : (
					<>
						{isAIThinking && !isAIPaused && (
							<div className='flex items-center justify-center gap-2 text-ivory-dim'>
								<div className='animate-spin w-4 h-4 border-2 border-brass border-t-transparent rounded-full'></div>
								AI is thinking...
							</div>
						)}

						{aiError && isAIPaused && (
							<div className='flex flex-col items-center gap-3 p-4 bg-xiangqi/10 border border-xiangqi/30 rounded-lg'>
								<div className='text-xiangqi text-center'>
									<div className='font-semibold mb-1'>❌ AI Error</div>
									<div className='text-sm opacity-90'>{aiError}</div>
								</div>
								<button
									onClick={onRetry}
									className='px-4 py-2 bg-brass text-ink-900 rounded-lg transition-colors text-sm font-medium hover:bg-brass-bright'
								>
									🔄 Retry
								</button>
							</div>
						)}

						<AIDebugDialog moves={aiDebugMoves} isVisible={isDebugMode} />
					</>
				)}
			</div>
		</div>
	);
};

export default AIStatusPanel;
