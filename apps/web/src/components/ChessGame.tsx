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
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import type { AIConfig } from '../lib/ai/types';
import { AIService } from '../lib/ai/service';
import { loadAIConfig, saveAIConfig, defaultAIConfig } from '../lib/ai/storage';

interface LogicDemo {
    id: string;
    title: string;
    description: string;
    board: (ChessPiece | null)[][];
    focusSquare?: Position;
    highlightSquares?: Position[];
    explanation: string;
}

type ChessGameMode = 'tutorial' | 'ai';

const ChessGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<ChessGameMode>('ai');
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<GameState>(() =>
        createInitialGameState()
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
    const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
    const [aiConfig, setAIConfig] = useState<AIConfig>(defaultAIConfig);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [aiDebugMessages, setAiDebugMessages] = useState<
        Array<{
            type: 'ai-thinking' | 'ai-move' | 'ai-error' | 'ai-debug';
            message: string;
            timestamp: number;
            data?: unknown;
        }>
    >([]);
    const [aiRejectionCount, setAiRejectionCount] = useState(0);
    const [isAiPaused, setIsAiPaused] = useState(false);
    const [aiService] = useState<AIService>(
        () => new AIService(defaultAIConfig)
    );

    // Load AI config on client side only to avoid SSR hydration mismatch
    useEffect(() => {
        const loadConfig = async () => {
            const config = await loadAIConfig();
            setAIConfig(config);
            aiService.updateConfig({ ...config, debug: isDebugMode });
        };
        loadConfig();
    }, [aiService, isDebugMode]);

    // Update AI service when debug mode changes
    useEffect(() => {
        aiService.updateConfig({ ...aiConfig, debug: isDebugMode });

        // Set up debug callback
        if (isDebugMode) {
            aiService.setDebugCallback((type, message, data) => {
                setAiDebugMessages(prev => [
                    ...prev,
                    {
                        type: type as
                            | 'ai-thinking'
                            | 'ai-move'
                            | 'ai-error'
                            | 'ai-debug',
                        message,
                        timestamp: Date.now(),
                        data,
                    },
                ]);
            });
        }
    }, [isDebugMode, aiConfig, aiService]);

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
    const _handleAIConfigChange = useCallback(
        async (newConfig: AIConfig) => {
            setAIConfig(newConfig);
            // Note: Saving should be done through profile page, not here
            // This is kept for backward compatibility only
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
                if (isDebugMode) {
                    setAiDebugMessages(prev => [
                        ...prev,
                        {
                            type: 'ai-debug',
                            message: `🎮 Attempting move: ${aiResponse.move.from} → ${aiResponse.move.to}`,
                            timestamp: Date.now(),
                            data: aiResponse,
                        },
                    ]);
                }

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

                    if (isDebugMode) {
                        setAiDebugMessages(prev => [
                            ...prev,
                            {
                                type: 'ai-move',
                                message: `✅ Move successful! ${aiResponse.move.from} → ${aiResponse.move.to}`,
                                timestamp: Date.now(),
                                data: {
                                    move: aiResponse.move,
                                    newStatus: updatedGameState.status,
                                },
                            },
                        ]);
                    }
                } else {
                    // Handle AI move rejection
                    const newRejectionCount = aiRejectionCount + 1;
                    setAiRejectionCount(newRejectionCount);

                    if (isDebugMode) {
                        setAiDebugMessages(prev => [
                            ...prev,
                            {
                                type: 'ai-error',
                                message: `❌ Move REJECTED (${newRejectionCount}/5): ${aiResponse.move.from} → ${aiResponse.move.to}`,
                                timestamp: Date.now(),
                                data: {
                                    suggestedMove: aiResponse.move,
                                    currentPlayer: gameState.currentPlayer,
                                    gameStatus: gameState.status,
                                    rejectionCount: newRejectionCount,
                                },
                            },
                        ]);
                    }

                    // Pause AI after 5 rejections
                    if (newRejectionCount >= 5) {
                        setIsAiPaused(true);
                        if (isDebugMode) {
                            setAiDebugMessages(prev => [
                                ...prev,
                                {
                                    type: 'ai-error',
                                    message: `🛑 AI PAUSED - Too many rejections (5/5). Game paused to prevent infinite loop.`,
                                    timestamp: Date.now(),
                                    data: {
                                        finalRejectionCount: newRejectionCount,
                                    },
                                },
                            ]);
                        }
                    }
                }
            } else {
                if (isDebugMode) {
                    setAiDebugMessages(prev => [
                        ...prev,
                        {
                            type: 'ai-error',
                            message: `❌ No valid AI response received`,
                            timestamp: Date.now(),
                            data: aiResponse,
                        },
                    ]);
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
        if (
            gameMode === 'ai' &&
            gameState.currentPlayer === aiPlayer &&
            gameState.status === 'playing' &&
            !gameState.isAiThinking &&
            !isAiPaused
        ) {
            const timer = setTimeout(() => {
                makeAIMoveAsync();
            }, 1000); // 1 second delay for better UX

            return () => clearTimeout(timer);
        }
    }, [gameState, gameMode, aiPlayer, makeAIMoveAsync, isAiPaused]);

    // Game mode handlers
    const toggleToMode = useCallback(
        (newMode: ChessGameMode) => {
            setGameMode(newMode);
            setGameStarted(false);
            setAiRejectionCount(0);
            setIsAiPaused(false);
            setAiDebugMessages([]);

            if (newMode === 'tutorial') {
                const demo = getCurrentDemo();
                setGameState({
                    board: demo.board,
                    currentPlayer: 'white',
                    status: 'playing',
                    moveHistory: [],
                    selectedSquare: null,
                    possibleMoves: [],
                    mode: 'human-vs-human',
                    isAiThinking: false,
                });
            } else if (newMode === 'ai') {
                if (aiConfig.enabled && aiConfig.apiKey) {
                    setGameState(
                        createInitialGameState('human-vs-ai', aiPlayer)
                    );
                } else {
                    // AI mode without proper config - default to human vs human
                    setGameState(createInitialGameState('human-vs-human'));
                }
            }
        },
        [getCurrentDemo, aiPlayer, aiConfig.enabled, aiConfig.apiKey]
    );

    const handleSquareClick = useCallback(
        (position: Position) => {
            if (gameMode === 'tutorial') {
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
                // Regular game mode or AI mode
                // Prevent moves during AI turn or when AI is thinking
                if (
                    (gameMode === 'ai' &&
                        gameState.currentPlayer === aiPlayer) ||
                    gameState.isAiThinking
                ) {
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
        [gameMode, gameState, getCurrentDemo, aiPlayer]
    );

    const resetGame = useCallback(() => {
        if (gameMode === 'ai') {
            setGameState(createInitialGameState('human-vs-ai', aiPlayer));
        } else {
            setGameState(createInitialGameState('human-vs-human'));
        }
        setGameStarted(false);
        setAiRejectionCount(0);
        setIsAiPaused(false);
        setAiDebugMessages([]);
    }, [gameMode, aiPlayer]);

    // Calculate hasGameStarted before using it in callbacks
    const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

    const handleStartOrReset = useCallback(() => {
        if (!hasGameStarted) {
            // Starting the game
            setGameStarted(true);
        } else {
            // Resetting the game
            resetGame();
        }
    }, [hasGameStarted, resetGame]);

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
        const playerName =
            gameState.currentPlayer === 'white' ? 'White' : 'Black';

        // Add AI/Human indicator in AI mode
        const playerType =
            gameMode === 'ai'
                ? gameState.currentPlayer === aiPlayer
                    ? '🤖 AI'
                    : '👤 Human'
                : '';

        switch (gameState.status) {
            case 'check':
                return `${playerName} is in check!`;
            case 'checkmate':
                return `Checkmate! ${gameState.currentPlayer === 'white' ? 'Black' : 'White'} wins!`;
            case 'stalemate':
                return 'Stalemate! The game is a draw.';
            case 'draw':
                return 'The game is a draw.';
            default:
                return gameMode === 'ai'
                    ? `${playerType} ${playerName} to move`
                    : `${playerName} to move`;
        }
    };

    const isGameOver =
        gameState.status === 'checkmate' ||
        gameState.status === 'stalemate' ||
        gameState.status === 'draw';

    const currentBoard =
        gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    const title =
        gameMode === 'tutorial' ? 'Chess Logic & Tutorials' : 'Chess Game';
    const subtitle =
        gameMode === 'tutorial'
            ? getCurrentDemo().description
            : getStatusMessage();
    const showModeToggle = gameMode === 'tutorial' || !hasGameStarted;

    return (
        <GameScaffold
            title={title}
            subtitle={subtitle}
            titleGradientClassName='bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300'
            subtitleClassName='text-purple-100'
            currentMode={gameMode}
            onModeChange={toggleToMode}
            showModeToggle={showModeToggle}
            inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
        >
            {gameMode === 'ai' && (
                <div className='flex flex-col gap-4 max-w-2xl mx-auto'>
                    <div className='flex gap-4 justify-center'>
                        <select
                            value={aiPlayer}
                            onChange={e => {
                                const newAIPlayer = e.target.value as
                                    | 'white'
                                    | 'black';
                                setAIPlayer(newAIPlayer);
                                setGameState(prev => ({
                                    ...prev,
                                    mode: 'human-vs-ai',
                                    aiPlayer: newAIPlayer,
                                }));
                            }}
                            className='glass-effect px-4 py-2 rounded-xl text-white bg-black bg-opacity-30 border border-white border-opacity-20'
                        >
                            <option value='black'>AI plays Black</option>
                            <option value='white'>AI plays White</option>
                        </select>
                    </div>

                    <div className='text-center'>
                        {!aiConfig.enabled || !aiConfig.apiKey ? (
                            <div className='text-yellow-400 text-sm'>
                                ⚠ AI not configured - Configure API key in
                                Profile to enable AI gameplay
                            </div>
                        ) : (
                            <>
                                {gameState.isAiThinking && !isAiPaused && (
                                    <div className='flex items-center justify-center gap-2 text-cyan-200'>
                                        <div className='animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full'></div>
                                        AI is thinking...
                                    </div>
                                )}

                                {isAiPaused && (
                                    <div className='text-red-300'>
                                        🛑 AI Paused ({aiRejectionCount}/5)
                                    </div>
                                )}

                                {isDebugMode && aiDebugMessages.length > 0 && (
                                    <div className='mt-4 p-4 bg-black bg-opacity-40 rounded-xl border border-white border-opacity-10'>
                                        <h4 className='text-sm font-semibold text-cyan-200 mb-2'>
                                            AI Debug:
                                        </h4>
                                        {aiDebugMessages
                                            .slice(-3)
                                            .map((msg, idx) => (
                                                <div
                                                    key={`${msg.timestamp}-${idx}`}
                                                    className='text-xs text-gray-300 font-mono'
                                                >
                                                    {msg.message}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {gameMode === 'tutorial' && (
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

            <div className='flex justify-center'>
                <GameStartOverlay
                    active={!hasGameStarted && gameMode !== 'tutorial'}
                >
                    <ChessBoard
                        board={currentBoard}
                        selectedSquare={gameState.selectedSquare}
                        possibleMoves={gameState.possibleMoves}
                        onSquareClick={handleSquareClick}
                        highlightSquares={currentHighlightSquares}
                    />
                </GameStartOverlay>
            </div>

            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' ? (
                    <>
                        <div className='flex gap-4 justify-center'>
                            <button
                                onClick={handleStartOrReset}
                                className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                            >
                                {hasGameStarted ? '🆕 New Game' : '▶️ Start'}
                            </button>

                            {isGameOver && (
                                <button
                                    onClick={resetGame}
                                    className='bg-gradient-to-r from-green-500 to-emerald-500 hover:from-emerald-500 hover:to-green-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
                                >
                                    🎮 Play Again
                                </button>
                            )}

                            {gameMode === 'ai' &&
                                aiConfig.enabled &&
                                aiConfig.apiKey && (
                                    <button
                                        onClick={() =>
                                            setIsDebugMode(!isDebugMode)
                                        }
                                        className={`glass-effect px-4 py-2 text-xs font-medium rounded-lg hover:scale-105 transition-all duration-300 border border-opacity-30 ${
                                            isDebugMode
                                                ? 'bg-yellow-500 bg-opacity-20 text-yellow-300 border-yellow-400'
                                                : 'text-gray-300 border-gray-400 hover:bg-white hover:bg-opacity-10'
                                        }`}
                                    >
                                        🐛{' '}
                                        {isDebugMode
                                            ? 'Debug ON'
                                            : 'Debug Mode'}
                                    </button>
                                )}

                            {gameMode === 'ai' &&
                                (!aiConfig.enabled || !aiConfig.apiKey) && (
                                    <button
                                        onClick={() =>
                                            (window.location.href = '/profile')
                                        }
                                        className='glass-effect px-4 py-2 text-sm font-medium rounded-lg hover:scale-105 transition-all duration-300 border border-white border-opacity-30 text-white hover:bg-white hover:bg-opacity-20'
                                    >
                                        ⚙️ Configure AI
                                    </button>
                                )}
                        </div>

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
                            {gameMode === 'ai' && (
                                <p className='flex items-center justify-center gap-2 pt-2 border-t border-white border-opacity-10'>
                                    <span>🤖</span>
                                    {aiConfig.enabled && aiConfig.apiKey
                                        ? `Playing against ${aiConfig.provider} (${aiConfig.model})`
                                        : 'AI Mode - Configure API key to play against AI'}
                                </p>
                            )}
                        </div>
                    </>
                ) : (
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
                                Chess Tips
                            </h3>
                            <div className='space-y-2 text-purple-200 text-sm'>
                                <p>
                                    "Control the center and develop your pieces
                                    early."
                                </p>
                                <p>
                                    "Castle early to protect your king and
                                    connect your rooks."
                                </p>
                                <p>
                                    "Look for forks, pins, and skewers to gain
                                    material advantages."
                                </p>
                                <p>
                                    "Always consider your opponent's best move
                                    before making yours."
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </GameScaffold>
    );
};

export default ChessGame;
