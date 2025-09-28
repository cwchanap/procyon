import React from 'react';

type Mode = 'tutorial' | 'ai';

interface GameModeToggleProps {
    currentMode: Mode;
    onChange(mode: Mode): void;
    inactiveClassName: string;
    className?: string;
}

const baseButtonClass =
    'glass-effect px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30';

const GameModeToggle: React.FC<GameModeToggleProps> = ({
    currentMode,
    onChange,
    inactiveClassName,
    className = 'flex gap-4',
}) => {
    return (
        <div className={className}>
            <button
                onClick={() => onChange('tutorial')}
                className={`${baseButtonClass} ${
                    currentMode === 'tutorial'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                        : inactiveClassName
                }`}
                type='button'
            >
                📚 Tutorial Mode
            </button>
            <button
                onClick={() => onChange('ai')}
                className={`${baseButtonClass} ${
                    currentMode === 'ai'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                        : inactiveClassName
                }`}
                type='button'
            >
                🤖 AI Mode
            </button>
        </div>
    );
};

export default GameModeToggle;
