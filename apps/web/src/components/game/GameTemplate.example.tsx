/**
 * EXAMPLE: Game Component Template
 *
 * This file shows the recommended structure for game components
 * using shared UI components following DRY and KISS principles.
 *
 * Copy this template when creating new game variants.
 */

import React, { useState, useCallback } from 'react';
import GameScaffold from './GameScaffold';
import GameStartOverlay from './GameStartOverlay';
import AIStatusPanel from './AIStatusPanel';
import GameControls from './GameControls';
import DemoSelector from './DemoSelector';
import TutorialInstructions from './TutorialInstructions';
import AIGameInstructions from './AIGameInstructions';
import AISettingsDialog from '../ai/AISettingsDialog';

// Import game-specific types and logic
// import type { GameState, Position, Piece } from '../lib/[game]/types';
// import { createInitialGameState, selectSquare, makeMove } from '../lib/[game]/game';
// import GameBoard from './[Game]Board';

type GameMode = 'tutorial' | 'ai';

const GameTemplate: React.FC = () => {
    // Game state
    const [gameMode, setGameMode] = useState<GameMode>('ai');
    const [gameStarted, setGameStarted] = useState(false);
    // const [gameState, setGameState] = useState<GameState>(createInitialGameState());

    // AI state
    const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
    const [isAIThinking] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isAIPaused, setIsAIPaused] = useState(false);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const [aiDebugMoves] = useState<unknown[]>([]);

    // Tutorial state
    const [currentDemo, setCurrentDemo] = useState('basic-movement');

    // Demo definitions
    const demos = [
        {
            id: 'basic-movement',
            title: 'Basic Movement',
            description: 'Learn how pieces move',
            // board: createCustomBoard('basic'),
            explanation: 'Click pieces to see their moves',
        },
        // Add more demos...
    ];

    // AI Configuration (from shared hook or local state)
    const aiConfig = {
        enabled: true,
        apiKey: 'xxx',
        provider: 'openai' as const,
        model: 'gpt-4',
    };

    // Handlers
    const _handleSquareClick = useCallback((_position: unknown) => {
        // Handle piece selection and moves
    }, []);

    const handleStartOrReset = useCallback(() => {
        if (!gameStarted) {
            setGameStarted(true);
        } else {
            // Reset game
            setGameStarted(false);
        }
    }, [gameStarted]);

    const handleReset = useCallback(() => {
        setGameStarted(false);
    }, []);

    const retryAIMove = useCallback(() => {
        setAiError(null);
        setIsAIPaused(false);
    }, []);

    // Status
    const getStatusMessage = (): string => {
        return 'White to move';
    };

    const isGameOver = false;
    const aiConfigured = aiConfig.enabled && !!aiConfig.apiKey;
    const hasGameStarted = gameStarted;

    // Render
    return (
        <GameScaffold
            title={gameMode === 'tutorial' ? 'Game Tutorials' : 'Game'}
            subtitle={
                gameMode === 'tutorial'
                    ? demos[0].description
                    : getStatusMessage()
            }
            titleGradientClassName='bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300'
            subtitleClassName='text-purple-100'
            currentMode={gameMode}
            onModeChange={setGameMode}
            showModeToggle={gameMode === 'tutorial' || !hasGameStarted}
            inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
            aiSettingsButton={
                <AISettingsDialog
                    aiPlayer={aiPlayer}
                    onAIPlayerChange={player =>
                        setAIPlayer(player as 'white' | 'black')
                    }
                    provider={aiConfig.provider}
                    model={aiConfig.model}
                    onProviderChange={() => {}}
                    onModelChange={() => {}}
                    aiPlayerOptions={[
                        { value: 'black', label: 'AI plays Black' },
                        { value: 'white', label: 'AI plays White' },
                    ]}
                    isActive={gameMode === 'ai'}
                    onActivate={() => setGameMode('ai')}
                />
            }
        >
            {/* ==================== AI MODE WARNING ==================== */}
            {gameMode === 'ai' && !hasGameStarted && !aiConfigured && (
                <div className='text-center text-yellow-400 text-sm'>
                    ⚠ AI not configured - Configure API key in Profile
                </div>
            )}

            {/* ==================== AI STATUS PANEL ==================== */}
            {gameMode === 'ai' && (
                <AIStatusPanel
                    aiConfigured={aiConfigured}
                    hasGameStarted={hasGameStarted}
                    isAIThinking={isAIThinking}
                    isAIPaused={isAIPaused}
                    aiError={aiError}
                    aiDebugMoves={aiDebugMoves}
                    isDebugMode={isDebugMode}
                    onRetry={retryAIMove}
                />
            )}

            {/* ==================== TUTORIAL DEMO SELECTOR ==================== */}
            {gameMode === 'tutorial' && (
                <DemoSelector
                    demos={demos}
                    currentDemo={currentDemo}
                    onDemoChange={setCurrentDemo}
                />
            )}

            {/* ==================== GAME INSTRUCTIONS ==================== */}
            <div className='w-full max-w-4xl mx-auto space-y-6'>
                {gameMode === 'ai' ? (
                    <AIGameInstructions
                        providerName={aiConfig.provider}
                        modelName={aiConfig.model}
                        aiConfigured={aiConfigured}
                    >
                        {/* Game-specific instructions can go here */}
                        <div className='text-xs pt-2'>
                            <p>
                                <strong>Special rules:</strong> Castling, En
                                passant, etc.
                            </p>
                        </div>
                    </AIGameInstructions>
                ) : (
                    <TutorialInstructions
                        title={demos[0].title}
                        explanation={demos[0].explanation}
                        tips={[
                            'Tip 1: Control the center',
                            'Tip 2: Develop pieces early',
                            'Tip 3: Protect your king',
                        ]}
                        tipsTitle='Strategy Tips'
                    />
                )}
            </div>

            {/* ==================== GAME BOARD ==================== */}
            <div className='flex justify-center'>
                <GameStartOverlay
                    active={!hasGameStarted && gameMode !== 'tutorial'}
                >
                    {/* Replace with actual board component */}
                    <div className='w-[640px] h-[640px] bg-gray-800 rounded-lg flex items-center justify-center text-white'>
                        Game Board Goes Here
                    </div>
                </GameStartOverlay>
            </div>

            {/* ==================== GAME CONTROLS ==================== */}
            <div className='w-full max-w-4xl mx-auto'>
                {gameMode === 'ai' && (
                    <GameControls
                        hasGameStarted={hasGameStarted}
                        isGameOver={isGameOver}
                        aiConfigured={aiConfigured}
                        isDebugMode={isDebugMode}
                        canExport={hasGameStarted}
                        onStartOrReset={handleStartOrReset}
                        onReset={handleReset}
                        onToggleDebug={() => setIsDebugMode(!isDebugMode)}
                        onExport={() => {
                            // Export game logic here
                        }}
                    />
                )}
            </div>
        </GameScaffold>
    );
};

export default GameTemplate;
