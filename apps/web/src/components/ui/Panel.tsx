import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const panelVariants = cva('rounded-lg border border-line', {
	variants: {
		raised: {
			true: 'bg-ink-600 shadow-panel',
			false: 'bg-ink-700',
		},
		accent: {
			chess: 'border-l-2 border-l-chess',
			xiangqi: 'border-l-2 border-l-xiangqi',
			shogi: 'border-l-2 border-l-shogi',
			jungle: 'border-l-2 border-l-jungle',
			brass: 'border-l-2 border-l-brass',
		},
	},
	defaultVariants: {
		raised: false,
	},
});

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
	accent?: 'chess' | 'xiangqi' | 'shogi' | 'jungle' | 'brass';
	raised?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
	accent,
	raised = false,
	className,
	children,
	...props
}) => {
	return (
		<div
			className={cn(panelVariants({ raised, accent }), className)}
			{...props}
		>
			{children}
		</div>
	);
};

export default Panel;
