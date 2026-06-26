import React from 'react';
import { cva } from 'class-variance-authority';

export interface AIMove {
	moveNumber: number;
	player: string;
	move: string;
	timestamp: number;
	isAI: boolean;
	thinking?: string;
	error?: string;
}

interface AIDebugDialogProps {
	moves: AIMove[];
	isVisible: boolean;
	className?: string;
}

type MoveSource = 'ai' | 'human';

const moveCardVariants = cva('p-3 rounded-lg border bg-ink-700/40', {
	variants: {
		source: {
			ai: 'border-line-brass',
			human: 'border-line',
		},
	},
});

const moveBadgeVariants = cva('text-xs px-2 py-1 rounded-full', {
	variants: {
		source: {
			ai: 'bg-brass text-ink-900',
			human: 'bg-ink-600 text-ivory',
		},
	},
});

const AIDebugDialog: React.FC<AIDebugDialogProps> = ({
	moves,
	isVisible,
	className = '',
}) => {
	if (!isVisible || moves.length === 0) {
		return null;
	}

	const formatTime = (timestamp: number) => {
		return new Date(timestamp).toLocaleTimeString([], {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	};

	return (
		<div
			className={`mt-4 p-4 bg-ink-900/40 rounded-lg border border-line ${className}`}
		>
			<h4 className='text-sm font-semibold text-brass mb-3 flex items-center gap-2'>
				<span>🤖</span>
				AI Move History
			</h4>
			<div className='max-h-64 overflow-y-auto space-y-3'>
				{moves.slice(-10).map((move, idx) => {
					const source: MoveSource = move.isAI ? 'ai' : 'human';
					return (
						<div
							key={`${move.moveNumber}-${move.timestamp}-${idx}`}
							className={moveCardVariants({ source })}
						>
							<div className='flex items-center justify-between mb-2'>
								<div className='flex items-center gap-2'>
									<span className={moveBadgeVariants({ source })}>
										{move.isAI ? '🤖 AI' : '👤 Human'}
									</span>
									<span className='text-xs font-medium text-ivory'>
										Move {move.moveNumber}
									</span>
								</div>
								<span className='text-xs text-ivory-dim'>
									{formatTime(move.timestamp)}
								</span>
							</div>

							<div className='text-sm'>
								<div className='text-ivory font-medium mb-1'>
									{move.player}: <span className='font-mono'>{move.move}</span>
								</div>

								{move.thinking && (
									<div className='text-brass text-xs mt-1 italic'>
										💭 "{move.thinking}"
									</div>
								)}

								{move.error && (
									<div className='text-xiangqi text-xs mt-1'>
										❌ {move.error}
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{moves.length > 10 && (
				<div className='text-xs text-ivory-dim text-center mt-2'>
					Showing last 10 moves (total: {moves.length})
				</div>
			)}
		</div>
	);
};

export default AIDebugDialog;
