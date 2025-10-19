import React from 'react';
import type { ShogiPiece, ShogiPosition } from '../lib/shogi';
import { SHOGI_BOARD_SIZE, PIECE_UNICODE } from '../lib/shogi';

interface ShogiBoardProps {
	board: (ShogiPiece | null)[][];
	selectedSquare: ShogiPosition | null;
	possibleMoves: ShogiPosition[];
	onSquareClick: (position: ShogiPosition) => void;
	highlightSquares?: ShogiPosition[];
}

const ShogiBoard: React.FC<ShogiBoardProps> = ({
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

	const getSquareColor = (_row: number, _col: number): string => {
		return 'bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-600';
	};

	const getPieceDisplay = (piece: ShogiPiece | null): string => {
		if (!piece) return '';
		return PIECE_UNICODE[piece.type][piece.color];
	};

	const renderPromotionZone = (row: number): boolean => {
		return row <= 2 || row >= 6;
	};

	const renderSquare = (row: number, col: number) => {
		const piece = board[row]?.[col];
		const isSelected = isSquareSelected(row, col);
		const isPossible = isPossibleMove(row, col);
		const isHighlighted = isHighlightedSquare(row, col);
		const squareColor = getSquareColor(row, col);
		const isPromotionZone = renderPromotionZone(row);

		return (
			<div
				key={`${row}-${col}`}
				className={`
          w-12 h-12 flex items-center justify-center cursor-pointer relative text-xs
          ${squareColor}
          ${isSelected ? 'ring-4 ring-red-400 ring-opacity-80 scale-105' : ''}
          ${isHighlighted ? 'ring-4 ring-yellow-400 ring-opacity-60' : ''}
          ${isPossible ? 'animate-pulse bg-green-200' : ''}
          ${isPromotionZone ? 'bg-gradient-to-br from-orange-50 to-orange-100' : ''}
          hover:scale-105 hover:shadow-md transition-all duration-200
        `}
				onClick={() => onSquareClick({ row, col })}
			>
				{/* Possible move indicator */}
				{isPossible && !piece && (
					<div className='w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full opacity-80 animate-bounce shadow-sm' />
				)}

				{/* Piece */}
				{piece && (
					<div
						className={`flex flex-col items-center justify-center select-none transition-all duration-200 hover:scale-110 ${
							piece.color === 'sente' ? 'text-black' : 'text-red-700 rotate-180'
						}`}
					>
						<span className='text-lg font-bold leading-none'>
							{getPieceDisplay(piece)}
						</span>
					</div>
				)}

				{/* Capture indicator */}
				{isPossible && piece && (
					<div className='absolute inset-0 border-2 border-red-500 rounded pointer-events-none animate-pulse' />
				)}

				{/* File and Rank labels */}
				{row === 0 && (
					<div className='absolute -top-5 text-xs font-bold text-gray-600'>
						{9 - col}
					</div>
				)}
				{col === 8 && (
					<div className='absolute -right-5 text-xs font-bold text-gray-600'>
						{String.fromCharCode(97 + row)}
					</div>
				)}
			</div>
		);
	};

	const renderBoard = () => {
		const squares = [];

		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			const rowSquares = [];
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
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

	return (
		<div className='flex flex-col items-center'>
			<div className='mb-2 text-sm font-bold text-red-700'>後手 (Gote)</div>
			<div className='inline-block border-2 border-yellow-800 rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-yellow-100 to-yellow-200 p-2'>
				<div className='rounded overflow-hidden shadow-inner bg-gradient-to-br from-yellow-50 to-yellow-100'>
					{renderBoard()}
				</div>
			</div>
			<div className='mt-2 text-sm font-bold text-black'>先手 (Sente)</div>
		</div>
	);
};

export default ShogiBoard;
