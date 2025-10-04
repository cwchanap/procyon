import { test, expect, describe } from 'bun:test';
import { isValidMove, getPossibleMoves } from './moves';
import { setPieceAt } from './board';
import type { XiangqiPiece } from './types';

describe('Xiangqi Move Validation', () => {
    describe('King (General) moves', () => {
        test('should move one square orthogonally within palace', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const king: XiangqiPiece = { type: 'king', color: 'red' };
            setPieceAt(board, { row: 9, col: 4 }, king);

            expect(
                isValidMove(board, { row: 9, col: 4 }, { row: 8, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 9, col: 4 }, { row: 9, col: 3 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 9, col: 4 }, { row: 9, col: 5 })
            ).toBe(true);
        });

        test('should not move diagonally', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const king: XiangqiPiece = { type: 'king', color: 'red' };
            setPieceAt(board, { row: 9, col: 4 }, king);

            expect(
                isValidMove(board, { row: 9, col: 4 }, { row: 8, col: 3 })
            ).toBe(false);
        });

        test('should not leave palace', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const king: XiangqiPiece = { type: 'king', color: 'red' };
            setPieceAt(board, { row: 9, col: 3 }, king);

            expect(
                isValidMove(board, { row: 9, col: 3 }, { row: 9, col: 2 })
            ).toBe(false);
        });

        test('should prevent flying kings (facing each other)', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const redKing: XiangqiPiece = { type: 'king', color: 'red' };
            const blackKing: XiangqiPiece = { type: 'king', color: 'black' };

            setPieceAt(board, { row: 9, col: 4 }, redKing);
            setPieceAt(board, { row: 0, col: 4 }, blackKing);

            // Red king tries to move to same column as black king with no pieces between
            expect(
                isValidMove(board, { row: 9, col: 4 }, { row: 8, col: 4 })
            ).toBe(false);
        });
    });

    describe('Advisor moves', () => {
        test('should move diagonally within palace', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const advisor: XiangqiPiece = { type: 'advisor', color: 'red' };
            setPieceAt(board, { row: 9, col: 3 }, advisor);

            expect(
                isValidMove(board, { row: 9, col: 3 }, { row: 8, col: 4 })
            ).toBe(true);
        });

        test('should not move orthogonally', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const advisor: XiangqiPiece = { type: 'advisor', color: 'red' };
            setPieceAt(board, { row: 9, col: 3 }, advisor);

            expect(
                isValidMove(board, { row: 9, col: 3 }, { row: 8, col: 3 })
            ).toBe(false);
        });

        test('should not leave palace', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const advisor: XiangqiPiece = { type: 'advisor', color: 'red' };
            setPieceAt(board, { row: 7, col: 3 }, advisor); // At edge of palace

            // Try to move outside palace (row 6 is outside red palace)
            expect(
                isValidMove(board, { row: 7, col: 3 }, { row: 6, col: 2 })
            ).toBe(false);
        });
    });

    describe('Elephant moves', () => {
        test('should move exactly two squares diagonally', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
            setPieceAt(board, { row: 9, col: 2 }, elephant);

            expect(
                isValidMove(board, { row: 9, col: 2 }, { row: 7, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 9, col: 2 }, { row: 7, col: 0 })
            ).toBe(true);
        });

        test('should be blocked by elephant eye', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
            const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };

            setPieceAt(board, { row: 9, col: 2 }, elephant);
            setPieceAt(board, { row: 8, col: 3 }, blocker); // Eye position

            expect(
                isValidMove(board, { row: 9, col: 2 }, { row: 7, col: 4 })
            ).toBe(false);
        });

        test('should not cross river', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const elephant: XiangqiPiece = { type: 'elephant', color: 'red' };
            setPieceAt(board, { row: 6, col: 2 }, elephant); // Row 6 is red side

            // Try to cross river to row 4 (black side, river at 4.5)
            expect(
                isValidMove(board, { row: 6, col: 2 }, { row: 4, col: 4 })
            ).toBe(false);
        });
    });

    describe('Horse moves', () => {
        test('should move in L-shape', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const horse: XiangqiPiece = { type: 'horse', color: 'red' };
            setPieceAt(board, { row: 5, col: 4 }, horse);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 3 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 5 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 4, col: 2 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 4, col: 6 })
            ).toBe(true);
        });

        test('should be blocked by horse leg', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const horse: XiangqiPiece = { type: 'horse', color: 'red' };
            const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };

            setPieceAt(board, { row: 5, col: 4 }, horse);
            setPieceAt(board, { row: 4, col: 4 }, blocker); // Blocking leg

            // Cannot move up-left or up-right
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 3 })
            ).toBe(false);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 5 })
            ).toBe(false);
        });
    });

    describe('Chariot moves', () => {
        test('should move orthogonally any distance', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
            setPieceAt(board, { row: 5, col: 4 }, chariot);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 0, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 9, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 5, col: 0 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 5, col: 8 })
            ).toBe(true);
        });

        test('should not move diagonally', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
            setPieceAt(board, { row: 5, col: 4 }, chariot);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 6 })
            ).toBe(false);
        });

        test('should be blocked by pieces', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
            const blocker: XiangqiPiece = { type: 'soldier', color: 'black' };

            setPieceAt(board, { row: 5, col: 4 }, chariot);
            setPieceAt(board, { row: 3, col: 4 }, blocker);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 2, col: 4 })
            ).toBe(false);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 3, col: 4 })
            ).toBe(true); // Can capture
        });
    });

    describe('Cannon moves', () => {
        test('should move orthogonally without capturing', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
            setPieceAt(board, { row: 5, col: 4 }, cannon);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 2, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 5, col: 7 })
            ).toBe(true);
        });

        test('should capture by jumping over exactly one piece', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
            const screen: XiangqiPiece = { type: 'soldier', color: 'red' };
            const target: XiangqiPiece = { type: 'soldier', color: 'black' };

            setPieceAt(board, { row: 5, col: 4 }, cannon);
            setPieceAt(board, { row: 3, col: 4 }, screen); // Screen piece
            setPieceAt(board, { row: 1, col: 4 }, target); // Target

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 1, col: 4 })
            ).toBe(true);
        });

        test('should not capture without screen', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
            const target: XiangqiPiece = { type: 'soldier', color: 'black' };

            setPieceAt(board, { row: 5, col: 4 }, cannon);
            setPieceAt(board, { row: 2, col: 4 }, target);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 2, col: 4 })
            ).toBe(false);
        });

        test('should not move through pieces when not capturing', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const cannon: XiangqiPiece = { type: 'cannon', color: 'red' };
            const blocker: XiangqiPiece = { type: 'soldier', color: 'red' };

            setPieceAt(board, { row: 5, col: 4 }, cannon);
            setPieceAt(board, { row: 3, col: 4 }, blocker);

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 2, col: 4 })
            ).toBe(false);
        });
    });

    describe('Soldier moves', () => {
        test('red soldier should move forward before crossing river', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const soldier: XiangqiPiece = { type: 'soldier', color: 'red' };
            setPieceAt(board, { row: 6, col: 4 }, soldier);

            expect(
                isValidMove(board, { row: 6, col: 4 }, { row: 5, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 6, col: 4 }, { row: 6, col: 3 })
            ).toBe(false); // No sideways
        });

        test('red soldier should move forward and sideways after crossing river', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const soldier: XiangqiPiece = { type: 'soldier', color: 'red' };
            setPieceAt(board, { row: 4, col: 4 }, soldier); // Crossed river

            expect(
                isValidMove(board, { row: 4, col: 4 }, { row: 3, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 4, col: 4 }, { row: 4, col: 3 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 4, col: 4 }, { row: 4, col: 5 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 4, col: 4 }, { row: 5, col: 4 })
            ).toBe(false); // No backward
        });

        test('black soldier should move forward before crossing river', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const soldier: XiangqiPiece = { type: 'soldier', color: 'black' };
            setPieceAt(board, { row: 3, col: 4 }, soldier);

            expect(
                isValidMove(board, { row: 3, col: 4 }, { row: 4, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 3, col: 4 }, { row: 3, col: 3 })
            ).toBe(false);
        });

        test('black soldier should move forward and sideways after crossing river', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const soldier: XiangqiPiece = { type: 'soldier', color: 'black' };
            setPieceAt(board, { row: 5, col: 4 }, soldier); // Crossed river

            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 6, col: 4 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 5, col: 3 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 5, col: 5 })
            ).toBe(true);
            expect(
                isValidMove(board, { row: 5, col: 4 }, { row: 4, col: 4 })
            ).toBe(false);
        });
    });

    describe('getPossibleMoves', () => {
        test('should return all valid moves for a piece', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
            setPieceAt(board, { row: 5, col: 4 }, chariot);

            const moves = getPossibleMoves(board, { row: 5, col: 4 });

            // Chariot at (5,4) should have 17 moves (9 vertical excluding self + 8 horizontal excluding self)
            expect(moves.length).toBe(17);
        });

        test('should not include moves to own pieces', () => {
            const board: (XiangqiPiece | null)[][] = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));

            const chariot: XiangqiPiece = { type: 'chariot', color: 'red' };
            const ally: XiangqiPiece = { type: 'soldier', color: 'red' };

            setPieceAt(board, { row: 5, col: 4 }, chariot);
            setPieceAt(board, { row: 5, col: 6 }, ally);

            const moves = getPossibleMoves(board, { row: 5, col: 4 });

            expect(moves).not.toContainEqual({ row: 5, col: 6 });
        });
    });
});
