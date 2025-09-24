/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AIConfig, AIResponse } from './types';
import type {
    GameVariant,
    BaseGameState,
    GamePosition,
    GamePiece,
    GAME_CONFIGS,
} from './game-variant-types';

export interface GameVariantAdapter {
    gameVariant: GameVariant;
    convertGameState(gameState: any): BaseGameState;
    getAllValidMoves(gameState: any): string[];
    generatePrompt(gameState: any): string;
    createVisualBoard(gameState: any): string;
    analyzeThreatsSafety(gameState: any): string;
    positionToAlgebraic(position: GamePosition): string;
    algebraicToPosition(algebraic: string): GamePosition;
    getPieceSymbol(piece: GamePiece): string;
}

export class UniversalAIService {
    private config: AIConfig;
    private adapter: GameVariantAdapter;
    private debugCallback?: (
        type: string,
        message: string,
        data?: unknown
    ) => void;

    constructor(config: AIConfig, adapter: GameVariantAdapter) {
        this.config = config;
        this.adapter = adapter;
    }

    setDebugCallback(
        callback: (type: string, message: string, data?: unknown) => void
    ) {
        this.debugCallback = callback;
    }

    async makeMove(gameState: any): Promise<AIResponse | null> {
        if (!this.config.enabled || !this.config.apiKey) {
            return null;
        }

        try {
            const prompt = this.adapter.generatePrompt(gameState);
            const baseGameState = this.adapter.convertGameState(gameState);

            if (this.config.debug) {
                console.group('🐛 AI DEBUG MODE');
                console.log('📋 Current Game State:');
                console.log(`Player: ${baseGameState.currentPlayer}`);
                console.log(`Status: ${baseGameState.status}`);
                console.log(
                    `Move #: ${Math.floor(baseGameState.moveHistory.length / 2) + 1}`
                );
                console.log('\n📤 PROMPT SENT TO AI:');
                console.log(prompt);
                console.log('\n' + '='.repeat(80));

                this.debugCallback?.(
                    'ai-debug',
                    `🤔 AI is thinking as ${baseGameState.currentPlayer}...`,
                    {
                        player: baseGameState.currentPlayer,
                        status: baseGameState.status,
                        moveNumber:
                            Math.floor(baseGameState.moveHistory.length / 2) +
                            1,
                        gameVariant: this.adapter.gameVariant,
                    }
                );
            }

            const response = await this.callLLM(prompt);

            if (this.config.debug) {
                console.log('📥 RAW AI RESPONSE:');
                console.log(response);
                console.log('\n' + '='.repeat(80));
            }

            const parsedResponse = this.parseAIResponse(response);

            if (this.config.debug) {
                console.log('🎯 PARSED AI RESPONSE:');
                console.log(parsedResponse);
                console.groupEnd();

                if (parsedResponse) {
                    this.debugCallback?.(
                        'ai-move',
                        `🎯 AI suggests: ${parsedResponse.move.from} → ${parsedResponse.move.to}`,
                        {
                            move: parsedResponse.move,
                            reasoning: parsedResponse.thinking,
                            confidence: parsedResponse.confidence,
                            gameVariant: this.adapter.gameVariant,
                        }
                    );
                } else {
                    this.debugCallback?.(
                        'ai-error',
                        '❌ Failed to parse AI response',
                        { rawResponse: response }
                    );
                }
            }

            return parsedResponse;
        } catch (error) {
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

    private parseAIResponse(response: string): AIResponse | null {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                if (this.config.debug) {
                    console.error('🚨 DEBUG: No JSON found in AI response');
                }
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.move || !parsed.move.from || !parsed.move.to) {
                if (this.config.debug) {
                    console.error(
                        '🚨 DEBUG: Invalid move format in parsed response:',
                        parsed
                    );
                }
                throw new Error('Invalid move format in response');
            }

            const moveFrom = parsed.move.from;
            const moveTo = parsed.move.to;

            if (this.config.debug) {
                console.log('🔍 DEBUG: Move validation:');
                console.log(`  From: "${moveFrom}" (type: ${typeof moveFrom})`);
                console.log(`  To: "${moveTo}" (type: ${typeof moveTo})`);

                // Check if moves are in correct algebraic format
                const config = GAME_CONFIGS[this.adapter.gameVariant];
                const filePattern = config.files.join('|');
                const rankPattern = config.ranks.join('|');
                const algebraicPattern = new RegExp(
                    `^(${filePattern})(${rankPattern})$`
                );
                const fromValid = algebraicPattern.test(moveFrom);
                const toValid = algebraicPattern.test(moveTo);

                console.log(`  From valid: ${fromValid}`);
                console.log(`  To valid: ${toValid}`);

                if (!fromValid || !toValid) {
                    console.warn('⚠️ DEBUG: Move format may be incorrect!');
                }
            }

            return {
                move: {
                    from: moveFrom,
                    to: moveTo,
                    reasoning: parsed.reasoning,
                },
                confidence: parsed.confidence || 50,
                thinking: parsed.reasoning,
            };
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.error('Raw response:', response);
            return null;
        }
    }

    updateConfig(newConfig: Partial<AIConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
}
