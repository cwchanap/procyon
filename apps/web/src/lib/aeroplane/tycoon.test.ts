import { describe, expect, test } from 'bun:test';
import { CLASSIC_CONFIG } from './game';
import {
	TYCOON_AIRPORT_PAIRS,
	TYCOON_AIRPORT_PAIR_TOLL,
	TYCOON_AIRPORT_PRICE,
	TYCOON_AIRPORT_TOLL,
	TYCOON_BOOST_STEPS,
	TYCOON_CUSTOMS_FEE,
	TYCOON_DEPARTURE_BONUS,
	TYCOON_STARTING_COINS,
	TYCOON_STEAL_AMOUNT,
	TYCOON_STORM_STEPS,
	TYCOON_TAX_AMOUNT,
	TYCOON_TILES,
	addCoins,
	addShield,
	clearPlaneShield,
	drawChanceCard,
	initialTycoonState,
	payCoins,
	resolveLanding,
	setAirportOwner,
	shuffleChanceDeck,
	tycoonAirportPartner,
	tycoonTileKindAt,
	transferCoins,
	type TycoonLanding,
	type TycoonTileKind,
} from './tycoon';
import {
	SHARED_PROGRESS_MAX,
	START_OFFSET,
	TURN_ORDER,
	toGlobalTrackIndex,
} from './topology';
import { TYCOON_CHANCE_CARDS } from './types';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	AeroplaneStats,
	PlaneState,
	SkyTycoonState,
	TycoonChanceCard,
} from './types';

function plane(id: string, progress: number | null): PlaneState {
	return { id, color: id.split('-')[0] as AeroplaneColor, progress };
}

const ZERO_STATS: AeroplaneStats = {
	capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
	capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
	finished: { red: 0, yellow: 0, blue: 0, green: 0 },
};

function baseTycoon(): SkyTycoonState {
	return {
		coins: { red: 10, yellow: 10, blue: 10, green: 10 },
		airports: {},
		shields: [],
		skipNextRoll: { red: false, yellow: false, blue: false, green: false },
		chanceOrder: [...TYCOON_CHANCE_CARDS],
		chanceCursor: 0,
	};
}

function withTycoon(patch: Partial<SkyTycoonState> = {}): SkyTycoonState {
	return { ...baseTycoon(), ...patch };
}

/** A deck positioned so `card` is the next cyclic draw. */
function tycoonDrawing(
	card: TycoonChanceCard,
	patch: Partial<SkyTycoonState> = {}
): SkyTycoonState {
	return withTycoon({
		...patch,
		chanceCursor: TYCOON_CHANCE_CARDS.indexOf(card),
	});
}

function stateWith(
	planes: PlaneState[],
	tycoon: SkyTycoonState,
	config: Partial<AeroplaneConfig> = {},
	currentPlayer: AeroplaneColor = 'red'
): AeroplaneState {
	return {
		config: { ...CLASSIC_CONFIG, mode: 'sky-tycoon', ...config },
		currentPlayer,
		phase: 'awaiting-choice',
		pendingRoll: null,
		planes,
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: ZERO_STATS,
		tycoon,
	};
}

/** Player-relative progress reaching a global index, or null when too far. */
function progressForTile(
	color: AeroplaneColor,
	globalIndex: number
): number | null {
	const progress = ((globalIndex - START_OFFSET[color] + 52) % 52) + 1;
	return progress <= SHARED_PROGRESS_MAX ? progress : null;
}

function landingOn(
	globalIndex: number,
	tycoon: SkyTycoonState = baseTycoon(),
	extraPlanes: PlaneState[] = [],
	config: Partial<AeroplaneConfig> = {}
): { state: AeroplaneState; landing: TycoonLanding } {
	const color =
		TURN_ORDER.find(
			candidate => progressForTile(candidate, globalIndex) !== null
		) ?? 'red';
	const progress = progressForTile(color, globalIndex)!;
	const mover = plane(`${color}-0`, progress);
	const state = stateWith([mover, ...extraPlanes], tycoon, config);
	return { state, landing: { planeId: mover.id, color, progress } };
}

function resolve(landing: {
	state: AeroplaneState;
	landing: TycoonLanding;
}): NonNullable<ReturnType<typeof resolveLanding>> {
	const result = resolveLanding(landing.state, landing.landing);
	if (!result) throw new Error('expected a Tycoon landing result');
	return result;
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const key of Object.keys(value as object)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
		Object.freeze(value);
	}
	return value;
}

describe('Sky Tycoon tile map', () => {
	test('uses the exact reviewed global-index table', () => {
		const expected: [number, TycoonTileKind][] = [
			[0, 'airport'],
			[26, 'airport'],
			[6, 'airport'],
			[32, 'airport'],
			[13, 'airport'],
			[39, 'airport'],
			[19, 'airport'],
			[45, 'airport'],
			[3, 'chance'],
			[16, 'chance'],
			[29, 'chance'],
			[42, 'chance'],
			[2, 'boost'],
			[28, 'boost'],
			[5, 'tailwind'],
			[31, 'tailwind'],
			[8, 'shield'],
			[34, 'shield'],
			[11, 'wormhole'],
			[37, 'wormhole'],
			[15, 'storm'],
			[41, 'storm'],
			[18, 'customs'],
			[44, 'customs'],
			[21, 'tax'],
			[47, 'tax'],
			[24, 'crash'],
			[50, 'crash'],
		];
		expect(TYCOON_TILES.size).toBe(expected.length);
		for (const [index, kind] of expected) {
			expect(tycoonTileKindAt(index)).toBe(kind);
		}
		expect(tycoonTileKindAt(1)).toBeNull();
		expect(tycoonTileKindAt(51)).toBeNull();
	});

	test('all tile indices are unique with exactly two crash placements', () => {
		const indices = [...TYCOON_TILES.keys()];
		expect(new Set(indices).size).toBe(indices.length);
		expect(indices.length).toBe(28);
		expect(
			indices.filter(index => tycoonTileKindAt(index) === 'crash')
		).toEqual([24, 50]);
	});

	test('airport pairs are opposite 26-node partners', () => {
		for (const [a, b] of TYCOON_AIRPORT_PAIRS) {
			expect((a + 26) % 52).toBe(b);
			expect(tycoonAirportPartner(a)).toBe(b);
			expect(tycoonAirportPartner(b)).toBe(a);
		}
		expect(tycoonAirportPartner(3)).toBeNull();
		expect(tycoonAirportPartner(24)).toBeNull();
	});

	test('every tile is reachable on the shared track by some colour', () => {
		for (const index of TYCOON_TILES.keys()) {
			const reachable = TURN_ORDER.some(color => {
				const progress = progressForTile(color, index);
				return (
					progress !== null && toGlobalTrackIndex(color, progress) === index
				);
			});
			expect(reachable).toBe(true);
		}
	});
});

describe('Sky Tycoon economy constants', () => {
	test('match the design values', () => {
		expect(TYCOON_STARTING_COINS).toBe(10);
		expect(TYCOON_DEPARTURE_BONUS).toBe(3);
		expect(TYCOON_AIRPORT_PRICE).toBe(5);
		expect(TYCOON_AIRPORT_TOLL).toBe(2);
		expect(TYCOON_AIRPORT_PAIR_TOLL).toBe(4);
		expect(TYCOON_BOOST_STEPS).toBe(3);
		expect(TYCOON_STORM_STEPS).toBe(3);
		expect(TYCOON_CUSTOMS_FEE).toBe(3);
		expect(TYCOON_TAX_AMOUNT).toBe(2);
		expect(TYCOON_STEAL_AMOUNT).toBe(3);
	});
});

describe('coin transfer helpers', () => {
	test('mint, burn, pay and transfer are capped and immutable', () => {
		const tycoon = baseTycoon();

		const minted = addCoins(tycoon, 'red', 4);
		expect(minted.coins.red).toBe(14);
		expect(minted.coins.yellow).toBe(10);
		expect(tycoon.coins.red).toBe(10);

		const burned = addCoins(tycoon, 'yellow', -4);
		expect(burned.coins.yellow).toBe(6);
		expect(tycoon.coins.yellow).toBe(10);

		const paid = payCoins(tycoon, 'blue', 4);
		expect(paid.paid).toBe(4);
		expect(paid.tycoon.coins.blue).toBe(6);
		const tooPoor = payCoins(tycoon, 'blue', 11);
		expect(tooPoor.paid).toBe(0);
		expect(tooPoor.tycoon).toBe(tycoon);

		const transfer = transferCoins(tycoon, 'blue', 'green', 4);
		expect(transfer.paid).toBe(4);
		expect(transfer.tycoon.coins.blue).toBe(6);
		expect(transfer.tycoon.coins.green).toBe(14);
		const capped = transferCoins(tycoon, 'blue', 'green', 25);
		expect(capped.paid).toBe(10);
		expect(capped.tycoon.coins.blue).toBe(0);
		expect(capped.tycoon.coins.green).toBe(20);
		const empty = transferCoins(tycoon, 'blue', 'green', 0);
		expect(empty.paid).toBe(0);
		expect(empty.tycoon).toBe(tycoon);

		expect(tycoon.coins).toEqual({
			red: 10,
			yellow: 10,
			blue: 10,
			green: 10,
		});
	});
});

describe('chance deck', () => {
	test('initial state starts the economy and one shuffled deck', () => {
		const tycoon = initialTycoonState(4242);
		expect(tycoon.coins).toEqual({
			red: 10,
			yellow: 10,
			blue: 10,
			green: 10,
		});
		expect(tycoon.airports).toEqual({});
		expect(tycoon.shields).toEqual([]);
		expect(tycoon.skipNextRoll).toEqual({
			red: false,
			yellow: false,
			blue: false,
			green: false,
		});
		expect(tycoon.chanceCursor).toBe(0);
		expect([...tycoon.chanceOrder].sort()).toEqual(
			[...TYCOON_CHANCE_CARDS].sort()
		);
		expect(tycoon.chanceOrder).toEqual(shuffleChanceDeck(4242));
	});

	test('deck order is deterministic per seed and differs across seeds', () => {
		expect(shuffleChanceDeck(1)).toEqual(shuffleChanceDeck(1));
		expect(shuffleChanceDeck(1)).not.toEqual(shuffleChanceDeck(2));
	});

	test('draws cycle through the order via the cursor without reshuffling', () => {
		const order = shuffleChanceDeck(4242);
		let tycoon = withTycoon({ chanceOrder: [...order] });
		const drawn: TycoonChanceCard[] = [];
		for (let index = 0; index < 25; index += 1) {
			const draw = drawChanceCard(tycoon);
			drawn.push(draw.card);
			tycoon = draw.next;
		}
		expect(drawn).toEqual([
			...order,
			...order,
			order[0]!,
			order[1]!,
			order[2]!,
			order[3]!,
			order[4]!,
		]);
		expect(tycoon.chanceCursor).toBe(25);
		expect(tycoon.chanceOrder).toEqual(order);
	});

	test('chance tiles draw the next cyclic card and advance the cursor once', () => {
		const order = shuffleChanceDeck(4242);
		const landing = landingOn(3, withTycoon({ chanceOrder: [...order] }));
		const result = resolve(landing);
		expect(result.events[0]).toEqual({
			type: 'card',
			color: landing.landing.color,
			card: order[0]!,
		});
		expect(result.tycoon.chanceCursor).toBe(1);
		expect(result.tycoon.chanceOrder).toEqual(order);
	});
});

describe('airport tiles', () => {
	test('unowned and affordable airports are auto-bought for 5', () => {
		const landing = landingOn(6);
		const result = resolve(landing);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([
			{
				type: 'coins',
				color: 'red',
				amount: -TYCOON_AIRPORT_PRICE,
				reason: 'airport-buy',
			},
			{ type: 'airport', tile: 6, owner: 'red' },
		]);
		expect(result.tycoon.coins.red).toBe(5);
		expect(result.tycoon.airports).toEqual({ 6: 'red' });
	});

	test('unowned and unaffordable airports are left alone', () => {
		const landing = landingOn(
			6,
			withTycoon({ coins: { red: 4, yellow: 10, blue: 10, green: 10 } })
		);
		const result = resolve(landing);
		expect(result.events).toEqual([]);
		expect(result.relocation).toBeNull();
		expect(result.tycoon).toBe(landing.state.tycoon!);
		expect(result.tycoon.coins.red).toBe(4);
	});

	test('the owner pays nothing on their own airport', () => {
		const landing = landingOn(6, setAirportOwner(baseTycoon(), 6, 'red'));
		const result = resolve(landing);
		expect(result.events).toEqual([]);
		expect(result.relocation).toBeNull();
		expect(result.tycoon).toBe(landing.state.tycoon!);
	});

	test('rivals pay a toll of 2 to a single-airport owner', () => {
		const landing = landingOn(6, setAirportOwner(baseTycoon(), 6, 'yellow'));
		const result = resolve(landing);
		expect(result.events).toEqual([
			{
				type: 'transfer',
				from: 'red',
				to: 'yellow',
				amount: TYCOON_AIRPORT_TOLL,
				reason: 'airport-toll',
			},
		]);
		expect(result.tycoon.coins.red).toBe(8);
		expect(result.tycoon.coins.yellow).toBe(12);
	});

	test('the matched pair doubles the toll to 4', () => {
		let tycoon = setAirportOwner(baseTycoon(), 6, 'yellow');
		tycoon = setAirportOwner(tycoon, 32, 'yellow');
		const landing = landingOn(6, tycoon);
		const result = resolve(landing);
		expect(result.events).toEqual([
			{
				type: 'transfer',
				from: 'red',
				to: 'yellow',
				amount: TYCOON_AIRPORT_PAIR_TOLL,
				reason: 'airport-toll',
			},
		]);
		expect(result.tycoon.coins.red).toBe(6);
		expect(result.tycoon.coins.yellow).toBe(14);
	});

	test('tolls are capped by the payer balance', () => {
		const landing = landingOn(
			6,
			withTycoon({
				coins: { red: 1, yellow: 10, blue: 10, green: 10 },
				airports: { 6: 'yellow' },
			})
		);
		const result = resolve(landing);
		expect(result.events).toEqual([
			{
				type: 'transfer',
				from: 'red',
				to: 'yellow',
				amount: 1,
				reason: 'airport-toll',
			},
		]);
		expect(result.tycoon.coins.red).toBe(0);
		expect(result.tycoon.coins.yellow).toBe(11);
	});
});

describe('named tiles', () => {
	test('boost advances three logical squares', () => {
		const landing = landingOn(2);
		const result = resolve(landing);
		expect(result.relocation).toEqual({ kind: 'progress', progress: 6 });
		expect(result.events).toEqual([
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'boost',
				toProgress: 6,
			},
		]);
		expect(result.tycoon).toBe(landing.state.tycoon!);
	});

	test('boost stays put when an enemy occupies the target', () => {
		// red boosts 3→6, i.e. global 5; yellow-0 at progress 45 sits there.
		const landing = landingOn(2, baseTycoon(), [plane('yellow-0', 45)]);
		const result = resolve(landing);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([]);
	});

	test('boost respects friendly stacking rules on the target', () => {
		const blocked = landingOn(2, baseTycoon(), [plane('red-1', 6)]);
		expect(resolve(blocked).relocation).toBeNull();
		const stacked = landingOn(2, baseTycoon(), [plane('red-1', 6)], {
			stacking: true,
		});
		expect(resolve(stacked).relocation).toEqual({
			kind: 'progress',
			progress: 6,
		});
	});

	test('boost stops when the path crosses a blockade', () => {
		// Two yellow planes at progress 43 occupy global 3, on red's 3→6 path.
		const landing = landingOn(
			2,
			baseTycoon(),
			[plane('yellow-0', 43), plane('yellow-1', 43)],
			{ blockades: true }
		);
		const result = resolve(landing);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([]);
	});

	test('tailwind grants one informational bonus roll', () => {
		const landing = landingOn(5);
		const result = resolve(landing);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([{ type: 'tailwind', color: 'red' }]);
		expect(result.tycoon).toBe(landing.state.tycoon!);
	});

	test('shield pickups protect the mover without stacking', () => {
		const landing = landingOn(8);
		const first = resolve(landing);
		expect(first.tycoon.shields).toEqual(['red-0']);
		expect(first.events).toEqual([{ type: 'shield', planeId: 'red-0' }]);

		// A repeated pickup stays a single entry.
		const shielded = { ...landing.state, tycoon: first.tycoon };
		const second = resolveLanding(shielded, landing.landing);
		expect(second?.tycoon.shields).toEqual(['red-0']);
		expect(second?.tycoon.shields.length).toBe(1);
	});

	test('clearPlaneShield expires exactly the moved plane', () => {
		let tycoon = addShield(baseTycoon(), 'red-0');
		tycoon = addShield(tycoon, 'red-0');
		expect(tycoon.shields).toEqual(['red-0']);
		tycoon = addShield(tycoon, 'blue-1');
		expect(tycoon.shields).toEqual(['red-0', 'blue-1']);

		const expired = clearPlaneShield(tycoon, 'red-0');
		expect(expired.shields).toEqual(['blue-1']);
		expect(tycoon.shields).toEqual(['red-0', 'blue-1']);
		expect(clearPlaneShield(tycoon, 'green-2')).toBe(tycoon);
	});

	test('wormhole warps forward to the next wormhole on the route', () => {
		// red lands on global 11 at progress 12; the next wormhole is global 37.
		const landing = landingOn(11);
		const result = resolve(landing);
		expect(result.relocation).toEqual({ kind: 'progress', progress: 38 });
		expect(result.events).toEqual([
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'wormhole',
				toProgress: 38,
			},
		]);
	});

	test('wormhole stays put with none ahead or a blocked destination', () => {
		// blue reaches global 11 at progress 38; global 37 lies behind it.
		const behind = landingOn(11);
		expect(behind.landing.color).toBe('red');
		const blueState = stateWith([plane('blue-0', 38)], baseTycoon());
		const blueResult = resolveLanding(blueState, {
			planeId: 'blue-0',
			color: 'blue',
			progress: 38,
		});
		expect(blueResult?.relocation).toBeNull();
		expect(blueResult?.events).toEqual([]);

		// yellow-0 at progress 25 occupies global 37, red's warp target.
		const blocked = landingOn(11, baseTycoon(), [plane('yellow-0', 25)]);
		expect(resolve(blocked).relocation).toBeNull();
	});

	test('storm retreats up to three squares and can stop at the launch pad', () => {
		const mid = landingOn(15);
		const midResult = resolve(mid);
		expect(midResult.relocation).toEqual({ kind: 'progress', progress: 13 });
		expect(midResult.events).toEqual([
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'storm',
				toProgress: 13,
			},
		]);

		// yellow reaches global 15 at progress 3, so the storm hits the pad.
		const padState = stateWith([plane('yellow-0', 3)], baseTycoon());
		const padResult = resolveLanding(padState, {
			planeId: 'yellow-0',
			color: 'yellow',
			progress: 3,
		});
		expect(padResult?.relocation).toEqual({ kind: 'progress', progress: 0 });
	});

	test('storm never displaces an occupied launch pad or a blocked square', () => {
		const padTaken = stateWith(
			[plane('yellow-0', 3), plane('yellow-1', 0)],
			baseTycoon()
		);
		const padResult = resolveLanding(padTaken, {
			planeId: 'yellow-0',
			color: 'yellow',
			progress: 3,
		});
		expect(padResult?.relocation).toBeNull();
		expect(padResult?.events).toEqual([]);

		// blue-0 at progress 39 occupies global 12, red's storm target.
		const blocked = landingOn(15, baseTycoon(), [plane('blue-0', 39)]);
		const result = resolve(blocked);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([]);
	});

	test('customs auto-pays 3 or marks the next roll as skipped', () => {
		const affordable = landingOn(18);
		const paid = resolve(affordable);
		expect(paid.relocation).toBeNull();
		expect(paid.events).toEqual([
			{
				type: 'coins',
				color: 'red',
				amount: -TYCOON_CUSTOMS_FEE,
				reason: 'customs',
			},
		]);
		expect(paid.tycoon.coins.red).toBe(7);
		expect(paid.tycoon.skipNextRoll.red).toBe(false);

		const poor = landingOn(
			18,
			withTycoon({ coins: { red: 2, yellow: 10, blue: 10, green: 10 } })
		);
		const skipped = resolve(poor);
		expect(skipped.tycoon.coins.red).toBe(2);
		expect(skipped.tycoon.skipNextRoll).toEqual({
			red: true,
			yellow: false,
			blue: false,
			green: false,
		});
		expect(skipped.events).toEqual([{ type: 'skip', color: 'red' }]);
	});

	test('tax pays up to 2 and never below zero', () => {
		const rich = resolve(landingOn(21));
		expect(rich.events).toEqual([
			{ type: 'coins', color: 'red', amount: -2, reason: 'tax' },
		]);
		expect(rich.tycoon.coins.red).toBe(8);

		const poor = resolve(
			landingOn(
				21,
				withTycoon({ coins: { red: 1, yellow: 10, blue: 10, green: 10 } })
			)
		);
		expect(poor.events).toEqual([
			{ type: 'coins', color: 'red', amount: -1, reason: 'tax' },
		]);
		expect(poor.tycoon.coins.red).toBe(0);

		const broke = resolve(
			landingOn(
				21,
				withTycoon({ coins: { red: 0, yellow: 10, blue: 10, green: 10 } })
			)
		);
		expect(broke.events).toEqual([]);
		expect(broke.tycoon.coins.red).toBe(0);
	});

	test('crash returns the mover to the hangar from both placements', () => {
		const first = resolve(landingOn(24));
		expect(first.relocation).toEqual({ kind: 'hangar' });
		expect(first.events).toEqual([
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'crash',
				toProgress: null,
			},
		]);

		// yellow reaches global 50 at progress 38: the second crash tile.
		const second = landingOn(50);
		expect(second.landing.color).toBe('yellow');
		const secondResult = resolve(second);
		expect(secondResult.relocation).toEqual({ kind: 'hangar' });
		expect(secondResult.events).toEqual([
			{
				type: 'relocation',
				planeId: 'yellow-0',
				effect: 'crash',
				toProgress: null,
			},
		]);
	});
});

describe('chance cards', () => {
	test('gain-4 and gain-2 mint coins', () => {
		const gain4 = resolve(landingOn(3, tycoonDrawing('gain-4')));
		expect(gain4.events).toEqual([
			{ type: 'card', color: 'red', card: 'gain-4' },
			{ type: 'coins', color: 'red', amount: 4, reason: 'chance' },
		]);
		expect(gain4.tycoon.coins.red).toBe(14);

		const gain2 = resolve(landingOn(3, tycoonDrawing('gain-2')));
		expect(gain2.tycoon.coins.red).toBe(12);
	});

	test('lose-2 burns up to 2 coins and never goes negative', () => {
		const rich = resolve(landingOn(3, tycoonDrawing('lose-2')));
		expect(rich.events).toEqual([
			{ type: 'card', color: 'red', card: 'lose-2' },
			{ type: 'coins', color: 'red', amount: -2, reason: 'chance' },
		]);
		expect(rich.tycoon.coins.red).toBe(8);

		const poor = resolve(
			landingOn(
				3,
				tycoonDrawing('lose-2', {
					coins: { red: 1, yellow: 10, blue: 10, green: 10 },
				})
			)
		);
		expect(poor.tycoon.coins.red).toBe(0);
		expect(poor.events).toEqual([
			{ type: 'card', color: 'red', card: 'lose-2' },
			{ type: 'coins', color: 'red', amount: -1, reason: 'chance' },
		]);
	});

	test('steal-3 takes up to 3 from the richest opponent, ties by turn order', () => {
		const tied = resolve(landingOn(3, tycoonDrawing('steal-3')));
		expect(tied.events).toEqual([
			{ type: 'card', color: 'red', card: 'steal-3' },
			{
				type: 'transfer',
				from: 'yellow',
				to: 'red',
				amount: 3,
				reason: 'steal',
			},
		]);
		expect(tied.tycoon.coins.red).toBe(13);
		expect(tied.tycoon.coins.yellow).toBe(7);

		const richest = resolve(
			landingOn(
				3,
				tycoonDrawing('steal-3', {
					coins: { red: 10, yellow: 15, blue: 10, green: 20 },
				})
			)
		);
		expect(richest.tycoon.coins.green).toBe(17);
		expect(richest.tycoon.coins.red).toBe(13);

		const capped = resolve(
			landingOn(
				3,
				tycoonDrawing('steal-3', {
					coins: { red: 10, yellow: 1, blue: 0, green: 0 },
				})
			)
		);
		expect(capped.tycoon.coins.yellow).toBe(0);
		expect(capped.tycoon.coins.red).toBe(11);
	});

	test('movement and status cards reuse the tile semantics', () => {
		const boost = resolve(landingOn(3, tycoonDrawing('boost')));
		expect(boost.relocation).toEqual({ kind: 'progress', progress: 7 });
		expect(boost.events).toEqual([
			{ type: 'card', color: 'red', card: 'boost' },
			{
				type: 'relocation',
				planeId: 'red-0',
				effect: 'boost',
				toProgress: 7,
			},
		]);

		const tailwind = resolve(landingOn(3, tycoonDrawing('tailwind')));
		expect(tailwind.events).toEqual([
			{ type: 'card', color: 'red', card: 'tailwind' },
			{ type: 'tailwind', color: 'red' },
		]);

		const shield = resolve(landingOn(3, tycoonDrawing('shield')));
		expect(shield.tycoon.shields).toEqual(['red-0']);

		const storm = resolve(landingOn(3, tycoonDrawing('storm')));
		expect(storm.relocation).toEqual({ kind: 'progress', progress: 1 });

		const customs = resolve(landingOn(3, tycoonDrawing('customs')));
		expect(customs.tycoon.coins.red).toBe(7);

		const crash = resolve(landingOn(3, tycoonDrawing('crash')));
		expect(crash.relocation).toEqual({ kind: 'hangar' });
		// A crash card changes nothing but the draw cursor.
		expect(crash.tycoon).toEqual({
			...tycoonDrawing('crash'),
			chanceCursor: TYCOON_CHANCE_CARDS.indexOf('crash') + 1,
		});
	});

	test('a blocked card relocation consumes the effect without moving', () => {
		// yellow-0 at progress 46 occupies global 6, the boost card target.
		const landing = landingOn(3, tycoonDrawing('boost'), [
			plane('yellow-0', 46),
		]);
		const result = resolve(landing);
		expect(result.relocation).toBeNull();
		expect(result.events).toEqual([
			{ type: 'card', color: 'red', card: 'boost' },
		]);
		expect(result.tycoon.chanceCursor).toBe(
			TYCOON_CHANCE_CARDS.indexOf('boost') + 1
		);
	});

	test('card relocations never chain into the destination tile', () => {
		// Boost card from the chance tile lands red on global 6: an airport.
		const landing = landingOn(3, tycoonDrawing('boost'));
		const result = resolve(landing);
		expect(result.relocation).toEqual({ kind: 'progress', progress: 7 });
		expect(result.events).toHaveLength(2);
		expect(
			result.events.filter(
				event => event.type === 'airport' || event.type === 'card'
			)
		).toEqual([{ type: 'card', color: 'red', card: 'boost' }]);
		expect(result.tycoon.airports).toEqual({});
	});
});

describe('resolveLanding guards', () => {
	test('returns null for standard matches', () => {
		const landing = landingOn(6);
		const state = { ...landing.state, tycoon: null };
		expect(resolveLanding(state, landing.landing)).toBeNull();
	});

	test('non-shared and plain landings are inert no-ops', () => {
		const landing = landingOn(3);
		const tycoon = landing.state.tycoon!;
		for (const progress of [0, 52]) {
			const result = resolveLanding(landing.state, {
				planeId: 'red-0',
				color: 'red',
				progress,
			});
			expect(result?.events).toEqual([]);
			expect(result?.relocation).toBeNull();
			expect(result?.tycoon).toBe(tycoon);
		}

		const plain = landingOn(1);
		const plainResult = resolve(plain);
		expect(plainResult.events).toEqual([]);
		expect(plainResult.relocation).toBeNull();
		expect(plainResult.tycoon).toBe(plain.state.tycoon!);
	});

	test('unknown movers are inert', () => {
		const landing = landingOn(6);
		const result = resolveLanding(landing.state, {
			planeId: 'red-9',
			color: 'red',
			progress: 7,
		});
		expect(result?.events).toEqual([]);
		expect(result?.tycoon).toBe(landing.state.tycoon!);
	});
});

describe('Sky Tycoon purity', () => {
	test('resolveLanding never mutates the input state', () => {
		const scenarios: (() => {
			state: AeroplaneState;
			landing: TycoonLanding;
		})[] = [
			// Airport auto-buy.
			() => landingOn(6),
			// Airport toll payment.
			() => landingOn(6, setAirportOwner(baseTycoon(), 6, 'yellow')),
			// Chance draw with a crash card.
			() => landingOn(3, tycoonDrawing('crash')),
			// Boost relocation.
			() => landingOn(2),
			// Customs skip.
			() =>
				landingOn(
					18,
					withTycoon({ coins: { red: 2, yellow: 10, blue: 10, green: 10 } })
				),
		];
		for (const scenario of scenarios) {
			const { state, landing } = scenario();
			const before = structuredClone(state);
			resolveLanding(state, landing);
			expect(state).toEqual(before);
		}
	});

	test('resolveLanding tolerates deeply frozen inputs', () => {
		const bought = landingOn(6);
		expect(() =>
			resolveLanding(deepFreeze(bought.state), bought.landing)
		).not.toThrow();

		const drawn = landingOn(3, tycoonDrawing('storm'));
		expect(() =>
			resolveLanding(deepFreeze(drawn.state), drawn.landing)
		).not.toThrow();
	});
});
