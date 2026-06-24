import React from 'react';
import type { XiangqiPiece, XiangqiPosition } from '../lib/xiangqi/types';
import {
	XIANGQI_ROWS,
	XIANGQI_COLS,
	XIANGQI_SYMBOLS,
	PALACE_ROWS,
	PALACE_COLS,
} from '../lib/xiangqi/types';

interface XiangqiBoardProps {
	board: (XiangqiPiece | null)[][];
	selectedSquare: XiangqiPosition | null;
	possibleMoves: XiangqiPosition[];
	onSquareClick: (position: XiangqiPosition) => void;
	highlightSquares?: XiangqiPosition[];
}

const XiangqiBoard: React.FC<XiangqiBoardProps> = ({
	board,
	selectedSquare,
	possibleMoves,
	onSquareClick,
	highlightSquares = [],
}) => {
	const isSquareSelected = (row: number, col: number): boolean => {
		return selectedSquare?.row === row && selectedSquare?.col === col;
	};

	const isPossibleMove = (row: number, col: number): boolean => {
		return possibleMoves.some(move => move.row === row && move.col === col);
	};

	const isHighlightedSquare = (row: number, col: number): boolean => {
		return highlightSquares.some(
			square => square.row === row && square.col === col
		);
	};

	const isInPalace = (row: number, col: number): boolean => {
		return (
			(PALACE_ROWS.RED.includes(row) || PALACE_ROWS.BLACK.includes(row)) &&
			PALACE_COLS.includes(col)
		);
	};

	const isRiverLine = (row: number): boolean => {
		return row === 4 || row === 5;
	};

	const getPieceSymbol = (piece: XiangqiPiece | null): string => {
		if (!piece) return '';
		return XIANGQI_SYMBOLS[piece.color][piece.type] || '';
	};

	const renderSquare = (row: number, col: number) => {
		const piece = board[row]?.[col];
		const isSelected = isSquareSelected(row, col);
		const isPossible = isPossibleMove(row, col);
		const isHighlighted = isHighlightedSquare(row, col);
		const inPalace = isInPalace(row, col);
		const onRiver = isRiverLine(row);

		// Nocturne board tones for Xiangqi: #3A211C / #241513
		const baseBg = inPalace
			? 'bg-[#3A211C]'
			: onRiver
				? 'bg-[#2D1A16]'
				: 'bg-[#241513]';

		return (
			<div
				key={`${row}-${col}`}
				className={`
                    w-12 h-12 flex items-center justify-center cursor-pointer relative
                    border border-[#C8402F]/20
                    ${baseBg}
                    ${isSelected ? 'ring-2 ring-xiangqi ring-inset' : ''}
                    ${isHighlighted ? 'ring-2 ring-[#C8A24B]/60 ring-inset' : ''}
                    transition-colors duration-150
                `}
				onClick={() => onSquareClick({ row, col })}
			>
				{/* Grid lines */}
				<div className='absolute inset-0 pointer-events-none'>
					{/* Horizontal line */}
					{col < XIANGQI_COLS - 1 && (
						<div
							className='absolute top-1/2 right-0 w-0 h-0 border-t border-[#C8402F]/50 translate-x-1/2 -translate-y-px'
							style={{ width: '24px' }}
						/>
					)}

					{/* Vertical line */}
					{row < XIANGQI_ROWS - 1 && (
						<div
							className='absolute bottom-0 left-1/2 w-0 h-0 border-l border-[#C8402F]/50 translate-y-1/2 -translate-x-px'
							style={{ height: '24px' }}
						/>
					)}

					{/* Palace diagonal lines */}
					{inPalace && (
						<>
							{/* Top-left to bottom-right diagonal in palace */}
							{((row === 0 && col === 3) ||
								(row === 1 && col === 4) ||
								(row === 8 && col === 4) ||
								(row === 9 && col === 5)) && (
								<div className='absolute top-0 left-0 w-full h-full border-r border-[#C8402F]/40 transform rotate-45 origin-center' />
							)}

							{/* Top-right to bottom-left diagonal in palace */}
							{((row === 0 && col === 5) ||
								(row === 1 && col === 4) ||
								(row === 8 && col === 4) ||
								(row === 9 && col === 3)) && (
								<div className='absolute top-0 right-0 w-full h-full border-l border-[#C8402F]/40 transform -rotate-45 origin-center' />
							)}
						</>
					)}
				</div>

				{/* Possible move indicator */}
				{isPossible && !piece && (
					<div className='w-3 h-3 bg-xiangqi/70 rounded-full' />
				)}

				{/* Piece */}
				{piece && (
					<div className='relative z-10'>
						<div
							className={`
                            w-10 h-10 rounded-full flex items-center justify-center
                            ${
															piece.color === 'red'
																? 'bg-[#C8402F] text-ivory'
																: 'bg-ink-700 border border-line text-ivory'
														}
                            border-2 border-line shadow-lg
                        `}
						>
							<span className='text-sm font-bold select-none'>
								{getPieceSymbol(piece)}
							</span>
						</div>
					</div>
				)}

				{/* Capture indicator */}
				{isPossible && piece && (
					<div className='absolute inset-0 border-4 border-[#C8402F] rounded pointer-events-none' />
				)}

				{/* River indicator */}
				{row === 4 && (
					<div className='absolute bottom-0 left-0 right-0 h-px bg-[#C8402F]/60' />
				)}
				{row === 5 && (
					<div className='absolute top-0 left-0 right-0 h-px bg-[#C8402F]/60' />
				)}
			</div>
		);
	};

	const renderBoard = () => {
		const squares = [];

		for (let row = 0; row < XIANGQI_ROWS; row++) {
			const rowSquares = [];
			for (let col = 0; col < XIANGQI_COLS; col++) {
				rowSquares.push(renderSquare(row, col));
			}
			squares.push(
				<div key={row} className='flex'>
					{rowSquares}
				</div>
			);
		}

		return squares;
	};

	const renderRiverLabel = () => {
		return (
			<div className='absolute left-0 right-0 top-1/2 transform -translate-y-1/2 pointer-events-none'>
				<div className='flex justify-center'>
					<div className='bg-[#C8402F] text-ivory px-3 py-1 rounded-full text-xs font-bold shadow-lg opacity-80'>
						楚河 汉界
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className='relative inline-block border-2 border-line rounded-lg overflow-hidden shadow-2xl bg-ink-800 p-3'>
			<div className='relative rounded overflow-hidden'>
				{renderBoard()}
				{renderRiverLabel()}
			</div>

			{/* Board labels */}
			<div className='absolute -bottom-8 left-4 right-4 flex justify-between text-xs text-ivory-dim font-semibold'>
				<span>红方 (Red)</span>
				<span>黑方 (Black)</span>
			</div>
		</div>
	);
};

export default XiangqiBoard;
