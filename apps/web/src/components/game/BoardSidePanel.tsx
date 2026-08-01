import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export type Mode = 'tutorial' | 'ai';

interface BoardSidePanelProps {
	gameMode: Mode;
	onModeChange: (m: Mode) => void;
	aiModeLabel?: string;
	children?: React.ReactNode;
}

const modeToggleVariants = cva(
	'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
	{
		variants: {
			active: {
				true: 'border-brass bg-brass text-ink-900',
				false: 'border-line text-ivory-dim hover:bg-ink-600 hover:text-ivory',
			},
		},
		defaultVariants: {
			active: false,
		},
	}
);

type ModeToggleProps = VariantProps<typeof modeToggleVariants> &
	React.ButtonHTMLAttributes<HTMLButtonElement>;

const ModeToggle: React.FC<ModeToggleProps> = ({
	active,
	className,
	...props
}) => (
	<button
		type='button'
		className={cn(modeToggleVariants({ active, className }))}
		{...props}
	/>
);

const BoardSidePanel: React.FC<BoardSidePanelProps> = ({
	gameMode,
	onModeChange,
	aiModeLabel = 'Play vs AI',
	children,
}) => {
	return (
		<aside
			data-testid='game-side-panel'
			className='flex w-full flex-col gap-4 lg:w-72'
		>
			<div className='flex gap-2' role='group' aria-label='Game mode'>
				<ModeToggle
					onClick={() => onModeChange('tutorial')}
					aria-pressed={gameMode === 'tutorial'}
					active={gameMode === 'tutorial'}
				>
					Tutorial
				</ModeToggle>
				<ModeToggle
					onClick={() => onModeChange('ai')}
					aria-pressed={gameMode === 'ai'}
					active={gameMode === 'ai'}
				>
					{aiModeLabel}
				</ModeToggle>
			</div>
			{children}
		</aside>
	);
};

export default BoardSidePanel;
