import React from 'react';
import type { ChessPiece, Position } from '../lib/chess/types';
import { BOARD_SIZE } from '../lib/chess/types';

interface ChessBoardProps {
    board: (ChessPiece | null)[][];
    selectedSquare: Position | null;
    possibleMoves: Position[];
    onSquareClick: (position: Position) => void;
}

const ChessBoard: React.FC<ChessBoardProps> = ({
    board,
    selectedSquare,
    possibleMoves,
    onSquareClick,
}) => {
    const isSquareSelected = (row: number, col: number): boolean => {
        return selectedSquare?.row === row && selectedSquare?.col === col;
    };

    const isPossibleMove = (row: number, col: number): boolean => {
        return possibleMoves.some(move => move.row === row && move.col === col);
    };

    const getSquareColor = (row: number, col: number): string => {
        const isLight = (row + col) % 2 === 0;
        return isLight ? 'bg-amber-100' : 'bg-amber-800';
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
        const squareColor = getSquareColor(row, col);

        return (
            <div
                key={`${row}-${col}`}
                className={`
          w-12 h-12 flex items-center justify-center cursor-pointer relative
          ${squareColor}
          ${isSelected ? 'ring-4 ring-blue-500' : ''}
          hover:brightness-110 transition-all
        `}
                onClick={() => onSquareClick({ row, col })}
            >
                {/* Possible move indicator */}
                {isPossible && !piece && (
                    <div className='w-3 h-3 bg-green-500 rounded-full opacity-70' />
                )}

                {/* Piece */}
                {piece && (
                    <span className='text-3xl select-none'>
                        {getPieceSymbol(piece)}
                    </span>
                )}

                {/* Capture indicator */}
                {isPossible && piece && (
                    <div className='absolute inset-0 border-4 border-red-500 rounded pointer-events-none' />
                )}
            </div>
        );
    };

    const renderBoard = () => {
        const squares = [];

        for (let row = 0; row < BOARD_SIZE; row++) {
            const rowSquares = [];
            for (let col = 0; col < BOARD_SIZE; col++) {
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
        <div className='inline-block border-4 border-amber-900 rounded-lg overflow-hidden shadow-lg'>
            {renderBoard()}
        </div>
    );
};

export default ChessBoard;
