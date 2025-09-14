import React, { useState, useCallback } from 'react';
import type { GameState, Position } from '../lib/chess/types';
import {
    createInitialGameState,
    selectSquare,
    makeMove,
    getGameStatus,
} from '../lib/chess/game';
import ChessBoard from './ChessBoard';

const ChessGame: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(
        createInitialGameState
    );

    const handleSquareClick = useCallback(
        (position: Position) => {
            // If a piece is already selected, try to make a move
            if (gameState.selectedSquare) {
                const newGameState = makeMove(
                    gameState,
                    gameState.selectedSquare,
                    position
                );
                if (newGameState) {
                    // Update game status
                    const updatedGameState = {
                        ...newGameState,
                        status: getGameStatus(newGameState),
                    };
                    setGameState(updatedGameState);
                    return;
                }
            }

            // Otherwise, select the square
            const newGameState = selectSquare(gameState, position);
            setGameState(newGameState);
        },
        [gameState]
    );

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

    const isGameOver =
        gameState.status === 'checkmate' ||
        gameState.status === 'stalemate' ||
        gameState.status === 'draw';

    return (
        <div className='flex flex-col items-center gap-6 p-6'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-4'>
                    Chess Game
                </h1>
                <p className='text-xl text-purple-100 font-medium'>
                    {getStatusMessage()}
                </p>
            </div>

            <ChessBoard
                board={gameState.board}
                selectedSquare={gameState.selectedSquare}
                possibleMoves={gameState.possibleMoves}
                onSquareClick={handleSquareClick}
            />

            <div className='flex gap-4'>
                <button
                    onClick={resetGame}
                    className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                >
                    🆕 New Game
                </button>

                {isGameOver && (
                    <button
                        onClick={resetGame}
                        className='bg-gradient-to-r from-green-500 to-emerald-500 hover:from-emerald-500 hover:to-green-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
                    >
                        🎮 Play Again
                    </button>
                )}
            </div>

            <div className='text-sm text-purple-200 text-center max-w-md space-y-2 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                <p className='flex items-center justify-center gap-2'>
                    <span>🖱️</span>
                    Click on a piece to select it, then click on a highlighted
                    square to move.
                </p>
                <p className='flex items-center justify-center gap-2'>
                    <span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
                    Possible moves
                    <span className='mx-2'>•</span>
                    <span className='w-3 h-3 border-2 border-red-500 rounded inline-block'></span>
                    Captures
                </p>
            </div>
        </div>
    );
};

export default ChessGame;
