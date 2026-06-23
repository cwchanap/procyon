import React, { useEffect, useState } from 'react';
import ChessGameCard from './ChessGameCard';

const ChessGameSelector: React.FC = () => {
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	const chessGames = [
		{
			title: 'Standard Chess',
			description: 'Classic chess with game mode and interactive tutorials.',
			variant: 'chess' as const,
		},
		{
			title: 'Chinese Chess',
			description: 'Traditional Xiangqi with unique pieces and board layout.',
			variant: 'xiangqi' as const,
		},
		{
			title: 'Japanese Chess (Shogi)',
			description:
				'Traditional Japanese chess with unique piece movement and drops.',
			variant: 'shogi' as const,
		},
		{
			title: 'Jungle Chess (鬥獸棋)',
			description:
				'Animal-themed strategy game with unique terrain and piece hierarchy.',
			variant: 'jungle' as const,
		},
	];

	const handlePlayGame = (gameTitle: string) => {
		// Route to specific game pages based on game title
		if (gameTitle === 'Chinese Chess') {
			window.location.href = '/xiangqi';
		} else if (gameTitle === 'Japanese Chess (Shogi)') {
			window.location.href = '/shogi';
		} else if (gameTitle === 'Jungle Chess (鬥獸棋)') {
			window.location.href = '/jungle';
		} else {
			// For now, other games redirect to the standard chess page
			// In a real implementation, you'd pass the game type as a parameter
			window.location.href = '/chess';
		}
	};

	return (
		<div
			data-testid='game-cards'
			data-hydrated={isHydrated ? 'true' : 'false'}
			className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto'
		>
			{chessGames.map((game, index) => (
				<div
					key={index}
					className='animate-fade-in-up'
					style={{
						animationDelay: `${index * 0.1}s`,
						animationFillMode: 'both',
					}}
				>
					<ChessGameCard
						title={game.title}
						description={game.description}
						variant={game.variant}
						onPlay={() => handlePlayGame(game.title)}
					/>
				</div>
			))}
		</div>
	);
};

export default ChessGameSelector;
