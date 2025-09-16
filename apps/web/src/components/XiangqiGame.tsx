import React, { useState, useCallback } from 'react';
import type {
    XiangqiGameState,
    XiangqiPosition,
    XiangqiPiece,
} from '../lib/xiangqi/types';
import {
    createInitialXiangqiGameState,
    selectSquare,
    undoMove,
    resetGame,
} from '../lib/xiangqi/game';
import { getPossibleMoves } from '../lib/xiangqi/moves';
import { createInitialXiangqiBoard, getPieceAt } from '../lib/xiangqi/board';
import XiangqiBoard from './XiangqiBoard';

interface XiangqiDemo {
    id: string;
    title: string;
    description: string;
    board: (XiangqiPiece | null)[][];
    focusSquare?: XiangqiPosition;
    highlightSquares?: XiangqiPosition[];
    explanation: string;
}

type XiangqiGameMode = 'play' | 'tutorial';

const XiangqiGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<XiangqiGameMode>('play');
    const [gameState, setGameState] = useState<XiangqiGameState>(
        createInitialXiangqiGameState
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');

    const createCustomXiangqiBoard = useCallback(
        (setup: string): (XiangqiPiece | null)[][] => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            switch (setup) {
                case 'horse-moves':
                    board[5][4] = { type: 'horse', color: 'red' };
                    board[3][2] = { type: 'soldier', color: 'black' };
                    board[7][6] = { type: 'soldier', color: 'black' };
                    break;
                case 'cannon-demo':
                    board[9][4] = { type: 'king', color: 'red' };
                    board[7][4] = { type: 'cannon', color: 'red' };
                    board[5][4] = { type: 'soldier', color: 'black' };
                    board[3][4] = { type: 'king', color: 'black' };
                    break;
                case 'palace-demo':
                    board[9][4] = { type: 'king', color: 'red' };
                    board[9][3] = { type: 'advisor', color: 'red' };
                    board[9][5] = { type: 'advisor', color: 'red' };
                    board[0][4] = { type: 'king', color: 'black' };
                    break;
                case 'river-crossing':
                    board[6][0] = { type: 'soldier', color: 'red' };
                    board[3][0] = { type: 'soldier', color: 'red' };
                    board[9][4] = { type: 'king', color: 'red' };
                    board[0][4] = { type: 'king', color: 'black' };
                    break;
                default:
                    return createInitialXiangqiBoard();
            }

            return board;
        },
        []
    );

    const xiangqiDemos: XiangqiDemo[] = [
        {
            id: 'basic-movement',
            title: 'Basic Piece Movement',
            description:
                'Learn how different Xiangqi pieces move across the board',
            board: createInitialXiangqiBoard(),
            explanation:
                'Click on any piece to see its possible moves. Each piece has unique movement patterns specific to Xiangqi.',
        },
        {
            id: 'horse-moves',
            title: 'Horse Movement Pattern',
            description:
                'The horse moves in an L-shape but can be blocked by adjacent pieces',
            board: createCustomXiangqiBoard('horse-moves'),
            focusSquare: { row: 5, col: 4 },
            highlightSquares: [
                { row: 3, col: 3 },
                { row: 3, col: 5 },
                { row: 4, col: 2 },
                { row: 4, col: 6 },
                { row: 6, col: 2 },
                { row: 6, col: 6 },
                { row: 7, col: 3 },
                { row: 7, col: 5 },
            ],
            explanation:
                'The horse moves like in chess but can be blocked by pieces on adjacent points. This is called "hobbling the horse".',
        },
        {
            id: 'cannon-demo',
            title: 'Cannon Special Attack',
            description:
                'Cannons jump over pieces to capture, but move freely when not capturing',
            board: createCustomXiangqiBoard('cannon-demo'),
            focusSquare: { row: 7, col: 4 },
            explanation:
                'The cannon needs exactly one piece to jump over when capturing. It can capture the black king by jumping over the soldier.',
        },
        {
            id: 'palace-demo',
            title: 'Palace and Advisor Rules',
            description:
                'Kings and advisors are confined to the palace (nine-point fortress)',
            board: createCustomXiangqiBoard('palace-demo'),
            focusSquare: { row: 9, col: 4 },
            highlightSquares: [
                { row: 9, col: 3 },
                { row: 9, col: 5 },
                { row: 8, col: 3 },
                { row: 8, col: 4 },
                { row: 8, col: 5 },
                { row: 7, col: 3 },
                { row: 7, col: 4 },
                { row: 7, col: 5 },
            ],
            explanation:
                'The king and advisors cannot leave the palace. Advisors move diagonally one point within the palace.',
        },
        {
            id: 'river-crossing',
            title: 'River and Soldier Promotion',
            description:
                'Soldiers gain lateral movement after crossing the river',
            board: createCustomXiangqiBoard('river-crossing'),
            focusSquare: { row: 3, col: 0 },
            explanation:
                'Once a soldier crosses the river (between rows 4-5), it can move sideways as well as forward. This soldier has crossed the river.',
        },
    ];

    const getCurrentDemo = useCallback((): XiangqiDemo => {
        return (
            xiangqiDemos.find(demo => demo.id === currentDemo) ||
            xiangqiDemos[0]
        );
    }, [currentDemo, xiangqiDemos]);

    const handleSquareClick = useCallback(
        (position: XiangqiPosition) => {
            if (gameMode === 'tutorial') {
                const demo = getCurrentDemo();
                const piece = getPieceAt(demo.board, position);

                if (piece) {
                    const possibleMoves = getPossibleMoves(
                        demo.board,
                        position
                    );
                    setGameState(prev => ({
                        ...prev,
                        board: demo.board,
                        selectedSquare: position,
                        possibleMoves,
                    }));
                } else {
                    setGameState(prev => ({
                        ...prev,
                        board: demo.board,
                        selectedSquare: null,
                        possibleMoves: [],
                    }));
                }
            } else {
                const newGameState = selectSquare(gameState, position);
                setGameState(newGameState);
            }
        },
        [gameMode, gameState, getCurrentDemo]
    );

    const handleResetGame = useCallback(() => {
        setGameState(resetGame());
    }, []);

    const toggleMode = useCallback(() => {
        const newMode = gameMode === 'play' ? 'tutorial' : 'play';
        setGameMode(newMode);

        if (newMode === 'tutorial') {
            const demo = getCurrentDemo();
            setGameState({
                board: demo.board,
                currentPlayer: 'red',
                status: 'playing',
                moveHistory: [],
                selectedSquare: null,
                possibleMoves: [],
            });
        } else {
            setGameState(resetGame());
        }
    }, [gameMode, getCurrentDemo]);

    const handleDemoChange = useCallback(
        (demoId: string) => {
            setCurrentDemo(demoId);
            const demo = xiangqiDemos.find(d => d.id === demoId);
            if (demo) {
                setGameState(prev => ({
                    ...prev,
                    board: demo.board,
                    selectedSquare: null,
                    possibleMoves: [],
                }));
            }
        },
        [xiangqiDemos]
    );

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

    const currentBoard =
        gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    return (
        <div className='flex flex-col items-center gap-6 p-6 max-w-7xl mx-auto'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-red-400 via-yellow-400 to-red-600 bg-clip-text text-transparent mb-4'>
                    {gameMode === 'play'
                        ? 'Chinese Chess (象棋)'
                        : 'Xiangqi Logic & Tutorials'}
                </h1>
                <p className='text-xl text-purple-100 font-medium'>
                    {gameMode === 'play'
                        ? getStatusMessage()
                        : getCurrentDemo().description}
                </p>
            </div>

            {/* Mode Toggle */}
            <div className='flex gap-4'>
                <button
                    onClick={toggleMode}
                    className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                        gameMode === 'play'
                            ? 'bg-gradient-to-r from-red-500 to-yellow-500 text-white shadow-lg'
                            : 'text-purple-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    🎮 Play Mode
                </button>
                <button
                    onClick={toggleMode}
                    className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                        gameMode === 'tutorial'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                            : 'text-purple-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    📚 Tutorial Mode
                </button>
            </div>

            {/* Tutorial Demo Selector */}
            {gameMode === 'tutorial' && (
                <div className='flex flex-wrap gap-3 justify-center max-w-4xl'>
                    {xiangqiDemos.map(demoItem => (
                        <button
                            key={demoItem.id}
                            onClick={() => handleDemoChange(demoItem.id)}
                            className={`glass-effect px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                                currentDemo === demoItem.id
                                    ? 'bg-gradient-to-r from-red-500 to-yellow-500 text-white shadow-lg'
                                    : 'text-purple-100 hover:bg-white hover:bg-opacity-20'
                            }`}
                        >
                            {demoItem.title}
                        </button>
                    ))}
                </div>
            )}

            {/* Chess Board - Centered */}
            <div className='flex justify-center'>
                <XiangqiBoard
                    board={currentBoard}
                    selectedSquare={gameState.selectedSquare}
                    possibleMoves={gameState.possibleMoves}
                    onSquareClick={handleSquareClick}
                    highlightSquares={currentHighlightSquares}
                />
            </div>

            {/* Content Panel - Below Board */}
            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'play' ? (
                    // Play Mode Controls
                    <>
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

                        <div className='text-sm text-purple-200 text-center max-w-lg mx-auto space-y-3 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                            <p className='flex items-center justify-center gap-2'>
                                <span>🖱️</span>
                                Click on a piece to select it, then click on a
                                highlighted point to move.
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
                                    <strong>Pieces:</strong> 帅/将=General,
                                    仕/士=Advisor, 相/象=Elephant
                                </p>
                                <p>
                                    马=Horse, 车=Chariot, 炮=Cannon,
                                    兵/卒=Soldier
                                </p>
                                <p>
                                    <strong>Goal:</strong> Checkmate the
                                    opponent's General (King)
                                </p>
                            </div>
                        </div>

                        {/* Move history */}
                        {gameState.moveHistory.length > 0 && (
                            <div className='text-sm text-purple-200 text-center max-w-md mx-auto bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                                <h3 className='font-semibold mb-2'>
                                    Move History ({gameState.moveHistory.length}
                                    )
                                </h3>
                                <div className='max-h-32 overflow-y-auto'>
                                    {gameState.moveHistory
                                        .slice(-10)
                                        .map((move, index) => {
                                            const moveNum =
                                                gameState.moveHistory.length -
                                                10 +
                                                index +
                                                1;
                                            const piece = move.piece;
                                            const symbol =
                                                piece.color === 'red'
                                                    ? piece.type === 'king'
                                                        ? '帅'
                                                        : piece.type ===
                                                            'advisor'
                                                          ? '仕'
                                                          : piece.type ===
                                                              'elephant'
                                                            ? '相'
                                                            : piece.type ===
                                                                'horse'
                                                              ? '马'
                                                              : piece.type ===
                                                                  'chariot'
                                                                ? '车'
                                                                : piece.type ===
                                                                    'cannon'
                                                                  ? '炮'
                                                                  : '兵'
                                                    : piece.type === 'king'
                                                      ? '将'
                                                      : piece.type === 'advisor'
                                                        ? '士'
                                                        : piece.type ===
                                                            'elephant'
                                                          ? '象'
                                                          : piece.type ===
                                                              'horse'
                                                            ? '马'
                                                            : piece.type ===
                                                                'chariot'
                                                              ? '车'
                                                              : piece.type ===
                                                                  'cannon'
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
                                                        {String.fromCharCode(
                                                            97 + move.to.col
                                                        )}
                                                        {10 - move.to.row}
                                                        {move.capturedPiece
                                                            ? ' ×'
                                                            : ''}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    // Tutorial Mode Content
                    <>
                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h2 className='text-2xl font-bold text-white mb-3'>
                                {getCurrentDemo().title}
                            </h2>
                            <div className='bg-black bg-opacity-30 p-4 rounded-xl border border-yellow-500 border-opacity-30'>
                                <p className='text-yellow-200 leading-relaxed'>
                                    {getCurrentDemo().explanation}
                                </p>
                            </div>
                        </div>

                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                                <span>🎯</span>
                                How to Use This Demo
                            </h3>
                            <div className='space-y-3 text-yellow-200'>
                                <p className='flex items-center gap-3'>
                                    <span className='text-green-400'>•</span>
                                    Click on any piece to see its possible moves
                                </p>
                                <p className='flex items-center gap-3'>
                                    <span className='text-blue-400'>•</span>
                                    Green highlights show legal moves
                                </p>
                                <p className='flex items-center gap-3'>
                                    <span className='text-purple-400'>•</span>
                                    Orange outlines indicate capture moves
                                </p>
                                <p className='flex items-center gap-3'>
                                    <span className='text-yellow-400'>•</span>
                                    Yellow rings show tutorial highlights
                                </p>
                            </div>
                        </div>

                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                                <span>💡</span>
                                Xiangqi Wisdom
                            </h3>
                            <div className='space-y-2 text-yellow-200 text-sm'>
                                <p>
                                    "Control the central files - they are key to
                                    launching attacks across the river."
                                </p>
                                <p>
                                    "Protect your palace at all costs - an
                                    exposed general is vulnerable to mating
                                    attacks."
                                </p>
                                <p>
                                    "Cannons are powerful when they have
                                    platforms - coordinate with other pieces."
                                </p>
                                <p>
                                    "Advance soldiers across the river to gain
                                    lateral movement and attack power."
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default XiangqiGame;
