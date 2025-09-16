import React from 'react';
import ChessGameCard from './ChessGameCard';

const ChessGameSelector: React.FC = () => {
    const chessGames = [
        {
            title: 'Standard Chess',
            description:
                'Classic chess with game mode and interactive tutorials.',
        },
        {
            title: 'Chinese Chess',
            description:
                'Traditional Xiangqi with unique pieces and board layout.',
        },
        {
            title: 'Japanese Chess (Shogi)',
            description:
                'Traditional Japanese chess with unique piece movement and drops.',
        },
        {
            title: 'Chess960',
            description: 'Chess with randomized starting positions for pieces.',
        },
        {
            title: 'King of the Hill',
            description: 'Win by getting your king to the center of the board.',
        },
        {
            title: 'Three-check Chess',
            description: "Win by checking the opponent's king three times.",
        },
        {
            title: 'Atomic Chess',
            description:
                'Capturing pieces destroys surrounding pieces in an explosion.',
        },
        {
            title: 'Horde Chess',
            description: 'One player controls 36 pawns against normal pieces.',
        },
        {
            title: 'Giveaway Chess',
            description: 'Lose all your pieces to win the game.',
        },
    ];

    const handlePlayGame = (gameTitle: string) => {
        // Route to specific game pages based on game title
        if (gameTitle === 'Chinese Chess') {
            window.location.href = '/xiangqi';
        } else if (gameTitle === 'Japanese Chess (Shogi)') {
            window.location.href = '/shogi';
        } else {
            // For now, other games redirect to the standard chess page
            // In a real implementation, you'd pass the game type as a parameter
            window.location.href = '/chess';
        }
    };

    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto'>
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
                        onPlay={() => handlePlayGame(game.title)}
                    />
                </div>
            ))}
        </div>
    );
};

export default ChessGameSelector;
