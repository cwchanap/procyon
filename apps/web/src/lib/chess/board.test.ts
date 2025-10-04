import { test, expect, describe } from 'bun:test';
import {
    createInitialBoard,
    isValidPosition,
    getPieceAt,
    setPieceAt,
    isSquareEmpty,
    isSquareOccupiedByOpponent,
    isSquareOccupiedByAlly,
    copyBoard,
    positionToAlgebraic,
    algebraicToPosition,
} from './board';
import type { ChessPiece, Position } from './types';

describe('Chess Board Utilities', () => {
    describe('createInitialBoard', () => {
        test('should create an 8x8 board', () => {
            const board = createInitialBoard();
            expect(board.length).toBe(8);
            expect(board[0]?.length).toBe(8);
        });

        test('should place white pawns on row 6', () => {
            const board = createInitialBoard();
            for (let col = 0; col < 8; col++) {
                const piece = board[6]?.[col];
                expect(piece).not.toBe(null);
                expect(piece?.type).toBe('pawn');
                expect(piece?.color).toBe('white');
            }
        });

        test('should place black pawns on row 1', () => {
            const board = createInitialBoard();
            for (let col = 0; col < 8; col++) {
                const piece = board[1]?.[col];
                expect(piece).not.toBe(null);
                expect(piece?.type).toBe('pawn');
                expect(piece?.color).toBe('black');
            }
        });

        test('should place white pieces correctly on row 7', () => {
            const board = createInitialBoard();
            expect(board[7]?.[0]?.type).toBe('rook');
            expect(board[7]?.[1]?.type).toBe('knight');
            expect(board[7]?.[2]?.type).toBe('bishop');
            expect(board[7]?.[3]?.type).toBe('queen');
            expect(board[7]?.[4]?.type).toBe('king');
            expect(board[7]?.[5]?.type).toBe('bishop');
            expect(board[7]?.[6]?.type).toBe('knight');
            expect(board[7]?.[7]?.type).toBe('rook');
        });

        test('should place black pieces correctly on row 0', () => {
            const board = createInitialBoard();
            expect(board[0]?.[0]?.type).toBe('rook');
            expect(board[0]?.[1]?.type).toBe('knight');
            expect(board[0]?.[2]?.type).toBe('bishop');
            expect(board[0]?.[3]?.type).toBe('queen');
            expect(board[0]?.[4]?.type).toBe('king');
            expect(board[0]?.[5]?.type).toBe('bishop');
            expect(board[0]?.[6]?.type).toBe('knight');
            expect(board[0]?.[7]?.type).toBe('rook');
        });

        test('should have empty squares in rows 2-5', () => {
            const board = createInitialBoard();
            for (let row = 2; row <= 5; row++) {
                for (let col = 0; col < 8; col++) {
                    expect(board[row]?.[col]).toBe(null);
                }
            }
        });
    });

    describe('isValidPosition', () => {
        test('should return true for valid positions', () => {
            expect(isValidPosition({ row: 0, col: 0 })).toBe(true);
            expect(isValidPosition({ row: 7, col: 7 })).toBe(true);
            expect(isValidPosition({ row: 3, col: 4 })).toBe(true);
        });

        test('should return false for negative positions', () => {
            expect(isValidPosition({ row: -1, col: 0 })).toBe(false);
            expect(isValidPosition({ row: 0, col: -1 })).toBe(false);
        });

        test('should return false for positions >= 8', () => {
            expect(isValidPosition({ row: 8, col: 0 })).toBe(false);
            expect(isValidPosition({ row: 0, col: 8 })).toBe(false);
            expect(isValidPosition({ row: 9, col: 9 })).toBe(false);
        });
    });

    describe('getPieceAt', () => {
        test('should return piece at valid position', () => {
            const board = createInitialBoard();
            const piece = getPieceAt(board, { row: 0, col: 0 });
            expect(piece).not.toBe(null);
            expect(piece?.type).toBe('rook');
            expect(piece?.color).toBe('black');
        });

        test('should return null for empty square', () => {
            const board = createInitialBoard();
            const piece = getPieceAt(board, { row: 3, col: 3 });
            expect(piece).toBe(null);
        });

        test('should return null for invalid position', () => {
            const board = createInitialBoard();
            const piece = getPieceAt(board, { row: -1, col: 0 });
            expect(piece).toBe(null);
        });
    });

    describe('setPieceAt', () => {
        test('should set piece at valid position', () => {
            const board = createInitialBoard();
            const piece: ChessPiece = { type: 'queen', color: 'white' };
            setPieceAt(board, { row: 3, col: 3 }, piece);
            expect(board[3]?.[3]).toEqual(piece);
        });

        test('should remove piece when set to null', () => {
            const board = createInitialBoard();
            setPieceAt(board, { row: 0, col: 0 }, null);
            expect(board[0]?.[0]).toBe(null);
        });

        test('should not crash on invalid position', () => {
            const board = createInitialBoard();
            const piece: ChessPiece = { type: 'queen', color: 'white' };
            expect(() =>
                setPieceAt(board, { row: -1, col: 0 }, piece)
            ).not.toThrow();
        });
    });

    describe('isSquareEmpty', () => {
        test('should return true for empty square', () => {
            const board = createInitialBoard();
            expect(isSquareEmpty(board, { row: 3, col: 3 })).toBe(true);
        });

        test('should return false for occupied square', () => {
            const board = createInitialBoard();
            expect(isSquareEmpty(board, { row: 0, col: 0 })).toBe(false);
        });

        test('should return true for invalid position', () => {
            const board = createInitialBoard();
            expect(isSquareEmpty(board, { row: -1, col: 0 })).toBe(true);
        });
    });

    describe('isSquareOccupiedByOpponent', () => {
        test('should return true when opponent piece present', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'white')
            ).toBe(true);
            expect(
                isSquareOccupiedByOpponent(board, { row: 7, col: 0 }, 'black')
            ).toBe(true);
        });

        test('should return false when own piece present', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByOpponent(board, { row: 0, col: 0 }, 'black')
            ).toBe(false);
        });

        test('should return false for empty square', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByOpponent(board, { row: 3, col: 3 }, 'white')
            ).toBe(false);
        });
    });

    describe('isSquareOccupiedByAlly', () => {
        test('should return true when ally piece present', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'black')
            ).toBe(true);
            expect(
                isSquareOccupiedByAlly(board, { row: 7, col: 0 }, 'white')
            ).toBe(true);
        });

        test('should return false when opponent piece present', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByAlly(board, { row: 0, col: 0 }, 'white')
            ).toBe(false);
        });

        test('should return false for empty square', () => {
            const board = createInitialBoard();
            expect(
                isSquareOccupiedByAlly(board, { row: 3, col: 3 }, 'white')
            ).toBe(false);
        });
    });

    describe('copyBoard', () => {
        test('should create a deep copy', () => {
            const board = createInitialBoard();
            const copy = copyBoard(board);

            // Modify the copy
            setPieceAt(copy, { row: 0, col: 0 }, null);

            // Original should be unchanged
            expect(board[0]?.[0]).not.toBe(null);
            expect(copy[0]?.[0]).toBe(null);
        });

        test('should preserve all pieces', () => {
            const board = createInitialBoard();
            const copy = copyBoard(board);

            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    expect(copy[row]?.[col]).toEqual(board[row]?.[col]);
                }
            }
        });
    });

    describe('positionToAlgebraic', () => {
        test('should convert corners correctly', () => {
            expect(positionToAlgebraic({ row: 0, col: 0 })).toBe('a8');
            expect(positionToAlgebraic({ row: 0, col: 7 })).toBe('h8');
            expect(positionToAlgebraic({ row: 7, col: 0 })).toBe('a1');
            expect(positionToAlgebraic({ row: 7, col: 7 })).toBe('h1');
        });

        test('should convert middle squares correctly', () => {
            expect(positionToAlgebraic({ row: 4, col: 3 })).toBe('d4');
            expect(positionToAlgebraic({ row: 3, col: 4 })).toBe('e5');
        });
    });

    describe('algebraicToPosition', () => {
        test('should convert valid notation', () => {
            expect(algebraicToPosition('a8')).toEqual({ row: 0, col: 0 });
            expect(algebraicToPosition('h8')).toEqual({ row: 0, col: 7 });
            expect(algebraicToPosition('a1')).toEqual({ row: 7, col: 0 });
            expect(algebraicToPosition('h1')).toEqual({ row: 7, col: 7 });
            expect(algebraicToPosition('e4')).toEqual({ row: 4, col: 4 });
        });

        test('should throw for invalid notation', () => {
            expect(() => algebraicToPosition('z9')).toThrow(); // file z doesn't exist
            expect(() => algebraicToPosition('i1')).toThrow(); // file i doesn't exist
            expect(() => algebraicToPosition('')).toThrow(); // empty string
            expect(() => algebraicToPosition('a')).toThrow(); // missing rank
            expect(() => algebraicToPosition('11')).toThrow(); // no letter
        });
    });

    describe('algebraic <-> position roundtrip', () => {
        test('should be reversible', () => {
            const positions: Position[] = [
                { row: 0, col: 0 },
                { row: 3, col: 4 },
                { row: 7, col: 7 },
            ];

            for (const pos of positions) {
                const algebraic = positionToAlgebraic(pos);
                const converted = algebraicToPosition(algebraic);
                expect(converted).toEqual(pos);
            }
        });
    });
});
