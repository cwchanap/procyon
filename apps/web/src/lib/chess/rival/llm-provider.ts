import { createChessAI } from '../../ai/factory';
import type { AIConfig, AIResponse } from '../../ai/types';
import type { AIInteractionData } from '../../ai/service';
import type { GameState, ChessMoveRequest } from '../types';
import type { ChessRivalProvider } from './provider';
import type { RivalMoveResult } from './types';

export interface RivalDebugEvent {
	type: string;
	message: string;
	data?: Record<string, unknown>;
}

export interface LlmAiService {
	makeMove(state: GameState, requestToken?: number): Promise<AIResponse | null>;
	getLastInteraction(): AIInteractionData | undefined;
	setDebugCallback(
		callback: (
			type: string,
			message: string,
			data?: Record<string, unknown>
		) => void
	): void;
}

export interface CreateLlmRivalProviderOptions {
	config: AIConfig;
	debug: boolean;
	onDebugEvent?: (event: RivalDebugEvent) => void;
	createService?: (config: AIConfig) => LlmAiService;
}

class LlmRivalProvider implements ChessRivalProvider {
	readonly kind = 'llm' as const;

	private readonly service: LlmAiService;
	private disposed = false;
	private onDebugEvent: ((event: RivalDebugEvent) => void) | undefined;

	constructor(options: CreateLlmRivalProviderOptions) {
		const config = Object.freeze({
			...options.config,
			debug: options.debug,
		});
		const createService = options.createService ?? createChessAI;

		this.onDebugEvent = options.onDebugEvent;
		this.service = createService(config);
		this.service.setDebugCallback((type, message, data) => {
			if (this.disposed) {
				return;
			}
			this.onDebugEvent?.({ type, message, data });
		});
	}

	async initialize(): Promise<void> {
		this.ensureUsable();
	}

	async beginGame(): Promise<void> {
		this.ensureUsable();
	}

	async makeMove(
		state: GameState,
		requestToken: number
	): Promise<RivalMoveResult> {
		this.ensureUsable();

		const aiResponse = await this.service.makeMove(state, requestToken);
		this.ensureUsable();

		if (!aiResponse?.move) {
			return { ok: false, reason: 'no-move' };
		}

		const interaction = this.service.getLastInteraction();
		return {
			ok: true,
			move: aiResponse.move as ChessMoveRequest,
			meta: {
				thinking: aiResponse.thinking,
				confidence: aiResponse.confidence,
				interaction: {
					prompt: interaction?.prompt,
					response: interaction?.rawResponse,
				},
			},
		};
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.onDebugEvent = undefined;
		this.service.setDebugCallback(() => {});
	}

	private ensureUsable(): void {
		if (this.disposed) {
			throw new Error('LLM rival provider disposed');
		}
	}
}

export function createLlmRivalProvider(
	options: CreateLlmRivalProviderOptions
): ChessRivalProvider {
	return new LlmRivalProvider(options);
}
