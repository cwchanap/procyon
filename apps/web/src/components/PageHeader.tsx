import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import type { Accent } from '../lib/ai/game-variant-types';

const accentBar = cva('mt-5 h-px w-24', {
	variants: {
		accent: {
			chess: 'bg-chess',
			xiangqi: 'bg-xiangqi',
			shogi: 'bg-shogi',
			jungle: 'bg-jungle',
			brass: 'bg-brass',
		},
	},
	defaultVariants: {
		accent: 'brass',
	},
});

export interface PageHeaderProps {
	eyebrow?: string;
	title: string;
	titleClassName?: string;
	accent?: Accent;
	className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
	eyebrow,
	title,
	titleClassName,
	accent = 'brass',
	className,
}) => {
	return (
		<header className={cn('mb-10', className)}>
			{eyebrow && (
				<p className='mb-3 text-xs font-mono uppercase tracking-[0.25em] text-ivory-dim'>
					{eyebrow}
				</p>
			)}
			<h1
				className={cn(
					'font-display text-4xl sm:text-5xl font-semibold text-ivory',
					titleClassName
				)}
			>
				{title}
			</h1>
			<div className={accentBar({ accent })} />
		</header>
	);
};

export default PageHeader;
