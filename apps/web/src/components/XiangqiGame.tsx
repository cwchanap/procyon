import React, { useState, useCallback, useEffect } from 'react';
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
import { createXiangqiAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
import type { AIConfig } from '../lib/ai/types';
import XiangqiBoard from './XiangqiBoard';
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import AISettingsDialog from './ai/AISettingsDialog';
import type { AIMove } from './ai/AIDebugDialog';

interface XiangqiDemo {
    id: string;
    title: string;
    description: string;
    board: (XiangqiPiece | null)[][];
    focusSquare?: XiangqiPosition;
    highlightSquares?: XiangqiPosition[];
    explanation: string;
}

type XiangqiGameMode = 'tutorial' | 'ai';

const XiangqiGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<XiangqiGameMode>('ai');
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<XiangqiGameState>(
        createInitialXiangqiGameState
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
    const [aiPlayer, setAIPlayer] = useState<'red' | 'black'>('black');
    const [aiConfig, setAIConfig] = useState<AIConfig>({
        ...defaultAIConfig,
        gameVariant: 'xiangqi',
    });
    const [aiService] = useState(() => createXiangqiAI(aiConfig));
    const [isAIThinking, setIsAIThinking] = useState(false);
    const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [_isLoadingConfig, setIsLoadingConfig] = useState(true);

    // Helper function to convert move history to debug format
    const createAIMove = useCallback(
        (
            move: string,
            isAI: boolean,
            thinking?: string,
            error?: string
        ): AIMove => {
            const moveNumber = gameState.moveHistory.length + 1;
            const player =
                gameState.currentPlayer === 'red'
                    ? 'Red (红方)'
                    : 'Black (黑方)';

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

    // Load AI config on client side only to avoid SSR hydration mismatch
    useEffect(() => {
        const loadConfig = async () => {
            const config = await loadAIConfig();
            setAIConfig({ ...config, gameVariant: 'xiangqi' });
            aiService.updateConfig({
                ...config,
                gameVariant: 'xiangqi',
                debug: isDebugMode,
            });
            setIsLoadingConfig(false);
        };
        loadConfig();
    }, [aiService, isDebugMode]);

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
                    createAIMove(
                        type === 'ai-move' ? message : `Debug: ${message}`,
                        true,
                        thinking,
                        error
                    ),
                ]);
            });
        }
    }, [aiService, aiConfig, createAIMove, isDebugMode]);

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
                        const fromPos = algebraicToPosition(
                            aiResponse.move.from
                        );
                        const toPos = algebraicToPosition(aiResponse.move.to);

                        // Apply the move using xiangqi game logic
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

    const algebraicToPosition = useCallback(
        (algebraic: string): XiangqiPosition => {
            const file = algebraic[0];
            const rank = algebraic.slice(1);
            const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
            const ranks = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
            return {
                col: files.indexOf(file),
                row: ranks.indexOf(rank),
            };
        },
        []
    );

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
            } else if (gameMode === 'ai') {
                // AI mode - handle both human and AI moves
                const newGameState = selectSquare(gameState, position);
                setGameState(newGameState);
            }
        },
        [gameMode, gameState, getCurrentDemo, aiPlayer]
    );

    const handleResetGame = useCallback(() => {
        setGameState(resetGame());
        setGameStarted(false);
    }, []);

    // Calculate hasGameStarted before using it in callbacks
    const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

    const handleStartOrReset = useCallback(() => {
        if (!hasGameStarted) {
            // Starting the game - ensure game state is properly initialized
            setGameState(resetGame());
            setGameStarted(true);
        } else {
            // Resetting the game
            handleResetGame();
        }
    }, [hasGameStarted, handleResetGame]);

    const toggleToMode = useCallback(
        (newMode: XiangqiGameMode) => {
            setGameMode(newMode);
            setGameStarted(false);
            setIsAIThinking(false);
            setAIDebugMoves([]);

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
        },
        [getCurrentDemo]
    );

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

    const _handleUndoMove = useCallback(() => {
        const newGameState = undoMove(gameState);
        setGameState(newGameState);
    }, [gameState]);

    const getStatusMessage = (): string => {
        const playerName = gameState.currentPlayer === 'red' ? '红方' : '黑方';
        const playerNameEn =
            gameState.currentPlayer === 'red' ? 'Red' : 'Black';

        // Add AI/Human indicator in AI mode
        const playerType =
            gameMode === 'ai'
                ? gameState.currentPlayer === aiPlayer
                    ? '🤖 AI'
                    : '👤 Human'
                : '';

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
                return gameMode === 'ai'
                    ? `${playerType} ${playerName} (${playerNameEn}) to move`
                    : `${playerName} (${playerNameEn}) to move`;
        }
    };

    const isGameOver =
        gameState.status === 'checkmate' ||
        gameState.status === 'stalemate' ||
        gameState.status === 'draw';
    const _canUndo = gameState.moveHistory.length > 0;

    const currentBoard =
        gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    const title =
        gameMode === 'tutorial'
            ? 'Xiangqi Logic & Tutorials'
            : 'Chinese Chess (象棋)';
    const subtitle =
        gameMode === 'tutorial'
            ? getCurrentDemo().description
            : getStatusMessage();
    const showModeToggle = gameMode === 'tutorial' || !hasGameStarted;

    return (
        <GameScaffold
            title={title}
            subtitle={subtitle}
            titleGradientClassName='bg-gradient-to-r from-red-400 via-yellow-400 to-red-600'
            subtitleClassName='text-purple-100'
            currentMode={gameMode}
            onModeChange={toggleToMode}
            showModeToggle={showModeToggle}
            inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
            aiSettingsButton={
                <AISettingsDialog
                    aiPlayer={aiPlayer}
                    onAIPlayerChange={player =>
                        setAIPlayer(player as 'red' | 'black')
                    }
                    provider={aiConfig.provider}
                    model={aiConfig.model}
                    onProviderChange={provider =>
                        setAIConfig({ ...aiConfig, provider })
                    }
                    onModelChange={model => setAIConfig({ ...aiConfig, model })}
                    aiPlayerOptions={[
                        { value: 'black', label: 'AI plays Black (黑方)' },
                        { value: 'red', label: 'AI plays Red (红方)' },
                    ]}
                    isActive={gameMode === 'ai'}
                    onActivate={() => toggleToMode('ai')}
                />
            }
        >
            {gameMode === 'ai' && (
                <AIStatusPanel
                    aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                    hasGameStarted={hasGameStarted}
                    isAIThinking={isAIThinking}
                    isAIPaused={false}
                    aiError={null}
                    aiDebugMoves={aiDebugMoves}
                    isDebugMode={isDebugMode}
                    onRetry={() => {}}
                />
            )}

            {gameMode === 'tutorial' && (
                <DemoSelector
                    demos={xiangqiDemos}
                    currentDemo={currentDemo}
                    onDemoChange={handleDemoChange}
                />
            )}

            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' ? (
                    <>
                        <AIGameInstructions
                            providerName={aiConfig.provider}
                            modelName={aiConfig.model}
                            aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
                        >
                            <div className='text-xs space-y-1 pt-2'>
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
                        </AIGameInstructions>

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
                                                    ? '红'
                                                    : '黑';
                                            return (
                                                <div
                                                    key={`${moveNum}-${move.from.row}-${move.from.col}`}
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
                    <TutorialInstructions
                        title={getCurrentDemo().title}
                        explanation={getCurrentDemo().explanation}
                        tips={[
                            '"Control the central files - they are key to launching attacks across the river."',
                            '"Protect your palace at all costs - an exposed general is vulnerable to mating attacks."',
                            '"Cannons are powerful when they have platforms - coordinate with other pieces."',
                            '"Advance soldiers across the river to gain lateral movement and attack power."',
                        ]}
                        tipsTitle='Xiangqi Wisdom'
                    />
                )}
            </div>

            <div className='flex justify-center'>
                <GameStartOverlay
                    active={!hasGameStarted && gameMode !== 'tutorial'}
                >
                    <XiangqiBoard
                        board={currentBoard}
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
                        hasGameStarted={hasGameStarted}
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

export default XiangqiGame;
