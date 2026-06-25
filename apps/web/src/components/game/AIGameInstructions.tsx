import React from 'react';

interface AIGameInstructionsProps {
	providerName?: string;
	modelName?: string;
	aiConfigured: boolean;
	children?: React.ReactNode;
}

const AIGameInstructions: React.FC<AIGameInstructionsProps> = ({
	providerName,
	modelName,
	aiConfigured,
	children,
}) => {
	return (
		<div className='text-sm text-ivory-dim text-center max-w-md mx-auto space-y-2 bg-ink-700 rounded-lg p-4 border border-line'>
			<p className='flex items-center justify-center gap-2'>
				Click on a piece to select it, then click on a highlighted square to
				move.
			</p>
			<p className='flex items-center justify-center gap-2'>
				<span className='w-3 h-3 bg-jungle rounded-full inline-block'></span>
				Possible moves
				<span className='mx-2'>•</span>
				<span className='w-3 h-3 border-2 border-xiangqi rounded inline-block'></span>
				Captures
			</p>
			{children}
			<p className='flex items-center justify-center gap-2 pt-2 border-t border-line'>
				<span>🤖</span>
				{aiConfigured && providerName && modelName
					? `Playing against ${providerName} (${modelName})`
					: 'AI Mode - Configure API key to play against AI'}
			</p>
		</div>
	);
};

export default AIGameInstructions;
