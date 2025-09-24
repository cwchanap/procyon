// Export all AI types
export * from './types';
export * from './game-variant-types';

// Export the universal service and adapters
export { UniversalAIService } from './universal-service';
export type { GameVariantAdapter } from './universal-service';

// Export all adapters
export { ChessAdapter } from './chess-adapter';
export { XiangqiAdapter } from './xiangqi-adapter';
export { ShogiAdapter } from './shogi-adapter';

// Export factory functions
export * from './factory';

// Export storage utilities
export * from './storage';

// Legacy service (for backward compatibility)
export { AIService } from './service';
