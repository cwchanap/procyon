import React, { useState, useCallback, useEffect } from 'react';
import type { ShogiGameState, ShogiPosition, ShogiPiece } from '../lib/shogi';
import {
    createInitialGameState,
    selectSquare,
    selectHandPiece,
    clearSelection,
    SHOGI_BOARD_SIZE,
    SHOGI_FILES,
    SHOGI_RANKS,
} from '../lib/shogi';
import { createShogiAI, defaultAIConfig } from '../lib/ai';
import type { AIConfig } from '../lib/ai/types';
import ShogiBoard from './ShogiBoard';
import ShogiHand from './ShogiHand';

interface ShogiDemo {
    id: string;
    title: string;
    description: string;
    board: (ShogiPiece | null)[][];
    focusSquare?: ShogiPosition;
    highlightSquares?: ShogiPosition[];
    explanation: string;
}

type ShogiGameMode = 'tutorial' | 'ai';

const ShogiGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<ShogiGameMode>('ai');
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<ShogiGameState>(
        createInitialGameState
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
    const [aiPlayer, setAIPlayer] = useState<'sente' | 'gote'>('gote');
    const [aiConfig] = useState<AIConfig>({
        ...defaultAIConfig,
        gameVariant: 'shogi',
        enabled: true,
    });
    const [aiService] = useState(() => createShogiAI(aiConfig));
    const [isAIThinking, setIsAIThinking] = useState(false);
    const [aiDebugMessages, setAIDebugMessages] = useState<string[]>([]);

    const createCustomShogiBoard = useCallback(
        (setup: string): (ShogiPiece | null)[][] => {
            const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
                .fill(null)
                .map(() => Array(SHOGI_BOARD_SIZE).fill(null));

            switch (setup) {
                case 'lance-moves':
                    board[8][0] = { type: 'lance', color: 'sente' };
                    board[6][0] = { type: 'pawn', color: 'gote' };
                    board[4][0] = { type: 'pawn', color: 'gote' };
                    break;
                case 'gold-silver':
                    board[8][4] = { type: 'king', color: 'sente' };
                    board[8][3] = { type: 'gold', color: 'sente' };
                    board[8][5] = { type: 'silver', color: 'sente' };
                    board[0][4] = { type: 'king', color: 'gote' };
                    break;
                case 'promotion-zone':
                    board[2][4] = { type: 'pawn', color: 'sente' };
                    board[6][4] = { type: 'pawn', color: 'gote' };
                    board[8][4] = { type: 'king', color: 'sente' };
                    board[0][4] = { type: 'king', color: 'gote' };
                    break;
                case 'knight-jump':
                    board[8][1] = { type: 'knight', color: 'sente' };
                    board[7][0] = { type: 'pawn', color: 'sente' };
                    board[6][2] = { type: 'pawn', color: 'gote' };
                    break;
                default:
                    return createInitialGameState().board;
            }

            return board;
        },
        []
    );

    const shogiDemos: ShogiDemo[] = [
        {
            id: 'basic-movement',
            title: 'Basic Piece Movement',
            description:
                'Learn how different Shogi pieces move across the board',
            board: createInitialGameState().board,
            explanation:
                'Click on any piece to see its possible moves. Each piece has unique movement patterns in Shogi.',
        },
        {
            id: 'lance-moves',
            title: 'Lance Forward Movement',
            description:
                'Lances move forward any number of squares but cannot move backward',
            board: createCustomShogiBoard('lance-moves'),
            focusSquare: { row: 8, col: 0 },
            highlightSquares: [
                { row: 7, col: 0 },
                { row: 5, col: 0 },
                { row: 3, col: 0 },
                { row: 2, col: 0 },
                { row: 1, col: 0 },
                { row: 0, col: 0 },
            ],
            explanation:
                'The lance can move forward any number of squares until blocked. It cannot move backward or sideways.',
        },
        {
            id: 'gold-silver',
            title: 'Gold vs Silver Movement',
            description:
                'Gold generals and silver generals have different movement patterns',
            board: createCustomShogiBoard('gold-silver'),
            focusSquare: { row: 8, col: 3 },
            highlightSquares: [
                { row: 7, col: 2 },
                { row: 7, col: 3 },
                { row: 7, col: 4 },
                { row: 8, col: 2 },
                { row: 8, col: 4 },
            ],
            explanation:
                'Gold generals move one square in six directions (not diagonally backward). Silver generals move diagonally and straight forward.',
        },
        {
            id: 'promotion-zone',
            title: 'Promotion Zones',
            description:
                "Pieces can promote when entering the opponent's camp (last 3 rows)",
            board: createCustomShogiBoard('promotion-zone'),
            focusSquare: { row: 2, col: 4 },
            highlightSquares: [
                { row: 0, col: 0 },
                { row: 0, col: 1 },
                { row: 0, col: 2 },
                { row: 0, col: 3 },
                { row: 0, col: 4 },
                { row: 0, col: 5 },
                { row: 0, col: 6 },
                { row: 0, col: 7 },
                { row: 0, col: 8 },
                { row: 1, col: 0 },
                { row: 1, col: 1 },
                { row: 1, col: 2 },
                { row: 1, col: 3 },
                { row: 1, col: 4 },
                { row: 1, col: 5 },
                { row: 1, col: 6 },
                { row: 1, col: 7 },
                { row: 1, col: 8 },
                { row: 2, col: 0 },
                { row: 2, col: 1 },
                { row: 2, col: 2 },
                { row: 2, col: 3 },
                { row: 2, col: 5 },
                { row: 2, col: 6 },
                { row: 2, col: 7 },
                { row: 2, col: 8 },
            ],
            explanation:
                'The highlighted area is the promotion zone for Sente (bottom player). When pieces enter this zone, they can promote to become stronger.',
        },
        {
            id: 'knight-jump',
            title: 'Knight L-shaped Jump',
            description:
                'Knights jump in an L-shape: two squares forward, one square left or right',
            board: createCustomShogiBoard('knight-jump'),
            focusSquare: { row: 8, col: 1 },
            highlightSquares: [
                { row: 6, col: 0 },
                { row: 6, col: 2 },
            ],
            explanation:
                'The knight jumps over pieces in an L-shape. It can only move two squares forward and one square sideways.',
        },
    ];

    const getCurrentDemo = useCallback((): ShogiDemo => {
        return (
            shogiDemos.find(demo => demo.id === currentDemo) || shogiDemos[0]
        );
    }, [currentDemo, shogiDemos]);

    // AI setup and debug callback
    useEffect(() => {
        aiService.setDebugCallback((type, message, _data) => {
            setAIDebugMessages(prev => [
                ...prev.slice(-4),
                `[${type}] ${message}`,
            ]);
        });
        aiService.updateConfig(aiConfig);
    }, [aiService, aiConfig]);

    // AI move handling
    useEffect(() => {
        if (
            gameMode === 'ai' &&
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
                        if (aiResponse.move.from === '*') {
                            // Drop move
                            const _toPos = algebraicToPosition(
                                aiResponse.move.to
                            );
                            // TODO: Implement drop move logic
                            // console.log('AI drop move:', aiResponse.move.to);
                        } else {
                            // Regular move
                            const fromPos = algebraicToPosition(
                                aiResponse.move.from
                            );
                            const toPos = algebraicToPosition(
                                aiResponse.move.to
                            );

                            // Apply the move using shogi game logic
                            const moveResult = selectSquare(gameState, fromPos);
                            if (moveResult.selectedSquare) {
                                const finalResult = selectSquare(
                                    moveResult,
                                    toPos
                                );
                                setGameState(finalResult);
                            }
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
    }, [gameState, gameMode, aiPlayer, aiService, isAIThinking]);

    const algebraicToPosition = useCallback(
        (algebraic: string): ShogiPosition => {
            const file = algebraic[0];
            const rank = algebraic[1];
            return {
                col: SHOGI_FILES.indexOf(file),
                row: SHOGI_RANKS.indexOf(rank),
            };
        },
        []
    );

    const handleSquareClick = useCallback(
        (position: ShogiPosition) => {
            if (gameMode === 'tutorial') {
                const demo = getCurrentDemo();
                const piece = demo.board[position.row]?.[position.col];

                if (piece) {
                    // Simple tutorial moves for demonstration
                    let possibleMoves: ShogiPosition[] = [];
                    if (piece.type === 'pawn') {
                        const direction = piece.color === 'sente' ? -1 : 1;
                        const targetRow = position.row + direction;
                        if (
                            targetRow >= 0 &&
                            targetRow < SHOGI_BOARD_SIZE &&
                            !demo.board[targetRow][position.col]
                        ) {
                            possibleMoves = [
                                { row: targetRow, col: position.col },
                            ];
                        }
                    }
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
        setGameStarted(false);
    }, []);

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

    const toggleToMode = useCallback(
        (newMode: ShogiGameMode) => {
            setGameMode(newMode);
            setGameStarted(false);
            setIsAIThinking(false);
            setAIDebugMessages([]);

            if (newMode === 'tutorial') {
                const demo = getCurrentDemo();
                setGameState({
                    board: demo.board,
                    currentPlayer: 'sente',
                    status: 'playing',
                    moveHistory: [],
                    selectedSquare: null,
                    possibleMoves: [],
                    senteHand: [],
                    goteHand: [],
                    selectedHandPiece: null,
                });
            } else {
                setGameState(createInitialGameState());
            }
        },
        [getCurrentDemo]
    );

    const handleDemoChange = useCallback(
        (demoId: string) => {
            setCurrentDemo(demoId);
            const demo = shogiDemos.find(d => d.id === demoId);
            if (demo) {
                setGameState(prev => ({
                    ...prev,
                    board: demo.board,
                    selectedSquare: null,
                    possibleMoves: [],
                }));
            }
        },
        [shogiDemos]
    );

    const clearCurrentSelection = useCallback(() => {
        const newGameState = clearSelection(gameState);
        setGameState(newGameState);
    }, [gameState]);

    const getStatusMessage = (): string => {
        const playerName =
            gameState.currentPlayer === 'sente' ? '先手' : '後手';

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
                return `Checkmate! ${gameState.currentPlayer === 'sente' ? '後手' : '先手'} wins!`;
            case 'draw':
                return 'The game is a draw.';
            default:
                return gameMode === 'ai'
                    ? `${playerType} ${playerName} to move`
                    : `${playerName} to move`;
        }
    };

    const isGameOver =
        gameState.status === 'checkmate' || gameState.status === 'draw';

    const currentBoard =
        gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    return (
        <div className='flex flex-col items-center gap-6 p-6 max-w-7xl mx-auto'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent mb-4'>
                    {gameMode === 'tutorial'
                        ? 'Shogi Logic & Tutorials'
                        : '将棋 (Shogi)'}
                </h1>
                <p className='text-xl text-orange-100 font-medium'>
                    {gameMode === 'tutorial'
                        ? getCurrentDemo().description
                        : getStatusMessage()}
                </p>
            </div>

            {/* Mode Toggle - Hide after game starts (except in tutorial mode) */}
            {(gameMode === 'tutorial' || !hasGameStarted) && (
                <div className='flex gap-4'>
                    <button
                        onClick={() => toggleToMode('tutorial')}
                        className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                            gameMode === 'tutorial'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                                : 'text-orange-100 hover:bg-white hover:bg-opacity-20'
                        }`}
                    >
                        📚 Tutorial Mode
                    </button>
                    <button
                        onClick={() => toggleToMode('ai')}
                        className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                            gameMode === 'ai'
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                                : 'text-orange-100 hover:bg-white hover:bg-opacity-20'
                        }`}
                    >
                        🤖 AI Mode
                    </button>
                </div>
            )}

            {/* AI Controls */}
            {gameMode === 'ai' && (
                <div className='flex flex-col gap-4 max-w-2xl mx-auto'>
                    <div className='flex gap-4 justify-center'>
                        <select
                            value={aiPlayer}
                            onChange={e =>
                                setAIPlayer(e.target.value as 'sente' | 'gote')
                            }
                            className='glass-effect px-4 py-2 rounded-xl text-white bg-black bg-opacity-30 border border-white border-opacity-20'
                        >
                            <option value='gote'>AI plays Gote (後手)</option>
                            <option value='sente'>AI plays Sente (先手)</option>
                        </select>
                    </div>

                    {/* AI Status */}
                    <div className='text-center'>
                        {isAIThinking && (
                            <div className='flex items-center justify-center gap-2 text-cyan-200'>
                                <div className='animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full'></div>
                                AI is thinking...
                            </div>
                        )}

                        {/* Debug Messages */}
                        {aiConfig.debug && aiDebugMessages.length > 0 && (
                            <div className='mt-4 p-4 bg-black bg-opacity-40 rounded-xl border border-white border-opacity-10'>
                                <h4 className='text-sm font-semibold text-cyan-200 mb-2'>
                                    AI Debug:
                                </h4>
                                {aiDebugMessages.map((msg, idx) => (
                                    <div
                                        key={idx}
                                        className='text-xs text-gray-300 font-mono'
                                    >
                                        {msg}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tutorial Demo Selector */}
            {gameMode === 'tutorial' && (
                <div className='flex flex-wrap gap-3 justify-center max-w-4xl'>
                    {shogiDemos.map(demoItem => (
                        <button
                            key={demoItem.id}
                            onClick={() => handleDemoChange(demoItem.id)}
                            className={`glass-effect px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                                currentDemo === demoItem.id
                                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                                    : 'text-orange-100 hover:bg-white hover:bg-opacity-20'
                            }`}
                        >
                            {demoItem.title}
                        </button>
                    ))}
                </div>
            )}

            {/* Shogi Board and Game Layout - Always visible but input blocked before game start */}
            <>
                {gameMode === 'ai' ? (
                    // AI Mode Layout
                    <div
                        className={`relative ${!hasGameStarted && gameMode !== 'tutorial' ? 'opacity-75' : ''}`}
                    >
                        <div className='flex gap-8 items-start'>
                            {/* Gote Hand */}
                            <div className='flex flex-col gap-4'>
                                <ShogiHand
                                    pieces={gameState.goteHand}
                                    color='gote'
                                    selectedPiece={gameState.selectedHandPiece}
                                    onPieceClick={
                                        hasGameStarted ||
                                        gameMode === 'tutorial'
                                            ? handleHandPieceClick
                                            : () => {}
                                    }
                                />
                            </div>

                            {/* Board */}
                            <ShogiBoard
                                board={currentBoard}
                                selectedSquare={gameState.selectedSquare}
                                possibleMoves={gameState.possibleMoves}
                                onSquareClick={
                                    hasGameStarted || gameMode === 'tutorial'
                                        ? handleSquareClick
                                        : () => {}
                                }
                                highlightSquares={currentHighlightSquares}
                            />

                            {/* Sente Hand */}
                            <div className='flex flex-col gap-4'>
                                <ShogiHand
                                    pieces={gameState.senteHand}
                                    color='sente'
                                    selectedPiece={gameState.selectedHandPiece}
                                    onPieceClick={
                                        hasGameStarted ||
                                        gameMode === 'tutorial'
                                            ? handleHandPieceClick
                                            : () => {}
                                    }
                                />
                            </div>
                        </div>
                        {!hasGameStarted && gameMode !== 'tutorial' && (
                            <div className='absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg'>
                                <div className='bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium'>
                                    Click "Start" to begin playing
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Tutorial Mode Layout - Centered Board
                    <div className='flex justify-center'>
                        <ShogiBoard
                            board={currentBoard}
                            selectedSquare={gameState.selectedSquare}
                            possibleMoves={gameState.possibleMoves}
                            onSquareClick={handleSquareClick}
                            highlightSquares={currentHighlightSquares}
                        />
                    </div>
                )}
            </>

            {/* Content Panel - Below Board */}
            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' ? (
                    // AI Mode Controls
                    <>
                        <div className='flex gap-4 justify-center'>
                            <button
                                onClick={clearCurrentSelection}
                                className='glass-effect px-4 py-2 text-white font-semibold rounded-lg hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                            >
                                ❌ Clear Selection
                            </button>

                            <button
                                onClick={handleStartOrReset}
                                className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
                            >
                                {hasGameStarted ? '🆕 New Game' : '▶️ Start'}
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

                        <div className='text-sm text-orange-200 text-center max-w-2xl mx-auto space-y-2 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
                            <p className='flex items-center justify-center gap-2'>
                                <span>🖱️</span>
                                Click on a piece to select it, then click on a
                                highlighted square to move.
                            </p>
                            <p className='flex items-center justify-center gap-2'>
                                <span>✋</span>
                                Click on pieces in your hand to drop them on the
                                board.
                            </p>
                            <p className='flex items-center justify-center gap-2'>
                                <span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
                                Possible moves
                                <span className='mx-2'>•</span>
                                <span className='w-3 h-3 border-2 border-red-500 rounded inline-block'></span>
                                Captures
                            </p>
                            <p className='text-xs text-orange-300'>
                                先手 (Sente) plays first and pieces point
                                upward. 後手 (Gote) pieces are rotated and point
                                downward.
                            </p>
                        </div>
                    </>
                ) : (
                    // Tutorial Mode Content
                    <>
                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h2 className='text-2xl font-bold text-white mb-3'>
                                {getCurrentDemo().title}
                            </h2>
                            <div className='bg-black bg-opacity-30 p-4 rounded-xl border border-orange-500 border-opacity-30'>
                                <p className='text-orange-200 leading-relaxed'>
                                    {getCurrentDemo().explanation}
                                </p>
                            </div>
                        </div>

                        <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                            <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                                <span>🎯</span>
                                How to Use This Demo
                            </h3>
                            <div className='space-y-3 text-orange-200'>
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
                                Shogi Wisdom
                            </h3>
                            <div className='space-y-2 text-orange-200 text-sm'>
                                <p>
                                    "Promotion is key - advance your pieces to
                                    gain strength in the enemy camp."
                                </p>
                                <p>
                                    "The drop rule makes Shogi unique - captured
                                    pieces join your army."
                                </p>
                                <p>
                                    "Protect your king while building attacking
                                    formations with gold and silver."
                                </p>
                                <p>
                                    "Lance and knight are powerful but
                                    vulnerable - support them well."
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ShogiGame;
