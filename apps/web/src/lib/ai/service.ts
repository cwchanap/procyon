import type { AIConfig, AIResponse } from './types';
import type { GameState, Position, Move } from '../chess/types';
import { RANKS, FILES } from '../chess/types';

export class AIService {
    private config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
    }

    async makeMove(gameState: GameState): Promise<AIResponse | null> {
        if (!this.config.enabled || !this.config.apiKey) {
            return null;
        }

        try {
            const boardFEN = this.generateFEN(gameState);
            const prompt = this.createChessPrompt(gameState, boardFEN);

            const response = await this.callLLM(prompt);
            return this.parseAIResponse(response);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('AI service error:', error);
            return null;
        }
    }

    private async callLLM(prompt: string): Promise<string> {
        switch (this.config.provider) {
            case 'gemini':
                return this.callGemini(prompt);
            case 'openrouter':
                return this.callOpenRouter(prompt);
            default:
                throw new Error(
                    `Unsupported AI provider: ${this.config.provider}`
                );
        }
    }

    private async callGemini(prompt: string): Promise<string> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 500,
                    },
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    private async callOpenRouter(prompt: string): Promise<string> {
        const response = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Procyon Chess',
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 500,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    private createChessPrompt(gameState: GameState, boardFEN: string): string {
        const currentPlayer = gameState.currentPlayer;
        const moveHistory = this.formatMoveHistory(gameState.moveHistory);

        return `You are a chess AI assistant playing as ${currentPlayer}. Analyze the current chess position and provide your next move.

Current position (FEN): ${boardFEN}
Current player to move: ${currentPlayer}
Game status: ${gameState.status}

Move history (last 5 moves):
${moveHistory}

Chess Rules Reminder:
- Pieces move according to standard chess rules
- You must not leave your king in check
- If in check, you must get out of check
- Standard chess victory conditions apply (checkmate, stalemate, etc.)

IMPORTANT: You must respond in exactly this JSON format:
{
    "move": {
        "from": "e2",
        "to": "e4"
    },
    "reasoning": "Brief explanation of why this move is good",
    "confidence": 85
}

Provide only valid chess moves using algebraic notation (e.g., "e2" to "e4"). Consider:
1. Piece safety and development
2. Control of center squares
3. King safety
4. Tactical opportunities
5. Positional advantages

Your move:`;
    }

    private generateFEN(gameState: GameState): string {
        let fen = '';

        // Board position
        for (let rank = 0; rank < 8; rank++) {
            let emptyCount = 0;
            let rankStr = '';

            for (let file = 0; file < 8; file++) {
                const piece = gameState.board[rank][file];

                if (piece) {
                    if (emptyCount > 0) {
                        rankStr += emptyCount.toString();
                        emptyCount = 0;
                    }

                    let pieceChar = '';
                    switch (piece.type) {
                        case 'king':
                            pieceChar = 'k';
                            break;
                        case 'queen':
                            pieceChar = 'q';
                            break;
                        case 'rook':
                            pieceChar = 'r';
                            break;
                        case 'bishop':
                            pieceChar = 'b';
                            break;
                        case 'knight':
                            pieceChar = 'n';
                            break;
                        case 'pawn':
                            pieceChar = 'p';
                            break;
                    }

                    if (piece.color === 'white') {
                        pieceChar = pieceChar.toUpperCase();
                    }

                    rankStr += pieceChar;
                } else {
                    emptyCount++;
                }
            }

            if (emptyCount > 0) {
                rankStr += emptyCount.toString();
            }

            fen += rankStr;
            if (rank < 7) fen += '/';
        }

        // Add current player
        fen += ` ${gameState.currentPlayer === 'white' ? 'w' : 'b'}`;

        // Simplified FEN (without castling, en passant, halfmove, fullmove)
        fen += ' - - 0 1';

        return fen;
    }

    private formatMoveHistory(moves: Move[]): string {
        if (moves.length === 0) return 'Game start';

        const recentMoves = moves.slice(-10); // Last 10 moves
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

    private positionToAlgebraic(position: Position): string {
        return FILES[position.col] + RANKS[position.row];
    }

    private algebraicToPosition(algebraic: string): Position {
        const file = algebraic[0];
        const rank = algebraic[1];

        return {
            col: FILES.indexOf(file),
            row: RANKS.indexOf(rank),
        };
    }

    private parseAIResponse(response: string): AIResponse | null {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.move || !parsed.move.from || !parsed.move.to) {
                throw new Error('Invalid move format in response');
            }

            return {
                move: {
                    from: parsed.move.from,
                    to: parsed.move.to,
                    reasoning: parsed.reasoning,
                },
                confidence: parsed.confidence || 50,
                thinking: parsed.reasoning,
            };
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to parse AI response:', error);
            // eslint-disable-next-line no-console
            console.error('Raw response:', response);
            return null;
        }
    }

    updateConfig(newConfig: Partial<AIConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
}
