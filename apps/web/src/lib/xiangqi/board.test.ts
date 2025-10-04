import { test, expect, describe } from 'bun:test';
import {
    createInitialXiangqiBoard,
    isValidPosition,
    isInPalace,
    isOnSameSideOfRiver,
    hasCrossedRiver,
    getPieceAt,
    setPieceAt,
    copyBoard,
    findKing,
    getPositionString,
} from './board';
import type { XiangqiPiece } from './types';

describe('Xiangqi Board Utilities', () => {
    describe('createInitialXiangqiBoard', () => {
        test('should create a 10x9 board', () => {
            const board = createInitialXiangqiBoard();
            expect(board.length).toBe(10);
            expect(board[0].length).toBe(9);
        });

        test('should place red king at correct position', () => {
            const board = createInitialXiangqiBoard();
            const king = board[9][4];
            expect(king).not.toBe(null);
            expect(king?.type).toBe('king');
            expect(king?.color).toBe('red');
        });

        test('should place black king at correct position', () => {
            const board = createInitialXiangqiBoard();
            const king = board[0][4];
            expect(king).not.toBe(null);
            expect(king?.type).toBe('king');
            expect(king?.color).toBe('black');
        });

        test('should place chariots in corners', () => {
            const board = createInitialXiangqiBoard();
            expect(board[0][0]?.type).toBe('chariot');
            expect(board[0][8]?.type).toBe('chariot');
            expect(board[9][0]?.type).toBe('chariot');
            expect(board[9][8]?.type).toBe('chariot');
        });

        test('should place cannons correctly', () => {
            const board = createInitialXiangqiBoard();
            expect(board[2][1]?.type).toBe('cannon');
            expect(board[2][7]?.type).toBe('cannon');
            expect(board[7][1]?.type).toBe('cannon');
            expect(board[7][7]?.type).toBe('cannon');
        });

        test('should place soldiers on every other column', () => {
            const board = createInitialXiangqiBoard();
            // Black soldiers
            for (let col = 0; col < 9; col += 2) {
                expect(board[3][col]?.type).toBe('soldier');
                expect(board[3][col]?.color).toBe('black');
            }
            // Red soldiers
            for (let col = 0; col < 9; col += 2) {
                expect(board[6][col]?.type).toBe('soldier');
                expect(board[6][col]?.color).toBe('red');
            }
        });

        test('should have river rows empty', () => {
            const board = createInitialXiangqiBoard();
            for (let col = 0; col < 9; col++) {
                expect(board[4][col]).toBe(null);
                expect(board[5][col]).toBe(null);
            }
        });
    });

    describe('isValidPosition', () => {
        test('should return true for valid positions', () => {
            expect(isValidPosition({ row: 0, col: 0 })).toBe(true);
            expect(isValidPosition({ row: 9, col: 8 })).toBe(true);
            expect(isValidPosition({ row: 5, col: 4 })).toBe(true);
        });

        test('should return false for out of bounds positions', () => {
            expect(isValidPosition({ row: -1, col: 0 })).toBe(false);
            expect(isValidPosition({ row: 10, col: 0 })).toBe(false);
            expect(isValidPosition({ row: 0, col: -1 })).toBe(false);
            expect(isValidPosition({ row: 0, col: 9 })).toBe(false);
        });
    });

    describe('isInPalace', () => {
        test('should return true for red palace positions', () => {
            expect(isInPalace({ row: 7, col: 3 }, 'red')).toBe(true);
            expect(isInPalace({ row: 7, col: 4 }, 'red')).toBe(true);
            expect(isInPalace({ row: 7, col: 5 }, 'red')).toBe(true);
            expect(isInPalace({ row: 8, col: 4 }, 'red')).toBe(true);
            expect(isInPalace({ row: 9, col: 4 }, 'red')).toBe(true);
        });

        test('should return true for black palace positions', () => {
            expect(isInPalace({ row: 0, col: 3 }, 'black')).toBe(true);
            expect(isInPalace({ row: 0, col: 4 }, 'black')).toBe(true);
            expect(isInPalace({ row: 0, col: 5 }, 'black')).toBe(true);
            expect(isInPalace({ row: 1, col: 4 }, 'black')).toBe(true);
            expect(isInPalace({ row: 2, col: 4 }, 'black')).toBe(true);
        });

        test('should return false for non-palace positions', () => {
            expect(isInPalace({ row: 7, col: 2 }, 'red')).toBe(false);
            expect(isInPalace({ row: 7, col: 6 }, 'red')).toBe(false);
            expect(isInPalace({ row: 6, col: 4 }, 'red')).toBe(false);
            expect(isInPalace({ row: 5, col: 4 }, 'black')).toBe(false);
        });
    });

    describe('isOnSameSideOfRiver', () => {
        test('should return true for red pieces on red side', () => {
            expect(isOnSameSideOfRiver({ row: 9, col: 0 }, 'red')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 8, col: 4 }, 'red')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 7, col: 8 }, 'red')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 6, col: 0 }, 'red')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 5, col: 4 }, 'red')).toBe(true); // Row 5 is still red side (river at 4.5)
            expect(isOnSameSideOfRiver({ row: 4, col: 4 }, 'red')).toBe(false); // Row 4 is black side
        });

        test('should return true for black pieces on black side', () => {
            expect(isOnSameSideOfRiver({ row: 0, col: 0 }, 'black')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 1, col: 4 }, 'black')).toBe(true);
            expect(isOnSameSideOfRiver({ row: 4, col: 8 }, 'black')).toBe(true); // Row 4 is black side
            expect(isOnSameSideOfRiver({ row: 5, col: 0 }, 'black')).toBe(
                false
            ); // Row 5 is red side
        });
    });

    describe('hasCrossedRiver', () => {
        test('should return false for pieces on their own side', () => {
            expect(hasCrossedRiver({ row: 9, col: 0 }, 'red')).toBe(false);
            expect(hasCrossedRiver({ row: 0, col: 0 }, 'black')).toBe(false);
        });

        test('should return true for pieces across river', () => {
            expect(hasCrossedRiver({ row: 4, col: 0 }, 'red')).toBe(true);
            expect(hasCrossedRiver({ row: 3, col: 0 }, 'red')).toBe(true);
            expect(hasCrossedRiver({ row: 5, col: 0 }, 'black')).toBe(true);
            expect(hasCrossedRiver({ row: 6, col: 0 }, 'black')).toBe(true);
        });
    });

    describe('getPieceAt and setPieceAt', () => {
        test('should get and set pieces correctly', () => {
            const board = createInitialXiangqiBoard();
            const piece = getPieceAt(board, { row: 0, col: 0 });
            expect(piece?.type).toBe('chariot');

            const newPiece: XiangqiPiece = { type: 'cannon', color: 'red' };
            setPieceAt(board, { row: 5, col: 5 }, newPiece);
            expect(getPieceAt(board, { row: 5, col: 5 })).toEqual(newPiece);
        });

        test('should return null for invalid positions', () => {
            const board = createInitialXiangqiBoard();
            expect(getPieceAt(board, { row: -1, col: 0 })).toBe(null);
            expect(getPieceAt(board, { row: 0, col: 10 })).toBe(null);
        });

        test('should not set piece at invalid position', () => {
            const board = createInitialXiangqiBoard();
            const piece: XiangqiPiece = { type: 'cannon', color: 'red' };
            setPieceAt(board, { row: -1, col: 0 }, piece);
            // Should not crash
        });
    });

    describe('copyBoard', () => {
        test('should create deep copy', () => {
            const board = createInitialXiangqiBoard();
            const copy = copyBoard(board);

            setPieceAt(copy, { row: 0, col: 0 }, null);

            expect(getPieceAt(board, { row: 0, col: 0 })).not.toBe(null);
            expect(getPieceAt(copy, { row: 0, col: 0 })).toBe(null);
        });

        test('should preserve all pieces', () => {
            const board = createInitialXiangqiBoard();
            const copy = copyBoard(board);

            for (let row = 0; row < 10; row++) {
                for (let col = 0; col < 9; col++) {
                    const original = getPieceAt(board, { row, col });
                    const copied = getPieceAt(copy, { row, col });
                    expect(copied).toEqual(original);
                }
            }
        });
    });

    describe('findKing', () => {
        test('should find red king', () => {
            const board = createInitialXiangqiBoard();
            const pos = findKing(board, 'red');
            expect(pos).toEqual({ row: 9, col: 4 });
        });

        test('should find black king', () => {
            const board = createInitialXiangqiBoard();
            const pos = findKing(board, 'black');
            expect(pos).toEqual({ row: 0, col: 4 });
        });

        test('should return null if king not found', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));
            const pos = findKing(board, 'red');
            expect(pos).toBe(null);
        });
    });

    describe('getPositionString', () => {
        test('should convert positions to algebraic notation', () => {
            expect(getPositionString({ row: 0, col: 0 })).toBe('a10');
            expect(getPositionString({ row: 9, col: 8 })).toBe('i1');
            expect(getPositionString({ row: 5, col: 4 })).toBe('e5');
            expect(getPositionString({ row: 0, col: 4 })).toBe('e10');
        });
    });
});
