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
		// Nocturne board tones for Shogi: #23283A / #181B26
		// Use alternating tones for promotion zone vs regular zone
		return 'bg-[#23283A] border border-[#3E5C8A]/40';
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
			<button
				type='button'
				key={`${row}-${col}`}
				aria-label={`Square ${row}-${col}`}
				className={`
          w-12 h-12 flex items-center justify-center cursor-pointer relative text-xs p-0
          ${squareColor}
          ${isSelected ? 'ring-2 ring-shogi ring-inset' : ''}
          ${isHighlighted ? 'ring-2 ring-[#3E5C8A]/80 ring-inset' : ''}
          ${isPossible ? 'bg-[#3E5C8A]/20' : ''}
          ${isPromotionZone ? 'bg-[#181B26]' : ''}
          transition-colors duration-150
        `}
				onClick={() => onSquareClick({ row, col })}
			>
				{/* Possible move indicator */}
				{isPossible && !piece && (
					<div className='w-3 h-3 bg-shogi/70 rounded-full' />
				)}

				{/* Piece */}
				{piece && (
					<div
						className={`flex flex-col items-center justify-center select-none ${
							piece.color === 'sente'
								? 'text-ivory'
								: 'text-[#C8402F] rotate-180'
						}`}
					>
						<span className='text-lg font-bold leading-none'>
							{getPieceDisplay(piece)}
						</span>
					</div>
				)}

				{/* Capture indicator */}
				{isPossible && piece && (
					<div className='absolute inset-0 border-2 border-[#C8402F] rounded pointer-events-none' />
				)}

				{/* File and Rank labels */}
				{row === 0 && (
					<div className='absolute -top-5 text-xs font-bold font-mono text-ivory-dim'>
						{9 - col}
					</div>
				)}
				{col === 8 && (
					<div className='absolute -right-5 text-xs font-bold font-mono text-ivory-dim'>
						{String.fromCharCode(97 + row)}
					</div>
				)}
			</button>
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
			<div className='mb-2 text-sm font-bold text-[#C8402F]'>後手 (Gote)</div>
			<div className='inline-block border-2 border-line rounded-lg overflow-hidden shadow-lg bg-ink-800 p-1'>
				<div className='rounded overflow-hidden'>{renderBoard()}</div>
			</div>
			<div className='mt-2 text-sm font-bold text-ivory'>先手 (Sente)</div>
		</div>
	);
};

export default ShogiBoard;
