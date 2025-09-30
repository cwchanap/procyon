import React from 'react';
import GameModeToggle from './GameModeToggle';

type Mode = 'tutorial' | 'ai';

interface GameScaffoldProps {
    title: string;
    subtitle: string;
    titleGradientClassName: string;
    subtitleClassName: string;
    currentMode: Mode;
    onModeChange(mode: Mode): void;
    showModeToggle: boolean;
    inactiveModeClassName: string;
    aiSettingsButton?: React.ReactNode;
    children: React.ReactNode;
}

const GameScaffold: React.FC<GameScaffoldProps> = ({
    title,
    subtitle,
    titleGradientClassName,
    subtitleClassName,
    currentMode,
    onModeChange,
    showModeToggle,
    inactiveModeClassName,
    aiSettingsButton,
    children,
}) => {
    return (
        <div className='flex flex-col items-center gap-6 p-6 max-w-7xl mx-auto'>
            <div className='text-center'>
                <h1
                    className={`text-4xl font-bold ${titleGradientClassName} bg-clip-text text-transparent mb-4`}
                >
                    {title}
                </h1>
                <p className={`text-xl font-medium ${subtitleClassName}`}>
                    {subtitle}
                </p>
            </div>

            {showModeToggle && (
                <GameModeToggle
                    currentMode={currentMode}
                    onChange={onModeChange}
                    inactiveClassName={inactiveModeClassName}
                    aiSettingsButton={aiSettingsButton}
                />
            )}

            {children}
        </div>
    );
};

export default GameScaffold;
