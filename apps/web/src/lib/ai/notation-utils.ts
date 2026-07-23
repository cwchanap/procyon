import {
	posToNotation,
	notationToPos,
	tryNotationToPos,
} from '@procyon/game-core';
import { GAME_CONFIGS } from './game-variant-types';
import type {
	GameVariant,
	GameVariantConfig,
	GamePosition,
} from './game-variant-types';

export function configFor(variant: GameVariant): GameVariantConfig {
	return GAME_CONFIGS[variant];
}

export function positionToAlgebraic(
	variant: GameVariant,
	pos: GamePosition
): string {
	return posToNotation(GAME_CONFIGS[variant], pos);
}

export function algebraicToPosition(
	variant: GameVariant,
	str: string
): GamePosition {
	return notationToPos(GAME_CONFIGS[variant], str.trim().toLowerCase());
}

export function tryAlgebraicToPosition(
	variant: GameVariant,
	str: string
): GamePosition {
	const pos = tryNotationToPos(GAME_CONFIGS[variant], str.trim().toLowerCase());
	return pos ?? { row: -1, col: -1 };
}

export function isValidPosition(
	variant: GameVariant,
	pos: GamePosition
): boolean {
	const { rows, cols } = GAME_CONFIGS[variant].boardSize;
	return pos.row >= 0 && pos.row < rows && pos.col >= 0 && pos.col < cols;
}
