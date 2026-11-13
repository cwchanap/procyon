import React from 'react';

interface GameControlsProps {
	hasGameStarted: boolean;
	isGameOver: boolean;
	aiConfigured?: boolean;
	/** Disable the Start button while the AI config is still loading so the
	 * game can't start with stale/default config (no API key). */
	startDisabled?: boolean;
	startLabel?: React.ReactNode;
	/** Visible explanation shown near Start while a resolved setup blocks
	 * starting (the button itself stays disabled — never bypassed). */
	startBlockedReason?: string | null;
	showLlmTools?: boolean;
	isDebugMode: boolean;
	canExport: boolean;
	onStartOrReset: () => void;
	onReset: () => void;
	onToggleDebug: () => void;
	/** Only required when canExport is true (the export button calls it). */
	onExport?: () => void;
}

const GameControls: React.FC<GameControlsProps> = ({
	hasGameStarted,
	isGameOver,
	aiConfigured,
	startDisabled = false,
	startLabel,
	startBlockedReason,
	showLlmTools,
	isDebugMode,
	canExport,
	onStartOrReset,
	onReset,
	onToggleDebug,
	onExport,
}) => {
	const showTools = showLlmTools ?? aiConfigured ?? false;
	const buttonContent =
		startLabel ??
		(startDisabled
			? '⏳ Loading AI config…'
			: hasGameStarted
				? '🆕 New Game'
				: '▶️ Start');

	return (
		<div className='flex flex-col items-center'>
			<div className='flex gap-4 justify-center flex-wrap'>
				<button
					onClick={onStartOrReset}
					disabled={startDisabled}
					className='bg-ink-700 border border-line px-6 py-3 text-ivory font-semibold rounded-lg hover:bg-ink-600 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed'
				>
					{buttonContent}
				</button>

				{isGameOver && (
					<button
						onClick={onReset}
						className='bg-brass text-ink-900 px-6 py-3 font-semibold rounded-lg hover:bg-brass-bright transition-colors duration-150 shadow-lg'
					>
						🎮 Play Again
					</button>
				)}

				{showTools && (
					<>
						<button
							onClick={onToggleDebug}
							className={`bg-ink-700 border border-line px-4 py-2 text-xs font-medium rounded-lg transition-colors duration-150 ${
								isDebugMode
									? 'bg-brass/20 text-brass border-brass'
									: 'text-ivory-dim hover:bg-ink-600'
							}`}
						>
							🐛 {isDebugMode ? 'Debug ON' : 'Debug Mode'}
						</button>

						{canExport && onExport && (
							<button
								onClick={onExport}
								className='bg-ink-700 border border-line px-4 py-2 text-xs font-medium rounded-lg transition-colors duration-150 text-ivory-dim hover:bg-ink-600'
								title='Export game with AI prompts and responses'
							>
								📥 Export Game
							</button>
						)}
					</>
				)}
			</div>

			{/* Always-mounted live region below the button row so screen readers
			    announce block reasons when inserted without shifting buttons. */}
			<div role='status'>
				{startBlockedReason && (
					<p className='mt-2 text-center text-sm text-ivory-dim'>
						{startBlockedReason}
					</p>
				)}
			</div>
		</div>
	);
};

export default GameControls;
