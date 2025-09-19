import React, { useState, useCallback, useEffect } from 'react';
import type { GameState, Position, ChessPiece } from '../lib/chess/types';
import {
    createInitialGameState,
    selectSquare,
    makeMove,
    getGameStatus,
    makeAIMove,
    setAIThinking,
    isAITurn,
} from '../lib/chess/game';
import { getPossibleMoves } from '../lib/chess/moves';
import { createInitialBoard, getPieceAt } from '../lib/chess/board';
import ChessBoard from './ChessBoard';
import AIConfigPanel from './AIConfigPanel';
import type { AIConfig } from '../lib/ai/types';
import { AIService } from '../lib/ai/service';
import { loadAIConfig, saveAIConfig } from '../lib/ai/storage';

interface LogicDemo {
    id: string;
    title: string;
    description: string;
    board: (ChessPiece | null)[][];
    focusSquare?: Position;
    highlightSquares?: Position[];
    explanation: string;
}

type UIMode = 'play' | 'tutorial';

const ChessGame: React.FC = () => {
    const [uiMode, setUIMode] = useState<UIMode>('play');
    const [gameState, setGameState] = useState<GameState>(() =>
        createInitialGameState()
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
    const [aiConfig, setAIConfig] = useState<AIConfig>(() => loadAIConfig());
    const [aiService] = useState<AIService>(
        () => new AIService(loadAIConfig())
    );

    const createCustomBoard = useCallback(
        (setup: string): (ChessPiece | null)[][] => {
            const board: (ChessPiece | null)[][] = Array(8)
                .fill(null)
                .map(() => Array(8).fill(null));

            switch (setup) {
                case 'knight-moves':
                    board[4][4] = {
                        type: 'knight',
                        color: 'white',
                        hasMoved: false,
                    };
                    board[2][1] = {
                        type: 'pawn',
                        color: 'black',
                        hasMoved: false,
                    };
                    board[6][3] = {
                        type: 'pawn',
                        color: 'black',
                        hasMoved: false,
                    };
                    break;
                case 'check-demo':
                    board[7][4] = {
                        type: 'king',
                        color: 'white',
                        hasMoved: false,
                    };
                    board[0][0] = {
                        type: 'rook',
                        color: 'black',
                        hasMoved: false,
                    };
                    board[7][0] = {
                        type: 'rook',
                        color: 'white',
                        hasMoved: false,
                    };
                    break;
                case 'castling':
                    board[7][4] = {
                        type: 'king',
                        color: 'white',
                        hasMoved: false,
                    };
                    board[7][7] = {
                        type: 'rook',
                        color: 'white',
                        hasMoved: false,
                    };
                    board[7][0] = {
                        type: 'rook',
                        color: 'white',
                        hasMoved: false,
                    };
                    break;
                case 'pawn-promotion':
                    board[1][3] = {
                        type: 'pawn',
                        color: 'white',
                        hasMoved: true,
                    };
                    board[0][4] = {
                        type: 'king',
                        color: 'black',
                        hasMoved: false,
                    };
                    board[7][4] = {
                        type: 'king',
                        color: 'white',
                        hasMoved: false,
                    };
                    break;
                default:
                    return createInitialBoard();
            }

            return board;
        },
        []
    );

    const logicDemos: LogicDemo[] = [
        {
            id: 'basic-movement',
            title: 'Basic Piece Movement',
            description:
                'Learn how different chess pieces move across the board',
            board: createInitialBoard(),
            explanation:
                'Click on any piece to see its possible moves. Each piece has unique movement patterns that define the strategy of chess.',
        },
        {
            id: 'knight-moves',
            title: 'Knight Movement Pattern',
            description:
                'The knight moves in an L-shape: 2 squares in one direction, then 1 square perpendicular',
            board: createCustomBoard('knight-moves'),
            focusSquare: { row: 4, col: 4 },
            highlightSquares: [
                { row: 2, col: 3 },
                { row: 2, col: 5 },
                { row: 3, col: 2 },
                { row: 3, col: 6 },
                { row: 5, col: 2 },
                { row: 5, col: 6 },
                { row: 6, col: 3 },
                { row: 6, col: 5 },
            ],
            explanation:
                'The knight is unique - it can jump over other pieces and moves in an L-shape. Notice how it can capture the pawns but also move to empty squares.',
        },
        {
            id: 'check-demo',
            title: 'Check and King Safety',
            description:
                'Understanding when the king is in check and must be protected',
            board: createCustomBoard('check-demo'),
            focusSquare: { row: 7, col: 4 },
            explanation:
                'The white king is in check from the black rook. The king must move to safety, block the attack, or capture the attacking piece.',
        },
        {
            id: 'castling',
            title: 'Castling Rules',
            description:
                'A special move involving the king and rook for king safety',
            board: createCustomBoard('castling'),
            focusSquare: { row: 7, col: 4 },
            explanation:
                'Castling allows the king to move 2 squares toward a rook, and the rook moves to the square the king crossed. Both pieces must not have moved, and there must be no pieces between them.',
        },
        {
            id: 'pawn-promotion',
            title: 'Pawn Promotion',
            description:
                'When a pawn reaches the opposite end, it promotes to any piece',
            board: createCustomBoard('pawn-promotion'),
            focusSquare: { row: 1, col: 3 },
            explanation:
                'This white pawn is one move away from promoting. When it reaches the 8th rank, it can become a queen, rook, bishop, or knight.',
        },
    ];

    const getCurrentDemo = useCallback((): LogicDemo => {
        return (
            logicDemos.find(demo => demo.id === currentDemo) || logicDemos[0]
        );
    }, [currentDemo, logicDemos]);

    // AI Configuration handlers
    const handleAIConfigChange = useCallback(
        (newConfig: AIConfig) => {
            setAIConfig(newConfig);
            saveAIConfig(newConfig);
            aiService.updateConfig(newConfig);
        },
        [aiService]
    );

    // AI Move handling
    const makeAIMoveAsync = useCallback(async () => {
        if (!isAITurn(gameState) || gameState.isAiThinking) {
            return;
        }

        setGameState(prev => setAIThinking(prev, true));

        try {
            const aiResponse = await aiService.makeMove(gameState);

            if (aiResponse && aiResponse.move) {
                const newGameState = makeAIMove(
                    gameState,
                    aiResponse.move.from,
                    aiResponse.move.to
                );

                if (newGameState) {
                    const updatedGameState = {
                        ...newGameState,
                        status: getGameStatus(newGameState),
                        isAiThinking: false,
                    };
                    setGameState(updatedGameState);
                }
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('AI move failed:', error);
        } finally {
            setGameState(prev => setAIThinking(prev, false));
        }
    }, [gameState, aiService]);

    // Effect to trigger AI moves
    useEffect(() => {
        if (isAITurn(gameState) && !gameState.isAiThinking) {
            const timer = setTimeout(() => {
                makeAIMoveAsync();
            }, 1000); // 1 second delay for better UX

            return () => clearTimeout(timer);
        }
    }, [gameState, makeAIMoveAsync]);

    // Game mode handlers
    const startHumanVsHuman = useCallback(() => {
        setGameState(createInitialGameState('human-vs-human'));
    }, []);

    const startHumanVsAI = useCallback((aiColor: 'white' | 'black') => {
        setGameState(createInitialGameState('human-vs-ai', aiColor));
    }, []);

    const handleSquareClick = useCallback(
        (position: Position) => {
            if (uiMode === 'tutorial') {
                const demo = getCurrentDemo();
                const piece = getPieceAt(demo.board, position);

                if (piece) {
                    const possibleMoves = getPossibleMoves(
                        demo.board,
                        piece,
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
                // Regular game mode
                // Prevent moves during AI turn or when AI is thinking
                if (isAITurn(gameState) || gameState.isAiThinking) {
                    return;
                }

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
            }
        },
        [uiMode, gameState, getCurrentDemo]
    );

    const resetGame = useCallback(() => {
        setGameState(createInitialGameState());
    }, []);

    const toggleMode = useCallback(() => {
        const newMode = uiMode === 'play' ? 'tutorial' : 'play';
        setUIMode(newMode);

        if (newMode === 'tutorial') {
            const demo = getCurrentDemo();
            setGameState({
                board: demo.board,
                currentPlayer: 'white',
                status: 'playing',
                moveHistory: [],
                selectedSquare: null,
                possibleMoves: [],
            });
        } else {
            setGameState(createInitialGameState());
        }
    }, [uiMode, getCurrentDemo]);

    const handleDemoChange = useCallback(
        (demoId: string) => {
            setCurrentDemo(demoId);
            const demo = logicDemos.find(d => d.id === demoId);
            if (demo) {
                setGameState(prev => ({
                    ...prev,
                    board: demo.board,
                    selectedSquare: null,
                    possibleMoves: [],
                }));
            }
        },
        [logicDemos]
    );

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

    const currentBoard =
        uiMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        uiMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    return (
        <div className='flex flex-col items-center gap-6 p-6 max-w-7xl mx-auto'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-4'>
                    {uiMode === 'play'
                        ? 'Chess Game'
                        : 'Chess Logic & Tutorials'}
                </h1>
                <p className='text-xl text-purple-100 font-medium'>
                    {uiMode === 'play'
                        ? getStatusMessage()
                        : getCurrentDemo().description}
                </p>
            </div>

            {/* Mode Toggle */}
            <div className='flex gap-4'>
                <button
                    onClick={toggleMode}
                    className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                        uiMode === 'play'
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                            : 'text-purple-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    🎮 Play Mode
                </button>
                <button
                    onClick={toggleMode}
                    className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                        uiMode === 'tutorial'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                            : 'text-purple-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    📚 Tutorial Mode
                </button>
            </div>

            {/* Tutorial Demo Selector */}
            {uiMode === 'tutorial' && (
                <div className='flex flex-wrap gap-3 justify-center max-w-4xl'>
                    {logicDemos.map(demoItem => (
                        <button
                            key={demoItem.id}
                            onClick={() => handleDemoChange(demoItem.id)}
                            className={`glass-effect px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                                currentDemo === demoItem.id
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
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
                <ChessBoard
                    board={currentBoard}
                    selectedSquare={gameState.selectedSquare}
                    possibleMoves={gameState.possibleMoves}
                    onSquareClick={handleSquareClick}
                    highlightSquares={currentHighlightSquares}
                />
            </div>

            {/* Content Panel - Below Board */}
            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {uiMode === 'play' ? (
                    // Play Mode Controls
                    <>
                        {/* Game Mode Selection */}
                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h3 className='text-xl font-semibold text-white mb-4 text-center'>
                                Game Mode
                            </h3>
                            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                                <button
                                    onClick={startHumanVsHuman}
                                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                        gameState.mode === 'human-vs-human'
                                            ? 'border-blue-400 bg-blue-500 bg-opacity-20 text-white'
                                            : 'border-white border-opacity-20 text-purple-200 hover:border-blue-400'
                                    }`}
                                >
                                    <div className='text-2xl mb-2'>👥</div>
                                    <div className='font-medium'>
                                        Human vs Human
                                    </div>
                                    <div className='text-sm opacity-70'>
                                        Play against a friend
                                    </div>
                                </button>

                                <button
                                    onClick={() => startHumanVsAI('black')}
                                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                        gameState.mode === 'human-vs-ai' &&
                                        gameState.aiPlayer === 'black'
                                            ? 'border-purple-400 bg-purple-500 bg-opacity-20 text-white'
                                            : 'border-white border-opacity-20 text-purple-200 hover:border-purple-400'
                                    }`}
                                    disabled={
                                        !aiConfig.enabled || !aiConfig.apiKey
                                    }
                                >
                                    <div className='text-2xl mb-2'>🤖</div>
                                    <div className='font-medium'>
                                        Human vs AI
                                    </div>
                                    <div className='text-sm opacity-70'>
                                        You play as White
                                    </div>
                                </button>

                                <button
                                    onClick={() => startHumanVsAI('white')}
                                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                        gameState.mode === 'human-vs-ai' &&
                                        gameState.aiPlayer === 'white'
                                            ? 'border-pink-400 bg-pink-500 bg-opacity-20 text-white'
                                            : 'border-white border-opacity-20 text-purple-200 hover:border-pink-400'
                                    }`}
                                    disabled={
                                        !aiConfig.enabled || !aiConfig.apiKey
                                    }
                                >
                                    <div className='text-2xl mb-2'>🎯</div>
                                    <div className='font-medium'>
                                        AI vs Human
                                    </div>
                                    <div className='text-sm opacity-70'>
                                        You play as Black
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* AI Configuration Panel */}
                        <AIConfigPanel
                            config={aiConfig}
                            onConfigChange={handleAIConfigChange}
                        />

                        {/* Game Controls */}
                        <div className='flex gap-4 justify-center'>
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

                        {/* AI Thinking Indicator */}
                        {gameState.isAiThinking && (
                            <div className='glass-effect p-4 rounded-xl border border-purple-400 border-opacity-50'>
                                <div className='flex items-center justify-center gap-3'>
                                    <div className='animate-spin w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full'></div>
                                    <span className='text-purple-200'>
                                        AI is thinking...
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Game Instructions */}
                        <div className='text-sm text-purple-200 text-center max-w-md mx-auto space-y-2 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                            <p className='flex items-center justify-center gap-2'>
                                <span>🖱️</span>
                                Click on a piece to select it, then click on a
                                highlighted square to move.
                            </p>
                            <p className='flex items-center justify-center gap-2'>
                                <span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
                                Possible moves
                                <span className='mx-2'>•</span>
                                <span className='w-3 h-3 border-2 border-red-500 rounded inline-block'></span>
                                Captures
                            </p>
                            {gameState.mode === 'human-vs-ai' && (
                                <p className='flex items-center justify-center gap-2 pt-2 border-t border-white border-opacity-10'>
                                    <span>🤖</span>
                                    Playing against {aiConfig.provider} (
                                    {aiConfig.model})
                                </p>
                            )}
                        </div>
                    </>
                ) : (
                    // Tutorial Mode Content
                    <>
                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h2 className='text-2xl font-bold text-white mb-3'>
                                {getCurrentDemo().title}
                            </h2>
                            <div className='bg-black bg-opacity-30 p-4 rounded-xl border border-purple-500 border-opacity-30'>
                                <p className='text-purple-200 leading-relaxed'>
                                    {getCurrentDemo().explanation}
                                </p>
                            </div>
                        </div>

                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                                <span>🎯</span>
                                How to Use This Demo
                            </h3>
                            <div className='space-y-3 text-purple-200'>
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
                                    Red outlines indicate capture moves
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
                                Chess Wisdom
                            </h3>
                            <div className='space-y-2 text-purple-200 text-sm'>
                                <p>
                                    "Control the center squares - they're the
                                    most valuable real estate on the board."
                                </p>
                                <p>
                                    "Develop your pieces before launching
                                    attacks - teamwork wins games."
                                </p>
                                <p>
                                    "Always think three moves ahead: your move,
                                    opponent's response, your follow-up."
                                </p>
                                <p>
                                    "King safety is paramount - a exposed king
                                    is a losing king."
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChessGame;
