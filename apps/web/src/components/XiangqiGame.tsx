import React, { useState, useCallback } from 'react';
import type { XiangqiGameState, XiangqiPosition } from '../lib/xiangqi/types';
import {
    createInitialXiangqiGameState,
    selectSquare,
    undoMove,
    resetGame,
} from '../lib/xiangqi/game';
import XiangqiBoard from './XiangqiBoard';

const XiangqiGame: React.FC = () => {
    const [gameState, setGameState] = useState<XiangqiGameState>(
        createInitialXiangqiGameState
    );

    const handleSquareClick = useCallback(
        (position: XiangqiPosition) => {
            const newGameState = selectSquare(gameState, position);
            setGameState(newGameState);
        },
        [gameState]
    );

    const handleResetGame = useCallback(() => {
        setGameState(resetGame());
    }, []);

    const handleUndoMove = useCallback(() => {
        const newGameState = undoMove(gameState);
        setGameState(newGameState);
    }, [gameState]);

    const getStatusMessage = (): string => {
        const playerName = gameState.currentPlayer === 'red' ? '红方' : '黑方';
        const playerNameEn =
            gameState.currentPlayer === 'red' ? 'Red' : 'Black';

        switch (gameState.status) {
            case 'check':
                return `${playerName} (${playerNameEn}) is in check! 将军！`;
            case 'checkmate': {
                const winner =
                    gameState.currentPlayer === 'red'
                        ? '黑方 (Black)'
                        : '红方 (Red)';
                return `Checkmate! ${winner} wins! 将死！`;
            }
            case 'stalemate':
                return 'Stalemate! The game is a draw. 和棋！';
            case 'draw':
                return 'The game is a draw. 和棋！';
            default:
                return `${playerName} (${playerNameEn}) to move`;
        }
    };

    const isGameOver =
        gameState.status === 'checkmate' ||
        gameState.status === 'stalemate' ||
        gameState.status === 'draw';

    const canUndo = gameState.moveHistory.length > 0;

    return (
        <div className='flex flex-col items-center gap-6 p-6'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-red-400 via-yellow-400 to-red-600 bg-clip-text text-transparent mb-4'>
                    Chinese Chess (象棋)
                </h1>
                <p className='text-xl text-purple-100 font-medium'>
                    {getStatusMessage()}
                </p>
            </div>

            <XiangqiBoard
                board={gameState.board}
                selectedSquare={gameState.selectedSquare}
                possibleMoves={gameState.possibleMoves}
                onSquareClick={handleSquareClick}
            />

            <div className='flex gap-4 flex-wrap justify-center'>
                <button
                    onClick={handleResetGame}
                    className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                >
                    🆕 New Game
                </button>

                <button
                    onClick={handleUndoMove}
                    disabled={!canUndo}
                    className={`px-6 py-3 text-white font-semibold rounded-xl transition-all duration-300 border border-white border-opacity-30 ${
                        canUndo
                            ? 'glass-effect hover:bg-white hover:bg-opacity-20 hover:scale-105'
                            : 'opacity-50 cursor-not-allowed bg-gray-600'
                    }`}
                >
                    ↶ Undo Move
                </button>

                {isGameOver && (
                    <button
                        onClick={handleResetGame}
                        className='bg-gradient-to-r from-red-500 to-yellow-500 hover:from-yellow-500 hover:to-red-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
                    >
                        🎮 Play Again
                    </button>
                )}
            </div>

            <div className='text-sm text-purple-200 text-center max-w-lg space-y-3 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                <p className='flex items-center justify-center gap-2'>
                    <span>🖱️</span>
                    Click on a piece to select it, then click on a highlighted
                    point to move.
                </p>
                <p className='flex items-center justify-center gap-2'>
                    <span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
                    Possible moves
                    <span className='mx-2'>•</span>
                    <span className='w-3 h-3 border-2 border-orange-500 rounded inline-block'></span>
                    Captures
                </p>
                <div className='text-xs space-y-1'>
                    <p>
                        <strong>Pieces:</strong> 帅/将=General, 仕/士=Advisor,
                        相/象=Elephant
                    </p>
                    <p>马=Horse, 车=Chariot, 炮=Cannon, 兵/卒=Soldier</p>
                    <p>
                        <strong>Goal:</strong> Checkmate the opponent's General
                        (King)
                    </p>
                </div>
            </div>

            {/* Move history */}
            {gameState.moveHistory.length > 0 && (
                <div className='text-sm text-purple-200 text-center max-w-md bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                    <h3 className='font-semibold mb-2'>
                        Move History ({gameState.moveHistory.length})
                    </h3>
                    <div className='max-h-32 overflow-y-auto'>
                        {gameState.moveHistory.slice(-10).map((move, index) => {
                            const moveNum =
                                gameState.moveHistory.length - 10 + index + 1;
                            const piece = move.piece;
                            const symbol =
                                piece.color === 'red'
                                    ? piece.type === 'king'
                                        ? '帅'
                                        : piece.type === 'advisor'
                                          ? '仕'
                                          : piece.type === 'elephant'
                                            ? '相'
                                            : piece.type === 'horse'
                                              ? '马'
                                              : piece.type === 'chariot'
                                                ? '车'
                                                : piece.type === 'cannon'
                                                  ? '炮'
                                                  : '兵'
                                    : piece.type === 'king'
                                      ? '将'
                                      : piece.type === 'advisor'
                                        ? '士'
                                        : piece.type === 'elephant'
                                          ? '象'
                                          : piece.type === 'horse'
                                            ? '马'
                                            : piece.type === 'chariot'
                                              ? '车'
                                              : piece.type === 'cannon'
                                                ? '炮'
                                                : '卒';

                            return (
                                <div
                                    key={index}
                                    className='flex justify-between text-xs'
                                >
                                    <span>{moveNum}.</span>
                                    <span>
                                        {symbol}{' '}
                                        {String.fromCharCode(
                                            97 + move.from.col
                                        )}
                                        {10 - move.from.row} →{' '}
                                        {String.fromCharCode(97 + move.to.col)}
                                        {10 - move.to.row}
                                        {move.capturedPiece ? ' ×' : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default XiangqiGame;
