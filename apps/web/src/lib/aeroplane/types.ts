import type { RngState } from './rng';

export type AeroplaneColor = 'red' | 'yellow' | 'blue' | 'green';
export type Personality = 'cautious' | 'aggressive' | 'unpredictable';
export type DiceMode = 'fair' | 'relaxed';
export type LaunchRule = 'six' | 'five-or-six';
export type FinishRule = 'exact' | 'bounce';
export type AeroplanePhase = 'awaiting-roll' | 'awaiting-choice' | 'finished';
export type AeroplaneRulePreset = 'classic' | 'quick-chill' | 'custom';

export const AEROPLANE_COLORS = ['red', 'yellow', 'blue', 'green'] as const;

export interface AeroplaneConfig {
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

export type AeroplaneEventType = 'move' | 'jump' | 'flight';

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

/** The selected local-AI move and the immutable AI stream continuation. */
export interface AiMoveChoice {
	move: ResolvedMove;
	rng: RngState;
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
}

export interface AeroplaneTransition {
	state: AeroplaneState;
	move: ResolvedMove;
	events: AeroplaneEvent[];
	capturedPlaneIds: string[];
}
