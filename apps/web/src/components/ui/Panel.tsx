import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import type { Accent } from '../../lib/game-id';

const PANEL_ACCENT_CLASSES = {
	chess: 'border-l-2 border-l-chess',
	xiangqi: 'border-l-2 border-l-xiangqi',
	shogi: 'border-l-2 border-l-shogi',
	jungle: 'border-l-2 border-l-jungle',
	aeroplane: 'border-l-2 border-l-aeroplane',
	brass: 'border-l-2 border-l-brass',
} satisfies Record<Accent, string>;

const panelVariants = cva('rounded-lg border border-line', {
	variants: {
		raised: {
			true: 'bg-ink-600 shadow-panel',
			false: 'bg-ink-700',
		},
		accent: PANEL_ACCENT_CLASSES,
	},
	defaultVariants: {
		raised: false,
	},
});

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
	accent?: Accent;
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
