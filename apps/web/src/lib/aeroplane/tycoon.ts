import {
	finalHomeOccupancy,
	finalSharedOccupancy,
	pathCrossesBlockade,
} from './rules';
import {
	SHARED_PROGRESS_MAX,
	TURN_ORDER,
	isSharedTrackProgress,
	toGlobalTrackIndex,
	toPosition,
} from './topology';
import { nextUint32, normalizeRngState } from './rng';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneColor,
	AeroplaneState,
	PlaneState,
	SkyTycoonState,
	TycoonChanceCard,
	TycoonCoinReason,
	TycoonEffectEvent,
} from './types';

export type TycoonTileKind =
	| 'airport'
	| 'chance'
	| 'boost'
	| 'tailwind'
	| 'shield'
	| 'wormhole'
	| 'storm'
	| 'customs'
	| 'tax'
	| 'crash';

export const TYCOON_STARTING_COINS = 10;
export const TYCOON_DEPARTURE_BONUS = 3;
export const TYCOON_AIRPORT_PRICE = 5;
export const TYCOON_AIRPORT_TOLL = 2;
export const TYCOON_AIRPORT_PAIR_TOLL = 4;
export const TYCOON_BOOST_STEPS = 3;
export const TYCOON_STORM_STEPS = 3;
export const TYCOON_CUSTOMS_FEE = 3;
export const TYCOON_TAX_AMOUNT = 2;
export const TYCOON_STEAL_AMOUNT = 3;

/**
 * The exact reviewed global-index map (0–51). Airport pairs repeat at each
 * 13-square player-start offset while the other kinds form opposite 26-node
 * pairs; the deliberate four-colour asymmetry is documented in the design.
 */
export const TYCOON_AIRPORT_PAIRS: readonly (readonly [number, number])[] = [
	[0, 26],
	[6, 32],
	[13, 39],
	[19, 45],
];

const TYCOON_TILE_INDICES: Readonly<
	Record<Exclude<TycoonTileKind, 'airport'>, readonly number[]>
> = {
	chance: [3, 16, 29, 42],
	boost: [2, 28],
	tailwind: [5, 31],
	shield: [8, 34],
	wormhole: [11, 37],
	storm: [15, 41],
	customs: [18, 44],
	tax: [21, 47],
	crash: [24, 50],
};

/** Static global-index → tile-kind table shared by resolver and board. */
export const TYCOON_TILES: ReadonlyMap<number, TycoonTileKind> = (() => {
	const table = new Map<number, TycoonTileKind>();
	for (const pair of TYCOON_AIRPORT_PAIRS) {
		table.set(pair[0], 'airport');
		table.set(pair[1], 'airport');
	}
	for (const entry of Object.entries(TYCOON_TILE_INDICES)) {
		const kind = entry[0] as Exclude<TycoonTileKind, 'airport'>;
		for (const index of entry[1]) table.set(index, kind);
	}
	return table;
})();

export function tycoonTileKindAt(globalIndex: number): TycoonTileKind | null {
	return TYCOON_TILES.get(globalIndex) ?? null;
}

/** The paired airport global index, or null for non-airport tiles. */
export function tycoonAirportPartner(globalIndex: number): number | null {
	for (const pair of TYCOON_AIRPORT_PAIRS) {
		if (pair[0] === globalIndex) return pair[1];
		if (pair[1] === globalIndex) return pair[0];
	}
	return null;
}

/** Distinct salt so the discarded effects stream never aligns with dice/AI. */
const EFFECTS_SEED_SALT = 0x0effec75;

/**
 * Temporary salted effects seed for the one-time deck shuffle. Callers must
 * discard it: only `chanceOrder`/`chanceCursor` persist in `state.tycoon`.
 */
export function deriveEffectsSeed(rootSeed: number): number {
	return nextUint32({
		value: normalizeRngState(rootSeed).value ^ EFFECTS_SEED_SALT,
	}).value;
}

/** One-time seeded Fisher–Yates of the ten-card deck; no RNG survives it. */
export function shuffleChanceDeck(rootSeed: number): TycoonChanceCard[] {
	const deck: TycoonChanceCard[] = [...TYCOON_CHANCE_CARDS];
	let rng = { value: deriveEffectsSeed(rootSeed) };
	for (let index = deck.length - 1; index >= 1; index -= 1) {
		const sample = nextUint32(rng);
		rng = sample.rng;
		const swap = sample.value % (index + 1);
		const temp = deck[index]!;
		deck[index] = deck[swap]!;
		deck[swap] = temp;
	}
	return deck;
}

/** Fresh economy plus the once-shuffled cyclic deck for a new Tycoon match. */
export function initialTycoonState(rootSeed: number): SkyTycoonState {
	return {
		coins: {
			red: TYCOON_STARTING_COINS,
			yellow: TYCOON_STARTING_COINS,
			blue: TYCOON_STARTING_COINS,
			green: TYCOON_STARTING_COINS,
		},
		airports: {},
		shields: [],
		skipNextRoll: { red: false, yellow: false, blue: false, green: false },
		chanceOrder: shuffleChanceDeck(rootSeed),
		chanceCursor: 0,
	};
}

/** Mint or burn coins against the unlimited bank; balances never go negative. */
export function addCoins(
	tycoon: SkyTycoonState,
	color: AeroplaneColor,
	amount: number
): SkyTycoonState {
	return {
		...tycoon,
		coins: { ...tycoon.coins, [color]: tycoon.coins[color] + amount },
	};
}

/** Pay an exact amount or nothing; affordability is the caller's decision. */
export function payCoins(
	tycoon: SkyTycoonState,
	color: AeroplaneColor,
	amount: number
): { tycoon: SkyTycoonState; paid: number } {
	if (tycoon.coins[color] < amount) return { tycoon, paid: 0 };
	return { tycoon: addCoins(tycoon, color, -amount), paid: amount };
}

/** Move up to `amount` coins between colours, capped by the payer's balance. */
export function transferCoins(
	tycoon: SkyTycoonState,
	from: AeroplaneColor,
	to: AeroplaneColor,
	amount: number
): { tycoon: SkyTycoonState; paid: number } {
	const paid = Math.min(amount, tycoon.coins[from]);
	if (paid <= 0) return { tycoon, paid: 0 };
	return {
		tycoon: {
			...tycoon,
			coins: {
				...tycoon.coins,
				[from]: tycoon.coins[from] - paid,
				[to]: tycoon.coins[to] + paid,
			},
		},
		paid,
	};
}

export function ownsAirportPair(
	tycoon: SkyTycoonState,
	tile: number,
	owner: AeroplaneColor
): boolean {
	const partner = tycoonAirportPartner(tile);
	return (
		partner !== null &&
		tycoon.airports[tile] === owner &&
		tycoon.airports[partner] === owner
	);
}

export function setAirportOwner(
	tycoon: SkyTycoonState,
	tile: number,
	owner: AeroplaneColor
): SkyTycoonState {
	return { ...tycoon, airports: { ...tycoon.airports, [tile]: owner } };
}

/** Grant the one-shot landing shield; repeated pickups do not stack. */
export function addShield(
	tycoon: SkyTycoonState,
	planeId: string
): SkyTycoonState {
	if (tycoon.shields.includes(planeId)) return tycoon;
	return { ...tycoon, shields: [...tycoon.shields, planeId] };
}

/** Expire-on-move support: drop a plane's shield when that plane next moves. */
export function clearPlaneShield(
	tycoon: SkyTycoonState,
	planeId: string
): SkyTycoonState {
	if (!tycoon.shields.includes(planeId)) return tycoon;
	return {
		...tycoon,
		shields: tycoon.shields.filter(id => id !== planeId),
	};
}

/** Draw cyclically; the cursor, not a reshuffle, cycles cards to the bottom. */
export function drawChanceCard(tycoon: SkyTycoonState): {
	card: TycoonChanceCard;
	next: SkyTycoonState;
} {
	const card =
		tycoon.chanceOrder[tycoon.chanceCursor % TYCOON_CHANCE_CARDS.length];
	if (!card) throw new Error('Chance deck must contain the ten card ids');
	return { card, next: { ...tycoon, chanceCursor: tycoon.chanceCursor + 1 } };
}

export interface TycoonLanding {
	planeId: string;
	color: AeroplaneColor;
	/** Final shared-track landing progress (1–50) that triggered the tile. */
	progress: number;
}

export type TycoonRelocation =
	| { kind: 'progress'; progress: number }
	| { kind: 'hangar' };

export interface TycoonLandingResult {
	tycoon: SkyTycoonState;
	events: TycoonEffectEvent[];
	/** Where the engine must relocate the mover, if any. Never re-triggered. */
	relocation: TycoonRelocation | null;
}

function noEffect(tycoon: SkyTycoonState): TycoonLandingResult {
	return { tycoon, events: [], relocation: null };
}

function findPlane(state: AeroplaneState, planeId: string): PlaneState | null {
	return state.planes.find(candidate => candidate.id === planeId) ?? null;
}

/**
 * Whether the mover may stop on a shared square via a forced relocation.
 * Forced moves never capture: existing enemy planes (shielded or not) block
 * the stop, own planes only when stacking permits joining.
 */
function forcedSharedStop(
	state: AeroplaneState,
	plane: PlaneState,
	progress: number
): boolean {
	const position = toPosition(plane.color, progress);
	if (position.kind !== 'track') return false;
	const captures = finalSharedOccupancy(state, plane, position);
	return captures !== null && captures.length === 0;
}

function boostTarget(
	state: AeroplaneState,
	plane: PlaneState,
	fromProgress: number
): number | null {
	const target = fromProgress + TYCOON_BOOST_STEPS;
	if (target > SHARED_PROGRESS_MAX) {
		// Home progress 51–53: never finish. The shared stretch before the
		// private lane still respects blockades; the home cell must be free.
		if (
			pathCrossesBlockade(state, plane.color, fromProgress, SHARED_PROGRESS_MAX)
		)
			return null;
		return finalHomeOccupancy(state, plane, target) ? null : target;
	}
	if (pathCrossesBlockade(state, plane.color, fromProgress, target)) {
		return null;
	}
	return forcedSharedStop(state, plane, target) ? target : null;
}

function wormholeTarget(
	state: AeroplaneState,
	plane: PlaneState,
	fromProgress: number
): number | null {
	for (
		let progress = fromProgress + 1;
		progress <= SHARED_PROGRESS_MAX;
		progress += 1
	) {
		if (
			tycoonTileKindAt(toGlobalTrackIndex(plane.color, progress)) === 'wormhole'
		) {
			return forcedSharedStop(state, plane, progress) ? progress : null;
		}
	}
	return null;
}

function stormTarget(
	state: AeroplaneState,
	plane: PlaneState,
	fromProgress: number
): number | null {
	const target = Math.max(fromProgress - TYCOON_STORM_STEPS, 0);
	if (target === 0) {
		// The launch pad holds at most one own plane, as launching requires.
		const launchTaken = state.planes.some(
			candidate =>
				candidate.id !== plane.id &&
				candidate.color === plane.color &&
				candidate.progress === 0
		);
		return launchTaken ? null : 0;
	}
	return forcedSharedStop(state, plane, target) ? target : null;
}

/** Highest-balance opponent; ties break by TURN_ORDER. */
function richestOpponent(
	tycoon: SkyTycoonState,
	mover: AeroplaneColor
): AeroplaneColor {
	let richest: AeroplaneColor | null = null;
	for (const color of TURN_ORDER) {
		if (color === mover) continue;
		if (richest === null || tycoon.coins[color] > tycoon.coins[richest]) {
			richest = color;
		}
	}
	if (richest === null) throw new Error('A mover must have opponents');
	return richest;
}

function resolveAirport(
	tycoon: SkyTycoonState,
	color: AeroplaneColor,
	tile: number
): TycoonLandingResult {
	const owner = tycoon.airports[tile];
	if (owner === color) return noEffect(tycoon);
	if (owner === undefined) {
		const purchase = payCoins(tycoon, color, TYCOON_AIRPORT_PRICE);
		if (purchase.paid === 0) return noEffect(tycoon);
		return {
			tycoon: setAirportOwner(purchase.tycoon, tile, color),
			events: [
				{
					type: 'coins',
					color,
					amount: -TYCOON_AIRPORT_PRICE,
					reason: 'airport-buy',
				},
				{ type: 'airport', tile, owner: color },
			],
			relocation: null,
		};
	}
	const toll = ownsAirportPair(tycoon, tile, owner)
		? TYCOON_AIRPORT_PAIR_TOLL
		: TYCOON_AIRPORT_TOLL;
	const payment = transferCoins(tycoon, color, owner, toll);
	return {
		tycoon: payment.tycoon,
		events:
			payment.paid > 0
				? [
						{
							type: 'transfer',
							from: color,
							to: owner,
							amount: payment.paid,
							reason: 'airport-toll',
						},
					]
				: [],
		relocation: null,
	};
}

function coinEvent(
	color: AeroplaneColor,
	amount: number,
	reason: TycoonCoinReason
): TycoonEffectEvent {
	return { type: 'coins', color, amount, reason };
}

function relocationResult(
	tycoon: SkyTycoonState,
	planeId: string,
	effect: 'boost' | 'wormhole' | 'storm',
	target: number | null
): TycoonLandingResult {
	if (target === null) return noEffect(tycoon);
	return {
		tycoon,
		events: [{ type: 'relocation', planeId, effect, toProgress: target }],
		relocation: { kind: 'progress', progress: target },
	};
}

/**
 * Apply one named tile/card effect. Tile-only kinds (`airport`, `chance`,
 * `wormhole`, `tax`) enter through their tile cases; Chance cards never chain
 * to another tile, so no card re-enters this switch from a landing.
 */
function applyNamedEffect(
	state: AeroplaneState,
	tycoon: SkyTycoonState,
	plane: PlaneState,
	progress: number,
	effect: TycoonTileKind | TycoonChanceCard
): TycoonLandingResult {
	switch (effect) {
		case 'airport':
		case 'chance':
			return noEffect(tycoon);
		case 'gain-4':
			return {
				tycoon: addCoins(tycoon, plane.color, 4),
				events: [coinEvent(plane.color, 4, 'chance')],
				relocation: null,
			};
		case 'gain-2':
			return {
				tycoon: addCoins(tycoon, plane.color, 2),
				events: [coinEvent(plane.color, 2, 'chance')],
				relocation: null,
			};
		case 'lose-2': {
			const amount = -Math.min(2, tycoon.coins[plane.color]);
			return {
				tycoon: addCoins(tycoon, plane.color, amount),
				events: amount < 0 ? [coinEvent(plane.color, amount, 'chance')] : [],
				relocation: null,
			};
		}
		case 'steal-3': {
			const victim = richestOpponent(tycoon, plane.color);
			const stolen = transferCoins(
				tycoon,
				victim,
				plane.color,
				TYCOON_STEAL_AMOUNT
			);
			return {
				tycoon: stolen.tycoon,
				events:
					stolen.paid > 0
						? [
								{
									type: 'transfer',
									from: victim,
									to: plane.color,
									amount: stolen.paid,
									reason: 'steal',
								},
							]
						: [],
				relocation: null,
			};
		}
		case 'boost':
			return relocationResult(
				tycoon,
				plane.id,
				'boost',
				boostTarget(state, plane, progress)
			);
		case 'tailwind':
			return {
				tycoon,
				events: [{ type: 'tailwind', color: plane.color }],
				relocation: null,
			};
		case 'shield':
			return {
				tycoon: addShield(tycoon, plane.id),
				events: [{ type: 'shield', planeId: plane.id }],
				relocation: null,
			};
		case 'wormhole':
			return relocationResult(
				tycoon,
				plane.id,
				'wormhole',
				wormholeTarget(state, plane, progress)
			);
		case 'storm':
			return relocationResult(
				tycoon,
				plane.id,
				'storm',
				stormTarget(state, plane, progress)
			);
		case 'customs': {
			const payment = payCoins(tycoon, plane.color, TYCOON_CUSTOMS_FEE);
			if (payment.paid > 0) {
				return {
					tycoon: payment.tycoon,
					events: [coinEvent(plane.color, -TYCOON_CUSTOMS_FEE, 'customs')],
					relocation: null,
				};
			}
			return {
				tycoon: {
					...tycoon,
					skipNextRoll: { ...tycoon.skipNextRoll, [plane.color]: true },
				},
				events: [{ type: 'skip', color: plane.color }],
				relocation: null,
			};
		}
		case 'tax': {
			const amount = -Math.min(TYCOON_TAX_AMOUNT, tycoon.coins[plane.color]);
			return {
				tycoon: addCoins(tycoon, plane.color, amount),
				events: amount < 0 ? [coinEvent(plane.color, amount, 'tax')] : [],
				relocation: null,
			};
		}
		case 'crash':
			return {
				tycoon,
				events: [
					{
						type: 'relocation',
						planeId: plane.id,
						effect: 'crash',
						toProgress: null,
					},
				],
				relocation: { kind: 'hangar' },
			};
	}
}

/**
 * Resolve exactly one tile effect after a normal final shared-track landing.
 * Pure: the input state and its tycoon layer are never mutated. A forced
 * relocation is returned, never applied here, and never triggers another
 * tile, flight, jump or card. Returns null when the match is Standard.
 */
export function resolveLanding(
	state: AeroplaneState,
	landing: TycoonLanding
): TycoonLandingResult | null {
	const start = state.tycoon;
	if (!start) return null;
	if (!isSharedTrackProgress(landing.progress)) return noEffect(start);
	const plane = findPlane(state, landing.planeId);
	if (!plane) return noEffect(start);
	const tile = toGlobalTrackIndex(landing.color, landing.progress);
	const kind = tycoonTileKindAt(tile);
	if (!kind) return noEffect(start);

	if (kind === 'airport') {
		return resolveAirport(start, plane.color, tile);
	}
	if (kind === 'chance') {
		const draw = drawChanceCard(start);
		const applied = applyNamedEffect(
			state,
			draw.next,
			plane,
			landing.progress,
			draw.card
		);
		return {
			tycoon: applied.tycoon,
			events: [
				{ type: 'card', color: plane.color, card: draw.card },
				...applied.events,
			],
			relocation: applied.relocation,
		};
	}
	return applyNamedEffect(state, start, plane, landing.progress, kind);
}
