import React from 'react';
import { cn } from '../../lib/utils';

type Mode = 'tutorial' | 'ai';

interface BoardSidePanelProps {
	gameMode: Mode;
	onModeChange: (m: Mode) => void;
	children?: React.ReactNode;
}

const base =
	'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors';

const BoardSidePanel: React.FC<BoardSidePanelProps> = ({
	gameMode,
	onModeChange,
	children,
}) => {
	return (
		<aside className='flex w-full flex-col gap-4 lg:w-72'>
			<div className='flex gap-2' role='group' aria-label='Game mode'>
				<button
					type='button'
					onClick={() => onModeChange('tutorial')}
					aria-pressed={gameMode === 'tutorial'}
					className={cn(
						base,
						gameMode === 'tutorial'
							? 'border-brass bg-brass text-ink-900'
							: 'border-line text-ivory-dim hover:bg-ink-600 hover:text-ivory'
					)}
				>
					Tutorial
				</button>
				<button
					type='button'
					onClick={() => onModeChange('ai')}
					aria-label='Play vs AI'
					aria-pressed={gameMode === 'ai'}
					className={cn(
						base,
						gameMode === 'ai'
							? 'border-brass bg-brass text-ink-900'
							: 'border-line text-ivory-dim hover:bg-ink-600 hover:text-ivory'
					)}
				>
					Play vs AI
				</button>
			</div>
			{children}
		</aside>
	);
};

export default BoardSidePanel;
