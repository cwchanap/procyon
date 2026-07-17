import React from 'react';

export type DebugOutcomeButtonsProps = {
	onWin: () => void;
	onLoss: () => void;
	onDraw: () => void;
};

/**
 * DEV-only debug buttons that force a game outcome (win/loss/draw).
 * Converged across all variants — toggled via Shift+D (see useGameDebugOutcomes).
 * Safe-by-default: returns null in production even if a caller forgets to gate.
 * Callers gate visibility (showDebugWinButton, game started, not over)
 * and pass the trigger handlers from useGameDebugOutcomes.
 */
export default function DebugOutcomeButtons({
	onWin,
	onLoss,
	onDraw,
}: DebugOutcomeButtonsProps) {
	if (!import.meta.env.DEV) return null;
	return (
		<div className='flex gap-2 justify-center text-xs'>
			<button
				type='button'
				onClick={onWin}
				className='px-3 py-1 bg-jungle hover:opacity-90 text-ink-900 rounded'
				title='Debug: Win'
			>
				🏆 Win
			</button>
			<button
				type='button'
				onClick={onLoss}
				className='px-3 py-1 bg-destructive hover:opacity-90 text-ivory rounded'
				title='Debug: Loss'
			>
				💀 Loss
			</button>
			<button
				type='button'
				onClick={onDraw}
				className='px-3 py-1 bg-ink-600 hover:bg-ink-700 text-ivory rounded'
				title='Debug: Draw'
			>
				🤝 Draw
			</button>
			<span className='text-ivory-dim self-center'>(Shift+D to toggle)</span>
		</div>
	);
}
