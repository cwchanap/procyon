import React from 'react';
import { buttonVariants } from './ui/Button';
import { Panel } from './ui/Panel';
import type { GameId } from '../lib/game-id';

export interface GameCardProps {
	title: string;
	description: string;
	gameId: GameId;
	href: string;
	preview: React.ReactNode;
}

const GameCard: React.FC<GameCardProps> = ({
	title,
	description,
	gameId,
	href,
	preview,
}) => {
	return (
		<Panel
			accent={gameId}
			className='group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-panel'
		>
			<div className='flex aspect-video flex-shrink-0 items-center justify-center bg-ink-800'>
				{preview}
			</div>
			<div className='flex flex-grow flex-col p-6'>
				<h3 className='mb-3 min-h-[2rem] font-display text-2xl font-semibold text-ivory'>
					{title}
				</h3>
				<p className='mb-6 min-h-[4.5rem] flex-grow leading-relaxed text-ivory-dim'>
					{description}
				</p>
				<a
					href={href}
					className={buttonVariants({ className: 'mt-auto w-full' })}
				>
					Play {title}
				</a>
			</div>
		</Panel>
	);
};

export default GameCard;
