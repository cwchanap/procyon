import React from 'react';

const AeroplaneBoardPreview: React.FC = () => {
	const boardSize = 8;
	const squareSize = 20;
	const squares = [];

	for (let row = 0; row < boardSize; row++) {
		for (let col = 0; col < boardSize; col++) {
			const isLight = (row + col) % 2 === 0;
			squares.push(
				<rect
					key={`${row}-${col}`}
					x={col * squareSize}
					y={row * squareSize}
					width={squareSize}
					height={squareSize}
					fill={isLight ? '#263E5D' : '#17263A'}
				/>
			);
		}
	}

	return (
		<svg
			width={boardSize * squareSize}
			height={boardSize * squareSize}
			viewBox={`0 0 ${boardSize * squareSize} ${boardSize * squareSize}`}
			role='img'
			aria-label='Aeroplane Chess board preview'
		>
			{squares}
			<path
				d='M80 35l8 17 17 8-17 8-8 17-8-17-17-8 17-8z'
				fill='#4F8FD8'
				opacity='0.9'
			/>
		</svg>
	);
};

export default AeroplaneBoardPreview;
