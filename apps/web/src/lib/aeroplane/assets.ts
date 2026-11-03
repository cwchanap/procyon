import type { SkinId } from './rewards';
import type { TycoonTileKind } from './tycoon';
import type { AeroplaneColor } from './types';

/** Every Aeroplane runtime asset is served from this public root. */
const AEROPLANE_ASSET_ROOT = '/aeroplane';

/** Board background drawn inside the BoardSurface image slot. */
export const BOARD_BACKGROUND_URL = `${AEROPLANE_ASSET_ROOT}/board/background.svg`;

/** Served plane sprite for one skin × colour. */
export function spriteUrl(skin: SkinId, color: AeroplaneColor): string {
	return `${AEROPLANE_ASSET_ROOT}/planes/${skin}-${color}.svg`;
}

/** Served tile icon for one Sky Tycoon tile kind, or the coin. */
export function tileIconUrl(kind: TycoonTileKind | 'coin'): string {
	return `${AEROPLANE_ASSET_ROOT}/icons/${kind}.svg`;
}

/** The nine optimized AAC cues in the pack, in README order. */
export const AEROPLANE_CUES = [
	'roll',
	'hop',
	'flight',
	'capture',
	'finish',
	'win',
	'coin-gain',
	'coin-loss',
	'trap',
] as const;

export type AeroplaneCue = (typeof AEROPLANE_CUES)[number];

/** Served audio file for one cue. */
export function cueUrl(cue: AeroplaneCue): string {
	return `${AEROPLANE_ASSET_ROOT}/sfx/${cue}.m4a`;
}
