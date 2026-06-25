import React from 'react';
import type {
	JunglePiece,
	JunglePosition,
	JungleTerrain,
} from '../lib/jungle/types';
import {
	JUNGLE_SYMBOLS,
	JUNGLE_FILES,
	JUNGLE_RANKS,
} from '../lib/jungle/types';

interface JungleBoardProps {
	board: (JunglePiece | null)[][];
	terrain: JungleTerrain[][];
	selectedSquare: JunglePosition | null;
	possibleMoves: JunglePosition[];
	onSquareClick: (position: JunglePosition) => void;
	highlightSquares?: JunglePosition[];
}

const JungleBoard: React.FC<JungleBoardProps> = ({
	board,
	terrain,
	selectedSquare,
	possibleMoves,
	onSquareClick,
	highlightSquares = [],
}) => {
	const getTerrainColor = (terrain: JungleTerrain): string => {
		switch (terrain.type) {
			case 'water':
				return 'bg-jungle-water border-shogi/40';
			case 'trap':
				return terrain.owner === 'red'
					? 'bg-xiangqi/15 border-xiangqi/40'
					: 'bg-shogi/15 border-shogi/40';
			case 'den':
				return terrain.owner === 'red'
					? 'bg-xiangqi/25 border-xiangqi/60'
					: 'bg-shogi/25 border-shogi/60';
			default:
				return 'bg-jungle-den border-jungle/30';
		}
	};

	const getPieceDisplay = (piece: JunglePiece): string => {
		return JUNGLE_SYMBOLS[piece.color][piece.type];
	};

	const getPieceColor = (piece: JunglePiece): string => {
		return piece.color === 'red' ? 'text-xiangqi-light' : 'text-shogi-light';
	};

	const isSelected = (row: number, col: number): boolean => {
		return (
			selectedSquare !== null &&
			selectedSquare.row === row &&
			selectedSquare.col === col
		);
	};

	const isPossibleMove = (row: number, col: number): boolean => {
		return possibleMoves.some(move => move.row === row && move.col === col);
	};

	const isHighlighted = (row: number, col: number): boolean => {
		return highlightSquares.some(
			square => square.row === row && square.col === col
		);
	};

	const getSquareClasses = (row: number, col: number): string => {
		const terrainData = terrain[row]![col];
		if (!terrainData) return 'w-16 h-16 border-2 border-line';

		const baseClasses = `
            w-16 h-16 border-2 flex items-center justify-center text-2xl font-bold
            cursor-pointer transition-all duration-200 relative p-0
            ${getTerrainColor(terrainData)}
        `;

		if (isSelected(row, col)) {
			return `${baseClasses} ring-4 ring-brass ring-opacity-75 z-10`;
		}

		if (isPossibleMove(row, col)) {
			return `${baseClasses} ring-2 ring-jungle ring-opacity-75`;
		}

		if (isHighlighted(row, col)) {
			return `${baseClasses} ring-2 ring-shogi ring-opacity-75`;
		}

		return baseClasses;
	};

	const getTerrainSymbol = (terrain: JungleTerrain): string => {
		switch (terrain.type) {
			case 'water':
				return '〜';
			case 'trap':
				return '△';
			case 'den':
				return '◆';
			default:
				return '';
		}
	};

	const getTerrainSymbolColor = (terrain: JungleTerrain): string => {
		switch (terrain.type) {
			case 'water':
				return 'text-shogi-light/30';
			case 'trap':
				return terrain.owner === 'red'
					? 'text-xiangqi-light/40'
					: 'text-shogi-light/40';
			case 'den':
				return terrain.owner === 'red'
					? 'text-xiangqi-light/50'
					: 'text-shogi-light/50';
			default:
				return '';
		}
	};

	return (
		<div className='flex flex-col items-center space-y-2'>
			{/* Column labels */}
			<div className='flex space-x-1 ml-8'>
				{JUNGLE_FILES.map((file, index) => (
					<div
						key={index}
						className='w-16 h-6 flex items-center justify-center text-sm font-semibold text-ivory-dim'
					>
						{file}
					</div>
				))}
			</div>

			{/* Board */}
			<div className='flex space-x-1'>
				{/* Row labels */}
				<div className='flex flex-col space-y-1 mr-2'>
					{JUNGLE_RANKS.map((rank, index) => (
						<div
							key={index}
							className='w-6 h-16 flex items-center justify-center text-sm font-semibold text-ivory-dim'
						>
							{rank}
						</div>
					))}
				</div>

				{/* Squares */}
				<div className='flex flex-col space-y-1'>
					{board.map((row, rowIndex) => (
						<div key={rowIndex} className='flex space-x-1'>
							{row.map((piece, colIndex) => {
								const terrainData = terrain[rowIndex]![colIndex];
								return (
									<button
										type='button'
										key={`${rowIndex}-${colIndex}`}
										aria-label={`Square ${rowIndex}-${colIndex}`}
										className={getSquareClasses(rowIndex, colIndex)}
										onClick={() =>
											onSquareClick({
												row: rowIndex,
												col: colIndex,
											})
										}
									>
										{/* Terrain symbol */}
										{terrainData && (
											<span
												className={`absolute text-xs ${getTerrainSymbolColor(terrainData)}`}
											>
												{getTerrainSymbol(terrainData)}
											</span>
										)}

										{/* Piece */}
										{piece && (
											<span className={`relative z-5 ${getPieceColor(piece)}`}>
												{getPieceDisplay(piece)}
											</span>
										)}

										{/* Possible move indicator */}
										{isPossibleMove(rowIndex, colIndex) && !piece && (
											<div className='absolute w-3 h-3 bg-jungle rounded-full opacity-75'></div>
										)}

										{/* Capture indicator */}
										{isPossibleMove(rowIndex, colIndex) && piece && (
											<div className='absolute inset-0 border-2 border-xiangqi rounded'></div>
										)}
									</button>
								);
							})}
						</div>
					))}
				</div>
			</div>

			{/* Legend */}
			<div className='mt-4 p-4 bg-ink-700 border border-line rounded-lg max-w-2xl'>
				<h3 className='text-sm font-semibold mb-2 text-ivory'>
					Terrain Legend:
				</h3>
				<div className='grid grid-cols-2 gap-2 text-xs text-ivory-dim'>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-jungle-den border border-jungle/30'></div>
						<span>Normal Land</span>
					</div>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-jungle-water border border-shogi/40'></div>
						<span>Water (only rats can enter)</span>
					</div>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-xiangqi/15 border border-xiangqi/40'></div>
						<span>Red Trap</span>
					</div>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-shogi/15 border border-shogi/40'></div>
						<span>Blue Trap</span>
					</div>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-xiangqi/25 border border-xiangqi/60'></div>
						<span>Red Den</span>
					</div>
					<div className='flex items-center space-x-2'>
						<div className='w-4 h-4 bg-shogi/25 border border-shogi/60'></div>
						<span>Blue Den</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default JungleBoard;
