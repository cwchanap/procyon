import React from 'react';
import { cn } from '../lib/utils';

const ruleColor: Record<string, string> = {
	chess: 'bg-chess',
	xiangqi: 'bg-xiangqi',
	shogi: 'bg-shogi',
	jungle: 'bg-jungle',
	brass: 'bg-brass',
};

export interface PageHeaderProps {
	eyebrow?: string;
	title: string;
	titleClassName?: string;
	accent?: 'chess' | 'xiangqi' | 'shogi' | 'jungle' | 'brass';
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
			<div className={cn('mt-5 h-px w-24', ruleColor[accent])} />
		</header>
	);
};

export default PageHeader;
