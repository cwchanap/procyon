import React, { useState, useCallback, useEffect } from 'react';
import type {
    JungleGameState,
    JunglePosition,
    JunglePieceColor,
    JunglePiece,
} from '../lib/jungle/types';
import {
    createInitialGameState,
    selectSquare,
    resetGame,
} from '../lib/jungle/game';
import { createInitialTerrain } from '../lib/jungle/types';
import { createInitialBoard } from '../lib/jungle/board';
import { createJungleAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
import type { AIConfig } from '../lib/ai/types';
import JungleBoard from './JungleBoard';
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import AISettingsDialog from './ai/AISettingsDialog';
import { type AIMove } from './ai/AIDebugDialog';

interface JungleDemo {
    id: string;
    title: string;
    description: string;
    board: (JunglePiece | null)[][];
    focusSquare?: JunglePosition;
    highlightSquares?: JunglePosition[];
    explanation: string;
}

type JungleGameMode = 'tutorial' | 'ai';

const JungleGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<JungleGameMode>('ai');
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<JungleGameState>(
        createInitialGameState()
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
    const [aiPlayer, setAIPlayer] = useState<JunglePieceColor>('blue');
    const [aiConfig, setAIConfig] = useState<AIConfig>({
        ...defaultAIConfig,
        gameVariant: 'jungle',
    });
    const [aiService] = useState(() => createJungleAI(aiConfig));
    const [isAIThinking, setIsAIThinking] = useState(false);
    const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [_isLoadingConfig, setIsLoadingConfig] = useState(true);
    const [_aiRejectionCount, setAiRejectionCount] = useState(0);
    const [_isAiPaused, setIsAiPaused] = useState(false);

    // Load AI config on client side only to avoid SSR hydration mismatch
    useEffect(() => {
        const loadConfig = async () => {
            const config = await loadAIConfig();
            setAIConfig({ ...config, gameVariant: 'jungle' });
            aiService.updateConfig({
                ...config,
                gameVariant: 'jungle',
                debug: isDebugMode,
            });
            setIsLoadingConfig(false);
        };
        loadConfig();
    }, [aiService, isDebugMode]);

    // AI setup and debug callback
    useEffect(() => {
        aiService.updateConfig({ ...aiConfig, debug: isDebugMode });

        // Set up debug callback
        if (isDebugMode) {
            aiService.setDebugCallback((type, message, _data) => {
                const thinking = type === 'ai-thinking' ? message : undefined;
                const error = type === 'ai-error' ? message : undefined;

                setAIDebugMoves(prev => [
                    ...prev,
                    _createAIMove(
                        type === 'ai-move' ? message : `Debug: ${message}`,
                        true,
                        thinking,
                        error
                    ),
                ]);
            });
        }
    }, [aiService, aiConfig, isDebugMode]);

    // AI move handling
    useEffect(() => {
        if (
            gameMode === 'ai' &&
            gameStarted &&
            gameState.currentPlayer === aiPlayer &&
            gameState.status === 'playing' &&
            !isAIThinking
        ) {
            const makeAIMove = async () => {
                setIsAIThinking(true);
                try {
                    const aiResponse = await aiService.makeMove(gameState);
                    if (aiResponse) {
                        // Parse AI move from algebraic notation
                        const fromPos = aiService.adapter.algebraicToPosition(
                            aiResponse.move.from
                        );
                        const toPos = aiService.adapter.algebraicToPosition(
                            aiResponse.move.to
                        );

                        // Apply the move using jungle game logic
                        const moveResult = selectSquare(gameState, fromPos);
                        if (moveResult.selectedSquare) {
                            const finalResult = selectSquare(moveResult, toPos);
                            setGameState(finalResult);
                        }
                    }
                } catch (_error) {
                    // console.error('AI move failed:', error);
                } finally {
                    setIsAIThinking(false);
                }
            };

            const timer = setTimeout(makeAIMove, 1000);
            return () => clearTimeout(timer);
        }
    }, [gameState, gameMode, gameStarted, aiPlayer, aiService, isAIThinking]);

    // Helper function to convert move history to debug format
    const _createAIMove = useCallback(
        (
            move: string,
            isAI: boolean,
            thinking?: string,
            error?: string
        ): AIMove => {
            const moveNumber = Math.floor(gameState.moveHistory.length / 2) + 1;
            const player =
                gameState.currentPlayer === 'red'
                    ? 'Red (红方)'
                    : 'Blue (蓝方)';

            return {
                moveNumber,
                player: `${isAI ? '🤖 AI ' : '👤 '}${player}`,
                move,
                timestamp: Date.now(),
                isAI,
                thinking,
                error,
            };
        },
        [gameState.moveHistory.length, gameState.currentPlayer]
    );

    const createCustomJungleBoard = useCallback(
        (setup: string): (JunglePiece | null)[][] => {
            const board: (JunglePiece | null)[][] = Array(9)
                .fill(null)
                .map(() => Array(7).fill(null));

            switch (setup) {
                case 'lion-moves':
                    board[4]![3] = {
                        type: 'lion',
                        color: 'red',
                        rank: 7,
                    };
                    board[2]![2] = {
                        type: 'rat',
                        color: 'blue',
                        rank: 1,
                    };
                    board[2]![4] = {
                        type: 'rat',
                        color: 'blue',
                        rank: 1,
                    };
                    break;
                case 'river-jumping':
                    board[4]![1] = {
                        type: 'tiger',
                        color: 'red',
                        rank: 6,
                    };
                    board[4]![5] = {
                        type: 'lion',
                        color: 'red',
                        rank: 7,
                    };
                    break;
                case 'trap-demonstration':
                    board[4]![3] = {
                        type: 'elephant',
                        color: 'red',
                        rank: 8,
                    };
                    board[4]![2] = {
                        type: 'wolf',
                        color: 'blue',
                        rank: 3,
                    };
                    break;
                case 'basic':
                    // Populate with initial board setup for basic movement tutorial
                    return createInitialBoard();
                default:
                    return board;
            }

            return board;
        },
        []
    );

    const jungleDemos: JungleDemo[] = [
        {
            id: 'basic-movement',
            title: 'Basic Piece Movement',
            description:
                'Learn how different Jungle pieces move across the board',
            board: createCustomJungleBoard('basic'),
            explanation:
                'Click on any piece to see its possible moves. Each piece has unique movement patterns and special abilities.',
        },
        {
            id: 'lion-moves',
            title: 'Lion Movement Pattern',
            description: 'The lion is powerful and can jump across rivers',
            board: createCustomJungleBoard('lion-moves'),
            focusSquare: { row: 4, col: 3 },
            highlightSquares: [
                { row: 2, col: 3 },
                { row: 3, col: 3 },
                { row: 4, col: 2 },
                { row: 4, col: 4 },
                { row: 5, col: 3 },
                { row: 6, col: 3 },
            ],
            explanation:
                'The lion can move one square in any direction and jump across rivers if there are no pieces blocking the path.',
        },
        {
            id: 'river-jumping',
            title: 'River Jumping',
            description: 'Tigers and lions can jump across rivers',
            board: createCustomJungleBoard('river-jumping'),
            focusSquare: { row: 4, col: 1 },
            highlightSquares: [
                { row: 4, col: 3 },
                { row: 4, col: 5 },
            ],
            explanation:
                'Tigers and lions can jump across rivers in a straight line, but cannot jump if there are pieces in the water blocking the path.',
        },
        {
            id: 'trap-demonstration',
            title: 'Trap Mechanics',
            description: 'Pieces in enemy traps become vulnerable',
            board: createCustomJungleBoard('trap-demonstration'),
            focusSquare: { row: 4, col: 3 },
            highlightSquares: [{ row: 4, col: 2 }],
            explanation:
                'When a piece enters an enemy trap, its rank becomes 0, making it capturable by any piece. Elephants are especially vulnerable to rats.',
        },
    ];
    const getCurrentDemo = useCallback((): JungleDemo => {
        const demo = jungleDemos.find(demo => demo.id === currentDemo);
        return (demo || jungleDemos[0]) as JungleDemo;
    }, [currentDemo, jungleDemos]);

    const handleSquareClick = useCallback(
        (position: JunglePosition) => {
            if (gameMode === 'tutorial') {
                const demo = getCurrentDemo();
                const newGameState = {
                    ...gameState,
                    board: demo.board,
                    selectedSquare: position,
                    possibleMoves: [], // Simplified for tutorial
                };
                setGameState(newGameState);
            } else {
                const newGameState = selectSquare(gameState, position);
                setGameState(newGameState);
            }
        },
        [gameMode, gameState, getCurrentDemo]
    );

    const handleResetGame = useCallback(() => {
        setGameState(resetGame());
        setGameStarted(false);
        setAiRejectionCount(0);
        setIsAiPaused(false);
        setAIDebugMoves([]);
    }, []);

    const handleStartOrReset = useCallback(() => {
        if (!gameStarted) {
            // Starting game - ensure game state is properly initialized
            setGameState(createInitialGameState());
            setGameStarted(true);
        } else {
            // Resetting the game
            handleResetGame();
        }
    }, [gameStarted, handleResetGame]);

    const handleDemoChange = useCallback(
        (demoId: string) => {
            setCurrentDemo(demoId);
            const demo = jungleDemos.find(d => d.id === demoId);
            if (demo) {
                setGameState(prev => ({
                    ...prev,
                    board: demo.board,
                    selectedSquare: null,
                    possibleMoves: [],
                }));
            }
        },
        [jungleDemos]
    );

    const toggleToMode = useCallback(
        (newMode: JungleGameMode) => {
            setGameMode(newMode);
            setGameStarted(false);
            setAiRejectionCount(0);
            setIsAiPaused(false);
            setAIDebugMoves([]);

            if (newMode === 'tutorial') {
                const demo = getCurrentDemo();
                setGameState({
                    board: demo.board,
                    terrain: createInitialTerrain(),
                    currentPlayer: 'red',
                    status: 'playing',
                    moveHistory: [],
                    selectedSquare: null,
                    possibleMoves: [],
                });
            } else {
                setGameState(createInitialGameState());
            }
        },
        [getCurrentDemo]
    );

    const getStatusMessage = (): string => {
        const playerName = gameState.currentPlayer === 'red' ? '红方' : '蓝方';
        const playerNameEn = gameState.currentPlayer === 'red' ? 'Red' : 'Blue';

        // Add AI/Human indicator in AI mode
        const playerType =
            gameMode === 'ai'
                ? gameState.currentPlayer === aiPlayer
                    ? '🤖 AI'
                    : '👤 Human'
                : '';

        switch (gameState.status) {
            case 'check':
                return `${playerName} is in check! 将军！`;
            case 'checkmate': {
                const winner =
                    gameState.currentPlayer === 'red'
                        ? '蓝方 (Blue)'
                        : '红方 (Red)';
                return `Checkmate! ${winner} wins! 将死！`;
            }
            case 'stalemate':
                return 'Stalemate! The game is a draw. 和棋！';
            case 'draw':
                return 'The game is a draw. 和棋！';
            default:
                return gameMode === 'ai'
                    ? `${playerType} ${playerName} (${playerNameEn}) to move`
                    : `${playerName} (${playerNameEn}) to move`;
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
        gameMode === 'tutorial'
            ? 'Jungle Chess Logic & Tutorials'
            : 'Jungle Chess (鬥獸棋)';
    const subtitle =
        gameMode === 'tutorial'
            ? getCurrentDemo().description
            : gameStarted
              ? getStatusMessage()
              : '';
    const showModeToggle = gameMode === 'tutorial' || !gameStarted;

    return (
        <GameScaffold
            title={title}
            subtitle={subtitle}
            titleGradientClassName='bg-gradient-to-r from-green-400 via-blue-500 to-purple-600'
            subtitleClassName='text-purple-100'
            currentMode={gameMode}
            onModeChange={toggleToMode}
            showModeToggle={showModeToggle}
            inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
            aiSettingsButton={
                <AISettingsDialog
                    aiPlayer={aiPlayer}
                    onAIPlayerChange={player =>
                        setAIPlayer(player as JunglePieceColor)
                    }
                    provider={aiConfig.provider}
                    model={aiConfig.model}
                    onProviderChange={provider =>
                        setAIConfig({ ...aiConfig, provider: provider as any })
                    }
                    onModelChange={model => setAIConfig({ ...aiConfig, model })}
                    aiPlayerOptions={[
                        { value: 'blue', label: 'AI plays Blue (蓝方)' },
                        { value: 'red', label: 'AI plays Red (红方)' },
                    ]}
                    isActive={gameMode === 'ai'}
                />
            }
        >
            {gameMode === 'ai' && (
                <AIStatusPanel
                    aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                    hasGameStarted={gameStarted}
                    isAIThinking={isAIThinking}
                    isAIPaused={_isAiPaused}
                    aiError={null}
                    aiDebugMoves={aiDebugMoves}
                    isDebugMode={isDebugMode}
                    onRetry={() => {}}
                />
            )}

            {gameMode === 'tutorial' && (
                <DemoSelector
                    demos={jungleDemos}
                    currentDemo={currentDemo}
                    onDemoChange={handleDemoChange}
                />
            )}

            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' ? (
                    <AIGameInstructions
                        providerName={aiConfig.provider}
                        modelName={aiConfig.model}
                        aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                    >
                        <div className='text-xs space-y-1 pt-2'>
                            <p>
                                <strong>Pieces:</strong> 象=Elephant (8),
                                獅=Lion (7), 虎=Tiger (6)
                            </p>
                            <p>
                                豹=Leopard (5), 狗=Dog (4), 狼=Wolf (3), 貓=Cat
                                (2), 鼠=Rat (1)
                            </p>
                            <p>
                                <strong>Special Rules:</strong> Rat can defeat
                                Elephant, Lions/Tigers can jump rivers
                            </p>
                            <p>
                                <strong>Goal:</strong> Enter opponent's den (◆)
                                to win
                            </p>
                        </div>
                    </AIGameInstructions>
                ) : (
                    <TutorialInstructions
                        title={getCurrentDemo().title}
                        explanation={getCurrentDemo().explanation}
                        tips={[
                            '"Protect your high-ranking pieces but use rats strategically against elephants."',
                            '"Control the center of the board - it provides more movement options."',
                            '"Use river jumps to quickly advance pieces across the board."',
                            '"Pieces in enemy traps become vulnerable - use this to your advantage."',
                            '"Lions and tigers are powerful - use them for both offense and defense."',
                        ]}
                        tipsTitle='Jungle Chess Wisdom'
                    />
                )}
            </div>

            <div className='flex justify-center'>
                <GameStartOverlay
                    active={!gameStarted && gameMode !== 'tutorial'}
                >
                    <JungleBoard
                        board={currentBoard}
                        terrain={gameState.terrain}
                        selectedSquare={gameState.selectedSquare}
                        possibleMoves={gameState.possibleMoves}
                        onSquareClick={handleSquareClick}
                        highlightSquares={currentHighlightSquares}
                    />
                </GameStartOverlay>
            </div>

            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' && (
                    <GameControls
                        hasGameStarted={gameStarted}
                        isGameOver={isGameOver}
                        aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                        isDebugMode={isDebugMode}
                        canExport={false}
                        onStartOrReset={handleStartOrReset}
                        onReset={handleResetGame}
                        onToggleDebug={() => setIsDebugMode(!isDebugMode)}
                        onExport={() => {}}
                    />
                )}
            </div>
        </GameScaffold>
    );
};

export default JungleGame;
