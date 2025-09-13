import React, { useState, useCallback } from 'react';
import type { GameState, Position } from '../lib/chess/types';
import { createInitialGameState, selectSquare, makeMove, getGameStatus } from '../lib/chess/game';
import ChessBoard from './ChessBoard';

const ChessGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);

  const handleSquareClick = useCallback((position: Position) => {
    // If a piece is already selected, try to make a move
    if (gameState.selectedSquare) {
      const newGameState = makeMove(gameState, gameState.selectedSquare, position);
      if (newGameState) {
        // Update game status
        const updatedGameState = {
          ...newGameState,
          status: getGameStatus(newGameState)
        };
        setGameState(updatedGameState);
        return;
      }
    }

    // Otherwise, select the square
    const newGameState = selectSquare(gameState, position);
    setGameState(newGameState);
  }, [gameState]);

  const resetGame = useCallback(() => {
    setGameState(createInitialGameState());
  }, []);

  const getStatusMessage = (): string => {
    switch (gameState.status) {
      case 'check':
        return `${gameState.currentPlayer === 'white' ? 'White' : 'Black'} is in check!`;
      case 'checkmate':
        return `Checkmate! ${gameState.currentPlayer === 'white' ? 'Black' : 'White'} wins!`;
      case 'stalemate':
        return 'Stalemate! The game is a draw.';
      case 'draw':
        return 'The game is a draw.';
      default:
        return `${gameState.currentPlayer === 'white' ? 'White' : 'Black'} to move`;
    }
  };

  const isGameOver = gameState.status === 'checkmate' || gameState.status === 'stalemate' || gameState.status === 'draw';

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">Chess Game</h1>
        <p className="text-lg text-muted-foreground">{getStatusMessage()}</p>
      </div>

      <ChessBoard
        board={gameState.board}
        selectedSquare={gameState.selectedSquare}
        possibleMoves={gameState.possibleMoves}
        onSquareClick={handleSquareClick}
      />

      <div className="flex gap-4">
        <button
          onClick={resetGame}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          New Game
        </button>

        {isGameOver && (
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
          >
            Play Again
          </button>
        )}
      </div>

      <div className="text-sm text-muted-foreground text-center max-w-md">
        <p>Click on a piece to select it, then click on a highlighted square to move.</p>
        <p>Green dots show possible moves, red borders show captures.</p>
      </div>
    </div>
  );
};

export default ChessGame;