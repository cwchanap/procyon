import React from 'react';
import ChessGameCard from './ChessGameCard';

const ChessGameSelector: React.FC = () => {
  const chessGames = [
    {
      title: 'Standard Chess',
      description: 'Classic chess with standard rules and time controls.',
    },
    {
      title: 'Blitz Chess',
      description: 'Fast-paced chess with 3-5 minutes per player.',
    },
    {
      title: 'Rapid Chess',
      description: 'Quick chess games with 10-15 minutes per player.',
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
      description: 'Win by checking the opponent\'s king three times.',
    },
    {
      title: 'Atomic Chess',
      description: 'Capturing pieces destroys surrounding pieces in an explosion.',
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
    // For now, all games redirect to the standard chess page
    // In a real implementation, you'd pass the game type as a parameter
    window.location.href = '/chess';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {chessGames.map((game, index) => (
        <ChessGameCard
          key={index}
          title={game.title}
          description={game.description}
          onPlay={() => handlePlayGame(game.title)}
        />
      ))}
    </div>
  );
};

export default ChessGameSelector;