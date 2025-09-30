import React from 'react';
import AIDebugDialog, { type AIMove } from '../ai/AIDebugDialog';

interface AIStatusPanelProps {
    aiConfigured: boolean;
    hasGameStarted: boolean;
    isAIThinking: boolean;
    isAIPaused: boolean;
    aiError: string | null;
    aiDebugMoves: AIMove[];
    isDebugMode: boolean;
    onRetry: () => void;
}

const AIStatusPanel: React.FC<AIStatusPanelProps> = ({
    aiConfigured,
    hasGameStarted,
    isAIThinking,
    isAIPaused,
    aiError,
    aiDebugMoves,
    isDebugMode,
    onRetry,
}) => {
    return (
        <div className='flex flex-col gap-4 max-w-2xl mx-auto'>
            <div className='text-center'>
                {!aiConfigured ? (
                    hasGameStarted && (
                        <div className='text-yellow-400 text-sm'>
                            ⚠ AI not configured - Configure API key in Profile
                            to enable AI gameplay
                        </div>
                    )
                ) : (
                    <>
                        {isAIThinking && !isAIPaused && (
                            <div className='flex items-center justify-center gap-2 text-cyan-200'>
                                <div className='animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full'></div>
                                AI is thinking...
                            </div>
                        )}

                        {aiError && isAIPaused && (
                            <div className='flex flex-col items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg'>
                                <div className='text-red-300 text-center'>
                                    <div className='font-semibold mb-1'>
                                        ❌ AI Error
                                    </div>
                                    <div className='text-sm opacity-90'>
                                        {aiError}
                                    </div>
                                </div>
                                <button
                                    onClick={onRetry}
                                    className='px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium'
                                >
                                    🔄 Retry
                                </button>
                            </div>
                        )}

                        <AIDebugDialog
                            moves={aiDebugMoves}
                            isVisible={isDebugMode}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default AIStatusPanel;
