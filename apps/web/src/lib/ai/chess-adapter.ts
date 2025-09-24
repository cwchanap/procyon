/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    GameVariantAdapter,
    BaseGameState,
    GamePosition,
    GamePiece,
} from './universal-service';
import type { GameState, Position, Move } from '../chess/types';
import { RANKS, FILES } from '../chess/types';
import { getPossibleMoves, isMoveValid } from '../chess/moves';
import { isKingInCheck } from '../chess/game';
import { copyBoard, setPieceAt } from '../chess/board';
import { GAME_CONFIGS } from './game-variant-types';

export class ChessAdapter implements GameVariantAdapter {
    gameVariant = 'chess' as const;
    private config = GAME_CONFIGS.chess;
    private debugMode: boolean;

    constructor(debugMode = false) {
        this.debugMode = debugMode;
    }

    convertGameState(gameState: GameState): BaseGameState {
        return {
            board: gameState.board,
            currentPlayer: gameState.currentPlayer,
            status: gameState.status,
            moveHistory: gameState.moveHistory,
            selectedSquare: gameState.selectedSquare,
            possibleMoves: gameState.possibleMoves,
        };
    }

    getAllValidMoves(gameState: GameState): string[] {
        const { board, currentPlayer } = gameState;
        const validMoves: string[] = [];

        if (this.debugMode) {
            console.log(`🔍 Generating valid moves for ${currentPlayer}:`);
        }

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece && piece.color === currentPlayer) {
                    const fromPos = { row, col };
                    const algebraicFrom = this.positionToAlgebraic(fromPos);

                    if (this.debugMode) {
                        console.log(
                            `  Found ${piece.type} at ${algebraicFrom}`
                        );
                    }

                    const possibleMoves = getPossibleMoves(
                        board,
                        piece,
                        fromPos
                    );

                    if (this.debugMode && possibleMoves.length > 0) {
                        console.log(
                            `    Possible moves for ${piece.type} at ${algebraicFrom}:`,
                            possibleMoves
                                .map(pos => this.positionToAlgebraic(pos))
                                .join(', ')
                        );
                    }

                    for (const toPos of possibleMoves) {
                        const isValidMove = this.wouldMoveBeValid(
                            gameState,
                            fromPos,
                            toPos
                        );
                        if (isValidMove) {
                            const from = this.positionToAlgebraic(fromPos);
                            const to = this.positionToAlgebraic(toPos);
                            const pieceSymbol =
                                this.getPieceSymbolForMove(piece);
                            validMoves.push(`${from}-${to} (${pieceSymbol})`);
                        }
                    }
                }
            }
        }

        if (this.debugMode) {
            console.log(`📋 Total valid moves found: ${validMoves.length}`);
            if (validMoves.length > 0) {
                console.log(`📝 Valid moves:`, validMoves);
            }
        }

        if (validMoves.length === 0) {
            return ['No valid moves available (checkmate or stalemate)'];
        }

        const groupedMoves = this.groupMovesByPiece(validMoves);

        if (this.debugMode) {
            console.log(`📋 Grouped moves sent to AI:\n${groupedMoves}`);
        }

        return [groupedMoves];
    }

    generatePrompt(gameState: GameState): string {
        const currentPlayer = gameState.currentPlayer;
        const moveHistory = this.formatMoveHistory(gameState.moveHistory);
        const visualBoard = this.createVisualBoard(gameState);
        const threatAnalysis = this.analyzeThreatsSafety(gameState);
        const validMoves = this.getAllValidMoves(gameState)[0];
        const randomSeed = Math.floor(Math.random() * 1000);

        return `You are a chess AI assistant playing as ${currentPlayer}. Analyze the current chess position and provide your next move.

CURRENT BOARD POSITION:
${visualBoard}

Current player to move: ${currentPlayer}
Game status: ${gameState.status}
Move number: ${Math.floor(gameState.moveHistory.length / 2) + 1}

RECENT MOVES (last 5):
${moveHistory}

⚠️  CRITICAL - VALID MOVES AVAILABLE (ONLY CHOOSE FROM THESE):
${validMoves}

❌ DO NOT suggest moves for pieces that don't exist on those squares!
❌ DO NOT suggest e7-e5 if there's no pawn on e7!
❌ Check the board position above to see where pieces actually are!

POSITION ANALYSIS:
${threatAnalysis}

STRATEGIC CONSIDERATIONS:
- Opening principles: Control center (e4, e5, d4, d5), develop pieces, castle early
- Middlegame: Look for tactics, improve piece positions, create weaknesses
- Endgame: Activate king, promote pawns, use piece coordination

TACTICAL AWARENESS:
- Check for forks, pins, skewers, and discovered attacks
- Look for sacrifice opportunities
- Consider opponent's threats and counter-threats
- Evaluate piece exchanges carefully

RANDOMIZATION SEED: ${randomSeed} (use this to vary your play style slightly)

IMPORTANT: You must respond in exactly this JSON format:
{
    "move": {
        "from": "e2",
        "to": "e4"
    },
    "reasoning": "Detailed explanation of your strategic thinking",
    "confidence": 85
}

🚨 ABSOLUTE REQUIREMENT: You MUST choose ONLY from the valid moves listed above.
   - If you suggest e7-e5 but it's not in the valid moves list, your move will be REJECTED
   - Look at the visual board to understand current piece positions
   - Use ONLY the algebraic notations provided in the valid moves list

Your move:`;
    }

    createVisualBoard(gameState: GameState): string {
        const { board } = gameState;
        let visual = '    a  b  c  d  e  f  g  h\n';
        visual += '  ┌──────────────────────┐\n';

        for (let rank = 0; rank < 8; rank++) {
            visual += `${8 - rank} │ `;
            for (let file = 0; file < 8; file++) {
                const piece = board[rank][file];
                if (piece) {
                    const symbol = this.getPieceSymbol(piece);
                    visual += `${symbol} `;
                } else {
                    visual += '. ';
                }
            }
            visual += `│ ${8 - rank}\n`;
        }

        visual += '  └──────────────────────┘\n';
        visual += '    a  b  c  d  e  f  g  h\n';

        return visual;
    }

    analyzeThreatsSafety(gameState: GameState): string {
        const { board, currentPlayer } = gameState;
        let analysis = '';

        const myKing = this.findPiece(board, 'king', currentPlayer);
        const _enemyKing = this.findPiece(
            board,
            'king',
            currentPlayer === 'white' ? 'black' : 'white'
        );

        if (gameState.status === 'check') {
            analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
        }

        const myMaterial = this.countMaterial(board, currentPlayer);
        const enemyMaterial = this.countMaterial(
            board,
            currentPlayer === 'white' ? 'black' : 'white'
        );

        analysis += `Material balance: You ${myMaterial}, Opponent ${enemyMaterial}\n`;

        if (myMaterial > enemyMaterial) {
            analysis += `You have material advantage - consider trading pieces\n`;
        } else if (myMaterial < enemyMaterial) {
            analysis += `You are behind in material - avoid trades, look for tactics\n`;
        }

        if (myKing) {
            const kingSafety = this.evaluateKingSafety(
                board,
                myKing,
                currentPlayer
            );
            analysis += `Your king safety: ${kingSafety}\n`;
        }

        return analysis;
    }

    positionToAlgebraic(position: GamePosition): string {
        return FILES[position.col] + RANKS[position.row];
    }

    algebraicToPosition(algebraic: string): GamePosition {
        const file = algebraic[0];
        const rank = algebraic[1];

        return {
            col: FILES.indexOf(file),
            row: RANKS.indexOf(rank),
        };
    }

    getPieceSymbol(piece: GamePiece): string {
        const symbols = this.config.pieceSymbols;
        return symbols[piece.color][piece.type] || '?';
    }

    private wouldMoveBeValid(
        gameState: GameState,
        from: Position,
        to: Position
    ): boolean {
        const { board, currentPlayer } = gameState;
        const piece = board[from.row]?.[from.col];

        if (!piece || piece.color !== currentPlayer) {
            if (this.debugMode) {
                console.log(
                    `    ❌ Invalid: No ${currentPlayer} piece at ${this.positionToAlgebraic(from)}`
                );
            }
            return false;
        }

        if (!isMoveValid(board, from, to, piece)) {
            if (this.debugMode) {
                console.log(
                    `    ❌ Invalid: Move ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} not allowed for ${piece.type}`
                );
            }
            return false;
        }

        const testBoard = copyBoard(board);
        setPieceAt(testBoard, from, null);
        setPieceAt(testBoard, to, piece);

        const wouldBeInCheck = isKingInCheck(testBoard, currentPlayer);
        if (wouldBeInCheck) {
            if (this.debugMode) {
                console.log(
                    `    ❌ Invalid: Move ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} leaves king in check`
                );
            }
            return false;
        }

        if (this.debugMode) {
            console.log(
                `    ✅ Valid: ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)}`
            );
        }
        return true;
    }

    private formatMoveHistory(moves: Move[]): string {
        if (moves.length === 0) return 'Game start';

        const recentMoves = moves.slice(-10);
        return recentMoves
            .map((move, index) => {
                const moveNum =
                    Math.floor(
                        (moves.length - recentMoves.length + index) / 2
                    ) + 1;
                const isWhite =
                    (moves.length - recentMoves.length + index) % 2 === 0;
                const from = this.positionToAlgebraic(move.from);
                const to = this.positionToAlgebraic(move.to);

                if (isWhite) {
                    return `${moveNum}. ${from}-${to}`;
                } else {
                    return `${from}-${to}`;
                }
            })
            .join(' ');
    }

    private findPiece(
        board: any[][],
        type: string,
        color: string
    ): { row: number; col: number } | null {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece && piece.type === type && piece.color === color) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    private countMaterial(board: any[][], color: string): number {
        const values = {
            pawn: 1,
            knight: 3,
            bishop: 3,
            rook: 5,
            queen: 9,
            king: 0,
        };
        let total = 0;

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece && piece.color === color) {
                    total += values[piece.type as keyof typeof values] || 0;
                }
            }
        }

        return total;
    }

    private evaluateKingSafety(
        board: any[][],
        kingPos: { row: number; col: number },
        color: string
    ): string {
        const { row, col } = kingPos;

        if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
            return 'UNSAFE - King exposed in center';
        }

        if (color === 'white' && row === 7 && (col === 2 || col === 6)) {
            return 'GOOD - King castled';
        }
        if (color === 'black' && row === 0 && (col === 2 || col === 6)) {
            return 'GOOD - King castled';
        }

        if (
            (color === 'white' && row === 7) ||
            (color === 'black' && row === 0)
        ) {
            return 'OK - King on back rank';
        }

        return 'CAUTION - King position needs attention';
    }

    private getPieceSymbolForMove(piece: any): string {
        const symbols = {
            king: '♔/♚',
            queen: '♕/♛',
            rook: '♖/♜',
            bishop: '♗/♝',
            knight: '♘/♞',
            pawn: '♙/♟',
        };
        return symbols[piece.type as keyof typeof symbols] || piece.type;
    }

    private groupMovesByPiece(moves: string[]): string {
        const groups: { [key: string]: string[] } = {};

        for (const move of moves) {
            const pieceMatch = move.match(/\(([^)]+)\)/);
            const pieceType = pieceMatch ? pieceMatch[1] : 'Unknown';
            if (!groups[pieceType]) {
                groups[pieceType] = [];
            }
            groups[pieceType].push(move.replace(/\s*\([^)]+\)/, ''));
        }

        let result = '';
        for (const [pieceType, movesArray] of Object.entries(groups)) {
            result += `${pieceType}: ${movesArray.join(', ')}\n`;
        }

        return result.trim();
    }
}
