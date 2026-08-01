import React from 'react';
import type { ChessPiece, Position } from '../lib/chess/types';
import { BOARD_SIZE } from '../lib/chess/types';
import { CAPTURE_RING } from '../lib/board-accents';

interface ChessBoardProps {
	board: (ChessPiece | null)[][];
	selectedSquare: Position | null;
	possibleMoves: Position[];
	onSquareClick: (position: Position) => void;
	highlightSquares?: Position[];
	disabled?: boolean;
	orientation?: 'white' | 'black';
}

const ChessBoard: React.FC<ChessBoardProps> = ({
	board,
	selectedSquare,
	possibleMoves,
	onSquareClick,
	highlightSquares = [],
	disabled = false,
	orientation = 'white',
}) => {
	const indices = Array.from({ length: BOARD_SIZE }, (_, index) => index);
	const rowOrder = orientation === 'black' ? [...indices].reverse() : indices;
	const colOrder = orientation === 'black' ? [...indices].reverse() : indices;
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

	const getSquareColor = (row: number, col: number): string => {
		const isLight = (row + col) % 2 === 0;
		// Nocturne board tones: light chess-board, dark chess-deep
		return isLight ? 'bg-chess-board' : 'bg-chess-deep';
	};

	const getPieceSymbol = (piece: ChessPiece | null): string => {
		if (!piece) return '';

		const symbols: Record<string, string> = {
			'white-king': '♔',
			'white-queen': '♕',
			'white-rook': '♖',
			'white-bishop': '♗',
			'white-knight': '♘',
			'white-pawn': '♙',
			'black-king': '♚',
			'black-queen': '♛',
			'black-rook': '♜',
			'black-bishop': '♝',
			'black-knight': '♞',
			'black-pawn': '♟',
		};

		return symbols[`${piece.color}-${piece.type}`] || '';
	};

	const renderSquare = (row: number, col: number) => {
		const piece = board[row]?.[col];
		const isSelected = isSquareSelected(row, col);
		const isPossible = isPossibleMove(row, col);
		const isHighlighted = isHighlightedSquare(row, col);
		const squareColor = getSquareColor(row, col);

		return (
			<button
				type='button'
				key={`${row}-${col}`}
				aria-label={`Square ${row}-${col}`}
				disabled={disabled}
				className={`
          w-16 h-16 flex items-center justify-center cursor-pointer relative p-0
          ${squareColor}
          ${isSelected ? 'ring-2 ring-brass ring-inset' : ''}
          ${isHighlighted ? 'ring-2 ring-chess ring-opacity-60 ring-inset' : ''}
          ${disabled ? 'cursor-not-allowed' : ''}
          transition-colors duration-150
        `}
				onClick={() => onSquareClick({ row, col })}
			>
				{/* Possible move indicator */}
				{isPossible && !piece && (
					<div className='w-4 h-4 bg-brass/70 rounded-full' />
				)}

				{/* Piece */}
				{piece && (
					<span
						className={`text-4xl select-none ${
							piece.color === 'white'
								? 'text-ivory filter drop-shadow-lg'
								: 'text-ink-900 [text-shadow:0_0_2px_rgba(237,230,214,0.9),0_0_1px_rgba(237,230,214,0.9)]'
						}`}
					>
						{getPieceSymbol(piece)}
					</span>
				)}

				{/* Capture indicator */}
				{isPossible && piece && <div className={CAPTURE_RING.chess} />}
			</button>
		);
	};

	const renderBoard = () => {
		return rowOrder.map(row => (
			<div key={row} className='flex'>
				{colOrder.map(col => renderSquare(row, col))}
			</div>
		));
	};

	return (
		<div
			data-testid='chess-board'
			className='inline-block border-2 border-line rounded-lg overflow-hidden shadow-2xl bg-ink-700 p-1'
		>
			<div className='rounded overflow-hidden'>{renderBoard()}</div>
		</div>
	);
};

export default ChessBoard;
