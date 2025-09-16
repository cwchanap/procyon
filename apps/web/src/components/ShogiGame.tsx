import React, { useState, useCallback } from 'react';
import type { ShogiGameState, ShogiPosition, ShogiPiece } from '../lib/shogi';
import {
    createInitialGameState,
    selectSquare,
    selectHandPiece,
    clearSelection,
    SHOGI_BOARD_SIZE,
} from '../lib/shogi';
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

type ShogiGameMode = 'play' | 'tutorial';

const ShogiGame: React.FC = () => {
    const [gameMode, setGameMode] = useState<ShogiGameMode>('play');
    const [gameState, setGameState] = useState<ShogiGameState>(
        createInitialGameState
    );
    const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');

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
            } else {
                const newGameState = selectSquare(gameState, position);
                setGameState(newGameState);
            }
        },
        [gameMode, gameState, getCurrentDemo]
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

    const toggleMode = useCallback(() => {
        const newMode = gameMode === 'play' ? 'tutorial' : 'play';
        setGameMode(newMode);

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
    }, [gameMode, getCurrentDemo]);

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

    const currentBoard =
        gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
    const currentHighlightSquares =
        gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

    return (
        <div className='flex flex-col items-center gap-6 p-6 max-w-7xl mx-auto'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent mb-4'>
                    {gameMode === 'play'
                        ? '将棋 (Shogi)'
                        : 'Shogi Logic & Tutorials'}
                </h1>
                <p className='text-xl text-orange-100 font-medium'>
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
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                            : 'text-orange-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    🎮 Play Mode
                </button>
                <button
                    onClick={toggleMode}
                    className={`glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
                        gameMode === 'tutorial'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                            : 'text-orange-100 hover:bg-white hover:bg-opacity-20'
                    }`}
                >
                    📚 Tutorial Mode
                </button>
            </div>

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

            {gameMode === 'play' ? (
                // Play Mode Layout
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
                        board={currentBoard}
                        selectedSquare={gameState.selectedSquare}
                        possibleMoves={gameState.possibleMoves}
                        onSquareClick={handleSquareClick}
                        highlightSquares={currentHighlightSquares}
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

            {/* Content Panel - Below Board */}
            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'play' ? (
                    // Play Mode Controls
                    <>
                        <div className='flex gap-4 justify-center'>
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
