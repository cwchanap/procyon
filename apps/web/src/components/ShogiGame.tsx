import React, { useState, useCallback } from 'react';
import type { ShogiGameState, ShogiPosition, ShogiPiece } from '../lib/shogi';
import {
    createInitialGameState,
    selectSquare,
    selectHandPiece,
    clearSelection,
} from '../lib/shogi';
import ShogiBoard from './ShogiBoard';
import ShogiHand from './ShogiHand';

const ShogiGame: React.FC = () => {
    const [gameState, setGameState] = useState<ShogiGameState>(
        createInitialGameState
    );

    const handleSquareClick = useCallback(
        (position: ShogiPosition) => {
            const newGameState = selectSquare(gameState, position);
            setGameState(newGameState);
        },
        [gameState]
    );

    const handleHandPieceClick = useCallback(
        (piece: ShogiPiece) => {
            if (piece.color === gameState.currentPlayer) {
                const newGameState = selectHandPiece(gameState, piece);
                setGameState(newGameState);
            }
        },
        [gameState]
    );

    const resetGame = useCallback(() => {
        setGameState(createInitialGameState());
    }, []);

    const clearCurrentSelection = useCallback(() => {
        const newGameState = clearSelection(gameState);
        setGameState(newGameState);
    }, [gameState]);

    const getStatusMessage = (): string => {
        switch (gameState.status) {
            case 'check':
                return `${gameState.currentPlayer === 'sente' ? '先手' : '後手'} is in check!`;
            case 'checkmate':
                return `Checkmate! ${gameState.currentPlayer === 'sente' ? '後手' : '先手'} wins!`;
            case 'draw':
                return 'The game is a draw.';
            default:
                return `${gameState.currentPlayer === 'sente' ? '先手' : '後手'} to move`;
        }
    };

    const isGameOver =
        gameState.status === 'checkmate' || gameState.status === 'draw';

    return (
        <div className='flex flex-col items-center gap-6 p-6'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent mb-4'>
                    将棋 (Shogi)
                </h1>
                <p className='text-xl text-orange-100 font-medium'>
                    {getStatusMessage()}
                </p>
            </div>

            <div className='flex gap-8 items-start'>
                {/* Gote Hand */}
                <div className='flex flex-col gap-4'>
                    <ShogiHand
                        pieces={gameState.goteHand}
                        color='gote'
                        selectedPiece={gameState.selectedHandPiece}
                        onPieceClick={handleHandPieceClick}
                    />
                </div>

                {/* Board */}
                <ShogiBoard
                    board={gameState.board}
                    selectedSquare={gameState.selectedSquare}
                    possibleMoves={gameState.possibleMoves}
                    onSquareClick={handleSquareClick}
                />

                {/* Sente Hand */}
                <div className='flex flex-col gap-4'>
                    <ShogiHand
                        pieces={gameState.senteHand}
                        color='sente'
                        selectedPiece={gameState.selectedHandPiece}
                        onPieceClick={handleHandPieceClick}
                    />
                </div>
            </div>

            <div className='flex gap-4'>
                <button
                    onClick={clearCurrentSelection}
                    className='glass-effect px-4 py-2 text-white font-semibold rounded-lg hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                >
                    ❌ Clear Selection
                </button>

                <button
                    onClick={resetGame}
                    className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                >
                    🆕 New Game
                </button>

                {isGameOver && (
                    <button
                        onClick={resetGame}
                        className='bg-gradient-to-r from-orange-500 to-red-500 hover:from-red-500 hover:to-orange-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
                    >
                        🎮 Play Again
                    </button>
                )}
            </div>

            <div className='text-sm text-orange-200 text-center max-w-2xl space-y-2 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                <p className='flex items-center justify-center gap-2'>
                    <span>🖱️</span>
                    Click on a piece to select it, then click on a highlighted
                    square to move.
                </p>
                <p className='flex items-center justify-center gap-2'>
                    <span>✋</span>
                    Click on pieces in your hand to drop them on the board.
                </p>
                <p className='flex items-center justify-center gap-2'>
                    <span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
                    Possible moves
                    <span className='mx-2'>•</span>
                    <span className='w-3 h-3 border-2 border-red-500 rounded inline-block'></span>
                    Captures
                </p>
                <p className='text-xs text-orange-300'>
                    先手 (Sente) plays first and pieces point upward. 後手
                    (Gote) pieces are rotated and point downward.
                </p>
            </div>
        </div>
    );
};

export default ShogiGame;
