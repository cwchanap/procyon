/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AIConfig, AIResponse } from './types';
import type {
	GameVariant,
	BaseGameState,
	GamePosition,
	GamePiece,
} from './game-variant-types';
import { GAME_CONFIGS } from './game-variant-types';
import { createRuleGuardian, type RuleGuardian } from './rule-guardian';

// Re-export types needed by adapters
export type {
	BaseGameState,
	GamePosition,
	GamePiece,
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

export interface AIInteractionData {
	prompt: string;
	rawResponse: string;
	parsedResponse: AIResponse | null;
}

export class UniversalAIService {
	private config: AIConfig;
	public adapter: GameVariantAdapter;
	private ruleGuardian: RuleGuardian;
	private debugCallback?: (
		type: string,
		message: string,
		data?: unknown
	) => void;
	private lastInteraction?: AIInteractionData;

	constructor(config: AIConfig, adapter: GameVariantAdapter) {
		this.config = config;
		this.adapter = adapter;
		this.ruleGuardian = createRuleGuardian(adapter.gameVariant);
	}

	setDebugCallback(
		callback: (type: string, message: string, data?: unknown) => void
	) {
		this.debugCallback = callback;
	}

	getLastInteraction(): AIInteractionData | undefined {
		return this.lastInteraction;
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
						moveNumber: Math.floor(baseGameState.moveHistory.length / 2) + 1,
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

			// Store the interaction data for export
			this.lastInteraction = {
				prompt,
				rawResponse: response,
				parsedResponse,
			};

			if (this.config.debug) {
				console.log('🎯 PARSED AI RESPONSE:');
				console.log(parsedResponse);
			}

			// Validate the AI move using the rule guardian
			if (parsedResponse) {
				const validation = this.ruleGuardian.validateAIMove(
					gameState,
					parsedResponse
				);

				if (this.config.debug) {
					console.log('🛡️ RULE GUARDIAN VALIDATION:');
					console.log(`Valid: ${validation.isValid}`);
					if (!validation.isValid) {
						console.log(`Reason: ${validation.reason}`);
						if (validation.suggestedAlternative) {
							console.log(
								'Suggested alternative:',
								validation.suggestedAlternative
							);
						}
					}
				}

				if (!validation.isValid) {
					if (this.config.debug) {
						console.groupEnd();
						this.debugCallback?.(
							'ai-error',
							`🚫 Invalid AI move: ${validation.reason}`,
							{
								move: parsedResponse.move,
								reason: validation.reason,
								gameVariant: this.adapter.gameVariant,
							}
						);
					}

					throw new Error(`Invalid move: ${validation.reason}`);
				}
			}

			if (this.config.debug) {
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
					this.debugCallback?.('ai-error', '❌ Failed to parse AI response', {
						rawResponse: response,
					});
				}
			}

			return parsedResponse;
		} catch (error) {
			console.error('AI service error:', error);
			throw error; // Propagate error to UI
		}
	}

	private async callLLM(prompt: string): Promise<string> {
		switch (this.config.provider) {
			case 'gemini':
				return this.callGemini(prompt);
			case 'openrouter':
				return this.callOpenRouter(prompt);
			case 'openai':
				return this.callOpenAI(prompt);
			case 'chutes':
				return this.callChutes(prompt);
			default:
				throw new Error(`Unsupported AI provider: ${this.config.provider}`);
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
						maxOutputTokens: 2048,
					},
				}),
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Gemini API error: ${response.statusText} - ${errorText}`
			);
		}

		const data = await response.json();

		// Debug log the full response structure
		if (this.config.debug) {
			console.log(
				'🔍 Full Gemini API response:',
				JSON.stringify(data, null, 2)
			);
		}

		// Check for safety ratings that might have blocked the response
		if (data.promptFeedback?.blockReason) {
			throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
		}

		// Check if candidates were filtered
		if (!data.candidates || data.candidates.length === 0) {
			throw new Error('Gemini returned no candidates');
		}

		const candidate = data.candidates[0];

		// Check finish reason
		if (candidate.finishReason === 'SAFETY') {
			throw new Error('Gemini response blocked by safety filters');
		}

		if (candidate.finishReason === 'MAX_TOKENS') {
			// If we hit max tokens, try to extract partial response if available
			const text = candidate?.content?.parts?.[0]?.text || '';
			if (text) {
				console.warn('⚠️ Gemini hit MAX_TOKENS but partial response available');
				return text;
			}
			throw new Error(
				'Gemini response truncated - no content generated before hitting token limit'
			);
		}

		// Check if parts array exists
		if (!candidate?.content?.parts || candidate.content.parts.length === 0) {
			throw new Error(
				`Gemini returned no content parts (finishReason: ${candidate.finishReason})`
			);
		}

		const text = candidate.content.parts[0]?.text || '';
		if (!text) {
			throw new Error('Gemini returned empty text content');
		}

		return text;
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

	private async callOpenAI(prompt: string): Promise<string> {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
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
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.choices?.[0]?.message?.content || '';
	}

	private async callChutes(prompt: string): Promise<string> {
		const response = await fetch('https://llm.chutes.ai/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
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
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Chutes API error: ${response.statusText}`);
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
