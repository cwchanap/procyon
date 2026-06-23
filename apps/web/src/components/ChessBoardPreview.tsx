import React from 'react';

type Variant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';

const PALETTE: Record<Variant, { light: string; dark: string }> = {
	chess: { light: '#2A2620', dark: '#1C1916' },
	xiangqi: { light: '#3A211C', dark: '#241513' },
	shogi: { light: '#23283A', dark: '#181B26' },
	jungle: { light: '#1F3029', dark: '#15211C' },
};

const ChessBoardPreview: React.FC<{ variant?: Variant }> = ({
	variant = 'chess',
}) => {
	const boardSize = 8;
	const squareSize = 20;
	const { light, dark } = PALETTE[variant];

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
					fill={isLight ? light : dark}
				/>
			);
		}
	}

	return (
		<svg
			width={boardSize * squareSize}
			height={boardSize * squareSize}
			viewBox={`0 0 ${boardSize * squareSize} ${boardSize * squareSize}`}
		>
			{squares}
		</svg>
	);
};

export default ChessBoardPreview;
