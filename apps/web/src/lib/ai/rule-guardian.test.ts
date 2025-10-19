import { test, expect, describe, beforeEach } from 'bun:test';
import {
    ChessRuleGuardian,
    XiangqiRuleGuardian,
    ShogiRuleGuardian,
    JungleRuleGuardian,
    createRuleGuardian,
} from './rule-guardian';
import { createInitialBoard as createChessBoard } from '../chess/board';
import { createInitialXiangqiBoard } from '../xiangqi/board';
import { createInitialGameState } from '../jungle/game';
import type { AIResponse } from './types';
import type { ChessPiece } from '../chess/types';
import type { XiangqiPiece } from '../xiangqi/types';
import type { ShogiPiece } from '../shogi';
import type { JunglePiece } from '../jungle/types';

describe('Rule Guardian System', () => {
    describe('createRuleGuardian', () => {
        test('should create chess rule guardian', () => {
            const guardian = createRuleGuardian('chess');
            expect(guardian.gameVariant).toBe('chess');
            expect(guardian).toBeInstanceOf(ChessRuleGuardian);
        });

        test('should create xiangqi rule guardian', () => {
            const guardian = createRuleGuardian('xiangqi');
            expect(guardian.gameVariant).toBe('xiangqi');
            expect(guardian).toBeInstanceOf(XiangqiRuleGuardian);
        });

        test('should create shogi rule guardian', () => {
            const guardian = createRuleGuardian('shogi');
            expect(guardian.gameVariant).toBe('shogi');
            expect(guardian).toBeInstanceOf(ShogiRuleGuardian);
        });

        test('should create jungle rule guardian', () => {
            const guardian = createRuleGuardian('jungle');
            expect(guardian.gameVariant).toBe('jungle');
            expect(guardian).toBeInstanceOf(JungleRuleGuardian);
        });

        test('should throw for unsupported game variant', () => {
            expect(() => {
                // @ts-expect-error - testing invalid variant
                createRuleGuardian('checkers');
            }).toThrow();
        });
    });

    describe('ChessRuleGuardian', () => {
        let guardian: ChessRuleGuardian;
        let gameState: {
            board: (ChessPiece | null)[][];
            currentPlayer: 'white' | 'black';
        };

        beforeEach(() => {
            guardian = new ChessRuleGuardian();
            gameState = {
                board: createChessBoard(),
                currentPlayer: 'white',
            };
        });

        test('should validate move with correct piece', () => {
            const response: AIResponse = {
                move: { from: 'e2', to: 'e4' },
                reasoning: 'Opening move',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should reject move from empty square', () => {
            const response: AIResponse = {
                move: { from: 'e4', to: 'e5' },
                reasoning: 'Invalid move',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('No piece at e4');
        });

        test('should reject move of opponent piece', () => {
            const response: AIResponse = {
                move: { from: 'e7', to: 'e5' },
                reasoning: 'Moving black piece',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Not your piece');
        });

        test('should reject out of bounds moves', () => {
            const response: AIResponse = {
                move: { from: 'e2', to: 'e9' },
                reasoning: 'Invalid target',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('out of bounds');
        });

        test('should parse algebraic notation correctly', () => {
            const parsed = guardian.parseMove({ from: 'e2', to: 'e4' });
            expect(parsed.fromPos).toEqual({ row: 6, col: 4 });
            expect(parsed.toPos).toEqual({ row: 4, col: 4 });
        });

        test('should handle corner positions', () => {
            const parsed1 = guardian.parseMove({ from: 'a1', to: 'h8' });
            expect(parsed1.fromPos).toEqual({ row: 7, col: 0 });
            expect(parsed1.toPos).toEqual({ row: 0, col: 7 });
        });

        test('should reject invalid notation format', () => {
            const response: AIResponse = {
                move: { from: 'invalid', to: 'e4' },
                reasoning: 'Bad format',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('out of bounds');
        });
    });

    describe('XiangqiRuleGuardian', () => {
        let guardian: XiangqiRuleGuardian;
        let gameState: {
            board: (XiangqiPiece | null)[][];
            currentPlayer: 'red' | 'black';
        };

        beforeEach(() => {
            guardian = new XiangqiRuleGuardian();
            gameState = {
                board: createInitialXiangqiBoard(),
                currentPlayer: 'red',
            };
        });

        test('should validate move with correct piece', () => {
            const response: AIResponse = {
                move: { from: 'a1', to: 'a2' },
                reasoning: 'Soldier advance',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should enforce palace rules for king', () => {
            // Clear board and place king outside palace
            const emptyBoard = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));
            emptyBoard[9][4] = { type: 'king', color: 'red' };
            gameState.board = emptyBoard;

            const response: AIResponse = {
                move: { from: 'e1', to: 'e2' },
                reasoning: 'King move',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);

            // Try to move outside palace
            const badResponse: AIResponse = {
                move: { from: 'e1', to: 'a1' },
                reasoning: 'Invalid king move',
            };
            const badResult = guardian.validateAIMove(gameState, badResponse);
            expect(badResult.isValid).toBe(false);
            expect(badResult.reason).toContain('palace');
        });

        test('should enforce palace rules for advisor', () => {
            const emptyBoard = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));
            emptyBoard[9][3] = { type: 'advisor', color: 'red' };
            gameState.board = emptyBoard;

            const response: AIResponse = {
                move: { from: 'd1', to: 'e2' },
                reasoning: 'Advisor diagonal',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should enforce river crossing rules for elephant', () => {
            const emptyBoard = Array(10)
                .fill(null)
                .map(() => Array(9).fill(null));
            emptyBoard[5][2] = { type: 'elephant', color: 'red' };
            gameState.board = emptyBoard;

            // Try to cross river
            const response: AIResponse = {
                move: { from: 'c5', to: 'e7' },
                reasoning: 'Cross river',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('cross river');
        });

        test('should parse xiangqi notation correctly', () => {
            const parsed = guardian.parseMove({ from: 'a10', to: 'a9' });
            expect(parsed.fromPos).toEqual({ row: 0, col: 0 });
            expect(parsed.toPos).toEqual({ row: 1, col: 0 });
        });

        test('should validate position bounds', () => {
            const response: AIResponse = {
                move: { from: 'a10', to: 'j10' }, // j is out of bounds
                reasoning: 'Out of bounds',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('out of bounds');
        });
    });

    describe('ShogiRuleGuardian', () => {
        let guardian: ShogiRuleGuardian;
        let gameState: {
            board: (ShogiPiece | null)[][];
            currentPlayer: 'sente' | 'gote';
        };

        beforeEach(() => {
            guardian = new ShogiRuleGuardian();
            gameState = {
                board: Array(9)
                    .fill(null)
                    .map(() => Array(9).fill(null)),
                currentPlayer: 'black',
            };
        });

        test('should validate regular move', () => {
            gameState.board[6][4] = { type: 'pawn', color: 'black' };

            const response: AIResponse = {
                move: { from: '5g', to: '5f' },
                reasoning: 'Pawn advance',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should validate drop move', () => {
            const response: AIResponse = {
                move: { from: '*', to: '5e' },
                reasoning: 'Piece drop',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should reject drop on occupied square', () => {
            gameState.board[4][4] = { type: 'pawn', color: 'black' };

            const response: AIResponse = {
                move: { from: '*', to: '5e' },
                reasoning: 'Drop on occupied',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('occupied');
        });

        test('should parse shogi notation correctly', () => {
            const parsed = guardian.parseMove({ from: '9a', to: '9b' });
            expect(parsed.fromPos).toEqual({ row: 0, col: 0 });
            expect(parsed.toPos).toEqual({ row: 1, col: 0 });
            expect(parsed.isDrop).toBe(false);
        });

        test('should parse drop notation correctly', () => {
            const parsed = guardian.parseMove({ from: '*', to: '5e' });
            expect(parsed.fromPos).toEqual({ row: -1, col: -1 });
            expect(parsed.toPos).toEqual({ row: 4, col: 4 });
            expect(parsed.isDrop).toBe(true);
        });

        test('should reject move from empty square', () => {
            const response: AIResponse = {
                move: { from: '5e', to: '5d' },
                reasoning: 'Empty square',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('No piece');
        });

        test('should reject moving opponent piece', () => {
            gameState.board[4][4] = { type: 'pawn', color: 'white' };

            const response: AIResponse = {
                move: { from: '5e', to: '5d' },
                reasoning: 'Wrong color',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Not your piece');
        });

        test('should validate bounds for shogi board', () => {
            const response: AIResponse = {
                move: { from: '9a', to: '0a' }, // Invalid rank
                reasoning: 'Out of bounds',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('out of bounds');
        });
    });

    describe('JungleRuleGuardian', () => {
        let guardian: JungleRuleGuardian;
        let gameState: {
            board: (JunglePiece | null)[][];
            terrain: any[][];
            currentPlayer: 'red' | 'blue';
        };

        beforeEach(() => {
            guardian = new JungleRuleGuardian();
            const initialState = createInitialGameState();
            gameState = initialState;
        });

        test('should validate move with correct piece', () => {
            const response: AIResponse = {
                move: { from: 'a1', to: 'a2' }, // Red piece (current player)
                confidence: 0.8,
                thinking: 'Lion advance',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(true);
        });

        test('should reject move from empty square', () => {
            const response: AIResponse = {
                move: { from: 'd5', to: 'd4' },
                confidence: 0.5,
                thinking: 'Invalid move from empty square',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('No piece');
        });

        test('should reject move of opponent piece', () => {
            const response: AIResponse = {
                move: { from: 'a9', to: 'a8' }, // Blue piece (opponent)
                confidence: 0.6,
                thinking: 'Moving opponent piece',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Not your piece');
        });

        test('should reject out of bounds moves', () => {
            const response: AIResponse = {
                move: { from: 'a9', to: 'h9' }, // h is out of bounds for jungle
                confidence: 0.3,
                thinking: 'Invalid target',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('out of bounds');
        });

        test('should parse jungle notation correctly', () => {
            const parsed = guardian.parseMove({ from: 'a9', to: 'a8' });
            expect(parsed.fromPos).toEqual({ row: 0, col: 0 });
            expect(parsed.toPos).toEqual({ row: 1, col: 0 });
        });

        test('should handle corner positions', () => {
            const parsed = guardian.parseMove({ from: 'a1', to: 'g9' });
            expect(parsed.fromPos).toEqual({ row: 8, col: 0 });
            expect(parsed.toPos).toEqual({ row: 0, col: 6 });
        });
    });

    describe('Error handling', () => {
        test('should handle malformed move objects gracefully', () => {
            const guardian = new ChessRuleGuardian();
            const gameState = {
                board: createChessBoard(),
                currentPlayer: 'white',
            };

            const response: AIResponse = {
                // @ts-expect-error - testing invalid move
                move: { from: null, to: 'e4' },
                reasoning: 'Bad move',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
            expect(result.reason).toBeDefined();
        });

        test('should handle missing board data', () => {
            const guardian = new ChessRuleGuardian();
            const gameState = {
                board: [],
                currentPlayer: 'white',
            };

            const response: AIResponse = {
                move: { from: 'e2', to: 'e4' },
                reasoning: 'Move',
            };

            const result = guardian.validateAIMove(gameState, response);
            expect(result.isValid).toBe(false);
        });
    });
});
