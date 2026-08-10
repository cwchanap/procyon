import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';

export const GAME_ROUTES = {
	chess: '/chess',
	xiangqi: '/xiangqi',
	shogi: '/shogi',
	jungle: '/jungle',
	aeroplane: '/aeroplane',
} satisfies Record<GameId, string>;

export const STRATEGY_GAME_ROUTES = {
	chess: GAME_ROUTES.chess,
	xiangqi: GAME_ROUTES.xiangqi,
	shogi: GAME_ROUTES.shogi,
	jungle: GAME_ROUTES.jungle,
} satisfies Record<GameVariant, string>;

export function isAIConfigGamePath(path: string): boolean {
	return Object.values(STRATEGY_GAME_ROUTES).some(route =>
		path.startsWith(route)
	);
}
