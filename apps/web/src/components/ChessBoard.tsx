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
        return isLight
            ? 'bg-gradient-to-br from-amber-100 to-amber-200 shadow-inner'
            : 'bg-gradient-to-br from-amber-800 to-amber-900 shadow-inner';
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
          w-16 h-16 flex items-center justify-center cursor-pointer relative
          ${squareColor}
          ${isSelected ? 'ring-4 ring-cyan-400 ring-opacity-80 scale-105' : ''}
          ${isPossible ? 'animate-pulse' : ''}
          hover:scale-105 hover:shadow-lg transition-all duration-300
          border border-black border-opacity-10
        `}
                onClick={() => onSquareClick({ row, col })}
            >
                {/* Possible move indicator */}
                {isPossible && !piece && (
                    <div className='w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full opacity-80 animate-bounce shadow-lg' />
                )}

                {/* Piece */}
                {piece && (
                    <span
                        className={`text-4xl select-none transition-all duration-300 hover:scale-110 filter drop-shadow-lg ${
                            piece.color === 'white'
                                ? 'text-white'
                                : 'text-gray-900'
                        }`}
                    >
                        {getPieceSymbol(piece)}
                    </span>
                )}

                {/* Capture indicator */}
                {isPossible && piece && (
                    <div className='absolute inset-0 border-4 border-red-500 rounded pointer-events-none animate-pulse shadow-lg' />
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
        <div className='inline-block border-4 border-amber-900 rounded-xl overflow-hidden shadow-2xl bg-gradient-to-br from-amber-50 to-amber-100 p-2 transform hover:scale-105 transition-all duration-500'>
            <div className='rounded-lg overflow-hidden shadow-inner bg-gradient-to-br from-amber-200 to-amber-300 p-1'>
                {renderBoard()}
            </div>
        </div>
    );
};

export default ChessBoard;
