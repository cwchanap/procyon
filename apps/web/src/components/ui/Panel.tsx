import React from 'react';
import { cn } from '../../lib/utils';

const accentBorder: Record<string, string> = {
	chess: 'border-l-2 border-l-chess',
	xiangqi: 'border-l-2 border-l-xiangqi',
	shogi: 'border-l-2 border-l-shogi',
	jungle: 'border-l-2 border-l-jungle',
	brass: 'border-l-2 border-l-brass',
};

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
			className={cn(
				'rounded-lg border border-line',
				raised ? 'bg-ink-600 shadow-panel' : 'bg-ink-700',
				accent && accentBorder[accent],
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
};

export default Panel;
