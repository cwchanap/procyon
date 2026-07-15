import type { GameVariant } from './ai/game-variant-types';

export const CAPTURE_RING: Record<GameVariant, string> = {
	chess: 'absolute inset-0 border-4 border-chess rounded pointer-events-none',
	xiangqi:
		'absolute inset-0 border-4 border-xiangqi rounded pointer-events-none',
	shogi: 'absolute inset-0 border-2 border-shogi rounded pointer-events-none',
	jungle: 'absolute inset-0 border-2 border-jungle rounded pointer-events-none',
};

export const CAPTURE_SWATCH: Record<GameVariant, string> = {
	chess: 'border-2 border-chess rounded',
	xiangqi: 'border-2 border-xiangqi rounded',
	shogi: 'border-2 border-shogi rounded',
	jungle: 'border-2 border-jungle rounded',
};
