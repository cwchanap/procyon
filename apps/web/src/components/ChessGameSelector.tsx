import React, { useEffect, useState } from 'react';
import GameCard from './GameCard';
import ChessBoardPreview from './ChessBoardPreview';
import AeroplaneBoardPreview from './aeroplane/AeroplaneBoardPreview';
import { GAME_ROUTES } from '../lib/game-id';

const games = [
	{
		title: 'Standard Chess',
		description: 'Classic chess with game mode and interactive tutorials.',
		gameId: 'chess' as const,
		href: GAME_ROUTES.chess,
		preview: <ChessBoardPreview variant='chess' />,
	},
	{
		title: 'Chinese Chess',
		description: 'Traditional Xiangqi with unique pieces and board layout.',
		gameId: 'xiangqi' as const,
		href: GAME_ROUTES.xiangqi,
		preview: <ChessBoardPreview variant='xiangqi' />,
	},
	{
		title: 'Japanese Chess (Shogi)',
		description:
			'Traditional Japanese chess with unique piece movement and drops.',
		gameId: 'shogi' as const,
		href: GAME_ROUTES.shogi,
		preview: <ChessBoardPreview variant='shogi' />,
	},
	{
		title: 'Jungle Chess (鬥獸棋)',
		description:
			'Animal-themed strategy game with unique terrain and piece hierarchy.',
		gameId: 'jungle' as const,
		href: GAME_ROUTES.jungle,
		preview: <ChessBoardPreview variant='jungle' />,
	},
	{
		title: 'Aeroplane Chess',
		description: 'A race-around-the-board game of luck, timing, and takeoffs.',
		gameId: 'aeroplane' as const,
		href: GAME_ROUTES.aeroplane,
		preview: <AeroplaneBoardPreview />,
	},
];

const ChessGameSelector: React.FC = () => {
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	return (
		<div
			data-testid='game-cards'
			data-hydrated={isHydrated ? 'true' : 'false'}
			className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto'
		>
			{games.map((game, index) => (
				<div
					key={index}
					className='animate-fade-in-up'
					style={{
						animationDelay: `${index * 0.1}s`,
						animationFillMode: 'both',
					}}
				>
					<GameCard
						title={game.title}
						description={game.description}
						gameId={game.gameId}
						href={game.href}
						preview={game.preview}
					/>
				</div>
			))}
		</div>
	);
};

export default ChessGameSelector;
