import React from 'react';

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
			className={`mt-4 p-4 bg-black bg-opacity-40 rounded-xl border border-white border-opacity-10 ${className}`}
		>
			<h4 className='text-sm font-semibold text-cyan-200 mb-3 flex items-center gap-2'>
				<span>🤖</span>
				AI Move History
			</h4>
			<div className='max-h-64 overflow-y-auto space-y-3'>
				{moves.slice(-10).map((move, idx) => (
					<div
						key={`${move.moveNumber}-${move.timestamp}-${idx}`}
						className={`p-3 rounded-lg border ${
							move.isAI
								? 'bg-blue-900 bg-opacity-30 border-blue-500 border-opacity-30'
								: 'bg-gray-900 bg-opacity-30 border-gray-500 border-opacity-30'
						}`}
					>
						<div className='flex items-center justify-between mb-2'>
							<div className='flex items-center gap-2'>
								<span
									className={`text-xs px-2 py-1 rounded-full ${
										move.isAI
											? 'bg-blue-500 text-white'
											: 'bg-gray-500 text-white'
									}`}
								>
									{move.isAI ? '🤖 AI' : '👤 Human'}
								</span>
								<span className='text-xs font-medium text-white'>
									Move {move.moveNumber}
								</span>
							</div>
							<span className='text-xs text-gray-400'>
								{formatTime(move.timestamp)}
							</span>
						</div>

						<div className='text-sm'>
							<div className='text-white font-medium mb-1'>
								{move.player}: <span className='font-mono'>{move.move}</span>
							</div>

							{move.thinking && (
								<div className='text-cyan-300 text-xs mt-1 italic'>
									💭 "{move.thinking}"
								</div>
							)}

							{move.error && (
								<div className='text-red-300 text-xs mt-1'>❌ {move.error}</div>
							)}
						</div>
					</div>
				))}
			</div>

			{moves.length > 10 && (
				<div className='text-xs text-gray-400 text-center mt-2'>
					Showing last 10 moves (total: {moves.length})
				</div>
			)}
		</div>
	);
};

export default AIDebugDialog;
