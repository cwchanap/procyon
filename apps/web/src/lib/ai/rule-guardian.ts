/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameVariant, GamePosition } from './game-variant-types';
import type { AIResponse } from './types';

export interface MoveValidationResult {
    isValid: boolean;
    reason?: string;
    suggestedAlternative?: { from: string; to: string };
}

export interface RuleGuardian {
    gameVariant: GameVariant;
    validateAIMove(
        gameState: any,
        aiResponse: AIResponse
    ): MoveValidationResult;
    parseMove(algebraicMove: { from: string; to: string }): {
        fromPos: GamePosition;
        toPos: GamePosition;
        isDrop?: boolean;
    };
}

export class ChessRuleGuardian implements RuleGuardian {
    gameVariant = 'chess' as const;

    validateAIMove(
        gameState: any,
        aiResponse: AIResponse
    ): MoveValidationResult {
        try {
            const { fromPos, toPos } = this.parseMove(aiResponse.move);

            // Check bounds
            if (
                !this.isValidPosition(fromPos) ||
                !this.isValidPosition(toPos)
            ) {
                return {
                    isValid: false,
                    reason: 'Move coordinates out of bounds',
                };
            }

            // Check if piece exists at from position
            const piece = gameState.board[fromPos.row]?.[fromPos.col];
            if (!piece) {
                return {
                    isValid: false,
                    reason: `No piece at ${aiResponse.move.from}`,
                };
            }

            // Check if it's the right player's piece
            if (piece.color !== gameState.currentPlayer) {
                return {
                    isValid: false,
                    reason: `Not your piece at ${aiResponse.move.from}`,
                };
            }

            return { isValid: true };
        } catch (error) {
            return { isValid: false, reason: `Invalid move format: ${error}` };
        }
    }

    parseMove(move: { from: string; to: string }): {
        fromPos: GamePosition;
        toPos: GamePosition;
    } {
        return {
            fromPos: this.algebraicToPosition(move.from),
            toPos: this.algebraicToPosition(move.to),
        };
    }

    private algebraicToPosition(algebraic: string): GamePosition {
        const file = algebraic[0];
        const rank = algebraic[1];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

        if (!file || !rank) {
            throw new Error(`Invalid algebraic notation: ${algebraic}`);
        }

        const col = files.indexOf(file);
        const row = ranks.indexOf(rank);

        // Return position even if invalid - let isValidPosition handle it
        return { col, row };
    }

    private isValidPosition(pos: GamePosition): boolean {
        return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
    }
}

export class XiangqiRuleGuardian implements RuleGuardian {
    gameVariant = 'xiangqi' as const;

    validateAIMove(
        gameState: any,
        aiResponse: AIResponse
    ): MoveValidationResult {
        try {
            const { fromPos, toPos } = this.parseMove(aiResponse.move);

            // Check bounds
            if (
                !this.isValidPosition(fromPos) ||
                !this.isValidPosition(toPos)
            ) {
                return {
                    isValid: false,
                    reason: 'Move coordinates out of bounds for xiangqi board',
                };
            }

            // Check if piece exists at from position
            const piece = gameState.board[fromPos.row]?.[fromPos.col];
            if (!piece) {
                return {
                    isValid: false,
                    reason: `No piece at ${aiResponse.move.from}`,
                };
            }

            // Check if it's the right player's piece
            if (piece.color !== gameState.currentPlayer) {
                return {
                    isValid: false,
                    reason: `Not your piece at ${aiResponse.move.from}`,
                };
            }

            // Xiangqi-specific rules
            if (piece.type === 'king' || piece.type === 'advisor') {
                if (!this.isInPalace(toPos, piece.color)) {
                    return {
                        isValid: false,
                        reason: `${piece.type} must stay in palace`,
                    };
                }
            }

            if (piece.type === 'elephant') {
                if (!this.isOnCorrectSide(toPos, piece.color)) {
                    return {
                        isValid: false,
                        reason: 'Elephant cannot cross river',
                    };
                }
            }

            return { isValid: true };
        } catch (error) {
            return { isValid: false, reason: `Invalid move format: ${error}` };
        }
    }

    parseMove(move: { from: string; to: string }): {
        fromPos: GamePosition;
        toPos: GamePosition;
    } {
        return {
            fromPos: this.algebraicToPosition(move.from),
            toPos: this.algebraicToPosition(move.to),
        };
    }

    private algebraicToPosition(algebraic: string): GamePosition {
        const file = algebraic[0];
        const rank = algebraic.slice(1);
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
        const ranks = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

        if (!file || !rank) {
            throw new Error(`Invalid algebraic notation: ${algebraic}`);
        }

        const col = files.indexOf(file);
        const row = ranks.indexOf(rank);

        // Return position even if invalid - let isValidPosition handle it
        return { col, row };
    }

    private isValidPosition(pos: GamePosition): boolean {
        return pos.row >= 0 && pos.row < 10 && pos.col >= 0 && pos.col < 9;
    }

    private isInPalace(pos: GamePosition, color: string): boolean {
        const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
        const palaceCols = [3, 4, 5];
        return palaceRows.includes(pos.row) && palaceCols.includes(pos.col);
    }

    private isOnCorrectSide(pos: GamePosition, color: string): boolean {
        return color === 'red' ? pos.row >= 5 : pos.row <= 4;
    }
}

export class ShogiRuleGuardian implements RuleGuardian {
    gameVariant = 'shogi' as const;

    validateAIMove(
        gameState: any,
        aiResponse: AIResponse
    ): MoveValidationResult {
        try {
            const { fromPos, toPos, isDrop } = this.parseMove(aiResponse.move);

            if (isDrop) {
                // Drop move validation
                if (!this.isValidPosition(toPos)) {
                    return {
                        isValid: false,
                        reason: 'Drop coordinates out of bounds',
                    };
                }

                // Check if square is empty
                if (gameState.board[toPos.row]?.[toPos.col]) {
                    return {
                        isValid: false,
                        reason: 'Cannot drop on occupied square',
                    };
                }

                return { isValid: true };
            } else {
                // Regular move validation
                if (
                    !this.isValidPosition(fromPos) ||
                    !this.isValidPosition(toPos)
                ) {
                    return {
                        isValid: false,
                        reason: 'Move coordinates out of bounds for shogi board',
                    };
                }

                // Check if piece exists at from position
                const piece = gameState.board[fromPos.row]?.[fromPos.col];
                if (!piece) {
                    return {
                        isValid: false,
                        reason: `No piece at ${aiResponse.move.from}`,
                    };
                }

                // Check if it's the right player's piece
                if (piece.color !== gameState.currentPlayer) {
                    return {
                        isValid: false,
                        reason: `Not your piece at ${aiResponse.move.from}`,
                    };
                }

                return { isValid: true };
            }
        } catch (error) {
            return { isValid: false, reason: `Invalid move format: ${error}` };
        }
    }

    parseMove(move: { from: string; to: string }): {
        fromPos: GamePosition;
        toPos: GamePosition;
        isDrop?: boolean;
    } {
        const isDrop = move.from === '*';

        if (isDrop) {
            return {
                fromPos: { row: -1, col: -1 }, // Invalid position for drops
                toPos: this.algebraicToPosition(move.to),
                isDrop: true,
            };
        } else {
            return {
                fromPos: this.algebraicToPosition(move.from),
                toPos: this.algebraicToPosition(move.to),
                isDrop: false,
            };
        }
    }

    private algebraicToPosition(algebraic: string): GamePosition {
        const file = algebraic[0];
        const rank = algebraic[1];
        const files = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
        const ranks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

        if (!file || !rank) {
            throw new Error(`Invalid algebraic notation: ${algebraic}`);
        }

        const col = files.indexOf(file);
        const row = ranks.indexOf(rank);

        // Return position even if invalid - let isValidPosition handle it
        return { col, row };
    }

    private isValidPosition(pos: GamePosition): boolean {
        return pos.row >= 0 && pos.row < 9 && pos.col >= 0 && pos.col < 9;
    }
}

export class JungleRuleGuardian implements RuleGuardian {
    gameVariant = 'jungle' as const;

    validateAIMove(
        gameState: any,
        aiResponse: AIResponse
    ): MoveValidationResult {
        try {
            const { fromPos, toPos } = this.parseMove(aiResponse.move);

            // Check bounds for Jungle chess (9x7 board)
            if (
                !this.isValidPosition(fromPos) ||
                !this.isValidPosition(toPos)
            ) {
                return {
                    isValid: false,
                    reason: 'Move coordinates out of bounds for jungle board',
                };
            }

            // Check if piece exists at from position
            const piece = gameState.board[fromPos.row]?.[fromPos.col];
            if (!piece) {
                return {
                    isValid: false,
                    reason: `No piece at ${aiResponse.move.from}`,
                };
            }

            // Check if it's the right player's piece
            if (piece.color !== gameState.currentPlayer) {
                return {
                    isValid: false,
                    reason: `Not your piece at ${aiResponse.move.from}`,
                };
            }

            return { isValid: true };
        } catch (error) {
            return { isValid: false, reason: `Invalid move format: ${error}` };
        }
    }

    parseMove(move: { from: string; to: string }): {
        fromPos: GamePosition;
        toPos: GamePosition;
    } {
        return {
            fromPos: this.algebraicToPosition(move.from),
            toPos: this.algebraicToPosition(move.to),
        };
    }

    private algebraicToPosition(algebraic: string): GamePosition {
        const file = algebraic[0];
        const rank = algebraic[1];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const ranks = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

        if (!file || !rank) {
            throw new Error(`Invalid algebraic notation: ${algebraic}`);
        }

        const col = files.indexOf(file);
        const row = ranks.indexOf(rank);

        // Return position even if invalid - let isValidPosition handle it
        return { col, row };
    }

    private isValidPosition(pos: GamePosition): boolean {
        return pos.row >= 0 && pos.row < 9 && pos.col >= 0 && pos.col < 7;
    }
}

export function createRuleGuardian(gameVariant: GameVariant): RuleGuardian {
    switch (gameVariant) {
        case 'chess':
            return new ChessRuleGuardian();
        case 'xiangqi':
            return new XiangqiRuleGuardian();
        case 'shogi':
            return new ShogiRuleGuardian();
        case 'jungle':
            return new JungleRuleGuardian();
        default:
            throw new Error(`Unsupported game variant: ${gameVariant}`);
    }
}
