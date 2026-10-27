import type { RngState } from './rng';

export const AEROPLANE_COLORS = ['red', 'yellow', 'blue', 'green'] as const;
export type AeroplaneColor = (typeof AEROPLANE_COLORS)[number];
export type Personality = 'cautious' | 'aggressive' | 'unpredictable';
export type DiceMode = 'fair' | 'relaxed';
export type LaunchRule = 'six' | 'five-or-six';
export type FinishRule = 'exact' | 'bounce';
export type AeroplanePhase = 'awaiting-roll' | 'awaiting-choice' | 'finished';
export type AeroplaneRulePreset = 'classic' | 'quick-chill' | 'custom';
/** Independent gameplay mode; Sky Tycoon layers coins/tiles over standard rules. */
export type AeroplaneMode = 'standard' | 'sky-tycoon';

export interface AeroplaneConfig {
	mode: AeroplaneMode;
	rulePreset: AeroplaneRulePreset;
	victoryTarget: 2 | 4;
	diceMode: DiceMode;
	launchRule: LaunchRule;
	finishRule: FinishRule;
	stacking: boolean;
	blockades: boolean;
	humanColor: AeroplaneColor;
	chatter: boolean;
}

export interface AiSeat {
	color: AeroplaneColor;
	personality: Personality;
}

export interface PlaneState {
	id: string;
	color: AeroplaneColor;
	progress: number | null;
}

export type AeroplanePosition =
	| { kind: 'hangar'; color: AeroplaneColor }
	| { kind: 'launch'; color: AeroplaneColor }
	| {
			kind: 'track';
			color: AeroplaneColor;
			progress: number;
			globalIndex: number;
	  }
	| { kind: 'home'; color: AeroplaneColor; progress: number; homeIndex: number }
	| { kind: 'finished'; color: AeroplaneColor };

export type AeroplaneEventType = 'move' | 'jump' | 'flight' | 'warp';

/**
 * A logical movement event. Coordinates are deliberately absent: renderers
 * can project these positions into any board layout without becoming part of
 * the rules authority.
 */
export interface AeroplaneEvent {
	type: AeroplaneEventType;
	planeId: string;
	from: AeroplanePosition;
	to: AeroplanePosition;
	distance?: number;
}

export interface ResolvedMove {
	planeId: string;
	color: AeroplaneColor;
	roll: number;
	start: AeroplanePosition;
	baseEndpoint: AeroplanePosition;
	finalEndpoint: AeroplanePosition;
	events: AeroplaneEvent[];
	capturedPlaneIds: string[];
}

/**
 * Exactly ten Sky Tycoon Chance cards, drawn cyclically from one seeded
 * shuffle. Movement cards reuse the matching tile semantics without chaining.
 */
export const TYCOON_CHANCE_CARDS = [
	'gain-4',
	'gain-2',
	'lose-2',
	'steal-3',
	'boost',
	'tailwind',
	'shield',
	'storm',
	'customs',
	'crash',
] as const;
export type TycoonChanceCard = (typeof TYCOON_CHANCE_CARDS)[number];

/** Why a colour's coin balance changed against the unlimited bank. */
export type TycoonCoinReason =
	| 'departure'
	| 'airport-buy'
	| 'chance'
	| 'customs'
	| 'tax';

/**
 * Coordinate-free, informational Sky Tycoon effect. Movement keeps its own
 * positional `AeroplaneEvent`; these never carry board coordinates so feeds
 * can render money, ownership, cards, shields and skips without positions.
 */
export type TycoonEffectEvent =
	| {
			type: 'coins';
			color: AeroplaneColor;
			amount: number;
			reason: TycoonCoinReason;
	  }
	| {
			type: 'transfer';
			from: AeroplaneColor;
			to: AeroplaneColor;
			amount: number;
			reason: 'airport-toll' | 'steal';
	  }
	| { type: 'airport'; tile: number; owner: AeroplaneColor }
	| { type: 'card'; color: AeroplaneColor; card: TycoonChanceCard }
	| { type: 'shield'; planeId: string }
	| { type: 'skip'; color: AeroplaneColor }
	| { type: 'tailwind'; color: AeroplaneColor }
	| {
			type: 'relocation';
			planeId: string;
			effect: 'boost' | 'wormhole' | 'storm' | 'crash';
			/** Committed progress, or null when the plane went to the hangar. */
			toProgress: number | null;
	  };

/**
 * Sky Tycoon economy layer; null in Standard mode. Only `chanceOrder` and
 * `chanceCursor` carry randomness: the deck is shuffled once at match start
 * from a discarded salted seed and drawn cyclically, so no RNG persists.
 */
export interface SkyTycoonState {
	/** Nonnegative integer balance per colour; every match starts at 10. */
	coins: Record<AeroplaneColor, number>;
	/** Airport global-index → owner colour; absent keys are unowned. */
	airports: Partial<Record<number, AeroplaneColor>>;
	/** Plane IDs protected until each plane next moves; pickups never stack. */
	shields: string[];
	skipNextRoll: Record<AeroplaneColor, boolean>;
	/** Shuffled permutation of the ten unique card IDs. */
	chanceOrder: TycoonChanceCard[];
	/** Nonnegative draw cursor; `chanceOrder[cursor % 10]` is next. */
	chanceCursor: number;
}

/** The selected local-AI move and the immutable AI stream continuation. */
export interface AiMoveChoice {
	move: ResolvedMove;
	rng: RngState;
}

/**
 * A deterministic action committed by the match controller.
 *
 * Roll and move actions share one record shape so a pending-choice save can
 * retain the roll before a plane is selected.  `selectedPlaneId` is null (or
 * omitted) for rolls without a selected plane; move actions include the
 * selected plane and the logical resolver events.
 */
export type AeroplaneActionKind = 'roll' | 'move';
export type AeroplaneActionActor = 'human' | 'ai';

export interface AeroplaneActionRecord {
	kind: AeroplaneActionKind;
	actor: AeroplaneActionActor;
	color: AeroplaneColor;
	roll: number;
	selectedPlaneId?: string | null;
	/** Positional movement plus coordinate-free Tycoon effect information. */
	events: (AeroplaneEvent | TycoonEffectEvent)[];
	checksum: string;
}

export interface AeroplaneStats {
	capturesMade: Record<AeroplaneColor, number>;
	capturesSuffered: Record<AeroplaneColor, number>;
	finished: Record<AeroplaneColor, number>;
}

export interface AeroplaneState {
	config: AeroplaneConfig;
	currentPlayer: AeroplaneColor;
	phase: AeroplanePhase;
	pendingRoll: number | null;
	planes: PlaneState[];
	winner: AeroplaneColor | null;
	turnNumber: number;
	noMoveStreak: Record<AeroplaneColor, number>;
	lastPlaceRounds: Record<AeroplaneColor, number>;
	roundNumber: number;
	stats: AeroplaneStats;
	/** Sky Tycoon economy layer; null when config.mode is 'standard'. */
	tycoon: SkyTycoonState | null;
}

export interface AeroplaneTransition {
	state: AeroplaneState;
	move: ResolvedMove;
	events: AeroplaneEvent[];
	capturedPlaneIds: string[];
}

/** Versioned local recovery envelope.  Action history is diagnostic only. */
export interface PersistedAeroplaneMatchV1 {
	version: 1;
	savedAt: string;
	/** Match-start wall clock. Optional only for legacy v1 snapshots. */
	startedAt?: string;
	/** Winning-transition wall clock. Optional only for legacy terminal saves. */
	completedAt?: string;
	rootSeed: number;
	config: AeroplaneConfig;
	state: AeroplaneState;
	seats: AiSeat[];
	diceRng: RngState;
	aiRng: RngState;
	actions: AeroplaneActionRecord[];
}
