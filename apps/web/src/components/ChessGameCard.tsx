import React from 'react';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import ChessBoardPreview from './ChessBoardPreview';
import type { GameVariant } from '../lib/ai/game-variant-types';

interface ChessGameCardProps {
	title: string;
	description: string;
	variant?: GameVariant;
	onPlay: () => void;
}

const ChessGameCard: React.FC<ChessGameCardProps> = ({
	title,
	description,
	variant = 'chess',
	onPlay,
}) => {
	return (
		<Panel
			accent={variant}
			className='group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-panel'
		>
			<div className='flex aspect-video flex-shrink-0 items-center justify-center bg-ink-800'>
				<ChessBoardPreview variant={variant} />
			</div>
			<div className='flex flex-grow flex-col p-6'>
				<h3 className='mb-3 min-h-[2rem] font-display text-2xl font-semibold text-ivory'>
					{title}
				</h3>
				<p className='mb-6 min-h-[4.5rem] flex-grow leading-relaxed text-ivory-dim'>
					{description}
				</p>
				<Button onClick={onPlay} className='mt-auto w-full'>
					Play {title}
				</Button>
			</div>
		</Panel>
	);
};

export default ChessGameCard;
