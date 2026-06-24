import React from 'react';

type Mode = 'tutorial' | 'ai';

interface GameModeToggleProps {
	currentMode: Mode;
	onChange(mode: Mode): void;
	inactiveClassName: string;
	className?: string;
	aiSettingsButton?: React.ReactNode;
}

const baseButtonClass =
	'bg-ink-700 border border-line px-6 py-3 rounded-xl font-medium transition-colors duration-150';

const GameModeToggle: React.FC<GameModeToggleProps> = ({
	currentMode,
	onChange,
	inactiveClassName,
	className = 'flex gap-4',
	aiSettingsButton,
}) => {
	return (
		<div className={className}>
			<button
				onClick={() => onChange('tutorial')}
				className={`${baseButtonClass} ${
					currentMode === 'tutorial'
						? 'bg-brass text-ink-900 border-brass shadow-lg'
						: inactiveClassName
				}`}
				type='button'
			>
				📚 Tutorial Mode
			</button>
			{aiSettingsButton}
		</div>
	);
};

export default GameModeToggle;
