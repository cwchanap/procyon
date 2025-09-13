import React from 'react';

const ChessBoardPreview: React.FC = () => {
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
                    fill={isLight ? '#f0d9b5' : '#b58863'}
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
