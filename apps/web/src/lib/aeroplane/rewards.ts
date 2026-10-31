import type { GameId } from '../game-id';
import type { OpponentEngineId } from '../ai/opponent';
import { isNonNegativeInteger } from './persistence';
import { TYCOON_AIRPORT_PRICE } from './tycoon';
import { isAeroplaneColor } from './types';
import type {
	AeroplaneColor,
	AeroplaneState,
	AeroplaneTransition,
} from './types';

/** Aeroplane board skin, unlocked permanently by lifetime stars. */
export type SkinId = 'classic' | 'contrail' | 'racer' | 'starlight' | 'ace';

export interface SkinCatalogEntry {
	id: SkinId;
	/** Lifetime stars required to unlock. */
	stars: number;
	/** Display label used by the setup picker and rewards panel. */
	label: string;
}

/** Unlock ladder in ascending threshold order. */
export const SKIN_CATALOG: readonly SkinCatalogEntry[] = [
	{ id: 'classic', stars: 0, label: 'Classic' },
	{ id: 'contrail', stars: 20, label: 'Contrail' },
	{ id: 'racer', stars: 60, label: 'Racer' },
	{ id: 'starlight', stars: 140, label: 'Starlight' },
	{ id: 'ace', stars: 300, label: 'Ace' },
];

/** Catalog display label for one skin. */
export function skinLabel(id: SkinId): string {
	for (const entry of SKIN_CATALOG) if (entry.id === id) return entry.label;
	return id;
}

/** Every skin whose threshold is met by `stars`. */
export function getUnlockedSkins(stars: number): SkinId[] {
	return SKIN_CATALOG.filter(entry => entry.stars <= stars).map(
		entry => entry.id
	);
}

/**
 * One completed match as scored: either a locally built
 * `SubmitPlayHistoryInput` payload or a fetched `ServerPlayHistory` row.
 */
export interface RewardMatchInput {
	gameId: GameId;
	status: 'win' | 'loss' | 'draw';
	opponentEngineId?: OpponentEngineId | null;
	details?: unknown;
}

/** Star rows for one match; `total` is the sum of the rows. */
export interface StarBreakdown {
	/** Human win: 10, otherwise 0. */
	win: number;
	/** 2 × min(capturesMade, 10). */
	captures: number;
	/** 3 × planesFinished (0–4). */
	finished: number;
	/** Sky Tycoon end-of-match surplus; 0 in Standard. */
	coins: number;
	/** Sum of the rows above. */
	total: number;
}

const WIN_STARS = 10;
const STARS_PER_CAPTURE = 2;
export const CAPTURE_COUNT_CAP = 10;
const STARS_PER_FINISHED_PLANE = 3;
export const TYCOON_BONUS_CAP = 10;
/** Stars earned per COINS_PER_STAR coins of surplus above the baseline. */
const COINS_PER_STAR = 5;
/**
 * Fixed scoring baseline: the spec measures Sky Tycoon surplus above a
 * starting balance of 10, frozen here so a future change to the live game's
 * starting coins cannot re-score (and re-lock skins from) saved matches.
 */
const TYCOON_SCORE_BASELINE_COINS = 10;

interface ParsedDetails {
	humanColor: AeroplaneColor;
	capturesMade: number;
	planesFinished: number;
	/** Human Sky Tycoon balance, or null in Standard. */
	humanCoins: number | null;
}

/** Narrow runtime parse; corrupt or partial records yield null, never a throw. */
function parseDetails(details: unknown): ParsedDetails | null {
	if (typeof details !== 'object' || details === null) return null;
	const raw = details as Record<string, unknown>;
	if (
		raw.mode !== undefined &&
		raw.mode !== 'standard' &&
		raw.mode !== 'sky-tycoon'
	) {
		return null;
	}
	if (!isAeroplaneColor(raw.humanColor)) return null;
	if (!isNonNegativeInteger(raw.capturesMade)) return null;
	// Structurally bounded by the four-plane hangar.
	if (!isNonNegativeInteger(raw.planesFinished) || raw.planesFinished > 4)
		return null;
	if (raw.mode !== 'sky-tycoon') {
		// Standard (including legacy rows without `mode`) never scores coins.
		return {
			humanColor: raw.humanColor,
			capturesMade: raw.capturesMade,
			planesFinished: raw.planesFinished,
			humanCoins: null,
		};
	}
	const humanCoins = (raw.coins as Record<string, unknown> | undefined)?.[
		raw.humanColor
	];
	if (!isNonNegativeInteger(humanCoins)) return null;
	return {
		humanColor: raw.humanColor,
		capturesMade: raw.capturesMade,
		planesFinished: raw.planesFinished,
		humanCoins,
	};
}

/**
 * Score one completed Aeroplane match against the local-trio engine, or null
 * for anything not scoreable: other variants, other opponents, draws and
 * corrupt/partial details are all skipped rather than thrown.
 */
export function scoreMatch(input: RewardMatchInput): StarBreakdown | null {
	if (input.gameId !== 'aeroplane') return null;
	if (input.opponentEngineId !== 'aeroplane-trio-v1') return null;
	if (input.status !== 'win' && input.status !== 'loss') return null;
	const details = parseDetails(input.details);
	if (!details) return null;
	const win = input.status === 'win' ? WIN_STARS : 0;
	const captures =
		STARS_PER_CAPTURE * Math.min(details.capturesMade, CAPTURE_COUNT_CAP);
	const finished = STARS_PER_FINISHED_PLANE * details.planesFinished;
	const coins =
		details.humanCoins === null
			? 0
			: Math.min(
					TYCOON_BONUS_CAP,
					Math.floor(
						Math.max(0, details.humanCoins - TYCOON_SCORE_BASELINE_COINS) /
							COINS_PER_STAR
					)
				);
	return {
		win,
		captures,
		finished,
		coins,
		total: win + captures + finished + coins,
	};
}

/** A notable human moment worth surfacing in the terminal panel. */
export interface HumanMoment {
	kind: 'capture' | 'coins';
	label: string;
	/** Captured plane count; set when `kind` is `'capture'`. */
	captures?: number;
	/** Positive coin delta; set when `kind` is `'coins'`. */
	coinGain?: number;
}

function captureLabel(count: number): string {
	if (count === 2) return 'Double capture!';
	if (count === 3) return 'Triple capture!';
	if (count === 4) return 'Quadruple capture!';
	return `Multi-capture (${count})!`;
}

/**
 * One notable moment per resolved transition: a human multi-capture (the
 * mover must be human) or a human Sky Tycoon gain of at least the airport
 * price — including transfers paid out by AI moves. Negative deltas such as
 * automatic airport buys never qualify, and a capture wins when both fire.
 */
export function deriveHumanMoment(
	prevState: AeroplaneState,
	transition: AeroplaneTransition,
	humanColor: AeroplaneColor
): HumanMoment | null {
	const captures = transition.capturedPlaneIds.length;
	if (transition.move.color === humanColor && captures >= 2) {
		return { kind: 'capture', label: captureLabel(captures), captures };
	}
	const before = prevState.tycoon?.coins[humanColor];
	const after = transition.state.tycoon?.coins[humanColor];
	if (
		before !== undefined &&
		after !== undefined &&
		after - before >= TYCOON_AIRPORT_PRICE
	) {
		return {
			kind: 'coins',
			label: 'Big coin gain!',
			coinGain: after - before,
		};
	}
	return null;
}
