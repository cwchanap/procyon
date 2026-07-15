import React from 'react';
import { cn } from '../../lib/utils';

export type GamePlayLayoutProps = {
	title: string;
	subtitle?: string;
	boardColumn: React.ReactNode;
	sidePanel: React.ReactNode;
	banner?: React.ReactNode;
	className?: string;
	/** Breakpoint at which board + side panel sit side-by-side. Default `'lg'`. */
	sideBySideFrom?: 'lg' | 'xl';
};

/**
 * Shared play-shell layout for game islands: title, optional subtitle/banner,
 * then board column + side panel in a responsive row.
 *
 * Extracted from ChessGame's root structure; adoption on game components is
 * deferred to later tasks.
 */
export default function GamePlayLayout({
	title,
	subtitle,
	boardColumn,
	sidePanel,
	banner,
	className,
	sideBySideFrom = 'lg',
}: GamePlayLayoutProps) {
	const rowBp = sideBySideFrom === 'xl' ? 'xl:flex-row' : 'lg:flex-row';
	// Chess uses exact `lg:flex-row lg:items-start lg:justify-center`. For `xl`,
	// only the row breakpoint moves so the stack stays until that size.
	const alignClasses =
		sideBySideFrom === 'xl'
			? 'xl:items-start xl:justify-center'
			: 'lg:items-start lg:justify-center';

	return (
		<div className={cn('mx-auto w-full max-w-7xl px-4 py-6', className)}>
			<div className='mb-6 text-center'>
				<h1 className='mb-2 font-display text-4xl font-bold text-ivory'>
					{title}
				</h1>
				{subtitle != null && subtitle !== '' && (
					<p className='text-xl font-medium text-ivory-dim'>{subtitle}</p>
				)}
			</div>

			{banner}

			<div className={cn('flex flex-col gap-6', rowBp, alignClasses)}>
				{boardColumn}
				{sidePanel}
			</div>
		</div>
	);
}
