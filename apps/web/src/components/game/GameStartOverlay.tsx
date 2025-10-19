import React from 'react';

interface GameStartOverlayProps {
	active: boolean;
	message?: string;
	children: React.ReactNode;
}

const GameStartOverlay: React.FC<GameStartOverlayProps> = ({
	active,
	message = 'Click "Start" to begin playing',
	children,
}) => {
	return (
		<div className={`relative ${active ? 'opacity-75' : ''}`}>
			{children}
			{active && (
				<div className='absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg'>
					<div className='bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium'>
						{message}
					</div>
				</div>
			)}
		</div>
	);
};

export default GameStartOverlay;
