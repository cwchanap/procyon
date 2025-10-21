import type { AIConfig } from './types';
import type { GameVariant } from './game-variant-types';
import { UniversalAIService } from './service';
import { ChessAdapter } from './chess-adapter';
import { XiangqiAdapter } from './xiangqi-adapter';
import { ShogiAdapter } from './shogi-adapter';
import { JungleAdapter } from './jungle-adapter';

/**
 * Factory function to create AI service for a specific game variant
 */
export function createAIService(
	config: AIConfig,
	gameVariant: GameVariant = 'chess'
): UniversalAIService {
	const configWithVariant = { ...config, gameVariant };

	switch (gameVariant) {
		case 'chess':
			return new UniversalAIService(
				configWithVariant,
				new ChessAdapter(config.debug)
			);
		case 'xiangqi':
			return new UniversalAIService(
				configWithVariant,
				new XiangqiAdapter(config.debug)
			);
		case 'shogi':
			return new UniversalAIService(
				configWithVariant,
				new ShogiAdapter(config.debug)
			);
		case 'jungle':
			return new UniversalAIService(
				configWithVariant,
				new JungleAdapter(config.debug)
			);
		default:
			throw new Error(`Unsupported game variant: ${gameVariant}`);
	}
}

/**
 * Create chess AI service (legacy compatibility)
 */
export function createChessAI(config: AIConfig): UniversalAIService {
	return createAIService(config, 'chess');
}

/**
 * Create xiangqi AI service
 */
export function createXiangqiAI(config: AIConfig): UniversalAIService {
	return createAIService(config, 'xiangqi');
}

/**
 * Create shogi AI service
 */
export function createShogiAI(config: AIConfig): UniversalAIService {
	return createAIService(config, 'shogi');
}

/**
 * Create jungle AI service
 */
export function createJungleAI(config: AIConfig): UniversalAIService {
	return createAIService(config, 'jungle');
}
