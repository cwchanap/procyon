import React from 'react';

interface GameControlsProps {
	hasGameStarted: boolean;
	isGameOver: boolean;
	aiConfigured: boolean;
	isDebugMode: boolean;
	canExport: boolean;
	onStartOrReset: () => void;
	onReset: () => void;
	onToggleDebug: () => void;
	onExport: () => void;
}

const GameControls: React.FC<GameControlsProps> = ({
	hasGameStarted,
	isGameOver,
	aiConfigured,
	isDebugMode,
	canExport,
	onStartOrReset,
	onReset,
	onToggleDebug,
	onExport,
}) => {
	return (
		<div className='flex gap-4 justify-center flex-wrap'>
			<button
				onClick={onStartOrReset}
				className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
			>
				{hasGameStarted ? '🆕 New Game' : '▶️ Start'}
			</button>

			{isGameOver && (
				<button
					onClick={onReset}
					className='bg-gradient-to-r from-green-500 to-emerald-500 hover:from-emerald-500 hover:to-green-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
				>
					🎮 Play Again
				</button>
			)}

			{aiConfigured && (
				<>
					<button
						onClick={onToggleDebug}
						className={`glass-effect px-4 py-2 text-xs font-medium rounded-lg hover:scale-105 transition-all duration-300 border border-opacity-30 ${
							isDebugMode
								? 'bg-yellow-500 bg-opacity-20 text-yellow-300 border-yellow-400'
								: 'text-gray-300 border-gray-400 hover:bg-white hover:bg-opacity-10'
						}`}
					>
						🐛 {isDebugMode ? 'Debug ON' : 'Debug Mode'}
					</button>

					{canExport && (
						<button
							onClick={onExport}
							className='glass-effect px-4 py-2 text-xs font-medium rounded-lg hover:scale-105 transition-all duration-300 border border-opacity-30 text-blue-300 border-blue-400 hover:bg-blue-500 hover:bg-opacity-10'
							title='Export game with AI prompts and responses'
						>
							📥 Export Game
						</button>
					)}
				</>
			)}
		</div>
	);
};

export default GameControls;
