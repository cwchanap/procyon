// Export all AI types
export * from './types';
export * from './game-variant-types';

// Export the AI service and adapters
export { UniversalAIService } from './service';
export type { GameVariantAdapter } from './service';

// Export all adapters
export { ChessAdapter } from './chess-adapter';
export { XiangqiAdapter } from './xiangqi-adapter';
export { ShogiAdapter } from './shogi-adapter';

// Export factory functions
export * from './factory';

// Export storage utilities
export * from './storage';
